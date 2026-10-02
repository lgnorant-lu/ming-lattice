#!/usr/bin/env node
// check-boundaries.mjs — 边界契约评估器（ADR-0008 D3/D7；v1.1 规范形实现）
// 纯评估：facts(JSONL) × rules(boundaries.yaml|json) → findings
// 规范形: ∀x∈SubjectSet : Witness(x)；evaluator 核 = Q(逐单元边/属性量化) + P(集对账)
//   Q-∃(增量安全): forbidden/allowed/builtin-dead
//   Q-∀(需全图):   required/covered/isolated —— --staged 跳过（Rego 否定安全律）
//   P(需全图):     parity
//   unit-local(增量安全): attrs
// 退出码契约: 0=无违规 1=有违规 2=用法/IO错 3=规则schema非法(fail-closed)
// 用法: node check-boundaries.mjs --facts F.jsonl [--rules boundaries.yaml]
//       [--json] [--staged a.mjs,b.mjs]

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { domainOf, parseJsonl, globMatch, baseName, unitFile } from './lib/facts.mjs';
import { loadYaml } from './lib/yaml.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');

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
  // .yaml/.yml：lite 解析优先（零子进程跨端），不支持的构造回退 pwsh 桥
  return loadYaml(p);
}

// ---------- schema 校验（fail-closed：未知键/缺字段直接拒） ----------
const KNOWN_TOP = new Set(
  ['version', 'domains', 'rules', 'meta', 'manifest', 'exemptions',
   'consumers', 'extends', 'producers']);
  // consumers=消费方调度(run-boundary 读); extends=预设留位(候审)
  // producers=契约自带生产器规格（ref 边机制形状，run-boundary 经
  //   --emit-spec 喂回 extract——kit 不内嵌采纳仓私有机制词表）
const KNOWN_RULE = new Set(
  ['forbidden', 'allowed', 'required', 'covered', 'isolated', 'parity', 'attrs',
   'reachable']);
const KNOWN_CLAUSE = new Set([
  'name', 'label', 'severity', 'why',                        // 元数据：name=ruleId 锚；label=兼容别名
  'from', 'to', 'via', 'units_in', 'needs', 'to_in', 'from_in', // 边量化参数
  'of_kind', 'exempt',                                        // 单元集过滤/豁免
  'declared', 'observed_units_in', 'observed_kind',           // parity 集对账
  'declared_from', 'observed_from', 'direction',              // parity v1.4：边派生集
  'name_match', 'name_not_match',                             // attrs 见证
  'roots',                                                    // reachable 根集 globs
]);
const KNOWN_MANIFEST = new Set(
  ['node_kinds', 'edge_kinds', 'extra_keys', 'families', 'extractors', 'find_levels']);
const BUILTIN_NODE_KINDS = new Set(['file', 'dir', 'decl']);
const BUILTIN_EDGE_KINDS = new Set(['import', 'link', 'docref', 'mention', 'declare', 'export']);
const LEVELS = new Set(['error', 'warn', 'note']);
// staged 安全表（规格条款，不是实现细节）：不完整视图只许 ∃/unit-local 族
const STAGED_SAFE = new Set(['forbidden', 'allowed', 'attrs']);
const FULL_ONLY = new Set(['required', 'covered', 'isolated', 'parity', 'reachable']);

function validateRules(rules) {
  if (!rules || typeof rules !== 'object') die('rules 非对象', 3);
  for (const k of Object.keys(rules))
    if (!KNOWN_TOP.has(k)) die(`rules 顶层未知键: ${k}`, 3);
  if (!Array.isArray(rules.domains) || !rules.domains.length)
    die('rules.domains 缺省或非数组', 3);
  for (const d of rules.domains)
    if (!d.name || !d.match) die('domains 条目需 {name, match}', 3);

  // manifest：词表注册段（fail-closed——用未注册词表的规则即配置 bug）
  const man = rules.manifest || {};
  for (const k of Object.keys(man))
    if (!KNOWN_MANIFEST.has(k)) die(`manifest 未知键: ${k}`, 3);
  for (const k of Object.keys(man))
    if (man[k] != null && !Array.isArray(man[k])) die(`manifest.${k} 须为数组`, 3);
  const edgeKinds = new Set([...BUILTIN_EDGE_KINDS, ...(man.edge_kinds || [])]);
  const fams = man.families ? new Set(man.families) : null;

  // exemptions：顶层豁免名单 {unit|glob, why?, until?}
  const ex = rules.exemptions || [];
  if (!Array.isArray(ex)) die('exemptions 须为数组', 3);
  for (const e of ex)
    if (typeof e === 'object' && e !== null &&
        ((!e.unit && !e.glob) || !e.why))
      die('exemptions 条目需 {unit|glob, why}——豁免不带理由即失控点', 3);

  const r = rules.rules || {};
  for (const k of Object.keys(r)) {
    if (!KNOWN_RULE.has(k)) die(`rules.rules 未知族: ${k}`, 3);
    if (fams && !fams.has(k)) die(`rules.rules 族未在 manifest.families 注册: ${k}`, 3);
  }
  let i = 0;
  for (const [fam, list] of Object.entries(r)) {
    if (!Array.isArray(list)) die(`rules.${fam} 非数组`, 3);
    for (const c of list) {
      i++;
      for (const ck of Object.keys(c))
        if (!KNOWN_CLAUSE.has(ck)) die(`rules.${fam} 子句未知键: ${ck}`, 3);
      c._synthName = !(c.name || c.label);          // 合成名标记（lint 提示用）
      c.name = c.name || c.label || `${fam}#${i}`; // ruleId 归一化（label 是 v1 别名）
      if (c.severity != null && !LEVELS.has(c.severity))
        die(`rules.${fam}[${c.name}] severity 须∈error|warn|note`, 3);
      for (const k of ['via', 'needs', 'to', 'from', 'to_in', 'from_in',
                       'exempt', 'declared', 'name_match', 'name_not_match',
                       'roots'])
        if (c[k] != null && !Array.isArray(c[k])) c[k] = [c[k]];
      // via/needs 词表校验：未注册的边 kind = fail-closed（词表即数据）
      for (const k of ['via', 'needs'])
        for (const v of c[k] || [])
          if (!edgeKinds.has(v))
            die(`rules.${fam}[${c.name}] ${k} 引用未注册边 kind: ${v}`, 3);
      // parity 边派生集选择子：{kind, mechanism, units_in, name} 已知键；
      // direction 词表；declared_from/observed_from 须与 declared/
      // observed_* 互斥（同一条 parity 不混两种集源）
      for (const sk of ['declared_from', 'observed_from']) {
        if (c[sk] == null) continue;
        if (typeof c[sk] !== 'object')
          die(`rules.${fam}[${c.name}] ${sk} 须为选择子对象`, 3);
        for (const k of Object.keys(c[sk]))
          if (!['kind', 'mechanism', 'units_in', 'name'].includes(k))
            die(`rules.${fam}[${c.name}] ${sk} 未知键: ${k}`, 3);
      }
      if (c.declared_from && c.declared)
        die(`rules.${fam}[${c.name}] declared_from 与 declared 互斥`, 3);
      if (c.observed_from && (c.observed_units_in || c.observed_kind))
        die(`rules.${fam}[${c.name}] observed_from 与 observed_units_in/kind 互斥`, 3);
      if (c.direction != null &&
          !['both', 'missing-only', 'undeclared-only'].includes(c.direction))
        die(`rules.${fam}[${c.name}] direction 须∈both|missing-only|undeclared-only`, 3);
      if (fam === 'reachable' && !c.roots?.length)
        die(`rules.reachable[${c.name}] 缺 roots 根集 globs`, 3);
    }
  }

  // producers：契约自带生产器规格（ref 边机制形状）——形状 fail-closed，
  // 语义校验在 extract 侧（callee regex 合法性、lang 支持面）
  const prod = rules.producers || {};
  for (const k of Object.keys(prod))
    if (!['ref'].includes(k)) die(`producers 未知键: ${k}`, 3);
  for (const [i, s] of (prod.ref || []).entries()) {
    if (typeof s !== 'object' || s === null)
      die(`producers.ref[${i}] 非对象`, 3);
    for (const k of Object.keys(s))
      if (!['lang', 'callee', 'mechanism', 'role', 'name_args',
            'symbol_arg', 'for_expand', 'units_in', 'const_files'].includes(k))
        die(`producers.ref[${i}] 未知键: ${k}`, 3);
    if (!s.lang || !s.callee || !s.mechanism || !s.role ||
        !Array.isArray(s.name_args))
      die(`producers.ref[${i}] 缺必备键 lang/callee/mechanism/role/name_args`, 3);
  }
  return rules;
}

// ruleset lint：配置级自检（非致命——deny-overrides 已定语义，但交集多半是笔误）
function lintRules(rules) {
  const R = rules.rules || {};
  const warn = [];
  const overlap = (a, b) => !a?.length || !b?.length || a.some((x) => b.includes(x));
  for (const cf of R.forbidden || [])
    for (const ca of R.allowed || [])
      if (overlap(cf.from, ca.from) && overlap(cf.via, ca.via) && overlap(cf.to, ca.to))
        warn.push(`ruleset-lint: forbidden[${cf.name}] ∩ allowed[${ca.name}] ` +
          `域交叠——deny-overrides 下 forbidden 赢，确认非笔误`);
  // 域引用 lint：from/to/from_in/to_in 收域名（非 glob）——引用未声明域=死规则
  const SENTINELS = new Set(['external', '__other__', '__dead__', '__none__']);
  const domNames = new Set((rules.domains || []).map((d) => d.name));
  for (const [fam, list] of Object.entries(R))
    for (const c of list) {
      if (c._synthName)
        warn.push(`ruleset-lint: ${fam}[${c.name}] 缺 name——建议显式 ruleId 便于豁免锚定`);
      for (const k of ['from', 'to', 'from_in', 'to_in'])
        for (const v of c[k] || [])
          if (!domNames.has(v) && !SENTINELS.has(v))
            warn.push(`ruleset-lint: ${fam}[${c.name}] ${k} 引用未声明域 '${v}'` +
              `——域键收域名非 glob（units_in/exempt 才是 glob），当前为死规则`);
    }
  return warn;
}

// ---------- 评估 ----------
// 边模型：kind∈边词表 或 extra.to 在场的事实；src=domainOf(file)；dst=domainOf(extra.to)
// extra.external → dst='external'；extra.dead 或 scope=unresolved → dst='__dead__'
function edgeDst(f) {
  if (f.extra?.dead) return '__dead__';
  if (f.extra?.external) return 'external';
  return f.extra?.to || null;
}
const isEdgeFact = (f, edgeKinds) =>
  edgeKinds.has(f.kind) || (f.extra && f.extra.to !== undefined);

function inDomains(d, list) { return Array.isArray(list) ? list.includes(d) : list === d; }
const sev = (c) => c.severity || 'error';

function evaluate(facts, rules, stagedOnly) {
  const domains = rules.domains;
  const R = rules.rules || {};
  const violations = [];
  const man = rules.manifest || {};
  const edgeKinds = new Set([...BUILTIN_EDGE_KINDS, ...(man.edge_kinds || [])]);
  const nodeKinds = new Set([...BUILTIN_NODE_KINDS, ...(man.node_kinds || [])]);

  const edges = facts.filter((f) => isEdgeFact(f, edgeKinds));
  // staged 视图：边保留 = 源文件或目标单元在 staged 集
  // （declare 边 file=.gitignore 而 to=staged 文件——目标侧命中同样要评）
  const viewEdges = stagedOnly
    ? edges.filter((e) => stagedOnly.has(e.file) || stagedOnly.has(e.extra?.to))
    : edges;

  // 入度索引（covered/isolated 用）：unit → 指向它的边
  const inbound = new Map(), outbound = new Map();
  for (const e of edges) {
    const t = e.extra?.to;
    if (t != null) {
      const s = inbound.get(t) || []; s.push(e); inbound.set(t, s);
    }
    const s = outbound.get(e.unit) || []; s.push(e); outbound.set(e.unit, s);
  }

  // 主体集：node-kind 事实按 unit 去重（file/dir/decl 是量化主体；边不是主体）
  const subjects = new Map();
  for (const f of facts) {
    if (!nodeKinds.has(f.kind)) continue;
    if (!subjects.has(f.unit))
      subjects.set(f.unit, { unit: f.unit, file: f.file, kind: f.kind });
  }
  const exemptGlobs = (rules.exemptions || []).map((e) =>
    typeof e === 'string' ? e : (e.unit || e.glob));

  function* selectUnits(c) {
    const pats = [].concat(c.units_in || []);
    for (const u of subjects.values()) {
      if (c.of_kind && u.kind !== c.of_kind) continue;
      if (pats.length && !pats.some((p) => globMatch(unitFile(u.unit), p) || globMatch(u.unit, p)))
        continue;
      if (stagedOnly && !stagedOnly.has(u.file)) continue;
      yield u;
    }
  }
  const isExempt = (u, c) =>
    [...(c.exempt || []), ...exemptGlobs]
      .some((g) => g && (globMatch(u.unit, g) || globMatch(u.file, g)));

  // ---------- Q-∃ 族：逐边检测（staged 安全） ----------
  const fileExempt = (file) =>
    exemptGlobs.some((g) => g && globMatch(file, g));
  for (const f of viewEdges) {
    const src = domainOf(f.file, domains) || '__other__';
    const dstRaw = edgeDst(f);
    const dst = dstRaw === 'external' || dstRaw === '__dead__'
      ? dstRaw : (dstRaw ? domainOf(dstRaw, domains) || '__other__' : '__none__');
    const edge = { file: f.file, line: f.line, kind: f.kind,
                   name: f.name, src, dst, to: dstRaw, unit: f.unit };

    // 死链接/死引用永远违规（无需声明——无 to 的相对边即断裂）
    // 例外：豁免文件不出 finding（vendored 上游死链是上游维护面，非本仓契约）
    if ((f.kind === 'link' || f.kind === 'docref') && f.extra?.dead && !fileExempt(f.file))
      violations.push({ ...edge, rule: 'builtin:no-dead-links', severity: 'error',
        expect: '链接目标可解析', observed: `无法解析 ${f.extra?.to || f.name}`,
        fix: '修复路径或移除引用' });
    if (f.kind === 'import' && f.extra?.dead && !fileExempt(f.file))
      violations.push({ ...edge, rule: 'builtin:no-dead-imports', severity: 'error',
        expect: 'import 目标可解析', observed: `无法解析 ${f.name}`,
        fix: '修复 specifier 或补目标文件' });

    for (const c of R.allowed || []) {
      // allowed 语义：from+via 命中的边，其 dst 必须在 to 名单内（deny-overrides：
      // 若同边也中 forbidden，forbidden 违规照样产出——交集配置属 ruleset-lint 范畴）
      if ((c.via || []).length && !c.via.includes(f.kind)) continue;
      if (!inDomains(src, c.from)) continue;
      if (!inDomains(dst, c.to))
        violations.push({ ...edge, rule: `allowed:${c.name}`, severity: sev(c),
          expect: `目标域∈{${(c.to || []).join(',')}}`, observed: `命中 ${dst}`,
          fix: '改向允许目标，或将目标域补进 to 名单' });
    }
    for (const c of R.forbidden || []) {
      if ((c.via || []).length && !c.via.includes(f.kind)) continue;
      if (!inDomains(src, c.from)) continue;
      if (inDomains(dst, c.to))
        violations.push({ ...edge, rule: `forbidden:${c.name}`, severity: sev(c),
          expect: `${f.kind} 边 ${src}→${dst} 不应存在`, observed: `${f.file}:${f.line || '?'} → ${f.name}`,
          fix: '移除该依赖边，或调整域归属/豁免' });
    }
  }

  // ---------- Q-∀ / P 族：全图量化，staged 一律跳过 ----------
  // required（v1 语义保留：units_in 前缀 glob，unit=首段键；needs/to_in 可选=任意）
  if (!stagedOnly) {
    for (const c of R.required || []) {
      const units = new Map();
      for (const f of facts) {
        if (matchUnits(f.file, c.units_in)) {
          const u = unitKey(f.file, c.units_in);
          if (!units.has(u)) units.set(u, []);
          units.get(u).push(f);
        }
      }
      for (const [u, fs2] of units) {
        if (exemptGlobs.some((g) => g && (globMatch(u, g) || globMatch(unitFile(u), g))))
          continue;
        const ok = fs2.some((f) =>
          (!c.needs?.length || c.needs.includes(f.kind)) &&
          !f.extra?.dead &&
          (!c.to_in ||
            inDomains(domainOf(f.extra?.to || '', domains) || '__other__', c.to_in)));
        if (!ok) violations.push({ file: u, unit: u, kind: 'required',
          rule: `required:${c.name}`, severity: sev(c),
          expect: `单元须有 ${c.needs || '任意'} 边` + (c.to_in ? ` 至∈{${c.to_in}}` : ''),
          observed: '无满足条件的事实', fix: '补满足条件的声明/引用，或收窄 units_in' });
      }
    }

    // covered：∀u∈S : ∃e∈inbound(u) : e.kind∈needs ∧ (from_in ⇒ domainOf(e.file)∈from_in)
    for (const c of R.covered || []) {
      for (const u of selectUnits(c)) {
        if (isExempt(u, c)) continue;
        const ins = (inbound.get(u.unit) || []).filter((e) =>
          (!c.needs || c.needs.length === 0 || c.needs.includes(e.kind)) &&
          (!c.from_in ||
            inDomains(domainOf(e.file, domains) || '__other__', c.from_in)));
        if (!ins.length)
          violations.push({ file: u.file, unit: u.unit, kind: 'covered',
            rule: `covered:${c.name}`, severity: sev(c),
            expect: `被 ≥1 条 ${(c.needs || []).join('|') || '任意'} 边覆盖` +
              (c.from_in ? `（源域∈{${c.from_in}}）` : ''),
            observed: '零入度', fix: '在声明源/文档索引中补引用，或将其移出断言域' });
      }
    }

    // isolated：∀u∈S : ∄关联边（via 限定，缺省=全部边）——豁免不算关联
    for (const c of R.isolated || []) {
      for (const u of selectUnits(c)) {
        const rel = [...(inbound.get(u.unit) || []), ...(outbound.get(u.unit) || [])]
          .filter((e) => !(e.kind === 'declare' && e.extra?.source === 'exempt'))
          .filter((e) => !c.via?.length || c.via.includes(e.kind));
        if (rel.length && !isExempt(u, c))
          violations.push({ file: u.file, unit: u.unit, kind: 'isolated',
            rule: `isolated:${c.name}`, severity: sev(c),
            expect: '断言域内无关联边' + (c.via?.length ? `（via∈{${c.via}}）` : ''),
            observed: `${rel.length} 条关联边`, fix: '移出关联、加豁免，或收窄 units_in' });
      }
    }

    // reachable：∀f∈S : f∈Reach(roots) —— mark-sweep 孤儿检测（文件粒度）
    // 语义：roots glob 命中的文件恒可达；沿 via 边（缺省=全部边）file→to
    // 有向 BFS；S∩不可达=孤儿候选件（非判官——是删是留人裁决）。
    // 只沿 resolve 成功的边传播（dead/external 不续传播）。
    for (const c of R.reachable || []) {
      const files = new Set(facts.map((f) => f.file));
      const adj = new Map();
      for (const e of edges) {
        const to = e.extra?.to;
        if (to == null || e.extra?.dead || e.extra?.external) continue;
        if (c.via?.length && !c.via.includes(e.kind)) continue;
        let s = adj.get(e.file);
        if (!s) { s = []; adj.set(e.file, s); }
        s.push(to);
      }
      const isExemptFile = (f) =>
        [...(c.exempt || []), ...exemptGlobs].some((g) => g && globMatch(f, g));
      const reached = new Set();
      const queue = [];
      for (const f of files)
        if (c.roots.some((g) => globMatch(f, g))) { reached.add(f); queue.push(f); }
      for (let i = 0; i < queue.length; i++)
        for (const nxt of adj.get(queue[i]) || [])
          if (files.has(nxt) && !reached.has(nxt)) { reached.add(nxt); queue.push(nxt); }
      const unitPats = [].concat(c.units_in || []);
      for (const f of files) {
        if (unitPats.length &&
            !unitPats.some((p) => globMatch(f, p))) continue;
        if (reached.has(f) || isExemptFile(f)) continue;
        violations.push({ file: f, unit: f, kind: 'reachable',
          rule: `reachable:${c.name}`, severity: sev(c),
          expect: `可自根集 {${c.roots.join(',')}} 沿 ` +
            `${c.via?.length ? `{${c.via.join(',')}} 边` : '任意边'}到达`,
          observed: '根集可达性闭包外——孤儿候选',
          fix: '确认删除/接入引用链/加豁免或根' });
      }
    }

    // parity：declared ⟺ observed 集对账（P 形：双向差集各产违规）
    // v1.4 扩展：declared_from/observed_from 边派生集（选择子
    //   {kind, mechanism, units_in} 收匹配事实的 name 入集——ops-register
    //   ⟺ ops-dispatch 这类符号对集的源是边不是单元）；
    //   direction: both(默认双向)|missing-only(只报 declared⊄observed)|
    //              undeclared-only(只报 observed⊄declared)
    for (const c of R.parity || []) {
      // collect 返回 Map(name→首个命中源文件)——违规 file 锚回事实源文件，
      // 豁免既能按名字 glob（'Zeta.*'）也能按源文件 glob（'crates/*/tests/**'）
      const collect = (sel) => {
        const m = new Map();
        if (!sel) return null;
        for (const f of facts) {
          if (sel.kind && f.kind !== sel.kind) continue;
          if (sel.mechanism && f.extra?.mechanism !== sel.mechanism) continue;
          if (sel.units_in && ![].concat(sel.units_in)
            .some((p) => globMatch(f.file, p))) continue;
          if (sel.name && !m.has(f.name)) m.set(f.name, f.file);
        }
        return m;
      };
      const declared = c.declared_from ? collect(c.declared_from)
        : new Map([].concat(c.declared || []).map((d) => [d, unitFile(d)]));
      let observed = null;
      if (c.observed_from) {
        observed = collect(c.observed_from);
      } else {
        observed = new Map();
        for (const u of subjects.values()) {
          if (c.observed_kind && u.kind !== c.observed_kind) continue;
          if (c.observed_units_in &&
              ![].concat(c.observed_units_in)
                .some((p) => globMatch(unitFile(u.unit), p) || globMatch(u.unit, p)))
            continue;
          observed.set(u.unit, unitFile(u.unit));
        }
      }
      // 规则级 c.exempt 优先于全局——parity 的名豁免（'UNRESOLVED.*'）若进
      // 全局会污染其他规则面；两表都支持名 glob 与源文件 glob 双通道
      const exempt = (name, file) =>
        [...(c.exempt || []), ...exemptGlobs].some((g) => g &&
          (globMatch(name, g) || globMatch(unitFile(name), g) ||
           (file && globMatch(file, g))));
      // direction 语义：missing-only=只报 declared∉observed；
      // undeclared-only=只报 observed∉declared；both=双向全报
      const dir = c.direction || 'both';
      if (dir !== 'undeclared-only')
        for (const [d, f0] of [...declared].sort(([a], [b]) => a < b ? -1 : a > b))
          if (!observed.has(d) && !exempt(d, f0))
            violations.push({ file: f0 || d, unit: d, kind: 'parity',
              rule: `parity:${c.name}:missing`, severity: sev(c),
              expect: '声明的单元在观察集存在', observed: '缺失',
              fix: '补齐实现或从声明集移除该条目' });
      if (dir !== 'missing-only')
        for (const [o, f0] of [...observed].sort(([a], [b]) => a < b ? -1 : a > b))
          if (!declared.has(o) && !exempt(o, f0))
            violations.push({ file: f0 || unitFile(o), unit: o, kind: 'parity',
              rule: `parity:${c.name}:undeclared`, severity: sev(c),
              expect: '观察到的单元在声明集登记', observed: '未声明',
              fix: '登记进声明集（registry/索引），或移除该单元' });
    }
  }

  // ---------- attrs 族：unit-local 谓词（staged 安全——不需要全图） ----------
  for (const c of R.attrs || []) {
    for (const u of selectUnits(c)) {
      if (isExempt(u, c)) continue;
      const bn = baseName(unitFile(u.unit).replace(/\/$/, ''));
      if (c.name_not_match?.some((g) => globMatch(bn, g)))
        violations.push({ file: u.file, unit: u.unit, kind: 'attrs',
          rule: `attrs:${c.name}`, severity: sev(c),
          expect: `基名不匹配 ${c.name_not_match}`, observed: bn,
          fix: '改名、移除，或加豁免声明' });
      if (c.name_match?.length && !c.name_match.some((g) => globMatch(bn, g)))
        violations.push({ file: u.file, unit: u.unit, kind: 'attrs',
          rule: `attrs:${c.name}`, severity: sev(c),
          expect: `基名匹配 ${c.name_match}`, observed: bn,
          fix: '按命名规范改名，或收窄 units_in' });
    }
  }

  // 确定性序：file → line → rule → unit（码点序——同 sortFacts，不依赖 ICU/locale）
  const cs = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  violations.sort((a, b) =>
    cs(String(a.file || ''), String(b.file || '')) ||
    (a.line || 0) - (b.line || 0) ||
    cs(String(a.rule), String(b.rule)) ||
    cs(String(a.unit || ''), String(b.unit || '')));
  return violations;
}

// units_in: 'deployable/*' → 单元键 = deployable/<名>（v1 required 语义保留）
function matchUnits(file, pat) {
  if (pat.endsWith('/*')) return file.startsWith(pat.slice(0, -1));
  return globMatch(file, pat); // 深层 glob：全域匹配
}
function unitKey(file, pat) {
  if (pat.endsWith('/*')) {
    const head = pat.slice(0, -1);
    return head + file.slice(head.length).split('/')[0];
  }
  return file; // 深层 glob：单元=文件本身
}

function main() {
  const a = parseArgs(process.argv);
  const rules = validateRules(loadRules(a.rules));
  const configWarnings = lintRules(rules);
  const text = a.facts === '-'
    ? fs.readFileSync(0, 'utf8')
    : fs.readFileSync(a.facts, 'utf8');
  const facts = parseJsonl(text);
  const staged = a.staged ? new Set(a.staged) : null;
  const violations = evaluate(facts, rules, staged);

  for (const w of configWarnings) console.error(`[check-boundaries] ${w}`);
  if (a.json) {
    process.stdout.write(JSON.stringify(
      { violations, count: violations.length, config_warnings: configWarnings },
      null, 1) + '\n');
  } else {
    for (const v of violations)
      console.log(`[${v.severity}] ${v.rule}  ${v.file}${v.line ? ':' + v.line : ''}` +
        (v.dst ? `  ${v.src}→${v.dst} ${v.name}` : '') +
        (v.fix ? `  ⤷ ${v.fix}` : ''));
    console.log(`[check-boundaries] facts=${facts.length} violations=${violations.length}` +
      (staged ? ` (staged: ${staged.size} 文件)` : ''));
  }
  process.exit(violations.length ? 1 : 0);
}

main();
