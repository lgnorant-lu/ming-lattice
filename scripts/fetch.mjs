// scripts/fetch.mjs
// vertical/ 物化器——registry.yaml 为唯一索引源（清单即锁、内容即产物、孤本例外声明）。
//
// 语义：
//   vertical/* 默认不入仓（远端仅存索引）；本脚本按 registry 条目把上游 clone 到本地，
//   精确落在 pin 指定的 commit 上（git 浅取 SHA，GitHub 支持 allowReachableSHA1InWant）。
//   sourceGone: true 的孤本条目跳过——它们由本仓直接承载字节，不参与物化。
//
// 用法：
//   node scripts/fetch.mjs [--dry-run] [--only <name>[,<name>...]] [--reconcile]
//     --dry-run    只打印物化计划，不触碰磁盘与网络
//     --only       只物化指定条目（逗号分隔）
//     --reconcile  已物化但 HEAD≠pin 的目录执行强制对齐（默认只报告不动手）
//
// 退出码：0=全部就绪 / 1=存在失败或漂移条目 / 2=自身故障（fail-closed 可分辨）
//
// 跨端约定：纯 node+git，无 shell 特性；clone 内强制 core.longpaths（Windows 深路径）、
//   GIT_LFS_SKIP_SMUDGE=1（不拉 LFS 实体，留指针）；永不 --recurse-submodules。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = path.join(REPO_ROOT, 'registry.yaml');

// ── 参数解析（fail-closed，与全仓 CLI 同构） ──
const args = process.argv.slice(2);
const BOOL_FLAGS = new Set(['--dry-run', '--reconcile']);
const VALUE_FLAGS = new Set(['--only']);
const flags = new Set(); const values = new Map();
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (BOOL_FLAGS.has(a)) { if (flags.has(a)) { console.error(`duplicate flag: ${a}`); process.exit(2); } flags.add(a); continue; }
  if (VALUE_FLAGS.has(a)) {
    const v = args[++i];
    if (!v || v.startsWith('--')) { console.error(`flag ${a} requires a value`); process.exit(2); }
    values.set(a, v); continue;
  }
  console.error(`unknown flag: ${a}`); process.exit(2);
}
const only = values.has('--only') ? new Set(values.get('--only').split(',').map(s => s.trim()).filter(Boolean)) : null;

// ── registry.yaml 行级解析（yaml-lite 子集，与 check-skill-index 同源约定） ──
function parseRegistry(text) {
  const out = [];
  let section = null, cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const sec = raw.match(/^([a-z_]+):\s*$/);
    if (sec) { section = sec[1]; cur = null; continue; }
    if (section !== 'vertical') continue;
    const entry = raw.match(/^ {2}- name:\s*(.+?)\s*$/);
    if (entry) { cur = { name: entry[1] }; out.push(cur); continue; }
    if (!cur) continue;
    const kv = raw.match(/^ {4}([a-zA-Z]+):\s*(.*?)\s*$/);
    if (kv) cur[kv[1]] = kv[2];
  }
  return out;
}

const git = (cwd, gargs, opts = {}) => execFileSync('git', gargs, {
  cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1', ...opts.env },
});

const headOf = dir => {
  try { return git(dir, ['rev-parse', 'HEAD']).trim(); } catch { return null; }
};

// ── 主流程 ──
const entries = parseRegistry(fs.readFileSync(REGISTRY_PATH, 'utf8'));
const targets = entries.filter(e => !only || only.has(e.name));

const results = { fetched: [], skippedPin: [], skippedGone: [], skippedNoRepo: [], drifted: [], failed: [] };

for (const e of targets) {
  if (e.sourceGone === 'true') { results.skippedGone.push(e.name); continue; }
  if (!e.repo || !e.pin) { results.skippedNoRepo.push(e.name); continue; }
  const dir = path.join(REPO_ROOT, e.path || `vertical/${e.name}`);

  if (fs.existsSync(dir)) {
    const head = headOf(dir);
    if (head === e.pin) { results.skippedPin.push(e.name); continue; }
    if (head && !flags.has('--reconcile')) {
      results.drifted.push(`${e.name} (HEAD=${head.slice(0, 7)} pin=${e.pin.slice(0, 7)})`);
      continue;
    }
  }

  if (flags.has('--dry-run')) { results.fetched.push(`${e.name} [计划]`); continue; }

  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(path.join(dir, '.git'))) {
      git(dir, ['init', '-q']);
      git(dir, ['remote', 'add', 'origin', e.repo]);
    }
    git(dir, ['config', 'core.longpaths', 'true']);
    try {
      git(dir, ['fetch', '--depth=1', '--no-tags', 'origin', e.pin]);
    } catch {
      // pin 不在浅可达面（服务端未开 allowReachableSHA1InWant 或 pin 悬死）→ 回退全量
      git(dir, ['fetch', '--no-tags', 'origin']);
    }
    git(dir, ['checkout', '-q', '--detach', e.pin]);
    results.fetched.push(e.name);
  } catch (err) {
    results.failed.push(`${e.name} (${String(err.stderr || err.message).split('\n')[0]})`);
  }
}

// base/ submodule 一并引导（单命令 bootstrap 语义）
if (!flags.has('--dry-run')) {
  try { git(REPO_ROOT, ['submodule', 'update', '--init']); } catch { /* 无 submodule 环境容忍 */ }
}

// ── 报告 ──
const fmt = (label, arr, detail = '') => arr.length && console.log(`${label} ${arr.length}: ${arr.join(', ')}${detail}`);
console.log('\n── fetch 报告 ──');
fmt('物化完成', results.fetched);
fmt('已就绪(pin一致)', results.skippedPin);
fmt('孤本跳过(sourceGone)', results.skippedGone);
fmt('缺 repo/pin 跳过', results.skippedNoRepo);
fmt('漂移(需 --reconcile)', results.drifted);
fmt('失败', results.failed);

const bad = results.drifted.length + results.failed.length;
process.exit(bad ? 1 : 0);
