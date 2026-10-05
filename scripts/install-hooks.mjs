#!/usr/bin/env node
// install-hooks.mjs — 门禁引擎 kit 跨平台 -Target 实现（POSIX 补位件）
// 用法: node scripts/install-hooks.mjs --target <repo> [--force] [--with-boundary] [--dry-run]
// 语义与 install-hooks.ps1 -Target 对齐（11 步）：git 根检查 → 旧 hooksPath 防线 →
//   scripts/hooks kit 拷贝（gates.local 排除）→ .githooks shim → .hooksrc 模板（不覆盖）→
//   .gitignore 追加 → boundary 采纳面（可选）→ hooksPath+commit.template → trust 存值 →
//   采纳元数据 → 指引输出。pwsh 缺席的 POSIX 环境由 install-hooks.sh -t 转调本件；
//   scaffold-repo 在 pwsh 探测失败时自动回退本件（双实现共用同一契约）。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const die = m => { console.error(`[E] ${m}`); process.exit(1); };
const info = m => console.log(`[scaffold] ${m}`);
const warn = m => console.log(`[scaffold] [警告] ${m}`);

const args = process.argv.slice(2);
const opts = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--target') {
    const v = args[++i];
    if (v === undefined || v.startsWith('--')) die('--target 缺值');
    if (opts.target) die('重复旗标: --target');
    opts.target = v;
  } else if (['--force', '--with-boundary', '--dry-run'].includes(a)) opts[a.slice(2)] = true;
  else die(a.startsWith('--') ? `未知旗标: ${a}` : `不接受位置参数: ${a}`);
}
if (!opts.target) die('缺 --target <repo>（本仓安装走 install-hooks.ps1/.sh）');
const dest = path.resolve(opts.target);
const dry = !!opts['dry-run'];

if (!fs.existsSync(path.join(dest, '.git'))) die(`目标不是 git 仓根: ${dest}`);

const git = (gargs, cwd) =>
  execFileSync('git', gargs, { cwd: cwd ?? dest, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const cp = (src, dst, note) => {
  if (dry) { info(`[dry-run] ${note}: ${src} -> ${dst}`); return; }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
};
const act = (note, fn) => { if (dry) { info(`[dry-run] ${note}`); return; } fn(); };

// 0. 既有 hooksPath 防线（与 ps1 同义：切换会停用旧体系）
const oldPath = (() => { try { return git(['config', 'core.hooksPath']); } catch { return ''; } })();
if (oldPath && oldPath !== '.githooks' && !opts.force) {
  const oldDir = path.join(dest, oldPath);
  const oldHooks = fs.existsSync(oldDir) ? fs.readdirSync(oldDir).join(', ') : '';
  warn(`目标已有 core.hooksPath=${oldPath}（hooks: ${oldHooks}）——切换将停用旧体系`);
  die('存在既有 hooksPath——确认迁移方案后用 --force 重试（或先平移旧检查到 gates.local）');
}

// 1. scripts/hooks 整目录（gates.local 显式排除——采纳侧私有住所永不属 kit）
const srcHooks = path.join(REPO_ROOT, 'scripts/hooks');
const dstHooks = path.join(dest, 'scripts/hooks');
if (dry) { info(`[dry-run] 复制 scripts/hooks（除 gates.local）-> ${dstHooks}`); }
else {
  fs.mkdirSync(dstHooks, { recursive: true });
  for (const ent of fs.readdirSync(srcHooks, { withFileTypes: true })) {
    if (ent.name === 'gates.local') continue;
    cp(path.join(srcHooks, ent.name), path.join(dstHooks, ent.name), '铺入 kit 件');
  }
}

// 2. .githooks shims（POSIX 位 chmod +x；Windows 上 git 经自带 sh 执行不需要位）
const dstShims = path.join(dest, '.githooks');
act(`复制 .githooks shim -> ${dstShims}`, () => {
  fs.mkdirSync(dstShims, { recursive: true });
  for (const f of fs.readdirSync(path.join(REPO_ROOT, '.githooks'))) {
    const d = path.join(dstShims, f);
    fs.copyFileSync(path.join(REPO_ROOT, '.githooks', f), d);
    try { fs.chmodSync(d, 0o755); } catch { /* Windows 无 POSIX 位语义 */ }
  }
});

// 3. .hooksrc 模板（不存在才铺——配置是采纳侧资产，永不覆盖）
const dstRc = path.join(dest, '.hooksrc');
if (!fs.existsSync(dstRc)) {
  act('.hooksrc <- .hooksrc.tmpl（按需裁改）', () =>
    fs.copyFileSync(path.join(REPO_ROOT, '.hooksrc.tmpl'), dstRc));
} else warn('.hooksrc 已存在，跳过（--force 不覆盖配置是刻意的）');

// 4. .gitignore 追加 .hooksrc.local（不重复追加）
const dstIgnore = path.join(dest, '.gitignore');
const gi = fs.existsSync(dstIgnore) ? fs.readFileSync(dstIgnore, 'utf8') : '';
if (!/^\.hooksrc\.local\s*$/m.test(gi)) {
  act('.gitignore += .hooksrc.local', () =>
    fs.appendFileSync(dstIgnore, '\n# 门禁引擎个人覆盖层\n.hooksrc.local\n'));
}

// 4.5 ming-boundary 采纳面（--with-boundary）
if (opts['with-boundary']) {
  cp(path.join(REPO_ROOT, 'private/engineering/ming-boundary/scripts'),
     path.join(dest, 'private/engineering/ming-boundary/scripts'), '铺入 ming-boundary 运行面');
  for (const f of ['yaml-lite.ps1', 'yaml2json.ps1']) {
    const src = path.join(REPO_ROOT, 'scripts/lib', f), dst = path.join(dest, 'scripts/lib', f);
    if (fs.existsSync(dst)) { warn(`${f} 已存在——不覆盖，请手工对齐`); continue; }
    cp(src, dst, `铺入 ${f}`);
  }
  cp(path.join(REPO_ROOT, 'scripts/hooks/gates.local/boundary-edge.mjs'),
     path.join(dest, 'scripts/hooks/gates.local/boundary-edge.mjs'), '铺入 boundary-edge 门');
  const byDst = path.join(dest, 'boundaries.yaml');
  if (!fs.existsSync(byDst)) {
    act('boundaries.yaml <- 起始模板', () =>
      fs.copyFileSync(path.join(REPO_ROOT, 'private/engineering/ming-boundary/assets/boundaries.starter.yaml'), byDst));
  } else warn('boundaries.yaml 已存在——跳过（契约归采纳侧）');
  const consReadme = path.join(dest, 'boundary.consumers/README.md');
  if (!fs.existsSync(consReadme)) {
    act('boundary.consumers/ <- 约定区+说明', () => {
      fs.mkdirSync(path.dirname(consReadme), { recursive: true });
      fs.writeFileSync(consReadme, `# boundary.consumers/ — 自定义消费方约定区

此目录文件**不会被 install-hooks 覆盖**（用户资产面，同 gates.local/ 语义）。

- 文件名即消费方 id：\`boundary.consumers/<id>.mjs\`
- 在 \`boundaries.yaml\` 的 \`consumers:\` 段**显式列名**才激活——目录内有文件不自动跑
- 契约（消费方协议 v1）：\`node <id>.mjs --facts <jsonl> --root <root> --config <json> [--apply]\`
  - \`outputs: findings\` → stdout 逐行 JSONL \`{rule,severity,unit,expect,observed,fix}\`
  - \`outputs: report\` → stdout 自由文本
  - \`outputs: files\` → stdout JSON \`{planned,written,preview?}\`，须声明 \`mutates: true\`
- 参考实现：\`private/engineering/ming-boundary/scripts/consumers/\`
`);
    });
  }
}

// 5. hooksPath + commit.template + trust（cwd 必指目标仓——engine repoRoot() 按 cwd 解析）
act('git config core.hooksPath=.githooks', () => {
  git(['config', 'core.hooksPath', '.githooks']);
  if (fs.existsSync(path.join(dest, '.gitmessage'))) git(['config', 'commit.template', '.gitmessage']);
  const r = spawnSync(process.execPath, [path.join(dstHooks, 'engine.mjs'), 'trust'],
    { cwd: dest, stdio: 'ignore' });
  if (r.error) warn(`engine trust 执行失败（不阻断）: ${r.error.message}`);
});

// 6. 采纳元数据（engine list 落后对账依据）
act('写入采纳元数据', () => {
  const gitDir = git(['rev-parse', '--absolute-git-dir']);
  const stateFile = path.join(gitDir, 'hook-engine-state.json');
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
  state.adoption = {
    sourceRepo: REPO_ROOT,
    sourceRev: (() => { try { return git(['rev-parse', 'HEAD'], REPO_ROOT); } catch { return ''; } })(),
    adoptedAt: new Date().toISOString(),
  };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
});

info('========================================================');
info(`  门禁引擎已铺入 ${path.basename(dest)}${dry ? '（dry-run 未落盘）' : ''}`);
info('  - 按需裁 .hooksrc（impact-test/pre-push-verify 可用 gate.<id>.command 配仓级命令；未配且无对应件自动缺席）');
if (opts['with-boundary']) info('  - ming-boundary 已铺：裁 boundaries.yaml 的 domains 后 extract+check 即生效');
info('  - 棕场接入建议先跑: node scripts/hooks/engine.mjs baseline --dry-run');
info('========================================================');
