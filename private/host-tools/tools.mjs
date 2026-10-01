// tools.mjs — 本机命令守卫/提示注册表的运行时查询件
// SoT: tools.yaml（同目录）。用法：
//   tools            状态表（native/tier/alt/installed/shim/escape）
//   tools status     同上
//   tools doctor     体检：shim 在位（升级 wipe 检测）/bashrc 编码/hints 挂载/PATH 序
//   tools gen-hints  由 registry 生成 bashrc 托管块（install.ps1 写入）
// exit: status 恒 0；doctor 有失败项 exit 1；用法/读档错 exit 2
// HT_HOME 环境变量覆盖 HOME 探针根（测试隔离用）。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseYamlLite } from '../engineering/ming-boundary/scripts/lib/yaml.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HT_HOME || os.homedir();
const USER_DIRS = [path.join(HOME, '.local', 'bin'), path.join(HOME, 'bin')];
const FALLBACK_DIRS = ['C:/Program Files/Git/mingw64/bin']; // 旧装位——Git 升级可覆写
const SHIM_DIRS = [...USER_DIRS, ...FALLBACK_DIRS];

function die(msg, code = 2) { console.error('tools: ' + msg); process.exit(code); }

function loadRegistry() {
  const p = path.join(HERE, 'tools.yaml');
  if (!fs.existsSync(p)) die('tools.yaml 缺席: ' + p);
  const data = parseYamlLite(fs.readFileSync(p, 'utf8'));
  if (!data || typeof data !== 'object' || !data.guards) die('tools.yaml 缺 guards 段');
  return data;
}

function onPath(cmd) {
  if (!cmd) return false;
  const r = spawnSync('where', [cmd], { encoding: 'utf8', shell: false });
  return r.status === 0;
}

function shimAt(name) {
  for (const [i, d] of SHIM_DIRS.entries()) {
    const p = path.join(d, name);
    if (fs.existsSync(p)) return { path: p, level: i < USER_DIRS.length ? 'user' : 'fallback' };
  }
  return null;
}

function table(rows, heads) {
  const w = heads.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  const line = r => r.map((c, i) => String(c).padEnd(w[i])).join('  ');
  return [line(heads), line(w.map(x => '-'.repeat(x))), ...rows.map(line)].join('\n');
}

function cmdStatus(reg) {
  const rows = [];
  for (const [name, g] of Object.entries(reg.guards || {})) {
    rows.push([
      name,
      g.tier,
      g.alt || '-',
      g.alt ? (onPath(g.alt) ? 'yes' : 'NO') : '-',
      ['block-form', 'soft-ban'].includes(g.tier) ? (shimAt(name)?.level || 'MISSING') : '-',
      g.escape_flag || g.env_off || g.escape || '-',
    ]);
  }
  for (const t of reg.free || []) {
    rows.push([t, 'free', '-', '-', '-', onPath(t) ? 'installed' : 'not-installed']);
  }
  console.log(table(rows, ['native', 'tier', 'alt', 'alt@PATH', 'shim', 'escape']));
  const missing = rows.filter(r => r[4] === 'MISSING');
  if (missing.length) console.log(`\n注意: ${missing.length} 项守卫 shim 不在位——跑 install.ps1 或 tools doctor`);
}

function bashrcProbe() {
  const p = path.join(HOME, '.bashrc');
  if (!fs.existsSync(p)) return { exists: false };
  const buf = fs.readFileSync(p);
  const utf16 = buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE;
  const utf8bom = !utf16 && buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  const text = utf16 ? buf.toString('utf16le') : buf.toString('utf8');
  return {
    exists: true, utf16, utf8bom,
    hasHints: text.includes('>>> ming host-tools hints'),
  };
}

function cmdDoctor(reg) {
  let fails = 0;
  const ok = (cond, good, bad) => { if (cond) console.log('  [ok] ' + good); else { console.log('  [FAIL] ' + bad); fails++; } };
  for (const [name, g] of Object.entries(reg.guards || {})) {
    if (!['block-form', 'soft-ban'].includes(g.tier)) continue;
    const s = shimAt(name);
    ok(s?.level === 'user',
      `${name} shim 在用户级位: ${s?.path || ''}`,
      s ? `${name} shim 仅在 fallback（${s.path}）——Git 升级可覆写，install.ps1 铺用户级`
        : `${name} shim 缺席（tier=${g.tier} 应有 shim；Git 升级 wipe 或 install 未跑）`);
  }
  const rc = bashrcProbe();
  ok(rc.exists, '.bashrc 存在', '.bashrc 缺席');
  if (rc.exists) {
    ok(!rc.utf16, '.bashrc 编码 UTF-8', '.bashrc 是 UTF-16（逐行解析全灭——install.ps1 可修）');
    ok(!rc.utf8bom, '.bashrc 无 UTF-8 BOM', '.bashrc 带 UTF-8 BOM（bash 首行噎住——剥 EF BB BF）');
    const hasHintEntry = Object.values(reg.guards || {}).some(g => g.tier === 'hint');
    ok(!hasHintEntry || rc.hasHints, 'hints 托管块已挂 .bashrc', 'hints 托管块缺席——install.ps1 挂载');
  }
  // PATH 检查：用户 bin 须在 PATH 存在（bash 内 MSYS2 profile 自动前置，
  // Windows 层序只影响 cmd/pwsh 链——shim 是 bash 件管不到那边）
  const homeWin = HOME.replace(/\//g, '\\').toLowerCase();
  const segs = (process.env.PATH || '').split(path.delimiter)
    .map(s => s.replace(/\//g, '\\').replace(/\\$/, '').toLowerCase());
  const hasUserBin = USER_DIRS.some(d =>
    segs.includes(d.replace(/\//g, '\\').toLowerCase()));
  ok(hasUserBin || segs.some(s => s.startsWith(homeWin) && s.endsWith('\\bin')),
    'PATH 含用户 bin 部署点',
    'PATH 无用户 bin 部署点（~/.local/bin 或 ~/bin）——shim 不会生效');
  console.log(fails ? `doctor: ${fails} 项失败` : 'doctor: 全绿');
  process.exit(fails ? 1 : 0);
}

function cmdGenHints(reg) {
  const emit = [];
  for (const [name, g] of Object.entries(reg.guards || {})) {
    if (g.tier !== 'hint' || !g.alt) continue;
    if (g.mode === 'redirect') {
      emit.push(`${name}() { command -v ${g.alt} >/dev/null 2>&1 && { echo "hint: ${name} -> ${g.alt}" >&2; command ${g.alt} "$@"; } || command ${name} "$@"; }`);
    } else {
      emit.push(`${name}() { command -v ${g.alt} >/dev/null 2>&1 && echo "hint: ${name} -> ${g.alt}（也可用原生 ${name}）" >&2; command ${name} "$@"; }`);
    }
  }
  console.log('# >>> ming host-tools hints >>>');
  console.log('# 由 tools.yaml guards 的 hint 层生成——勿手改（改表后跑 install.ps1 重生成）');
  console.log(emit.join('\n'));
  console.log('# <<< ming host-tools hints <<<');
}

const sub = process.argv[2] || 'status';
const reg = loadRegistry();
if (sub === 'status' || sub === 'list') cmdStatus(reg);
else if (sub === 'doctor') cmdDoctor(reg);
else if (sub === 'gen-hints') cmdGenHints(reg);
else die(`unknown subcommand: ${sub}（status|doctor|gen-hints）`);
