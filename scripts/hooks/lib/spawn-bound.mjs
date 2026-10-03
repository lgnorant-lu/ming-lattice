// scripts/hooks/lib/spawn-bound.mjs — 边界化子进程执行原语
// 缺口：spawnSync(cmd,{shell:true,timeout}) 超时只杀直接子进程
//   （Windows=TerminateProcess 单 PID；POSIX=kill(pid)），shell 的子孙逃逸成孤儿
//   ——Node 生态位缺口（nodejs/node#64406 killTree 提案未落地）。
// 双端策略（cargo util/job.rs 同构分述表）：
//   POSIX:   不 detached——保留 Ctrl-C 进程组语义（Ctrl-C 天然绞整组）。
//            timeout 路径 ps -eo pid=,ppid= 建表 BFS 收后代，先杀子孙再杀根。
//   Windows: taskkill /PID <pid> /T /F 按父链绞树——须在父存活时发起，
//            根先死子孙 reparent 后绞不到。
// 已知限：POSIX ps 只覆盖 MSYS/Linux 原生进程；枚举到杀死之间存在竞态窗
//   （新孙可能逃逸）——best-effort 绞杀，非强保证。

import { spawn, spawnSync } from 'node:child_process';

const PS_ENUM_TIMEOUT_MS = 10_000;
const TASKKILL_TIMEOUT_MS = 15_000;

// POSIX: 一次 ps 枚举建 父→[子] 表，BFS 收 rootPid 全部后代（不含根自身）。
// 失败降级为返回 []——killTree 仍会杀根（退化为单 PID 语义，不更坏）。
function posixDescendants(rootPid) {
  const r = spawnSync('ps', ['-eo', 'pid=,ppid='],
    { encoding: 'utf8', timeout: PS_ENUM_TIMEOUT_MS });
  if (r.status !== 0 || !r.stdout) return [];
  const byParent = new Map();
  for (const line of r.stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    const pid = +m[1], ppid = +m[2];
    if (!byParent.has(ppid)) byParent.set(ppid, []);
    byParent.get(ppid).push(pid);
  }
  const out = [];
  const seen = new Set([rootPid]);
  const queue = [rootPid];
  while (queue.length) {
    for (const c of byParent.get(queue.shift()) || []) {
      if (!seen.has(c)) { seen.add(c); out.push(c); queue.push(c); }
    }
  }
  return out;
}

// 绞杀以 rootPid 为根的进程树（best-effort）。
export function killTree(rootPid) {
  if (!rootPid) return;
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/PID', String(rootPid), '/T', '/F'],
        { stdio: 'ignore', timeout: TASKKILL_TIMEOUT_MS });
    } catch { /* best-effort */ }
    return;
  }
  // POSIX：先枚举后代再杀根——根死后子孙 reparent 到 init，ppid 线索即断
  const desc = posixDescendants(rootPid);
  try { process.kill(rootPid, 'SIGKILL'); } catch { /* gone */ }
  for (const p of desc) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
}

// shell 命令形态：等价 spawnSync(cmd,{shell:true,timeout}) 但 timeout 绞整树。
// 返回 Promise<{status, signal, timedOut, error}>；stdio 恒 inherit（门禁要透传输出）。
export function spawnBound(command, { cwd, env, timeoutMs = 0 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, env, stdio: 'inherit', shell: true });
    let settled = false;
    let timedOut = false;
    const done = (r) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ status: null, signal: null, error: null, ...r });
    };
    const timer = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs) : null;
    child.on('error', (error) => done({ timedOut, error }));
    child.on('close', (status, signal) => done({ status, signal, timedOut }));
  });
}

// argv 形态：file+args 不经 shell；capture=true 收 stdout/stderr（maxBuffer 超界绞树）。
// 返回 Promise<{status, signal, timedOut, overflow, stdout, stderr, error}>
export function spawnBoundArgv(file, args = [],
  { cwd, env, timeoutMs = 0, capture = false, maxBuffer = 64 << 20 } = {}) {
  return new Promise((resolve) => {
    const stdio = capture ? ['ignore', 'pipe', 'pipe'] : 'inherit';
    const child = spawn(file, args, { cwd, env, stdio });
    let settled = false;
    let timedOut = false;
    let overflow = false;
    let stdout = '';
    let stderr = '';
    const done = (r) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ status: null, signal: null, error: null, ...r });
    };
    const kill = () => killTree(child.pid);
    const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; kill(); }, timeoutMs) : null;
    if (capture) {
      child.stdout.on('data', (d) => {
        stdout += d;
        if (stdout.length > maxBuffer) { overflow = true; kill(); }
      });
      child.stderr.on('data', (d) => { stderr += d; });
    }
    child.on('error', (error) =>
      done({ timedOut, overflow, stdout, stderr, error }));
    child.on('close', (status, signal) =>
      done({ status, signal, timedOut, overflow, stdout, stderr }));
  });
}
