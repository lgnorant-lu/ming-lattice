#!/usr/bin/env node
// check-skill.mjs — 技能包规范性硬门控（ming-skill-forge §6 技能级检查）
// 用法: node check-skill.mjs <skill-dir> [--json] [--no-router] [--no-registry]
//       node check-skill.mjs --all [--json] [--no-router]
// 退出码: 0=无E级  1=存在E级
// 校验项清单: ../references/checklist.md
// 触发原则: 检查按自声明能力触发（有 metadata 查完备、-paradigm 查惯例），不按包形归簇。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..', '..');

// ---------- 单包检查 ----------
function checkDir(absDir, { skipRouter = false, skipRegistry = false, registryPath = null } = {}) {
  const issues = [];
  const dirName = path.basename(absDir);
  const add = (level, msg, file) => issues.push({ level, msg, file: file || absDir });
  let declaredLayer = null; // fm.metadata.layer 值——层别登记校验在 registry 块消费

  // ---------- 结构项 ----------
  const skillMd = path.join(absDir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) {
    add('E', 'SKILL.md 缺失');
    return issues;
  }
  const content = fs.readFileSync(skillMd, 'utf8');
  if (!content.trim()) { add('E', 'SKILL.md 为空'); return issues; }

  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    add('E', '无 frontmatter（--- 块缺失）');
  } else {
    const fm = fmMatch[1];
    const nameM = fm.match(/^name\s*:\s*(\S+)\s*$/m);
    const descM = fm.match(/^description\s*:\s*(.+?)(?=\n\S|\n---|\s*$)/ms);

    if (!nameM) {
      add('E', 'frontmatter 缺 name');
    } else {
      const name = nameM[1].trim().replace(/^["']|["']$/g, '');
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length < 3) {
        add('E', `name 非规范 kebab-case（小写段+单连字符，≥3 字符）: ${name}`);
      }
      if (name !== dirName) add('E', `name(${name}) != 目录名(${dirName})`);
    }

    if (!descM) {
      add('E', 'frontmatter 缺 description');
    } else {
      let desc = descM[1].trim().replace(/^["']|["']$/g, '');
      // YAML 块标量: description: | / > ——正文在后续缩进行
      if (/^[|>][+-]?$/.test(desc)) {
        const fmLines = fm.split(/\n/);
        const di = fmLines.findIndex(l => /^description\s*:/.test(l));
        const block = [];
        for (let i = di + 1; i < fmLines.length && /^\s+\S/.test(fmLines[i]); i++) block.push(fmLines[i].trim());
        desc = block.join(' ');
      }
      if (desc.length < 20) add('E', `description 过短(${desc.length} 字符)，路由触发会不准`);
      if (desc.length > 400) add('W', `description 过长(${desc.length} 字符)，L0 常驻税过高`);
      // 触发面质量启发式
      const hasWhat = /[一-龥]/.test(desc) || /\b(use|create|when|for)\b/i.test(desc);
      const hasTriggers = /触发词|trigger|使用|use when/i.test(desc) || desc.split(/[,，、;；]/).length >= 3;
      if (!hasWhat) add('W', 'description 缺 What（做什么）表述');
      if (!hasTriggers) add('W', 'description 无显式触发词/场景枚举——undertrigger 风险');
      if (/[A-Z]:\\|\/home\/|\/Users\//.test(desc)) add('W', 'description 含绝对路径——绑死本机则漏触发');
      if (/使用\s+\S+(-mcp|-server)/.test(desc)) add('W', 'description 绑定具体工具名（lint 同级告警项）');
    }

    // metadata 自声明即查完备性；不声明不索求（检查按能力触发，不按包形归簇）
    if (/^metadata\s*:/m.test(fm)) {
      const layerM = fm.match(/^  layer\s*:\s*(\S+)/m);
      if (!layerM) add('W', 'metadata 缺 layer');
      else declaredLayer = layerM[1];
      if (!/^  compose\s*:/m.test(fm)) add('W', 'metadata 缺 compose');
    }
  }

  // 正文预算（frontmatter 之后）
  const bodyLines = content.replace(/^---[\s\S]*?---\n?/, '').split('\n').length;
  if (bodyLines > 500) add('W', `正文 ${bodyLines} 行超 500 预算——细节下沉 references/`);

  // emoji 禁令（与 scripts/hooks/validate.mjs hasEmoji 同强度：旗帜/keycap/ZWJ 序列全覆盖）
  const emojiRe = new RegExp(
    "\\p{RI}{2}|(?![#*\\d](?!\\uFE0F?\\u20E3))\\p{Emoji}(?:\\p{EMod}|[\\u{E0020}-\\u{E007E}]+\\u{E007F}|\\uFE0F?\\u20E3)?(?:\\u200D\\p{Emoji}(?:\\p{EMod}|[\\u{E0020}-\\u{E007E}]+\\u{E007F}|\\uFE0F?\\u20E3)?)*",
    "u"
  );
  if (emojiRe.test(content)) add('E', '含 emoji（仓库铁律：用 [禁止]/[警告] 结构化标签）');

  // 相对链接文件存在性（剔除代码围栏与行内代码——语法示例不是真链接）
  const linkScanText = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const m of linkScanText.matchAll(/\]\(([^)]+)\)/g)) {
    const link = m[1].split('#')[0].trim();
    if (!link || /^(https?:|mailto:|#)/.test(link)) continue;
    if (!fs.existsSync(path.join(absDir, link))) add('E', `引用的文件不存在: ${link}`);
  }

  // 家族惯例：*-paradigm 元包自声明契约（sources.md + Compose 节）
  // -idiom 不索：testing-*-idiom 是语言落地包非元包，同后缀不同种（撞名记录见 checklist.md）
  const isParadigm = /-paradigm$/.test(dirName);
  if (isParadigm && !fs.existsSync(path.join(absDir, 'references', 'sources.md'))) {
    add('W', '家族惯例：*-paradigm 包应带 references/sources.md');
  }
  if (isParadigm && !/^##?\s*.*Compose/m.test(content)) add('I', '无 Compose 节（元包装配关系惯例）');

  // ---------- 接线项 ----------
  let routerExempt = false; // registry `router: false` 显式豁免位
  if (!skipRegistry) {
    const rp = registryPath || path.join(REPO_ROOT, 'registry.yaml');
    if (fs.existsSync(rp)) {
      const reg = fs.readFileSync(rp, 'utf8');
      const rel = path.relative(REPO_ROOT, absDir).replace(/\\/g, '/');
      const entryRe = new RegExp(`-\\s*name:\\s*${dirName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b([\\s\\S]*?)(?=\\n\\s*-\\s*name:|\\n\\S|$)`);
      const entry = reg.match(entryRe);
      if (!entry) {
        add('E', 'registry.yaml 无此条目（单一事实源未登记）');
      } else {
        if (!entry[1].includes(`path: ${rel}`)) add('E', `registry path 不符（期望 ${rel}）`);
        if (!/note\s*:/.test(entry[1])) add('W', 'registry 条目缺 note');
        if (!/deploy\s*:/.test(entry[1])) add('W', 'registry 条目缺 deploy 段');
        routerExempt = /router\s*:\s*false/.test(entry[1]);
        // ming- 前缀=元系统保留命名空间——条目须显式 metaSystem: true；非 ming- 声明此位=漂移
        const declaredMeta = /metaSystem\s*:\s*true/.test(entry[1]);
        if (dirName.startsWith('ming-') && !declaredMeta) {
          add('E', 'ming- 前缀保留给技能系统自身机械——registry 条目须显式声明 metaSystem: true');
        } else if (!dirName.startsWith('ming-') && declaredMeta) {
          add('W', 'metaSystem:true 声明在非 ming- 包上——声明漂移');
        }
        // 层别登记：metadata.layer 须在 registry layers: 表内（元组管理——新类别先入表再使用）
        const layerBlock = registrySection('layers', rp);
        if (declaredLayer && layerBlock) {
          const allowed = new Set([...layerBlock.matchAll(/^\s*-\s*([a-z-]+)/gm)].map(m => m[1]));
          if (!allowed.has(declaredLayer)) add('W', `layer 值 "${declaredLayer}" 未登记——新类别先入 registry layers 表`);
        }
        // 资产域登记：条目 domain: 值须在 registry domains: 表内（与 layers 同构——
        // 自由文本域无门必腐，apk/android、js/web 同义漂移即先例）
        const domainBlock = registrySection('domains', rp);
        const domM = entry[1].match(/^\s*domain:\s*(\S+)/m);
        if (domM && domainBlock) {
          const allowed = new Set([...domainBlock.matchAll(/^\s*-\s*([\w/-]+)/gm)].map(m => m[1]));
          if (!allowed.has(domM[1])) add('W', `domain 值 "${domM[1]}" 未登记——新值先入 registry domains 表`);
        }
      }
    } else {
      add('I', 'registry.yaml 不在仓库根（独立校验模式）');
    }
  }

  if (!skipRouter) {
    const manifestSrc = path.join(REPO_ROOT, 'scripts', 'build-router-manifest.mjs');
    if (fs.existsSync(manifestSrc)) {
      const src = fs.readFileSync(manifestSrc, 'utf8');
      const routed = src.includes(`"${dirName}"`);
      if (!routed) {
        if (routerExempt) add('I', 'router:false 已声明——DOMAIN_DEFS 检查豁免');
        else add('W', '未进 DOMAIN_DEFS——路由不可见（内部包可在 registry 标 router:false 或用 --no-router 豁免）');
      } else {
        if (routerExempt) add('W', 'router:false 声明与 DOMAIN_DEFS 引用矛盾——豁免位漂移');
        // T6 一致性提示：名字在 skillTriggers 的词与 description 零交集 = 路由/直连各说各话
        const skillTrigRe = new RegExp(`"${dirName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:\\s*\\[([^\\]]*)\\]`);
        const trigM = src.match(skillTrigRe);
        if (trigM) {
          const terms = [...trigM[1].matchAll(/"([^"]+)"/g)].map(x => x[1].toLowerCase());
          const descM2 = content.match(/^description\s*:\s*(.+?)(?=\n\S|\n---|\s*$)/ms);
          const descText = (descM2 ? descM2[1] : '').toLowerCase();
          if (terms.length && !terms.some(t => descText.includes(t))) {
            add('I', `skillTriggers 词 [${terms.join(', ')}] 未出现在 description——路由与直连触发面可能漂移`);
          }
          // T7 域门覆盖检查：skillTrigger 词若不在任何域 triggers/qualityGateTriggers，
          // 则只能域内细化、裸词永不开门——提示作者决断（细化词属正常，需开门请升格）
          const gateTerms = new Set(
            [...src.matchAll(/^\s*(?:qualityGate)?[tT]riggers\s*:\s*\[([\s\S]*?)\]/gm)]
              .flatMap(m => [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1].toLowerCase())));
          const gated = terms.filter(t => !gateTerms.has(t));
          if (gated.length) {
            add('I', `skillTriggers 词 [${gated.join(', ')}] 不在任何域触发词——仅域内细化、裸词不开门（有意细化可忽略，需开门请升入域 triggers）`);
          }
        }
      }
    }
  }

  return issues;
}

// ---------- candidates：候审区契约与统计 ----------
// 协议见 ../references/candidacy.md——一进证据开市、二进证据触发毕业（I 级放行信号）。
// 路由域词表 = build-router-manifest.mjs DOMAIN_DEFS 键（候选 domain 契约是目标路由域，
// 与条目 domain: 资产域词表同字段不同词表——值域当前不相交，归并/改名裁决见 SPINE §11）。
let _routerDomainKeys = null;
function routerDomainKeys() {
  if (_routerDomainKeys) return _routerDomainKeys;
  _routerDomainKeys = new Set();
  const src = path.join(REPO_ROOT, 'scripts', 'build-router-manifest.mjs');
  if (fs.existsSync(src)) {
    const m = fs.readFileSync(src, 'utf8').match(/DOMAIN_DEFS\s*=\s*\{([\s\S]*?)\n\};/);
    if (m) for (const k of m[1].matchAll(/^\s{2}([A-Za-z_]+)\s*:/gm)) _routerDomainKeys.add(k[1]);
  }
  return _routerDomainKeys;
}

function registrySection(key, registryPath = path.join(REPO_ROOT, 'registry.yaml')) {
  if (!fs.existsSync(registryPath)) return null;
  const reg = fs.readFileSync(registryPath, 'utf8');
  const startM = reg.match(new RegExp(`^${key}:\\s*$`, 'm'));
  if (!startM) return null;
  const rest = reg.slice(startM.index + startM[0].length);
  const nextTop = rest.search(/^\S/m);
  return nextTop < 0 ? rest : rest.slice(0, nextTop);
}

function candidateEntries(registryPath = path.join(REPO_ROOT, 'registry.yaml')) {
  const block = registrySection('candidates', registryPath);
  if (!block) return [];
  const entries = [];
  for (const m of block.matchAll(/-\s*name:\s*(\S+)[\s\S]*?(?=-\s*name:|$)/g)) {
    const b = m[0];
    const pick = k => { const f = b.match(new RegExp(`^\\s*${k}:\\s*"?(.+?)"?\\s*$`, 'm')); return f && f[1]; };
    const evBlock = (b.match(/evidence:[^\n]*\n([\s\S]*?)(?=\n\s+\w+:|$)/) || [null, ''])[1];
    entries.push({
      name: m[1],
      domain: pick('domain'),
      path: pick('path'),
      rationale: pick('rationale'),
      graduation: pick('graduation'),
      openedAt: pick('openedAt'),
      evidence: evBlock.split('\n').filter(l => /^\s*-\s*\S/.test(l)).length,
    });
  }
  return entries;
}

function checkCandidates(pkgNames = new Set(), { skipRouter = false, registryPath = path.join(REPO_ROOT, 'registry.yaml') } = {}) {
  const entries = candidateEntries(registryPath);
  const results = [];
  const seen = new Set();
  let ready = 0, oldestDays = 0;
  const today = new Date();
  for (const c of entries) {
    const issues = [];
    const add = (level, msg) => issues.push({ level, msg });
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.name)) add('E', `候选名非 kebab-case: ${c.name}`);
    for (const k of ['domain', 'path', 'rationale', 'graduation', 'openedAt']) {
      if (!c[k]) add('E', `候选条目缺字段 ${k}`);
    }
    // 候选 domain = 目标路由域：值须在 DOMAIN_DEFS 键内（词表门——skipRouter 豁免；
    // keys 空集=manifest 解析失败则跳过，不把解析器故障放大成全误报）
    if (c.domain && !skipRouter) {
      const keys = routerDomainKeys();
      if (keys.size && !keys.has(c.domain)) add('W', `候选 domain "${c.domain}" 不在 DOMAIN_DEFS 域键——目标路由域先入 build-router-manifest 域表`);
    }
    if (c.evidence === 0) add('E', '候选条目无 evidence——开市须至少一份实例证据');
    if (seen.has(c.name)) add('E', `候选重名: ${c.name}`);
    seen.add(c.name);
    if (pkgNames.has(c.name)) add('E', `候选与既有包重名: ${c.name}——应毕业或撤回`);
    if (c.path && fs.existsSync(path.join(REPO_ROOT, c.path))) add('W', `候选已有实体目录 ${c.path}——毕业接线或撤回`);
    if (c.evidence >= 2) { add('I', `graduation-ready：${c.evidence} 份证据已达毕业阈值`); ready++; }
    const days = c.openedAt ? Math.floor((today - new Date(c.openedAt)) / 86400000) : NaN;
    if (Number.isNaN(days)) add('W', `openedAt 不可解析: ${c.openedAt}`);
    else { if (days > oldestDays) oldestDays = days; if (days > 90) add('I', `aging candidate：开市 ${days} 天未毕业——复审存续`); }
    results.push({ name: c.name, issues });
  }
  return { entries, results, stats: { count: entries.length, ready, oldestDays } };
}

// ---------- --all：registry private 区批量 ----------
function privateEntries() {
  const block = registrySection('private') || '';
  const entries = [];
  for (const m of block.matchAll(/-\s*name:\s*(\S+)[\s\S]*?path:\s*(\S+)/g)) {
    entries.push({ name: m[1], path: m[2] });
  }
  return entries;
}

// ---------- 资产域词表全域扫描（--all 不迭代 vertical/deployable 条目，
// 但 domain: 字段挂在那些条目上——词表治理须在 registry 层面扫全段） ----------
function domainVocabSweep(registryPath = path.join(REPO_ROOT, 'registry.yaml')) {
  const domainBlock = registrySection('domains', registryPath);
  if (!domainBlock) return [];
  const allowed = new Set([...domainBlock.matchAll(/^\s*-\s*([\w/-]+)/gm)].map(m => m[1]));
  const issues = [];
  for (const sec of ['base', 'vertical', 'deployable', 'private']) {
    const block = registrySection(sec, registryPath);
    if (!block) continue;
    for (const m of block.matchAll(/^\s+domain:\s*(\S+)/gm)) {
      if (!allowed.has(m[1])) issues.push({ level: 'W', msg: `${sec} 区 domain 值 "${m[1]}" 未登记——新值先入 registry domains 表` });
    }
  }
  return issues;
}

// ---------- stats：一键统计投影（registry 纯函数视图——非新 SoT） ----------
// 三轴：layer 直方图（SKILL.md fm，含 undeclared 桶）/ domain 分布（条目字段）/
// fs→registry 孤儿目录（反向对账——登记条目→目录已有门，目录→登记此前无门）
function skillLayer(absDir) {
  const f = path.join(absDir, 'SKILL.md');
  if (!fs.existsSync(f)) return null;
  const fm = fs.readFileSync(f, 'utf8').match(/^---\s*\n([\s\S]*?)\n---/);
  return fm ? (fm[1].match(/^  layer:\s*(\S+)/m) || [null, null])[1] : null;
}

function allEntryPaths(registryPath = path.join(REPO_ROOT, 'registry.yaml')) {
  const out = new Set();
  for (const sec of ['base', 'vertical', 'deployable', 'private']) {
    const block = registrySection(sec, registryPath) || '';
    for (const m of block.matchAll(/path:\s*(\S+)/g)) out.add(m[1]);
  }
  return out;
}

// roots 可注入（测试用）；登记路径集外、含 SKILL.md 的目录 = 未登记孤儿
function unregisteredDirs(roots, registeredPaths) {
  const found = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name === 'node_modules') continue;
      const p = path.join(dir, ent.name);
      if (fs.existsSync(path.join(p, 'SKILL.md'))) {
        const rel = path.relative(REPO_ROOT, p).replace(/\\/g, '/');
        if (!registeredPaths.has(rel)) found.push(rel);
      } else walk(p); // SKILL.md 目录=包边界不深入；容器目录继续走（engineering/testing/ 嵌套）
    }
  };
  for (const r of roots) walk(path.resolve(REPO_ROOT, r));
  return found;
}

function collectStats(pkgs, registryPath = path.join(REPO_ROOT, 'registry.yaml')) {
  const layers = new Map(); let undeclaredLayers = 0;
  for (const e of pkgs) {
    const layer = skillLayer(path.join(REPO_ROOT, e.path));
    if (layer) layers.set(layer, (layers.get(layer) || 0) + 1); else undeclaredLayers++;
  }
  const domains = new Map();
  for (const sec of ['base', 'vertical', 'deployable', 'private']) {
    const block = registrySection(sec, registryPath) || '';
    for (const m of block.matchAll(/^\s+domain:\s*(\S+)/gm)) domains.set(m[1], (domains.get(m[1]) || 0) + 1);
  }
  const orphans = unregisteredDirs(['private', 'deployable'], allEntryPaths(registryPath));
  return { layers: Object.fromEntries(layers), undeclaredLayers, domains: Object.fromEntries(domains), orphans };
}

// ---------- CLI ----------
function main() {
  const args = process.argv.slice(2);
  // 显式旗标解析：未知旗标拒绝（防 --no-regstry 类拼错静默放行），位置参数有且仅一个
  const KNOWN = new Set(['--json', '--no-router', '--no-registry', '--all']);
  const positional = [];
  for (const a of args) {
    if (a.startsWith('--')) {
      if (!KNOWN.has(a)) { console.error(`[E] 未知旗标: ${a}`); process.exit(1); }
    } else positional.push(a);
  }
  const skillDir = positional[0];
  const asJson = args.includes('--json');
  const opts = { skipRouter: args.includes('--no-router'), skipRegistry: args.includes('--no-registry') };
  const allMode = args.includes('--all');

  if ((!skillDir && !allMode) || positional.length > 1) {
    console.error('用法: node check-skill.mjs <skill-dir>|--all [--json] [--no-router] [--no-registry]');
    process.exit(1);
  }

  const results = []; // {dir, issues}
  let candStats = null;
  let pkgStats = null;
  let pkgCount = 0;
  if (allMode) {
    const pkgs = privateEntries();
    pkgCount = pkgs.length;
    for (const e of pkgs) {
      const abs = path.join(REPO_ROOT, e.path);
      if (!fs.existsSync(abs)) { results.push({ dir: e.path, issues: [{ level: 'E', msg: `registry 登记路径不存在: ${e.path}`, file: abs }] }); continue; }
      results.push({ dir: e.name, issues: checkDir(abs, opts) });
    }
    if (!opts.skipRegistry) {
      const cand = checkCandidates(new Set(pkgs.map(p => p.name)), { skipRouter: opts.skipRouter });
      for (const c of cand.results) results.push({ dir: `candidate:${c.name}`, issues: c.issues });
      candStats = cand.stats;
      // 资产域词表全域扫描 + fs→registry 孤儿目录（反向对账补全）
      const domIssues = domainVocabSweep();
      if (domIssues.length) results.push({ dir: 'domain-vocab', issues: domIssues });
      pkgStats = collectStats(pkgs);
      for (const o of pkgStats.orphans) {
        results.push({ dir: 'fs-scan', issues: [{ level: 'W', msg: `目录含 SKILL.md 但 registry 无条目: ${o}——登记或移除` }] });
      }
    }
  } else {
    const absDir = path.resolve(skillDir);
    results.push({ dir: path.basename(absDir), issues: checkDir(absDir, opts) });
  }

  if (asJson) {
    console.log(JSON.stringify(allMode ? { results, candidates: candStats, stats: pkgStats } : results[0].issues, null, 2));
  } else {
    let te = 0, tw = 0, tn = 0;
    for (const r of results) {
      for (const i of r.issues) console.log(`[${i.level}] ${allMode ? r.dir + ': ' : ''}${i.msg}`);
      const e = r.issues.filter(i => i.level === 'E').length;
      const w = r.issues.filter(i => i.level === 'W').length;
      const n = r.issues.filter(i => i.level === 'I').length;
      te += e; tw += w; tn += n;
      if (!allMode || r.issues.length) console.log(`check-skill: ${r.dir} → E=${e} W=${w} I=${n}`);
    }
    console.log(`\ntotal: ${allMode ? pkgCount : results.length} pkg → E=${te} W=${tw} I=${tn}`);
    if (candStats) console.log(`candidates: ${candStats.count} registered (oldest ${candStats.oldestDays}d; ${candStats.ready} graduation-ready)`);
    if (pkgStats) {
      const fmt = o => `{${Object.entries(o).map(([k, v]) => `${k}:${v}`).join(' ')}}`;
      console.log(`stats: layers ${fmt(pkgStats.layers)} undeclared:${pkgStats.undeclaredLayers}`);
      console.log(`       domains ${fmt(pkgStats.domains)}`);
    }
  }
  process.exitCode = results.some(r => r.issues.some(i => i.level === 'E')) ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();

export { checkDir, privateEntries, candidateEntries, checkCandidates, routerDomainKeys, domainVocabSweep, unregisteredDirs, collectStats, skillLayer };
