// scripts/deploy-ledger.mjs
// 部署态账本——回答三个 sync 链完即忘的问题：装了什么、装的哪版、漂没漂。
//
//   --write  : 扫描 registry targets 指向的部署目录，快照落
//              .ming/<lattice>/state/deploy-ledger.json（本机态，不入仓）
//   --check  : (默认) 重扫当前态对账——与账本比漂移(added/missing/changed)，
//              与 registry deploy:true 期望比覆盖(uncovered/foreign)
//
// 语义约定：
//   目标目录条目名 = 单元名（sync 部署约定）；条目形态 = junction|symlink|dir|file。
//   expected 集 = registry 全段(deployable/private) deploy.<client>: true 的单元。
//   targets 路径支持 %VAR% / $VAR / ${VAR} 环境占位（与 sync.ps1 同源）。
//
// 退出码: 0=无漂移且覆盖全 / 1=有漂移或覆盖缺 / 2=参数或源缺失（fail-closed）

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.LEDGER_ROOT
  ? path.resolve(process.env.LEDGER_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'registry.yaml');

// ── 参数（fail-closed） ──
const args = process.argv.slice(2);
const flags = new Set();
for (const a of args) {
  if (a === '--write' || a === '--check' || a === '--json') {
    if (flags.has(a)) { console.error(`duplicate flag: ${a}`); process.exit(2); }
    flags.add(a);
  } else { console.error(`unknown flag: ${a}`); process.exit(2); }
}
const writeMode = flags.has('--write');
const jsonOut = flags.has('--json');

// ── registry 行级解析：targets + 全段条目 deploy map ──
const strip = (v) => v.trim().replace(/^"(.*)"$/, '$1').replace(/\s+#.*$/, '').trim();
function parseRegistryFull(text) {
  const targets = {};
  const units = [];                        // {name, section, deploy:{client:true}}
  let section = null, cur = null, inDeploy = false;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const sec = raw.match(/^([a-z_]+):\s*$/);
    if (sec) { section = sec[1]; cur = null; inDeploy = false; continue; }
    if (section === 'targets') {
      const kv = raw.match(/^ {2}([a-zA-Z0-9_-]+):\s*(.+)$/);
      if (kv) targets[kv[1]] = strip(kv[2]);
      continue;
    }
    if (!['vertical', 'base', 'deployable', 'private'].includes(section)) continue;
    const entry = raw.match(/^ {2}- name:\s*(.+?)\s*$/);
    if (entry) { cur = { name: entry[1], section, deploy: {} }; units.push(cur); inDeploy = false; continue; }
    if (!cur) continue;
    const depStart = raw.match(/^ {4}deploy:\s*(.*)$/);
    if (depStart) { inDeploy = true; if (depStart[1].trim() === '{}') inDeploy = false; continue; }
    if (inDeploy) {
      const sub = raw.match(/^ {6}([a-zA-Z0-9_-]+):\s*(.+)$/);
      if (sub) { cur.deploy[sub[1]] = strip(sub[2]); continue; }
      const kv = raw.match(/^ {4}([a-zA-Z]+):/);
      if (kv) inDeploy = false;             // 缩进退回 4 格 = deploy 块结束
    }
  }
  return { targets, units };
}

const expandEnv = (p) => p
  .replace(/%([^%]+)%/g, (_, v) => process.env[v] || '')
  .replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_, v) => process.env[v] || '');

// 目标目录条目快照：形态 + 链接目标 + mtime（文件/拷贝件漂移探测面）
function scanTarget(dir) {
  const entries = [];
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    try {
      const st = fs.lstatSync(p);
      let kind = st.isSymbolicLink() ? 'symlink' : e.isDirectory() ? 'dir' : 'file';
      let target = null;
      if (kind === 'symlink') { try { target = fs.readlinkSync(p); } catch {} }
      else if (e.isDirectory()) {
        try { target = fs.readlinkSync(p); if (target) kind = 'junction'; } catch { /* 真目录 readlink 必败 */ }
      }
      entries.push({ name: e.name, kind, target, mtimeMs: Math.round(st.mtimeMs) });
    } catch { /* 枚举竞态容忍 */ }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export function buildLedger(root = ROOT) {
  const regText = fs.existsSync(REGISTRY) ? fs.readFileSync(REGISTRY, 'utf8') : null;
  if (!regText) return { error: 'registry.yaml 缺席' };
  const { targets, units } = parseRegistryFull(regText);
  let head = null;
  try { head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
  const clients = {};
  for (const [client, rawPath] of Object.entries(targets)) {
    const dir = expandEnv(rawPath);
    clients[client] = {
      path: dir,
      expected: units.filter(u => u.deploy[client] === 'true').map(u => u.name).sort(),
      entries: dir && fs.existsSync(dir) ? scanTarget(dir) : null,
    };
  }
  // deploy 客户名∉targets 的单元会被静默忽略（pwsh 载入层有 registry_unknown_client 兜底，
  // 本 mjs 通道补可见性——未提交改动/fixture 走不到那道门）
  const known = new Set(Object.keys(targets));
  const warnings = units
    .flatMap(u => Object.keys(u.deploy).filter(c => !known.has(c)).map(c => `${u.name}/${c}`))
    .map(s => `deploy 客户名不在 targets: ${s}（该单元不会被任何客户端对账）`);
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), repoHead: head, clients, warnings };
}

export function checkDrift(ledger, now) {
  const out = {};
  for (const [client, cur] of Object.entries(now.clients)) {
    const prev = ledger.clients?.[client];
    const prevMap = new Map((prev?.entries || []).map(e => [e.name, e]));
    const nowMap = new Map((cur.entries || []).map(e => [e.name, e]));
    const missing = [...prevMap.keys()].filter(n => !nowMap.has(n));
    const added = [...nowMap.keys()].filter(n => !prevMap.has(n));
    const changed = [...nowMap.keys()].filter(n => {
      const a = prevMap.get(n); if (!a) return false;
      const b = nowMap.get(n);
      return a.kind !== b.kind || a.target !== b.target || a.mtimeMs !== b.mtimeMs;
    });
    const expectedSet = new Set(cur.expected);
    const uncovered = [...expectedSet].filter(n => !nowMap.has(n));
    const foreign = [...nowMap.keys()].filter(n => !expectedSet.has(n));
    out[client] = { missing, added, changed, uncovered, foreign, path: cur.path };
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const now = buildLedger(ROOT);
  if (now.error) { console.error(`[E] ${now.error}`); process.exit(2); }
  for (const w of now.warnings || []) console.error(`[W] ${w}`);

  // 账本落点：伞面 projects 首项（本仓=lattice）的 state/ 本机态域
  const ledgerDir = path.join(ROOT, '.ming', 'lattice', 'state');
  const ledgerPath = path.join(ledgerDir, 'deploy-ledger.json');

  if (writeMode) {
    fs.mkdirSync(ledgerDir, { recursive: true });
    fs.writeFileSync(ledgerPath, JSON.stringify(now, null, 1) + '\n');
    const total = Object.values(now.clients).reduce((s, c) => s + (c.entries?.length || 0), 0);
    console.log(`[ledger] 已快照 ${total} 条目 → ${path.relative(ROOT, ledgerPath)}`);
    for (const [c, d] of Object.entries(now.clients))
      console.log(`  ${c}: ${d.entries === null ? '目标目录缺席' : d.entries.length + ' 条目'}（expected ${d.expected.length}）`);
    process.exit(0);
  }

  // --check 默认：漂移 + 覆盖对账
  if (!fs.existsSync(ledgerPath)) {
    console.log(`[ledger] 账本缺席：${path.relative(ROOT, ledgerPath)}——先 --write 立账`);
    console.log('[ledger] 以下按 registry 期望单看当前态（无漂移基线）：');
  }
  const prev = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : { clients: {} };
  const drift = checkDrift(prev, now);
  if (jsonOut) { console.log(JSON.stringify(drift, null, 1)); process.exit(0); }

  let bad = 0;
  for (const [client, d] of Object.entries(drift)) {
    console.log(`── ${client} (${d.path}) ──`);
    for (const n of d.missing) { console.log(`  [missing]   ${n} ——账本有当前无`); bad++; }
    for (const n of d.changed) { console.log(`  [changed]   ${n} ——形态/目标/mtime 漂移`); bad++; }
    for (const n of d.uncovered) { console.log(`  [uncovered] ${n} ——registry 期望部署但当前缺席`); bad++; }
    for (const n of d.foreign) console.log(`  [foreign]   ${n} ——已装但 registry 未期望（外来件）`);
    if (!d.missing.length && !d.changed.length && !d.uncovered.length)
      console.log(`  ✓ 无漂移${d.added.length ? `（新增 ${d.added.length} 条——--write 可立账）` : ''}`);
    for (const n of d.added) console.log(`  [added]     ${n} ——账本后新增（--write 续账）`);
  }
  process.exit(bad ? 1 : 0);
}
