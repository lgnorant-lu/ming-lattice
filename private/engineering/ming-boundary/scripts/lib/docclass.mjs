// lib/docclass.mjs — docClass 注册表内核（声明式文档判定引擎）
// 形态 D 组件的内核层：load→classify→evaluate→scan 纯函数面——
// 文件枚举归 DocSource port、持久化/对账归 IndexSink port、本件无 I/O 主权。
// spec 契约经两仓判决级验证：IV8 九类 254/254 判决对拍（meta_check oracle）
// + 本仓三类 451/452（check-index/check-skill oracle）。
//
// spec 文件级键: schemaVersion(钉=1) / header(方言默认) / matchOrder(仅 first)
//   / docClasses[]
// 类级键: name / match{path|name|any|anyOf|exactPath|notPath} / required[]
//   / freshness{anyOf[]} / states{field,vocab,tolerate}|states[vocab 简写]
//   / fields{<f>:{pattern|vocab|tolerate|equalsFilenameStem|role|target|
//     multiline|nested}} / conditional[{when,require,check,level,msg}]
//   / gates{missingFrontmatter:error|warn|off} / header / staging / idScheme
//   / agingDays / statusField
// 闭集纪律：未知键装载即 fail-closed（schemaVersion=1 是闭契约——
//   未来新键走 schemaVersion 演进，不放任静默拼写漂移）。
import { parseYamlLite } from './yaml.mjs';
import { extractDocmeta } from './docmeta.mjs';
import { globMatch, baseName } from './facts.mjs';

export const DOCCLASS_SPEC_VERSION = 1;
// spec 方言名 → docmeta 面名（yaml-frontmatter 与 blockquote 为别名义）
export const HEADER_DIALECTS = {
  'yaml-frontmatter': 'frontmatter',
  'blockquote-head': 'blockquote',
  'blockquote': 'blockquote',
};
const FILE_KEYS = new Set(['schemaVersion', 'header', 'matchOrder', 'docClasses']);
const CLASS_KEYS = new Set(['name', 'match', 'required', 'freshness', 'states',
  'fields', 'conditional', 'gates', 'header', 'staging', 'idScheme',
  'agingDays', 'statusField']);
const MATCH_KEYS = new Set(['path', 'name', 'any', 'anyOf', 'exactPath', 'notPath']);
const FIELD_KEYS = new Set(['pattern', 'vocab', 'tolerate', 'equalsFilenameStem',
  'role', 'target', 'multiline', 'nested']);
const GATE_KEYS = new Set(['missingFrontmatter']);
const LEVELS = new Set(['error', 'warn', 'off']);
const COND_KEYS = new Set(['when', 'require', 'check', 'level', 'msg']);
const WHEN_OPS = new Set(['notIn']);
const CHECK_OPS = new Set(['lt-date']);
const FIELD_ROLES = new Set(['relation']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const asList = (v) => v === undefined || v === null ? [] : (Array.isArray(v) ? v : [v]);

// ── spec 装载（fail-closed：未知键/非法值全在装载时报） ──
export function loadSpecText(text, label = 'docclass.yaml') {
  const errors = [];
  let spec = null;
  try { spec = parseYamlLite(text); }
  catch (e) { errors.push(`${label}: 解析失败: ${String(e?.message ?? e).slice(0, 120)}`); }
  if (spec && typeof spec === 'object') validateSpec(spec, errors, label);
  else if (spec !== null && spec !== undefined) errors.push(`${label}: 顶层须为映射`);
  if (errors.length) return { spec: null, errors };
  return { spec: normalizeSpec(spec), errors: [] };
}

function validateSpec(spec, errors, label) {
  for (const k of Object.keys(spec))
    if (!FILE_KEYS.has(k)) errors.push(`${label}: 未知文件级键 ${k}`);
  if (spec.schemaVersion !== DOCCLASS_SPEC_VERSION)
    errors.push(`${label}: schemaVersion 须为 ${DOCCLASS_SPEC_VERSION}`);
  if (spec.matchOrder !== undefined && spec.matchOrder !== 'first')
    errors.push(`${label}: matchOrder 仅实现 first`);
  if (spec.header !== undefined && !HEADER_DIALECTS[spec.header])
    errors.push(`${label}: header 方言未实现: ${spec.header}`);
  if (!Array.isArray(spec.docClasses) || !spec.docClasses.length) {
    errors.push(`${label}: docClasses 须为非空列表`);
    return;
  }
  const seen = new Set();
  for (const [i, c] of spec.docClasses.entries()) {
    const tag = `${label}: docClasses[${i}]`;
    if (!c || typeof c !== 'object') { errors.push(`${tag} 须为映射`); continue; }
    for (const k of Object.keys(c))
      if (!CLASS_KEYS.has(k)) errors.push(`${tag} 未知类级键 ${k}`);
    if (typeof c.name !== 'string' || !c.name) errors.push(`${tag} 缺 name`);
    else if (seen.has(c.name)) errors.push(`${tag} name 重复: ${c.name}`);
    else seen.add(c.name);
    if (c.header !== undefined && !HEADER_DIALECTS[c.header])
      errors.push(`${tag} header 方言未实现: ${c.header}`);
    validateMatch(c.match, `${tag} match`, errors);
    for (const f of asList(c.required))
      if (typeof f !== 'string' || !f) errors.push(`${tag} required 项须为非空字符串`);
    if (c.freshness !== undefined) {
      if (!c.freshness || !_isStrList(c.freshness.anyOf) || !c.freshness.anyOf.length)
        errors.push(`${tag} freshness 须为 {anyOf: [非空字段名列表]}`);
      else if (c.freshness.level !== undefined && !['error', 'warn'].includes(c.freshness.level))
        errors.push(`${tag} freshness.level 仅 error|warn`);
    }
    if (c.states !== undefined && !Array.isArray(c.states)) {
      const s = c.states;
      if (!s || typeof s !== 'object' || !_isStrList(s.vocab) || !s.vocab.length)
        errors.push(`${tag} states 须为 vocab 列表或 {field,vocab,tolerate}`);
      else {
        if (s.field !== undefined && typeof s.field !== 'string')
          errors.push(`${tag} states.field 须为字段名`);
        if (s.tolerate !== undefined && !_isStrList(s.tolerate))
          errors.push(`${tag} states.tolerate 须为字符串列表`);
      }
    } else if (Array.isArray(c.states) && !_isStrList(c.states))
      errors.push(`${tag} states 简写须为字符串列表`);
    if (c.fields !== undefined) {
      if (!c.fields || typeof c.fields !== 'object' || Array.isArray(c.fields))
        errors.push(`${tag} fields 须为映射`);
      else for (const [fn, fd] of Object.entries(c.fields)) {
        if (!fd || typeof fd !== 'object' || Array.isArray(fd)) {
          errors.push(`${tag} fields.${fn} 须为映射`); continue;
        }
        for (const k of Object.keys(fd))
          if (!FIELD_KEYS.has(k)) errors.push(`${tag} fields.${fn} 未知键 ${k}`);
        if (fd.pattern !== undefined) {
          try { new RegExp(fd.pattern); }
          catch { errors.push(`${tag} fields.${fn}.pattern 非法正则: ${fd.pattern}`); }
        }
        if (fd.vocab !== undefined && (!_isStrList(fd.vocab) || !fd.vocab.length))
          errors.push(`${tag} fields.${fn}.vocab 须为非空字符串列表`);
        if (fd.tolerate !== undefined && !_isStrList(fd.tolerate))
          errors.push(`${tag} fields.${fn}.tolerate 须为字符串列表`);
        if (fd.role !== undefined && !FIELD_ROLES.has(fd.role))
          errors.push(`${tag} fields.${fn}.role 未实现: ${fd.role}`);
      }
    }
    if (c.gates !== undefined) {
      if (!c.gates || typeof c.gates !== 'object')
        errors.push(`${tag} gates 须为映射`);
      else for (const [gk, gv] of Object.entries(c.gates)) {
        if (!GATE_KEYS.has(gk)) errors.push(`${tag} gates 未知键 ${gk}`);
        else if (!LEVELS.has(gv)) errors.push(`${tag} gates.${gk} 档级越出 error|warn|off: ${gv}`);
      }
    }
    for (const [j, cond] of asList(c.conditional).entries()) {
      const ctag = `${tag} conditional[${j}]`;
      if (!cond || typeof cond !== 'object') { errors.push(`${ctag} 须为映射`); continue; }
      for (const k of Object.keys(cond))
        if (!COND_KEYS.has(k)) errors.push(`${ctag} 未知键 ${k}`);
      if (!cond.when || typeof cond.when !== 'object' || !Object.keys(cond.when).length)
        errors.push(`${ctag} 缺 when 条件`);
      else for (const [wf, wv] of Object.entries(cond.when)) {
        if (wv && typeof wv === 'object' && !Array.isArray(wv)) {
          for (const op of Object.keys(wv))
            if (!WHEN_OPS.has(op)) errors.push(`${ctag} when.${wf} 算子未实现: ${op}`);
          if (wv.notIn !== undefined && !_isStrList(wv.notIn))
            errors.push(`${ctag} when.${wf}.notIn 须为字符串列表`);
        } else if (typeof wv !== 'string')
          errors.push(`${ctag} when.${wf} 值须为字符串或算子映射`);
      }
      for (const f of asList(cond.require))
        if (typeof f !== 'string' || !f) errors.push(`${ctag} require 项须为非空字符串`);
      if (cond.msg !== undefined && typeof cond.msg !== 'string')
        errors.push(`${ctag} msg 须为字符串`);
      for (const [cf, cv] of Object.entries(cond.check ?? {})) {
        if (!cv || typeof cv !== 'object') { errors.push(`${ctag} check.${cf} 须为算子映射`); continue; }
        for (const op of Object.keys(cv))
          if (!CHECK_OPS.has(op)) errors.push(`${ctag} check.${cf} 算子未实现: ${op}`);
      }
      if (cond.level !== undefined && !['error', 'warn'].includes(cond.level))
        errors.push(`${ctag} level 仅 error|warn（off 无意义——不写该条）`);
    }
  }
}

// 归一化：anyOf→any 同义、states 列表简写→{field,vocab,tolerate}、缺省补齐
function normalizeSpec(spec) {
  const out = {
    schemaVersion: spec.schemaVersion,
    header: spec.header ?? null,
    matchOrder: spec.matchOrder ?? 'first',
    classes: spec.docClasses.map((c) => {
      const m = { ...(c.match ?? {}) };
      if (m.anyOf && !m.any) m.any = m.anyOf;
      let states = null;
      if (Array.isArray(c.states)) {
        states = { field: c.statusField ?? 'status', vocab: c.states, tolerate: [] };
      } else if (c.states) {
        states = { field: c.states.field ?? c.statusField ?? 'status',
          vocab: c.states.vocab, tolerate: asList(c.states.tolerate) };
      }
      return {
        name: c.name,
        match: m,
        header: c.header ?? null,
        required: asList(c.required),
        freshness: c.freshness ? { anyOf: c.freshness.anyOf, level: c.freshness.level ?? 'error' } : null,
        states,
        fields: c.fields ?? {},
        conditional: asList(c.conditional),
        gates: { missingFrontmatter: c.gates?.missingFrontmatter ?? 'off' },
      };
    }),
  };
  return out;
}

const _isStrList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const _isStrOrList = (v) => typeof v === 'string' || _isStrList(v);

function validateMatch(m, tag, errors) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) { errors.push(`${tag} 缺省或须为映射`); return; }
  for (const k of Object.keys(m))
    if (!MATCH_KEYS.has(k)) errors.push(`${tag} 未知键 ${k}`);
  for (const k of ['path', 'name', 'exactPath', 'notPath'])
    if (m[k] !== undefined && !_isStrOrList(m[k]))
      errors.push(`${tag}.${k} 须为字符串或字符串列表`);
  const hasInclude = m.path !== undefined || m.name !== undefined
    || m.exactPath !== undefined || m.any !== undefined || m.anyOf !== undefined;
  if (!hasInclude) errors.push(`${tag} 须至少一条包含键（path/name/exactPath/any）`);
  for (const sub of asList(m.any ?? m.anyOf)) validateMatch(sub, `${tag}.any[]`, errors);
}

// ── 类匹配（matchOrder=first：首个命中类胜出） ──
export function classify(rel, spec) {
  const base = baseName(rel);
  for (const c of spec.classes) if (matchObj(c.match, rel, base)) return c;
  return null;
}

function matchObj(m, rel, base) {
  if (m.notPath && asList(m.notPath).some((g) => globMatch(rel, g))) return false;
  if (m.exactPath !== undefined && !asList(m.exactPath).includes(rel)) return false;
  if (m.path !== undefined && !asList(m.path).every((g) => globMatch(rel, g))) return false;
  if (m.name !== undefined && !asList(m.name).every((g) => globMatch(base, g))) return false;
  if (m.any !== undefined) {
    if (!asList(m.any).some((sub) => matchObj(sub, rel, base))) return false;
  }
  return true;
}

// ── 判定（单文档 verdict；fields 投影 + issues） ──
// ctx: {today: 'YYYY-MM-DD'} —— 测试可注入固定日期保确定性
export function evaluateDoc(rel, text, spec, ctx = {}) {
  const today = ctx.today ?? new Date().toISOString().slice(0, 10);
  const cls = classify(rel, spec);
  if (!cls) return { className: null, dialect: null, fields: {}, issues: [] };
  const dialectName = HEADER_DIALECTS[cls.header ?? spec.header];
  const issues = [];
  if (!dialectName) {
    issues.push({ level: 'E', rule: 'dialect', msg: `${rel}: 类 ${cls.name} 未声明 header 方言` });
    return { className: cls.name, dialect: null, fields: {}, issues };
  }
  const dm = extractDocmeta(text);
  const surf = dm[dialectName];
  const label = `${rel} [${cls.name}]`;
  // missingFrontmatter=方言节点缺席（空字段面≠无头——IV8 实证：描述性
  // blockquote 无 name: 行时 meta_check 仍走 required 判定不报"无块"）。
  // 未声明默认 off——required 缺报本身即诊断，无 required 的类不产幽灵违例
  if (!surf) {
    const g = cls.gates.missingFrontmatter;
    if (g === 'error') issues.push({ level: 'E', rule: 'header', msg: `${label}: 无 ${dialectName} 头块` });
    else if (g === 'warn') issues.push({ level: 'W', rule: 'header', msg: `${label}: 无 ${dialectName} 头块` });
  }
  const fieldMap = surf?.fieldMap ?? {};
  // 嵌套点径解析（fm 方言）：`a.b` → yaml-lite 解析 fm body 走树；
  // key-only 降格面解析失败→undefined（缺席语义，不额外报错——fidelity 已标）
  let nestedCache = undefined;
  const resolve = (name) => {
    if (!name.includes('.')) return fieldMap[name];
    if (dialectName !== 'frontmatter' || !surf?.body) return undefined;
    if (nestedCache === undefined) {
      try { nestedCache = parseYamlLite(surf.body + '\n'); } catch { nestedCache = null; }
    }
    if (!nestedCache || typeof nestedCache !== 'object') return undefined;
    let cur = nestedCache;
    for (const seg of name.split('.')) {
      if (!cur || typeof cur !== 'object' || !(seg in cur)) return undefined;
      cur = cur[seg];
    }
    return typeof cur === 'object' ? undefined : cur;
  };

  // required：空值=缺报（meta_check `not fields[key]` 语义对齐——在场性
  // 判定分两层：required/conditional.require 要非空，freshness/states/vocab
  // 仅在场性，空值字段照常参与约束判定）
  for (const f of cls.required)
    if (resolve(f) === undefined || resolve(f) === '')
      issues.push({ level: 'E', rule: 'required', field: f, msg: `${label}: 缺 ${f} 字段` });

  // freshness：anyOf 至少一字段在场
  if (cls.freshness && !cls.freshness.anyOf.some((f) => resolve(f) !== undefined))
    issues.push({ level: cls.freshness.level === 'warn' ? 'W' : 'E', rule: 'freshness',
      msg: `${label}: 缺 freshness 字段（${cls.freshness.anyOf.join('|')} 至少一在场）` });

  // states：归一化状态词表（tolerate 静默豁免——record 类过渡态不入硬门）
  // 违例字段登记 invalidFields——conditional 引用违例字段即跳过
  // （meta_check 对拍实证：野生态不派生条件判定，语义建立在合法态上）
  const invalidFields = new Set();
  if (cls.states) {
    const v = resolve(cls.states.field);
    if (v !== undefined && !cls.states.vocab.includes(v) && !cls.states.tolerate.includes(v)) {
      issues.push({ level: 'E', rule: 'states', field: cls.states.field,
        msg: `${label}: ${cls.states.field} 越出闭集: ${v}（${cls.states.vocab.join('|')}）` });
      invalidFields.add(cls.states.field);
    }
  }

  // fields 字段级约束（pattern/vocab/equalsFilenameStem；role/target 为
  // 消费方声明（relation→docref 边），本层不判值）
  const stem = baseName(rel).replace(/\.[^.]+$/, '');
  for (const [fn, fd] of Object.entries(cls.fields)) {
    const v = resolve(fn);
    if (v === undefined) continue;
    if (fd.vocab && !fd.vocab.includes(v) && !(fd.tolerate ?? []).includes(v)) {
      issues.push({ level: 'E', rule: 'vocab', field: fn,
        msg: `${label}: ${fn} 越出词表: ${v}（${fd.vocab.join('|')}）` });
      invalidFields.add(fn);
    }
    if (fd.pattern && !(new RegExp(fd.pattern).test(String(v))))
      issues.push({ level: 'E', rule: 'pattern', field: fn,
        msg: `${label}: ${fn} 不合形态约束 ${fd.pattern}: ${v}` });
    if (fd.equalsFilenameStem && String(v) !== stem)
      issues.push({ level: 'E', rule: 'stem', field: fn,
        msg: `${label}: ${fn} 与文件名不一致（${v}）` });
  }

  // conditional：when 全字段命中 → require 缺字段/check 值比较（level 默认 error）
  // when 引用违例字段 → 该条跳过（条件语义建立在合法态上）
  for (const cond of cls.conditional) {
    if (Object.keys(cond.when ?? {}).some((wf) => invalidFields.has(wf))) continue;
    const level = cond.level === 'warn' ? 'W' : 'E';
    const hits = Object.entries(cond.when ?? {}).every(([wf, wv]) => {
      const v = resolve(wf);
      if (wv && typeof wv === 'object') {
        if (wv.notIn) return v !== undefined && !wv.notIn.includes(v);
        return false;
      }
      return v === wv;
    });
    if (!hits) continue;
    const desc = Object.entries(cond.when).map(([f, w]) => `${f}=${typeof w === 'object' ? `notIn(${w.notIn?.join('|')})` : w}`).join(' ∧ ');
    // cond.msg 为 warn/error 消息模板（IV8 meta_check 契约）：
    // {field}=缺报字段名、{when.X}=when 字段实际值——require 缺报与
    // check 违例同享模板；无模板回退自动生成描述
    const _tpl = (f) => cond.msg.replaceAll('{field}', f)
      .replace(/\{when\.(\w+)\}/g, (_, w) => String(resolve(w) ?? ''));
    for (const f of asList(cond.require))
      if (resolve(f) === undefined || resolve(f) === '')
        issues.push({ level, rule: 'conditional', field: f,
          msg: `${label}: ${cond.msg ? _tpl(f) : `${desc} 须带 ${f} 字段`}` });
    for (const [cf, cv] of Object.entries(cond.check ?? {})) {
      const v = resolve(cf);
      if (v === undefined) continue;
      if (cv['lt-date'] !== undefined) {
        const bound = cv['lt-date'] === 'today' ? today : cv['lt-date'];
        if (DATE_RE.test(String(v)) && String(v) < bound)
          issues.push({ level, rule: 'conditional-check', field: cf,
            msg: `${label}: ${desc} 且 ${cf}=${v} < ${bound}——${cond.msg ? _tpl(cf) : '到期项应复审'}` });
      }
    }
  }
  return { className: cls.name, dialect: dialectName, fields: fieldMap, issues };
}

// ── 扫描（多文档聚合；文件枚举/读取归消费方） ──
export function scanDocs(docs, spec, ctx = {}) {
  const results = [];
  const counts = { E: 0, W: 0, classified: 0, unclassified: 0 };
  for (const { rel, text } of docs) {
    const r = evaluateDoc(rel, text, spec, ctx);
    if (r.className) counts.classified++; else counts.unclassified++;
    for (const i of r.issues) counts[i.level]++;
    results.push(r);
  }
  return { results, counts };
}
