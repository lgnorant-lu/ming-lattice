// scripts/fetch.mjs
// vertical/ 物化器——registry.yaml 为唯一索引源（清单即锁、内容即产物、孤本例外声明）。
//
// 语义：
//   vertical/* 默认不入仓（远端仅存索引）；本脚本按 registry 条目把上游 clone 到本地，
//   精确落在 pin 指定的 commit 上（git 浅取 SHA，GitHub 支持 allowReachableSHA1InWant）。
//   sourceGone: true 的孤本条目跳过——它们由本仓直接承载字节，不参与物化。
//
// 用法：
//   node scripts/fetch.mjs [--dry-run] [--only <name>[,<name>...]] [--reconcile] [--include-heavy]
//     --dry-run        只打印物化计划，不触碰磁盘与网络
//     --only           只物化指定条目（逗号分隔；显式点名可达 heavy 条目）
//     --reconcile      已物化但 HEAD≠pin 的目录执行强制对齐（默认只报告不动手）
//     --include-heavy  把 weight: heavy 条目纳入默认物化面（默认面=core，主箱保持轻量）
//
// 退出码：0=全部就绪 / 1=存在失败或漂移条目 / 2=自身故障（fail-closed 可分辨）
//
// 跨端约定：纯 node+git，无 shell 特性；clone 内强制 core.longpaths（Windows 深路径）、
//   GIT_LFS_SKIP_SMUDGE=1（不拉 LFS 实体，留指针）；永不 --recurse-submodules。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// FETCH_ROOT 覆盖仅服务于测试隔离（fixtures 仓根）；常规使用恒为本仓根
const REPO_ROOT = process.env.FETCH_ROOT
  ? path.resolve(process.env.FETCH_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = path.join(REPO_ROOT, 'registry.yaml');

// ── 参数解析（fail-closed，与全仓 CLI 同构） ──
const args = process.argv.slice(2);
const BOOL_FLAGS = new Set(['--dry-run', '--reconcile', '--include-heavy']);
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
  maxBuffer: 64 * 1024 * 1024,   // ls-tree -l 大仓(4w+文件)输出数 MB，默认 1MB 会 ENOBUFS
  env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1', ...opts.env },
});

const headOf = dir => {
  try { return git(dir, ['rev-parse', 'HEAD']).trim(); } catch { return null; }
};

// ── 主流程 ──
const entries = parseRegistry(fs.readFileSync(REGISTRY_PATH, 'utf8'));
// weight 分层：heavy 条目不进默认物化面（双模态——主箱默认轻量，重仓显式装载）。
// --only 显式点名或 --include-heavy 均可达 heavy；无 weight 字段按 core 计（向后兼容）。
const includeHeavy = flags.has('--include-heavy');
const skippedHeavy = (!only && !includeHeavy) ? entries.filter(e => e.weight === 'heavy') : [];
const targets = entries.filter(e => {
  if (only) return only.has(e.name);
  return includeHeavy || e.weight !== 'heavy';
});

// --only 静默空集防御：名字打错不能无声退出 0
if (only) {
  const known = new Set(entries.map(e => e.name));
  const unknown = [...only].filter(n => !known.has(n));
  if (unknown.length) console.error(`[WARN] --only 未匹配条目: ${unknown.join(', ')}`);
  if (!targets.length) { console.error('no matching registry entries'); process.exit(2); }
}

const results = { fetched: [], skippedPin: [], skippedGone: [], skippedDisabled: [], skippedNoRepo: [], notRepo: [], drifted: [], remoteAligned: [], failed: [] };

// registry 是 SoT 也是输入面——形状校验在消费点（flag 注入/越根写防于拼错与恶意条目）
const SHA_RE = /^[0-9a-f]{40}$/i;
const entryDir = (e) => {
  const p = path.resolve(REPO_ROOT, e.path || `vertical/${e.name}`);
  return p.startsWith(REPO_ROOT + path.sep) ? p : null;
};

for (const e of targets) {
  if (e.sourceGone === 'true') { results.skippedGone.push(e.name); continue; }
  if (e.enabled === 'false') { results.skippedDisabled.push(e.name); continue; }
  if (!e.repo || !e.pin) { results.skippedNoRepo.push(e.name); continue; }
  // pin 进 `git fetch origin <refspec>`/`checkout`——非 hex 值可成 flag 注入载体
  // （--upload-pack=<bin> 即任意命令执行面）；repo 以 - 开头同理挡 flag 位
  if (!SHA_RE.test(e.pin)) { results.failed.push(`${e.name} (pin 非 40-hex SHA)`); continue; }
  if (e.repo.startsWith('-')) { results.failed.push(`${e.name} (repo 非法形态)`); continue; }
  const dir = entryDir(e);
  if (!dir) { results.failed.push(`${e.name} (path 越出仓根)`); continue; }

  let repairOnly = false;
  if (fs.existsSync(dir)) {
    const gitMeta = path.join(dir, '.git');
    if (fs.existsSync(gitMeta) && !fs.statSync(gitMeta).isDirectory()) {
      // .git 是 gitfile（submodule/linked-worktree 指针）：remote 对账/set-url 会劫持
      // 它本不属于自己的 remote——不收养不修改，报人工裁决
      results.notRepo.push(`${e.name} (.git 为 gitfile——submodule/worktree 须人工处理)`);
      continue;
    }
    if (!fs.existsSync(gitMeta)) {
      // 非 git 目录（游离文件残留/手工拷贝）：不收养不覆盖，报人工裁决
      results.notRepo.push(`${e.name} (存在非 git 目录——清空或迁走后重跑)`);
      continue;
    }
    const head = headOf(dir);
    // remote URL 对账：registry 是 SoT——上游改名/迁移后本地 stale remote 静默对齐
    try {
      const url = git(dir, ['remote', 'get-url', 'origin']).trim();
      if (url !== e.repo) {
        if (flags.has('--dry-run')) results.remoteAligned.push(`${e.name} [计划: ${url} → ${e.repo}]`);
        else { git(dir, ['remote', 'set-url', 'origin', e.repo]); results.remoteAligned.push(e.name); }
      }
    } catch {
      if (flags.has('--dry-run')) results.remoteAligned.push(`${e.name} [计划: remote add]`);
      else git(dir, ['remote', 'add', 'origin', e.repo]);
    }
    if (head === e.pin) {
      // 工作树完整性：HEAD 对≠就绪——ls-tree 列 HEAD 树逐一验存在（与索引形态无关，
      // vendored 克隆索引有填/空两种历史形态，空索引下 diff/status 全员误报 D）。
      //   缺文件           → 可安全自动重建（本地无可失之物）
      //   有改动(M/截断)   → 可能是本地工作或写截断，只报不毁，走 --reconcile 对齐语义
      //   ?? 未跟踪残留（build/ 等）属良性，不参与判定。
      let missing = false, dirty = false;
      try {
        // ls-tree -l 带 blob 尺寸：存在性 + 大小双查——截断/半写文件（写中断事故面）也能抓。
        // lstatSync 不随 symlink（Windows 占位文本/unix 链均与树 size 一致）；gitlink 只验存在。
        const tree = git(dir, ['ls-tree', '-r', '-l', '-z', 'HEAD']);
        for (const rec of tree.split('\0')) {
          if (!rec) continue;
          const tab = rec.indexOf('\t');
          const meta = rec.slice(0, tab).trim().split(/\s+/);   // size 列前有对齐空格
          const rel = rec.slice(tab + 1);
          const fp = path.join(dir, rel);
          if (meta[1] === 'commit') {          // gitlink：只验目录在
            if (!fs.existsSync(fp)) { missing = true; break; }
            continue;
          }
          try {
            const st = fs.lstatSync(fp);
            if (!st.isFile() && !st.isSymbolicLink()) { missing = true; break; }
            if (meta[3] !== '-' && st.size !== Number(meta[3])) { dirty = true; break; }  // 尺寸不符=改/截断，走 drift
          } catch { missing = true; break; }
        }
        // 有索引再查 status -uno：捕捉同尺寸改动（索引非空时 D/M 皆真实；?? 良性不算）
        if (!missing && git(dir, ['ls-files']).trim()) {
          dirty = !!git(dir, ['status', '--porcelain', '-uno']).trim();
        }
      } catch { /* 读不出时按就绪处理 */ }
      if (!missing && !dirty) { results.skippedPin.push(e.name); continue; }
      if (dirty && !flags.has('--reconcile')) {
        results.drifted.push(`${e.name} (pin一致但工作树有改动——--reconcile 覆盖对齐)`);
        continue;
      }
      repairOnly = true;
      if (flags.has('--dry-run')) { results.fetched.push(`${e.name} [计划: 重建工作树]`); continue; }
    } else if (head && !flags.has('--reconcile')) {
      results.drifted.push(`${e.name} (HEAD=${head.slice(0, 7)} pin=${e.pin.slice(0, 7)})`);
      continue;
    }
  }

  if (flags.has('--dry-run')) { results.fetched.push(`${e.name} [计划]`); continue; }

  try {
    if (repairOnly) {
      // 空工作树修复：对象在本地（blob:none 时 promisor 懒取），reset --hard 重建字节
      git(dir, ['reset', '-q', '--hard', e.pin]);
      results.fetched.push(`${e.name} [重建]`);
      continue;
    }
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      git(dir, ['init', '-q']);
      git(dir, ['remote', 'add', 'origin', e.repo]);
    }
    git(dir, ['config', 'core.longpaths', 'true']);
    try {
      git(dir, ['-c', 'transfer.fsckObjects=true', 'fetch', '--depth=1', '--no-tags', 'origin', e.pin]);
    } catch {
      // pin 不在浅可达面（服务端未开 allowReachableSHA1InWant 或 pin 悬死）→ 回退全量
      git(dir, ['-c', 'transfer.fsckObjects=true', 'fetch', '--no-tags', 'origin']);
    }
    git(dir, ['checkout', '-qf', '--detach', e.pin]);
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
fmt('重仓跳过(weight=heavy)', skippedHeavy.map(e => e.name), '——--only/--include-heavy 可达');
fmt('禁用跳过(enabled)', results.skippedDisabled);
fmt('缺 repo/pin 跳过', results.skippedNoRepo);
fmt('非仓库目录(需人工)', results.notRepo);
fmt('remote 已对齐', results.remoteAligned);
fmt('漂移(需 --reconcile)', results.drifted);
fmt('失败', results.failed);

const bad = results.drifted.length + results.failed.length + results.notRepo.length;
process.exit(bad ? 1 : 0);
