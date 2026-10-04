#!/usr/bin/env node
// 消费层编排者：facts 一次提取 → 多消费方分发 → 归并输出
// 用法: node run-boundary.mjs [--root R] [--rules R.yaml|R.json] [--facts F.jsonl]
//        [--facts-extra E.jsonl[,E2…]] （外部适配器事实并入——语义档证据源通道）
//        [--phase staged|ci|manual] [--staged-units a,b] [--only id,...]
//        [--apply] [--json] [--keep-facts] [--allow-degraded]
// 消费方协议 v1（临时稿）:
//   调起: node <entry> --facts <path> --root <root> --config <entry-json> [--apply]
//   outputs=findings → stdout 逐行 JSONL finding {rule,severity,unit,...}
//   outputs=report   → stdout 自由文本
//   outputs=files    → stdout JSON {planned:[],written:[],preview?};无 --apply 只准 planned(+preview)
//   非零退出 → 计 error finding <id>:crash
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadYaml } from './lib/yaml.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// --root 缺省=cwd 解析（先前硬编码指 kit 仓——从别的仓目录跑会静默评错对象）
const DEF_ROOT = process.cwd();
const EXTRACT = path.join(HERE, 'extract-facts.mjs');
const CHECK = path.join(HERE, 'check-boundaries.mjs');
const CONSUMERS_DIR = path.join(HERE, 'consumers');


// 内置目录件登记：id → 默认元数据（yaml entry 可覆写 phases/level 等）
const BUILTIN = {
  metrics:         { outputs: 'report', phases: ['staged', 'ci', 'manual'], level: 'note', mutates: false },
  'emit-skeleton': { outputs: 'files',  phases: ['manual'],                 level: 'note', mutates: true },
  diff:            { outputs: 'report', phases: ['ci', 'manual'],           level: 'warn', mutates: false },
  docclass:        { outputs: 'findings', phases: ['staged', 'ci', 'manual'], level: 'warn', mutates: false },
};
const KNOWN_CKEY = new Set(
  ['entry', 'phases', 'level', 'outputs', 'mutates', 'timeout_ms', 'baseline',
   'spec', 'args', 'note']);
const KNOWN_PHASE = new Set(['staged', 'ci', 'manual']);
const KNOWN_OUT = new Set(['findings', 'report', 'files']);
const DEFAULT_TIMEOUT = 120_000;

function die(msg, code = 2) { console.error(`[run-boundary] ${msg}`); process.exit(code); }

function parseArgs(argv) {
  const a = { root: DEF_ROOT, rules: null, facts: null, phase: 'ci',
              staged: null, only: null, apply: false, json: false, keep: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const take = () => argv[++i] ?? die(`${k} 缺参数`);
    if (k === '--root') a.root = path.resolve(take());
    else if (k === '--rules') a.rules = take();
    else if (k === '--facts') a.facts = take();
    else if (k === '--facts-extra') a.factsExtra = take().split(',').filter(Boolean);
    else if (k === '--phase') a.phase = take();
    else if (k === '--staged-units') a.staged = take().split(',').filter(Boolean);
    else if (k === '--only') a.only = take().split(',').filter(Boolean);
    else if (k === '--apply') a.apply = true;
    else if (k === '--json') a.json = true;
    else if (k === '--allow-degraded') a.allowDegraded = true;
    else if (k === '--keep' || k === '--keep-facts') a.keep = true;
    else die(`未知旗标: ${k}`);
  }
  if (!KNOWN_PHASE.has(a.phase)) die(`未知 phase: ${a.phase}`);
  return a;
}

function loadRules(p, root) {
  if (!fs.existsSync(p)) return null;
  if (/\.json$/i.test(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  return loadYaml(p);
}

// ---------- consumers 段 lint + 解析（fail-closed：列了名找不到实现=错） ----------
function resolveConsumers(section, root, warnings) {
  const out = [], errors = [];
  for (const [id, raw] of Object.entries(section || {})) {
    const errBefore = errors.length;
    if (raw != null && typeof raw !== 'object') {
      errors.push(`consumer ${id}: 配置形态非法（yaml-lite 不支持 flow-map '{...}'——改用块式多行键值）`);
      continue;
    }
    const cfg = { ...(raw || {}) };
    for (const k of Object.keys(cfg))
      if (!KNOWN_CKEY.has(k)) warnings.push(`consumer ${id}: 未知键 '${k}'`);
    const meta = { ...(BUILTIN[id] || {}), ...cfg };
    meta.outputs = meta.outputs || 'findings';
    meta.phases = meta.phases || ['ci', 'manual'];
    meta.level = meta.level || 'warn';
    for (const p of meta.phases)
      if (!KNOWN_PHASE.has(p)) errors.push(`consumer ${id}: 未知 phase '${p}'`);
    if (!KNOWN_OUT.has(meta.outputs)) errors.push(`consumer ${id}: 未知 outputs '${meta.outputs}'`);
    if (meta.outputs === 'files' && meta.mutates !== true)
      errors.push(`consumer ${id}: outputs=files 必须 mutates:true`);
    let entry = null;
    if (cfg.entry) {
      const p = path.resolve(root, cfg.entry);
      if (!(p === root || p.startsWith(root + path.sep)))
        errors.push(`consumer ${id}: entry 越出仓根: ${cfg.entry}`);
      else if (fs.existsSync(p)) entry = p;
      else errors.push(`consumer ${id}: entry 不存在: ${cfg.entry}`);
    } else {
      const local = path.join(root, 'boundary.consumers', `${id}.mjs`);
      const builtin = path.join(CONSUMERS_DIR, `${id}.mjs`);
      if (fs.existsSync(local)) entry = local;
      else if (fs.existsSync(builtin)) entry = builtin;
      else errors.push(`consumer ${id}: 无实现（entry 未给，boundary.consumers/ 与内置目录均无 ${id}.mjs）`);
    }
    if (errors.length === errBefore) out.push({ id, entry, meta });
  }
  return { out, errors };
}

// ---------- 主流程 ----------
const A = parseArgs(process.argv);

// 启动期收割（bounded best-effort，substrate orphan_reaper 形态）：
// 只碰 skc-*/遗留 mb-* transit 前缀且超龄者；SKC_REAP_OFF=1 可关。
// 收割失败不阻断主流程；private 不许 import scripts（R6）故走 spawn 非 import。
try {
  if (process.env.SKC_REAP_OFF !== '1') {
    const CLEAN_TEMP = path.join(HERE, '..', '..', '..', '..', 'scripts', 'clean-temp.mjs');
    if (fs.existsSync(CLEAN_TEMP))
      spawnSync(process.execPath, [CLEAN_TEMP, '--apply', '--quiet', '--budget', '2000'],
        { stdio: 'ignore', timeout: 15_000 });
  }
} catch { /* 收割面 best-effort */ }

const rulesPath = A.rules ? path.resolve(A.rules) : path.join(A.root, 'boundaries.yaml');
const contract = fs.existsSync(rulesPath) ? loadRules(rulesPath, A.root) : null;
if (!contract && !A.facts) die(`无规则文件且未给 --facts: ${rulesPath}`);

// 提取一次（--facts 提供则跳过）
// 临时产物生命周期：exit 钩子兜底清理——die()/异常早退同样生效，
// 不被主流程尾部清理点截断；SIGKILL 级硬崩由外部 reaper 兜底（命名域 skc/mb-*）。
const tmpFiles = [];
const trackTmp = (p) => {
  if (!tmpFiles.length) process.on('exit', () => {
    if (A.keep) return;
    for (const f of tmpFiles) { try { fs.rmSync(f, { force: true }); } catch { /* 尽力而为 */ } }
  });
  tmpFiles.push(p);
  return p;
};
let factsPath = A.facts, tmpFacts = null, tmpSpec = null;
if (!factsPath) {
  tmpFacts = trackTmp(path.join(os.tmpdir(), `skc-mb-facts-${process.pid}.jsonl`));
  const exArgv = [EXTRACT, '--root', A.root, '--out', tmpFacts];
  // staged 相位=增量语义：只抽 staged 单元集（pre-commit 面全仓抽取=25s 不可行）
  if (A.phase === 'staged' && A.staged?.length)
    exArgv.push('--files', A.staged.join(','));
  // hook 语境允许 regex 降级（ast-grep 缺席仓也该有门而不是罢工）
  if (A.allowDegraded) exArgv.push('--allow-degraded');
  // 契约自带 producers.ref 条款 → 转 JSON 规格喂 extract（机制词表住采纳仓
  // 契约里，kit 不内嵌 ops-register 这类私有词——生产/消费职责分离）
  if (contract?.producers?.ref?.length) {
    tmpSpec = trackTmp(path.join(os.tmpdir(), `skc-mb-spec-${process.pid}.json`));
    fs.writeFileSync(tmpSpec, JSON.stringify({ ref: contract.producers.ref }));
    exArgv.push('--emit-spec', tmpSpec);
  }
  const r = spawnSync(process.execPath, exArgv,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 600_000 });
  if (r.error || r.status !== 0) die(`facts 提取失败: ${r.stderr || r.error?.message}`, 3);
  factsPath = tmpFacts;
  console.error((r.stdout || '').trim());
}

// 外部事实归并口（ADR-0010 生产者侧中/重档）：scip/cargo/rustdoc 适配器
// 产物以同一份 JSONL 契约并入——fidelity/extra.producer 自行带出身戳。
// 不改写源文件：--facts 给的是用户文件时也并到新 tmp 副本。
if (A.factsExtra?.length) {
  let merged = fs.readFileSync(factsPath, 'utf8');
  for (const extra of A.factsExtra) {
    const p = path.resolve(extra);
    if (!fs.existsSync(p)) die(`--facts-extra 不存在: ${p}`);
    const chunk = fs.readFileSync(p, 'utf8');
    // 外部事实=不可信输入：逐行校验 JSONL+必备键，坏行 fail-closed 而非带病并入
    for (const [li, raw] of chunk.split('\n').entries()) {
      const t = raw.trim();
      if (!t) continue;
      let f;
      try { f = JSON.parse(t); }
      catch { die(`--facts-extra ${p}:${li + 1} 非 JSONL 行`, 2); }
      if (f.v !== 1 || typeof f.unit !== 'string' || typeof f.kind !== 'string' ||
          typeof f.file !== 'string' || typeof f.fidelity !== 'string')
          die(`--facts-extra ${p}:${li + 1} 缺 fact 必备键 (v/unit/kind/file/fidelity)`, 2);
    }
    merged += (merged.length && !merged.endsWith('\n') ? '\n' : '') + chunk;
  }
  const mergedPath = trackTmp(path.join(os.tmpdir(), `skc-mb-facts-merged-${process.pid}.jsonl`));
  fs.writeFileSync(mergedPath, merged);
  factsPath = mergedPath;
}

// 调度：evaluator 恒在（除非 --only 排除），其余按 consumers 段 + phase 过滤
const warnings = [], errors = [];
const sel = contract?.consumers
  ? resolveConsumers(contract.consumers, A.root, warnings) : { out: [], errors: [] };
errors.push(...sel.errors.map(e => `CONFIG ${e}`));
const inPhase = (c) => c.meta.phases.includes(A.phase);
const picked = sel.out.filter(c => (!A.only || A.only.includes(c.id)) && inPhase(c));
const stagedNoUnits = A.phase === 'staged' && !A.staged?.length;
let runEval = (!A.only || A.only.includes('check')) && contract
  && A.phase !== 'manual' && !stagedNoUnits;
// staged 相位下 evaluator 必须拿到 staged 单元集——否则部分事实+全图量化=否定不安全误报
if (stagedNoUnits && contract)
  errors.push('CONFIG --phase staged 需 --staged-units <逗号清单>（否则 ∀ 族在部分视图上误评）');

const findings = [], reports = [];
const pushFindings = (via, text) => {
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { const f = JSON.parse(line); f.via = f.via || via; findings.push(f); }
    catch { /* findings 型通道混入非 JSON 行=忽略（report 文本走 reports） */ }
  }
};

// 采纳空契约面：无 rules 的仓（emit/diff/metrics 先行、契约后补）evaluator
// 跳过而非撞 check-boundaries 的 domains 硬性校验——evaluator 也是消费方之一
const hasRules = contract && contract.rules && typeof contract.rules === 'object'
  && Object.keys(contract.rules).length > 0;
if (runEval && !hasRules) {
  runEval = false;
  warnings.push('contract 无 rules 条目——evaluator 跳过（仅消费方运行）');
}

if (runEval) {
  const argv = [CHECK, '--facts', factsPath, '--rules', rulesPath, '--json'];
  if (A.phase === 'staged' && A.staged?.length) argv.push('--staged', A.staged.join(','));
  const r = spawnSync(process.execPath, argv,
    { encoding: 'utf8', timeout: 600_000, maxBuffer: 512 << 20 });
  if (r.error || (r.status !== 0 && r.status !== 1))
    errors.push(`evaluator crash: ${r.stderr || r.error?.message}`);
  else {
    const out = JSON.parse(r.stdout);
    for (const f of out.violations || []) { f.via = 'check'; findings.push(f); }
    for (const w of out.config_warnings || []) warnings.push(w);
  }
}

for (const c of picked) {
  if (!c.entry) { errors.push(`consumer ${c.id}: 未解析到实现`); continue; }
  const argv = [c.entry, '--facts', factsPath, '--root', A.root,
    '--config', JSON.stringify({ ...c.meta, id: c.id })];
  if (A.apply) argv.push('--apply');
  if (Array.isArray(c.meta.args)) argv.push(...c.meta.args.map(String));
  const r = spawnSync(process.execPath, argv,
    { encoding: 'utf8', timeout: c.meta.timeout_ms || DEFAULT_TIMEOUT, maxBuffer: 512 << 20 });
  if (r.error || r.status !== 0) {
    findings.push({ rule: `${c.id}:crash`, severity: 'error', unit: c.id,
      expect: 'exit 0', observed: `${r.status ?? 'signal'} ${r.error?.message || ''}`.trim(),
      fix: r.stderr?.slice(0, 500) || '见 stderr', via: c.id });
    continue;
  }
  if (c.meta.outputs === 'findings') pushFindings(c.id, r.stdout);
  else {
    let text = r.stdout.trimEnd();
    if (c.meta.outputs === 'files') {          // files 型: JSON 契约, preview 友好显示
      try {
        const j = JSON.parse(text);
        text = `planned=${JSON.stringify(j.planned || [])}` +
          (j.written?.length ? ` written=${JSON.stringify(j.written)}` : '') +
          (j.preview ? `\n${j.preview}` : '');
      } catch { /* 非 JSON 输出原样透传 */ }
    }
    reports.push({ id: c.id, outputs: c.meta.outputs, text });
  }
}

// findings 回填 fidelity 注记（additive）——file|line|kind 回查事实，
// 下游（gate 的 regex-degraded 封顶 warn 等交叉表降权）直接消费不再自查
try {
  const fidMap = new Map();
  for (const line of fs.readFileSync(factsPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const f = JSON.parse(line);
    fidMap.set(`${f.file}|${f.line}|${f.kind}`, f.fidelity);
  }
  for (const f of findings) {
    const fid = fidMap.get(`${f.file}|${f.line}|${f.kind}`)
      || fidMap.get(`${f.unit}|${f.line}|${f.kind}`);
    if (fid) f.fidelity = fid;
  }
} catch { /* 注记失败不阻塞主通道 */ }

findings.sort((a, b) => (a.unit || '').localeCompare(b.unit || '')
  || (a.line || 0) - (b.line || 0) || (a.rule || '').localeCompare(b.rule || ''));

// 临时文件清理由 process.on('exit') 兜底（trackTmp 登记处）——
// 此处不再手写 rmSync，防止新增 die() 路径绕过清理
const hasErr = findings.some(f => f.severity === 'error') || errors.length > 0;
// root/phase 回显走 stderr——JSON 模式同样须可见（错上下文跑的诊断锚）
console.error(`[run-boundary] root=${A.root} phase=${A.phase} consumers=${picked.map(c => c.id).join(',') || '-'}` +
  ` findings=${findings.length} reports=${reports.length}`);
if (A.json) console.log(JSON.stringify({ findings, reports, warnings, errors }, null, 1));
else {
  for (const w of warnings) console.error(`[config] ${w}`);
  for (const r of reports) console.log(`\n== [${r.id}] (${r.outputs}) ==\n${r.text}`);
  for (const f of findings)
    console.log(`[${f.severity}] ${f.unit}${f.line ? ':' + f.line : ''} ${f.rule}` +
      (f.expect ? ` — expect ${f.expect}, got ${f.observed}` : '') + (f.via ? ` (via ${f.via})` : ''));
  for (const e of errors) console.error(`[error] ${e}`);
}
process.exit(hasErr ? 1 : 0);
