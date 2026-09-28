#!/usr/bin/env node
// check-boundaries.mjs — 边界契约评估器（ADR-0008 D3/D7）
// 纯评估：facts(JSONL) × rules(boundaries.yaml|json) → violations
// 退出码契约: 0=无违规 1=有违规 2=用法/IO错 3=规则schema非法(fail-closed)
// 用法: node check-boundaries.mjs --facts F.jsonl [--rules boundaries.yaml]
//       [--json] [--staged a.mjs,b.mjs]  // staged=增量模式：只评边级规则，required 跳过

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { domainOf, parseJsonl } from './lib/facts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const YAML2JSON = path.join(REPO_ROOT, 'scripts/lib/yaml2json.ps1');

function die(msg, code = 2) {
  console.error(`[check-boundaries] ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const a = { facts: null, rules: path.join(REPO_ROOT, 'boundaries.yaml'),
              json: false, staged: null };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const take = () => argv[++i] ?? die(`${k} 缺参数`);
    if (k === '--facts') a.facts = take();
    else if (k === '--rules') a.rules = take();
    else if (k === '--json') a.json = true;
    else if (k === '--staged') a.staged = take().split(',').filter(Boolean);
    else die(`未知旗标: ${k}`);
  }
  if (!a.facts) die('--facts 必填（或 - 读 stdin）');
  return a;
}

function loadRules(p) {
  if (!fs.existsSync(p)) die(`规则文件不存在: ${p}`);
  if (/\.json$/i.test(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  // .yaml/.yml 经仓内 yaml-lite 桥（pwsh 是仓级既有依赖）
  const r = spawnSync('pwsh', ['-NoProfile', '-File', YAML2JSON, '-Path', p],
    { encoding: 'utf8' });
  if (r.error || r.status !== 0)
    die(`yaml 桥失败（需 pwsh+yaml-lite，或改用 .json 规则）: ${r.stderr || r.error?.message}`, 3);
  try { return JSON.parse(r.stdout); }
  catch { die('yaml 桥输出非 JSON', 3); }
}

// ---------- schema 校验（fail-closed：未知键/缺字段直接拒） ----------
const KNOWN_TOP = new Set(['version', 'domains', 'rules', 'meta']);
const KNOWN_RULE = new Set(['forbidden', 'allowed', 'required']);
const KNOWN_CLAUSE = new Set(['from', 'to', 'via', 'label', 'units_in', 'needs', 'to_in']);

function validateRules(rules) {
  if (!rules || typeof rules !== 'object') die('rules 非对象', 3);
  for (const k of Object.keys(rules))
    if (!KNOWN_TOP.has(k)) die(`rules 顶层未知键: ${k}`, 3);
  if (!Array.isArray(rules.domains) || !rules.domains.length)
    die('rules.domains 缺省或非数组', 3);
  for (const d of rules.domains)
    if (!d.name || !d.match) die('domains 条目需 {name, match}', 3);
  const r = rules.rules || {};
  for (const k of Object.keys(r))
    if (!KNOWN_RULE.has(k)) die(`rules.rules 未知族: ${k}`, 3);
  for (const [fam, list] of Object.entries(r)) {
    if (!Array.isArray(list)) die(`rules.${fam} 非数组`, 3);
    for (const c of list)
      for (const ck of Object.keys(c))
        if (!KNOWN_CLAUSE.has(ck)) die(`rules.${fam} 子句未知键: ${ck}`, 3);
  }
  // 归一化：from/to/via/to_in 标量 → 数组（宽容读者，加法兼容）
  for (const list of Object.values(r))
    for (const c of list)
      for (const k of ['from', 'to', 'via', 'to_in'])
        if (c[k] != null && !Array.isArray(c[k])) c[k] = [c[k]];
  return rules;
}

// ---------- 评估 ----------
// 边模型：kind∈{import,link} 的事实；src=domainOf(file)；dst=domainOf(extra.to)
// extra.external → dst='external'；extra.dead 或 scope=unresolved → dst='__dead__'
function edgeDst(f) {
  if (f.extra?.dead) return '__dead__';
  if (f.extra?.external) return 'external';
  return f.extra?.to || null;
}

function evaluate(facts, rules, stagedOnly) {
  const domains = rules.domains;
  const R = rules.rules || {};
  const violations = [];
  const edgeFacts = facts.filter((f) =>
    (f.kind === 'import' || f.kind === 'link') &&
    (!stagedOnly || stagedOnly.has(f.file)));

  for (const f of edgeFacts) {
    const src = domainOf(f.file, domains) || '__other__';
    const dstRaw = edgeDst(f);
    const dst = dstRaw === 'external' || dstRaw === '__dead__'
      ? dstRaw : (dstRaw ? domainOf(dstRaw, domains) || '__other__' : '__none__');
    const edge = { file: f.file, line: f.line, kind: f.kind,
                   name: f.name, src, dst, to: dstRaw };

    // 死链接/死引用永远违规（无需声明——无 to 的相对边即断裂）
    if (f.kind === 'link' && f.extra?.dead)
      violations.push({ ...edge, rule: 'builtin:no-dead-links', severity: 'error' });
    if (f.kind === 'import' && f.extra?.dead)
      violations.push({ ...edge, rule: 'builtin:no-dead-imports', severity: 'error' });

    for (const c of R.allowed || []) {
      // allowed 语义：from+via 命中的边，其 dst 必须在 to 名单内
      if ((c.via || []).length && !c.via.includes(f.kind)) continue;
      if (!inDomains(src, c.from)) continue;
      if (!inDomains(dst, c.to))
        violations.push({ ...edge, rule: `allowed:${c.label || '?'}`, severity: 'error' });
    }
    for (const c of R.forbidden || []) {
      if ((c.via || []).length && !c.via.includes(f.kind)) continue;
      if (!inDomains(src, c.from)) continue;
      if (inDomains(dst, c.to))
        violations.push({ ...edge, rule: `forbidden:${c.label || '?'}`, severity: 'error' });
    }
  }

  // required：units_in 每个单元至少存在一条 via 边且 dst∈to_in
  // --staged 增量模式跳过：required 是全称量化（单元集须全图可见），
  // 子集事实面下必然误报——增量门只评边级规则（forbidden/allowed/builtin）
  if (!stagedOnly) for (const c of R.required || []) {
    const units = new Map();
    for (const f of facts) {
      if (matchUnits(f.file, c.units_in)) {
        const u = unitKey(f.file, c.units_in);
        if (!units.has(u)) units.set(u, []);
        units.get(u).push(f);
      }
    }
    for (const [u, fs2] of units) {
      const ok = fs2.some((f) =>
        f.kind === c.needs &&
        !f.extra?.dead &&
        inDomains(domainOf(f.extra?.to || '', domains) || '__other__', c.to_in));
      if (!ok) violations.push({ file: u, kind: 'required', rule: `required:${c.label || '?'}`, severity: 'error' });
    }
  }
  return violations;
}

function inDomains(d, list) { return Array.isArray(list) ? list.includes(d) : list === d; }

// units_in: 'deployable/*' → 单元键 = deployable/<名>
function matchUnits(file, pat) {
  return file.startsWith(pat.slice(0, -1));
}
function unitKey(file, pat) {
  const head = pat.endsWith('/*') ? pat.slice(0, -1) : pat;
  const rest = file.slice(head.length).split('/')[0];
  return head + rest;
}

function main() {
  const a = parseArgs(process.argv);
  const rules = validateRules(loadRules(a.rules));
  const text = a.facts === '-'
    ? fs.readFileSync(0, 'utf8')
    : fs.readFileSync(a.facts, 'utf8');
  const facts = parseJsonl(text);
  const staged = a.staged ? new Set(a.staged) : null;
  const violations = evaluate(facts, rules, staged);

  if (a.json) {
    process.stdout.write(JSON.stringify({ violations, count: violations.length }, null, 1) + '\n');
  } else {
    for (const v of violations)
      console.log(`[${v.severity}] ${v.rule}  ${v.file}${v.line ? ':' + v.line : ''}` +
        (v.dst ? `  ${v.src}→${v.dst} ${v.name}` : ''));
    console.log(`[check-boundaries] edges=${facts.length} violations=${violations.length}` +
      (staged ? ` (staged: ${staged.size} 文件)` : ''));
  }
  process.exit(violations.length ? 1 : 0);
}

main();
