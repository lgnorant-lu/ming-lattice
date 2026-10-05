#!/usr/bin/env node
// nslaw（内置目录件, outputs=[findings, report]）：标识命名空间法律
// argv: --facts F --root R --config JSON
// 模型：file facts 枚举受审文档面（契约 exemptions + scan_exclude 双层豁免），
//       defs[] 按模态提取实例定义位，正文 token 扫描得引用位；
//       findings 行先出（'{' 起头 JSONL），报告文本随后（runner 双通道收编）。
// config 键：
//   registry           必填——ming.1 namespaces.json（prefix/pattern/domain/ordering/role/note）
//   defs[]             实例登记源：{path, mode, pattern?, field?, local?}
//                      mode=first_col|heading|bold|tokens|filename|json_field|section_list
//                      local=true 文档局部定义位（只消解同文件引用，不入全局）
//   scan_exts          扫描扩展名（缺省 ['.md']）
//   scan_exclude       追加豁免 globs（内联）
//   scan_exclude_from  豁免清单文件（行首 glob + # 注释；@既有 work_id_exempt_globs 同款）
//   prose_from         散文登记处文档——表内反引号前缀与 registry 双向互锁
//   contract_from      契约路径供 exemptions（缺省 boundaries.yaml）
//   min_family         未登记族最少成员数（缺省 2）
// registry 条目 role=forbidden（反面法，非 ID 命名空间）：
//   line_pattern       行级正则（上下文敏感禁令——import iv8 而非 iv8.eval）
//   pattern            token 级禁令（缺省锚定 \b(token)\b 全词匹配）
//   allow[]            本规则豁免 globs（一等政策——上游 oracle 脚本合法持有）
//   exts[]             本规则文件扩展名集（缺省=全局 scan_exts）
// findings: nslaw:dangling(warn) collision(error) format(warn) forbidden(error)
//           unregistered-family(warn) registry-drift(warn) config(error)
import fs from 'node:fs';
import path from 'node:path';
import { parseJsonl, globMatch } from '../lib/facts.mjs';
import { loadYaml } from '../lib/yaml.mjs';

const argv = process.argv;
const take = (k) => argv[argv.indexOf(k) + 1];
const factsPath = take('--facts');
const root = path.resolve(take('--root'));
const cfg = JSON.parse(take('--config') || '{}');

const findings = [];
const emit = (rule, severity, unit, line, expect, observed, fix) =>
  console.log(JSON.stringify({ rule, severity, unit, file: unit,
    ...(line ? { line } : {}), expect, observed, fix }));
const report = [];

// ---------- 登记表装载（fail-closed，缺件仍走 finding 而非 crash）----------
let nsList = null;
if (!cfg.registry) {
  emit('nslaw:config', 'error', '(nslaw)', 0, 'registry 必填',
    '未配置', 'consumers.nslaw.registry: <repo-rel namespaces.json>');
} else {
  const rp = path.resolve(root, cfg.registry);
  if (!(rp === root || rp.startsWith(root + path.sep)) || !fs.existsSync(rp)) {
    emit('nslaw:config', 'error', '(nslaw)', 0, 'registry 存在且在仓根内',
      cfg.registry, '修正路径');
  } else {
    try { nsList = JSON.parse(fs.readFileSync(rp, 'utf8')).namespaces; }
    catch (e) { emit('nslaw:config', 'error', '(nslaw)', 0, 'registry 为合法 ming.1 JSON',
      `${cfg.registry}: ${e.message}`, '修 JSON 结构'); }
    if (!Array.isArray(nsList)) {
      emit('nslaw:config', 'error', '(nslaw)', 0, 'registry.namespaces 为数组',
        typeof nsList, '修 JSON 结构');
      nsList = null;
    }
  }
}
if (!nsList) process.exit(0); // config error finding 已发

// extra_namespaces_from：行首前缀清单文件（# 后注释=note）——合成 role=value
// 命名空间，pattern 统一 `^<P>-?\d+[a-z]?$`（融合/横杠双形通吃）；
// 已在 registry 登记的裸前缀跳过（json 优先）
if (cfg.extra_namespaces_from) {
  const bareOf0 = (p) => (String(p).match(/^([A-Z][A-Z0-9]*)/) || [null, null])[1];
  const known = new Set(nsList.map(n => bareOf0(n.prefix)).filter(Boolean));
  const ep = path.resolve(root, cfg.extra_namespaces_from);
  if (fs.existsSync(ep)) {
    for (const line of fs.readFileSync(ep, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z][A-Z0-9]*)\b/);
      if (!m || known.has(m[1])) continue;
      const note = (line.split('#', 2)[1] || '').trim();
      nsList.push({ prefix: `${m[1]}-<n>`, pattern: `^${m[1]}-?\\d+[a-z]?$`,
        role: 'value', ordering: 'enum', domain: 'extra',
        note: note || 'extra_namespaces_from 合成' });
    }
  } else emit('nslaw:config', 'error', '(nslaw)', 0, 'extra_namespaces_from 存在',
    cfg.extra_namespaces_from, '修配置');
}

// 模式编译：长模式优先（ADR-\d{4} 先于 AD-\d+ 免前缀吞并）；^$ 锚剥离后嵌 \b()\b
// role=forbidden 条目无 pattern 亦可（line_pattern 承载）——先按 role 分流再校验
const ROLE_OK = new Set(['id', 'value', 'forbidden']);
const nsl = nsList.filter(n => n && typeof n === 'object');
for (const n of nsl) {
  n._role = n.role || 'id';
  if (!ROLE_OK.has(n._role)) {
    emit('nslaw:config', 'error', '(nslaw)', 0, `role ∈ ${[...ROLE_OK].join('|')}`,
      `${n.prefix}: ${n.role}`, '修 registry role');
    n._role = 'id';
  }
  if (typeof n.pattern === 'string') {
    try { n._re = new RegExp(n.pattern); n._body = n.pattern.replace(/^\^|\$$/g, ''); }
    catch { emit('nslaw:config', 'error', '(nslaw)', 0, 'pattern 为合法正则',
      `${n.prefix}: ${n.pattern}`, '修 pattern'); }
  }
}
// forbidden 规则编译：line_pattern 行级 / pattern token 级；allow=规则级豁免（一等政策）
const forbNs = nsl.filter(n => n._role === 'forbidden');
for (const n of forbNs) {
  const src = n.line_pattern || (n._body ? `\\b(?:${n._body})\\b` : null);
  if (!src) {
    emit('nslaw:config', 'error', '(nslaw)', 0,
      'forbidden 条目需 line_pattern 或 pattern', n.prefix, '补匹配器');
    continue;
  }
  try { n._lre = new RegExp(src); }
  catch { emit('nslaw:config', 'error', '(nslaw)', 0, 'line_pattern 为合法正则',
    `${n.prefix}: ${src}`, '修正则'); }
  n._allow = [].concat(n.allow || []).filter(Boolean);
  n._exts = n.exts ? new Set([].concat(n.exts)) : null;
}
const memNs = nsl.filter(n => n._role !== 'forbidden' && n._re);
const idNs = memNs.filter(n => n._role === 'id');
const allBodies = memNs.map(n => n._body).filter(Boolean)
  .sort((a, b) => b.length - a.length);
const LABEL_ANY = allBodies.length
  ? new RegExp(`\\b(${allBodies.join('|')})\\b`, 'g') : null;
const LABEL_ID = idNs.length
  ? new RegExp(`\\b(${idNs.map(n => n._body).sort((a, b) => b.length - a.length).join('|')})\\b`, 'g')
  : null;
const FORMATS = memNs.map(n => n._re);
const isRegistered = (tok) => FORMATS.some(r => r && r.test(tok));

// ---------- 豁免面 ----------
const exGlobs = [];
const contractPath = path.resolve(root, cfg.contract_from || 'boundaries.yaml');
if (fs.existsSync(contractPath)) {
  try {
    const c = loadYaml(contractPath);
    for (const e of c.exemptions || [])
      exGlobs.push(typeof e === 'string' ? e : (e.glob || e.unit));
  } catch { /* 契约坏由 evaluator 报——nslaw 只取豁免面，不重复报错 */ }
}
for (const g of [].concat(cfg.scan_exclude || [])) exGlobs.push(g);
if (cfg.scan_exclude_from) {
  const p = path.resolve(root, cfg.scan_exclude_from);
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const head = line.split('#', 1)[0].trim();
      if (head) exGlobs.push(head);
    }
  }
}
const exOk = exGlobs.filter(Boolean);
const isEx = (u) => exOk.some(g => globMatch(u, g));

// ---------- 受审文档面（file facts × 扩展名 × 豁免） ----------
const exts = new Set([].concat(cfg.scan_exts || ['.md']));
const facts = parseJsonl(fs.readFileSync(factsPath, 'utf8'));
const scanFiles = [];
for (const f of facts) {
  if (f.kind !== 'file') continue;
  const u = f.unit;
  if (!exts.has(path.extname(u))) continue;
  if (isEx(u)) continue;
  scanFiles.push(u);
}

const readRel = (rel) => {
  const p = path.resolve(root, rel);
  return fs.existsSync(p) && p.startsWith(root) ? fs.readFileSync(p, 'utf8') : null;
};

// ---------- defs 提取 ----------
const defined = new Map();    // id -> Set(file:line)——全局定义位
const localDefs = new Map();  // rel -> Set(id)——文档局部定义位（只消解同文件引用）
const strictIds = new Set();  // 权威登记源（first_col/json_field/section_list）定义的 id——format 检查面
const strictSites = new Map(); // id -> Set('rel:line')——权威位撞名判定面
const defLines = new Set();   // `${rel}:${line}`——def 位行不再计为引用
const defSrc = [];            // [{rel, mode, found}]
const DEF_OK = new Set(['first_col', 'heading', 'bold', 'tokens', 'filename', 'json_field', 'section_list']);
const STRICT_MODE = new Set(['first_col', 'json_field', 'section_list']);
const IDISH = /^[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/; // 定义位粗形（须含数字或杠）
const addDef = (id, rel, line, strict, local) => {
  if (!IDISH.test(id) || !/[0-9-]/.test(id)) return;
  defLines.add(`${rel}:${line}`);
  if (local) {
    if (!localDefs.has(rel)) localDefs.set(rel, new Set());
    localDefs.get(rel).add(id);
    return;
  }
  if (strict) {
    strictIds.add(id);
    if (!strictSites.has(id)) strictSites.set(id, new Set());
    strictSites.get(id).add(`${rel}:${line}`);
  }
  if (!defined.has(id)) defined.set(id, new Set());
  defined.get(id).add(`${rel}:${line}`);
};

for (const d of [].concat(cfg.defs || [])) {
  const rel = String(d.path || '');
  const mode = d.mode;
  if (!DEF_OK.has(mode)) {
    emit('nslaw:config', 'error', '(nslaw)', 0, `defs mode ∈ ${[...DEF_OK].join('|')}`,
      `${rel}: ${mode}`, '修 defs 条目');
    continue;
  }
  // strict 权威登记表位（形态错出 format finding）；harvest 模态静默接纳。
  // local=true：定义位只消解同文件引用（文档局部编号，不入全局 def 空间）
  const strict = STRICT_MODE.has(mode), local = d.local === true;
  const abs = path.resolve(root, rel);
  let found = 0;
  if (mode === 'filename') {
    // pattern 锚定到 ID 本体——整段 match 即定义 ID（不写捕获组，写整式）
    const re = new RegExp(d.pattern || '[A-Z][A-Za-z0-9]*-?[A-Za-z0-9]+');
    if (fs.existsSync(abs)) {
      for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
        const m = ent.name.match(re);
        if (m) { addDef(m[0], `${rel}/${ent.name}`.replace(/\/\//g, '/'), 1, strict, local); found++; }
      }
    } else emit('nslaw:config', 'error', '(nslaw)', 0, 'defs.path 存在', rel, '修 defs');
  } else if (mode === 'json_field') {
    const text = readRel(rel);
    if (text === null) emit('nslaw:config', 'error', '(nslaw)', 0, 'defs.path 存在', rel, '修 defs');
    else {
      try {
        const j = JSON.parse(text);
        const fm = String(d.field || '').match(/^(\w+)\[\]\.(\w+)$/);
        const arr = fm ? j[fm[1]] : null;
        for (const it of [].concat(arr || []))
          if (it && typeof it[fm[2]] === 'string') { addDef(it[fm[2]], rel, 1, strict, local); found++; }
      } catch (e) { emit('nslaw:config', 'error', '(nslaw)', 0, 'defs.path 为合法 JSON',
        `${rel}: ${e.message}`, '修 defs'); }
    }
  } else {
    const text = readRel(rel);
    if (text === null) { emit('nslaw:config', 'error', '(nslaw)', 0, 'defs.path 存在', rel, '修 defs'); continue; }
    const lines = text.split(/\r?\n/);
    let inFence = false, sectionLetter = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
      if (inFence) continue;
      if (mode === 'first_col') {
        const m = line.match(/^\|\s*`?([A-Za-z][A-Za-z0-9_.-]*)`?\s*\|/);
        // `X-ID` 形 = 表头模板单元格（| MR-ID | name | ...），非实例分配
        if (m && !/^(?:[A-Z][A-Z0-9]*-)?ID$/.test(m[1])) {
          addDef(m[1], rel, i + 1, strict, local); found++;
        }
      } else if (mode === 'heading') {
        const m = line.match(/^#{1,6}\s+`?([A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)/);
        if (m) { addDef(m[1], rel, i + 1, strict, local); found++; }
      } else if (mode === 'bold') {
        for (const m of line.matchAll(/\*\*([A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)\*\*/g)) {
          addDef(m[1], rel, i + 1, strict, local); found++;
        }
      } else if (mode === 'tokens') {
        if (LABEL_ANY) for (const m of line.matchAll(LABEL_ANY)) { addDef(m[1], rel, i + 1, strict, local); found++; }
      } else if (mode === 'section_list') {
        const secM = line.match(/^## ([A-Z])\.\s/);
        if (secM) sectionLetter = secM[1];
        if (/^## /.test(line) && !secM) sectionLetter = null;
        const itemM = sectionLetter && line.match(/^(\d+)\.\s/);
        if (itemM) { addDef(`${sectionLetter}${itemM[1]}`, rel, i + 1, strict, local); found++; }
      }
    }
  }
  defSrc.push({ rel, mode, found, local });
}

// ---------- 引用扫描 ----------
const refs = []; // role=id 引用 {id, rel, line}
const refsCount = new Map(); // 全部已登记 token 的引用计数（value 亦入——dead 判定用）
const nsStats = new Map(); // prefix -> {role, defs:Set, refs, files:Set, dangling}
const nsOf = (tok) => memNs.find(n => n._re && n._re.test(tok));
const bump = (ns, tok, rel) => {
  if (!nsStats.has(ns.prefix)) nsStats.set(ns.prefix,
    { role: ns._role, defs: new Set(), refs: 0, files: new Set(), dangling: 0 });
  const r = nsStats.get(ns.prefix);
  r.refs++; r.files.add(rel);
  refsCount.set(tok, (refsCount.get(tok) || 0) + 1);
};
const GENERIC = /\b([A-Z]{2,6})-?(\d+[a-z]?)\b/g;
const STOP = new Set(['ISO', 'UTF', 'SHA', 'MD', 'RGB', 'HSL', 'IP', 'TCP', 'UDP', 'HTTP',
  'HTTPS', 'SQL', 'PNG', 'JPG', 'JPEG', 'GIF', 'BMP', 'PDF', 'ZIP', 'GPU', 'CPU', 'API',
  'URL', 'URI', 'JSON', 'YAML', 'XML', 'HTML', 'CSS', 'CLI', 'GUI', 'IDE', 'SDK',
  'CI', 'CD', 'IoU', 'AR', 'GT', 'DTD', 'MAE', 'ONNX', 'UI', 'TDD', 'BDD', 'MDT',
  'DNA', 'SARIF', 'OPA', 'AES', 'RSA', 'CVE', 'RFC', 'ECMA', 'TLS', 'SSL', 'IEEE',
  'NIST', 'PKCS', 'OAEP', 'PBKDF', 'HMAC', 'ECDH', 'ECDSA', 'AEAD', 'GCM', 'CBC', 'CTR',
  'FNV', 'GPL', 'MIT', 'BSD', 'WPT', 'ECMA', 'TLA']);
const fam = new Map(); // prefix -> {tokens:Set, files:Set, count}
const seenDangling = new Set();

for (const rel of scanFiles) {
  const text = readRel(rel);
  if (text === null) continue;
  const lines = text.split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (defLines.has(`${rel}:${i + 1}`)) continue;
    if (LABEL_ANY) for (const m of line.matchAll(LABEL_ANY)) {
      const tok = m[1], ns = nsOf(tok);
      if (!ns) continue;
      bump(ns, tok, rel);
      if (ns._role === 'id') {
        refs.push({ id: tok, rel, line: i + 1 });
        // 同行同 token 多次出现只报一次（dedupe 按 tok|rel|line）；
        // 局部定义位只消解同文件引用（文档局部编号语义）
        const dk = `${tok}|${rel}|${i + 1}`;
        const isDef = defined.has(tok) || (localDefs.get(rel) || new Set()).has(tok);
        if (!isDef && !seenDangling.has(dk)) {
          seenDangling.add(dk);
          emit('nslaw:dangling', 'warn', rel, i + 1, `${tok} 有定义位`,
            '引用无登记', '登记到 defs 源或停用改写');
        }
      }
    }
    for (const m of line.matchAll(GENERIC)) {
      const [tok, pre] = [m[0], m[1]];
      // 复合 ID 内段（MR-CTX-001 的 CTX-001）不是独立 token——前一字符是
      // '-' 或词字符即长 token 子串，跳过
      const prev = line[m.index - 1];
      if (prev === '-' || /\w/.test(prev || '')) continue;
      if (STOP.has(pre) || isRegistered(tok)) continue;
      if (!fam.has(pre)) fam.set(pre, { tokens: new Set(), files: new Set(), count: 0 });
      const f = fam.get(pre); f.tokens.add(tok); f.files.add(rel); f.count++;
    }
  }
}

// ---------- forbidden 禁现扫描（独立文件宇宙——exts 自定，不随 scan_exts） ----------
const forbStats = new Map(); // prefix -> {hits, files:Set}
if (forbNs.length) {
  for (const f of facts) {
    if (f.kind !== 'file' || isEx(f.unit)) continue;
    const rel = f.unit, ext = path.extname(rel);
    const rules = forbNs.filter(n => n._lre &&
      (!n._exts || n._exts.has(ext)) &&
      !(n._allow.length && n._allow.some(g => globMatch(rel, g))));
    if (!rules.length) continue;
    const text = readRel(rel);
    if (text === null) continue;
    let inFence = false;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
      if (inFence) continue;
      for (const n of rules) {
        if (!n._lre.test(line)) continue;
        emit('nslaw:forbidden', 'error', rel, i + 1,
          `禁用标记 ${n.prefix}`, line.trim().slice(0, 100),
          n.note || '移除命中或登记 allow 豁免');
        if (!forbStats.has(n.prefix)) forbStats.set(n.prefix, { hits: 0, files: new Set() });
        const s = forbStats.get(n.prefix); s.hits++; s.files.add(rel);
      }
    }
  }
}

// ---------- 判定 ----------
const defsChecked = defSrc.length > 0;
for (const [id, sites] of defined) {
  const files = [...new Set([...sites].map(s => s.split(':')[0]))];
  // 撞名只在权威登记位（strict 模态）上判：harvest 模态（文件名/tokens/
  // heading）本质不声称所有权，多账本共同登记是合法镜像——唯一性义务
  // 只压在登记表位上
  const ss = strictSites.get(id);
  if (ss && ss.size > 1) {
    const sfiles = [...new Set([...ss].map(s => s.split(':')[0]))];
    emit('nslaw:collision', 'error', sfiles[0], 0, '标号单一定义位',
      `${id} 权威定义于 ${[...ss].join(', ')}`, '保留唯一登记位');
  }
  // format 只查权威登记表位——harvest 模态抓到什么算什么，不校验形态
  if (strictIds.has(id) && !isRegistered(id))
    emit('nslaw:format', 'warn', files[0], 0,
      'def 匹配已登记命名空间格式', id, '修形态或在 registry 登记格式');
}
const minFam = Number.isFinite(+cfg.min_family) ? +cfg.min_family : 2;
for (const [pre, f] of [...fam.entries()].sort((a, b) => b[1].count - a[1].count)) {
  if (f.tokens.size < minFam) continue;
  emit('nslaw:unregistered-family', 'warn', [...f.files][0], 0,
    '成族 ID 形 token 须登记', `${pre}<N>（${[...f.tokens].slice(0, 5).join(', ')}` +
    `${f.tokens.size > 5 ? '…' : ''} 共 ${f.count} 处）`, 'registry 登记或停用');
}

// ---------- 散文<->registry 双向互锁 ----------
if (cfg.prose_from) {
  const text = readRel(cfg.prose_from);
  if (text === null) emit('nslaw:config', 'error', '(nslaw)', 0, 'prose_from 存在',
    cfg.prose_from, '修配置');
  else {
    const prosePrefixes = new Set();
    let inNs = false;
    for (const line of text.split('\n')) {
      if (/^#{1,6}\s/.test(line)) inNs = /命名空间|namespace|前缀|prefix/i.test(line);
      else if (inNs && /^\|/.test(line)) {
        for (const m of (line.split('|')[1] || '').matchAll(/`([^`]+)`/g))
          prosePrefixes.add((m[1].match(/^([A-Z][A-Z0-9]*)/) || [null, null])[1]);
      }
    }
    prosePrefixes.delete(null);
    const bareOf = (n) =>
      (String(n.prefix).match(/^([A-Z][A-Z0-9]*)/) || [null, null])[1];
    const jsonBare = new Set(memNs.map(bareOf).filter(Boolean));
    const jsonBareId = new Set(idNs.map(bareOf).filter(Boolean));
    for (const p of prosePrefixes)
      if (!jsonBare.has(p))
        emit('nslaw:registry-drift', 'warn', cfg.prose_from, 0,
          '散文登记前缀须在 registry', p, 'namespaces.json 补登记或删散文行');
    // 反向互锁只管 role=id 命名空间——value 族（技术词表/局部标签镜像）
    // 不要求散文登记
    for (const p of jsonBareId)
      if (!prosePrefixes.has(p))
        emit('nslaw:registry-drift', 'warn', cfg.prose_from, 0,
          'registry 的 id 命名空间须在散文登记', p, `${cfg.prose_from} 补行或 registry 删项`);
  }
}

// ---------- 报告 ----------
for (const [id] of defined) {
  const ns = nsOf(id);
  if (!ns) continue;
  if (!nsStats.has(ns.prefix)) nsStats.set(ns.prefix,
    { role: ns._role, defs: new Set(), refs: 0, files: new Set(), dangling: 0 });
  nsStats.get(ns.prefix).defs.add(id);
}
let dead = 0;
for (const [id] of defined) if (!refsCount.has(id)) dead++;
const danglingCount = new Map(); // ns.prefix -> n
for (const r of refs) {
  const ns = nsOf(r.id);
  const isDef = defined.has(r.id) || (localDefs.get(r.rel) || new Set()).has(r.id);
  if (ns && !isDef)
    danglingCount.set(ns.prefix, (danglingCount.get(ns.prefix) || 0) + 1);
}
for (const [pre, n] of danglingCount)
  if (nsStats.has(pre)) nsStats.get(pre).dangling = n;

const totalRefs = [...nsStats.values()].reduce((s, r) => s + r.refs, 0);
const localCount = [...localDefs.values()].reduce((s, set) => s + set.size, 0);
report.push(`nslaw: registry=${cfg.registry} (${memNs.length} ns` +
  `${forbNs.length ? `+${forbNs.length} forbidden` : ''}, id=${idNs.length})` +
  ` defs=${defined.size} ids${localCount ? ` (+${localCount} local)` : ''}/${defSrc.length} sources` +
  `  scan=${scanFiles.length} files  refs=${totalRefs} (id-role ${refs.length})` +
  `  tokens=${facts.length} facts`);
if (!defsChecked) report.push('（无 defs 源——悬空引用检查关闭）');
report.push('');
report.push('  ' + 'namespace'.padEnd(22) + 'role'.padEnd(7) + 'defs'.padStart(6) +
  'refs'.padStart(7) + 'files'.padStart(7) + 'dangling'.padStart(10) + 'dead'.padStart(6));
for (const [pre, r] of [...nsStats.entries()].sort((a, b) => b[1].refs - a[1].refs)) {
  const deadN = [...r.defs].filter(id => !refsCount.has(id)).length;
  report.push('  ' + pre.padEnd(22) + r.role.padEnd(7) + String(r.defs.size).padStart(6) +
    String(r.refs).padStart(7) + String(r.files.size).padStart(7) +
    String(r.dangling).padStart(10) + String(deadN).padStart(6));
}
const emptyNs = memNs.filter(n => !nsStats.has(n.prefix));
if (emptyNs.length)
  report.push(`零观测命名空间（${emptyNs.length}）：` + emptyNs.map(n => n.prefix).join(', '));
if (fam.size) {
  report.push('');
  report.push('unregistered families（未达 min_family 不告警）:');
  for (const [pre, f] of [...fam.entries()].sort((a, b) => b[1].count - a[1].count))
    report.push(`  ${pre}: ${f.tokens.size} tokens/${f.count} hits @ ${[...f.files].slice(0, 3).join(', ')}`);
}
report.push(`dead defs（已登记零引用）: ${dead}`);
if (forbNs.length) {
  report.push('');
  report.push('forbidden rules（禁现法——命中即 error finding）:');
  for (const n of forbNs) {
    const s = forbStats.get(n.prefix) || { hits: 0, files: new Set() };
    report.push(`  ${n.prefix}: ${s.hits} hits @ ${s.files.size} files` +
      `${n._allow.length ? `（allow ${n._allow.length} globs）` : ''}` +
      (n.note ? ` — ${n.note}` : ''));
  }
}
for (const line of report) console.log(line);
process.exit(0);
