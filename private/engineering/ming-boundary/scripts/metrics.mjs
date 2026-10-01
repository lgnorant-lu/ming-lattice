// metrics.mjs — 语言前端质量指标报告器（frontend-quality-gate.md 的语料层执行件）
// 用法:
//   node metrics.mjs [--lang rust] [--corpus <name>] [--gate] [--determinism]
//                    [--corpus-file <path>] [--no-m2] [--node-types <file>]
//                    [--sync   语料物化+rev 漂移对账（provisioning 步，量前先跑）]
// 指标: M1 解析错误率(ast-grep ERROR 扫描, errFixtureGlobs 豁免) /
//       M2 语法覆盖(node-types.json ÷ 规则 kind 词表, pin 自 upstream.yaml,
//          网络件 --no-m2 关 / --node-types 注入本地档)
//       M3 边产率(import+export/KLOC) / M4 畸形名率 / M5 确定性(--determinism 双跑)
//       M7 上游固件采收(corpus.yaml fixtures: 段, 逐件断言产边/decl/畸形名,
//          match 零命中=固件漂移 FAIL)
// --gate: 任一 corpus 越 minParseRate/maxMalformed/fixtures 断言阈值 exit 1
// 批次上限按命令行长动态算（≤24K 字符/批——Win32 32K 上限实测教训），不拍固定数

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseYamlLite } from './lib/yaml.mjs';
import { findAstGrep } from './lib/frontends.mjs';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTRACT = path.join(PKG, 'scripts', 'extract-facts.mjs');
const CMDLINE_BUDGET = 24000; // 字符——Win32 CreateProcess 32K 上限留裕量

function die(msg, code = 2) { console.error(`[metrics] ${msg}`); process.exit(code); }

function parseArgs(argv) {
  const a = { lang: null, corpus: null, gate: false, determinism: false,
              corpusFile: path.join(PKG, 'corpus.yaml'), m2: true, nodeTypes: null };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const take = () => argv[++i] ?? die(`${k} 缺参数`);
    if (k === '--lang') a.lang = take();
    else if (k === '--sync') a.sync = true;
    else if (k === '--corpus') a.corpus = take();
    else if (k === '--gate') a.gate = true;
    else if (k === '--determinism') a.determinism = true;
    else if (k === '--corpus-file') a.corpusFile = path.resolve(take());
    else if (k === '--no-m2') a.m2 = false;
    else if (k === '--node-types') a.nodeTypes = path.resolve(take());
    else die(`未知旗标: ${k}`);
  }
  return a;
}

function resolveCorpusPath(p) {
  if (path.isAbsolute(p)) return p;
  const root = process.env.MB_CORPUS_ROOT;
  if (!root) die(`corpus 相对路径 ${p} 需 MB_CORPUS_ROOT 环境变量`);
  return path.resolve(root, p);
}

function* srcFiles(dir, extSet) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '.git' || e.name === 'target' || e.name === 'node_modules') continue;
      yield* srcFiles(p, extSet);
    } else if (extSet.has(path.extname(e.name))) yield p;
  }
}

// 按命令行长分批——固定批数在路径长时触 Win32 32K 静默失败（实证坑）
function batches(files) {
  const out = []; let cur = []; let len = 0;
  for (const f of files) {
    const w = f.length + 3; // 引号+空格
    if (cur.length && len + w > CMDLINE_BUDGET) { out.push(cur); cur = []; len = 0; }
    cur.push(f); len += w;
  }
  if (cur.length) out.push(cur);
  return out;
}

function m1ParseRate(bin, langName, files, errGlobs) {
  const rules = `id: probe-error\nlanguage: ${langName}\nrule:\n  kind: ERROR`;
  const errRe = errGlobs.map(g => new RegExp(g));
  const errFiles = new Set();
  for (const b of batches(files)) {
    const r = spawnSync(bin, ['scan', '--inline-rules', rules, '--json', ...b],
      { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
    if (r.status !== 0 && !r.stdout) die(`ast-grep batch spawn 失败: ${r.stderr?.slice(0, 200)}`);
    for (const m of JSON.parse(r.stdout || '[]')) {
      if (m.ruleId === 'probe-error') errFiles.add(m.file.replace(/\\/g, '/'));
    }
  }
  const realErr = [...errFiles].filter(f => !errRe.some(re => re.test(f)));
  return { files: files.length, err: errFiles.size, errFixture: errFiles.size - realErr.length,
           realErr: realErr.length, rate: (files.length - realErr.length) / files.length };
}

function extractFacts(root) {
  const out = path.join(os.tmpdir(), `mb-metrics-${process.pid}-${Math.random().toString(36).slice(2)}.jsonl`);
  const r = spawnSync(process.execPath, [EXTRACT, '--root', root, '--out', out],
    { encoding: 'utf8' });
  if (r.status !== 0) die(`extract-facts 失败(${root}): ${(r.stderr || r.stdout || '').slice(0, 300)}`);
  return out;
}

function m3m4(factsPath, errGlobs, kloc) {
  const facts = fs.readFileSync(factsPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  const errRe = errGlobs.map(g => new RegExp(g));
  const edge = facts.filter(f => f.kind === 'import' || f.kind === 'export');
  const malformed = facts.filter(f => {
    const n = `${f.name || ''}${f.to || ''}`;
    return (/[{}]|\/\/|\n/.test(n) || n === '(unparsed)')
      && !errRe.some(re => re.test(String(f.file || '').replace(/\\/g, '/')));
  });
  return { facts: facts.length, edges: edge.length,
           yieldPerKloc: kloc ? (edge.length / kloc).toFixed(1) : null,
           malformed: malformed.length,
           malformedSample: malformed.slice(0, 5).map(f => `${f.file}:${f.name || f.to}`) };
}

async function m2Coverage(lang, nodeTypesFile) {
  const pins = parseYamlLite(fs.readFileSync(path.join(PKG, 'scripts/lib/langs/upstream.yaml'), 'utf8'));
  const spec = pins.langs?.[lang];
  if (!spec?.grammar || !spec?.rev) return { skipped: `upstream.yaml 无 ${lang} grammar pin` };
  let nt;
  if (nodeTypesFile) {
    nt = JSON.parse(fs.readFileSync(nodeTypesFile, 'utf8'));
  } else {
    const cache = path.join(os.tmpdir(), `mb-node-types-${lang}-${spec.rev}.json`);
    if (fs.existsSync(cache)) nt = JSON.parse(fs.readFileSync(cache, 'utf8'));
    else {
      const url = `https://raw.githubusercontent.com/${spec.grammar}/${spec.rev}/src/node-types.json`;
      const res = await fetch(url);
      if (!res.ok) return { skipped: `node-types.json 拉取失败 ${res.status}` };
      nt = await res.json();
      fs.writeFileSync(cache, JSON.stringify(nt));
    }
  }
  const named = new Set(nt.filter(n => n.named).map(n => n.type));
  const desc = await import(`./lib/langs/${lang}.mjs`);
  const rulesText = desc.rulesFor ? desc.rulesFor(null) : '';
  const ruleKinds = new Set([...rulesText.matchAll(/kind:\s*"?([a-z_]+)"?/g)].map(m => m[1]));
  const unknown = [...ruleKinds].filter(k => !named.has(k));
  return { named: named.size, ruleKinds: ruleKinds.size,
           coverage: +(ruleKinds.size / named.size * 100).toFixed(1), unknown };
}

// ---------- M7 上游固件采收（corpus.yaml fixtures: 段驱动） ----------
// spec 字段: match=仓相对路径正则(必填) / minFiles(缺省1，0命中=固件漂移FAIL)
//            / minImports / minDecls / maxMalformed(缺省0)——逐件断言
// 语义: 采收的上游 test_data/corpus 固件过抽取器，防"词表之外形态"静默劣化
function m7Fixtures(c, root, allFiles) {
  const rel = f => path.relative(root, f).replace(/\\/g, '/');
  const specs = (c.fixtures || []).map(s => {
    if (!s.match) return { s, files: null, err: 'fixtures spec 缺 match' };
    const re = new RegExp(s.match);
    return { s, files: allFiles.filter(f => re.test(rel(f))) };
  });
  const uniq = [...new Set(specs.flatMap(p => p.files || []))];
  const byFile = new Map();
  if (uniq.length) {
    const out = path.join(os.tmpdir(), `mb-fix-${process.pid}-${Math.random().toString(36).slice(2)}.jsonl`);
    const r = spawnSync(process.execPath,
      [EXTRACT, '--root', root, '--files', uniq.map(rel).join(','), '--out', out],
      { encoding: 'utf8' });
    if (r.status !== 0)
      return specs.map(p => ({ spec: p.s, n: (p.files || []).length, ok: false, rows: [],
                               err: `extract 失败: ${(r.stderr || r.stdout || '').slice(0, 120)}` }));
    for (const line of fs.readFileSync(out, 'utf8').split('\n').filter(Boolean)) {
      const f = JSON.parse(line);
      const k = String(f.file || '').replace(/\\/g, '/');
      if (!byFile.has(k)) byFile.set(k, []);
      byFile.get(k).push(f);
    }
    fs.rmSync(out, { force: true });
  }
  return specs.map(({ s, files, err }) => {
    if (err) return { spec: s, n: 0, ok: false, rows: [], err };
    const rows = (files || []).map(f => {
      const fx = byFile.get(rel(f)) || [];
      const imports = fx.filter(x => x.kind === 'import').length;
      const decls = fx.filter(x => x.kind === 'decl').length;
      const malformed = fx.filter(x => /[{}]|\/\/|\n/.test(`${x.name || ''}${x.to || ''}`)).length;
      const ok = imports >= (s.minImports ?? 0) && decls >= (s.minDecls ?? 0)
               && malformed <= (s.maxMalformed ?? 0);
      return { file: rel(f), imports, decls, malformed, ok };
    });
    const ok = (files || []).length >= (s.minFiles ?? 1) && rows.every(r => r.ok);
    return { spec: s, n: (files || []).length, ok, rows };
  });
}

// ---------- --sync：语料物化 + rev 漂移检测 ----------
// repo: 'owner/name' → GitHub https；绝对路径/URL 原样用（本地仓 clone 供测试）
// 缺席 → init+fetch --depth 1 <rev>+checkout FETCH_HEAD（浅物化不拉全史）；
// 在位 → rev-parse HEAD 对 rev，漂移只报告不改写（--sync 不做有损复位）
function git(dir, args) {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
}
function syncCorpus(c) {
  const root = resolveCorpusPath(c.path);
  const url = path.isAbsolute(c.repo) ? c.repo
    : /^[a-z]+:\/\//.test(c.repo) ? c.repo : `https://github.com/${c.repo}`;
  if (!fs.existsSync(path.join(root, '.git'))) {
    // 本地仓走 plain clone+checkout（file:// 对 --depth 语义不支持会静默忽略）；
    // 远端走 init+depth1 fetch 钉 sha——浅物化不拉全史
    const steps = path.isAbsolute(c.repo)
      ? [['clone', '-q', url, root], ['-C', root, 'checkout', '-q', c.rev]]
      : [['init', '-q'], ['remote', 'add', 'origin', url],
         ['fetch', '-q', '--depth', '1', 'origin', c.rev],
         ['checkout', '-q', 'FETCH_HEAD']];
    fs.mkdirSync(root, { recursive: true });
    for (const args of steps) {
      const r = args[0] === '-C' || args[0] === 'clone'
        ? spawnSync('git', args, { encoding: 'utf8' })
        : git(root, args);
      if (r.status !== 0) return { name: c.name, ok: false, err: `git ${args[0]}: ${(r.stderr || '').slice(0, 160)}` };
    }
    return { name: c.name, ok: true, action: 'materialized' };
  }
  const head = git(root, ['rev-parse', 'HEAD']);
  const cur = (head.stdout || '').trim();
  if (c.rev && cur !== c.rev)
    return { name: c.name, ok: false, action: 'drift',
             err: `HEAD=${cur.slice(0, 12)} ≠ pin=${c.rev.slice(0, 12)}（既有 checkout 不覆写——人工对账）` };
  return { name: c.name, ok: true, action: 'pinned' };
}

const a = parseArgs(process.argv);
const corpusReg = parseYamlLite(fs.readFileSync(a.corpusFile, 'utf8'));
const langs = Object.keys(corpusReg.langs || {}).filter(l => !a.lang || l === a.lang);
if (!langs.length) die('无语料命中（--lang 过滤后为空）');

if (a.sync) {
  let bad = 0;
  for (const lang of langs)
    for (const c of corpusReg.langs[lang].corpora || []) {
      if (!c.repo) continue; // 本地语料只量不拉
      const r = syncCorpus(c);
      if (!r.ok) bad++;
      console.log(`  ${r.ok ? '[ok]' : '[FAIL]'} ${lang}/${c.name}: ${r.action || ''}${r.err ? ' ' + r.err : ''}`);
    }
  process.exit(bad ? 1 : 0);
}

const { bin, ver } = findAstGrep();
const LANG_AST = { rust: 'Rust', python: 'Python' }; // ast-grep language 名映射
let gateFails = 0;

for (const lang of langs) {
  const entry = corpusReg.langs[lang];
  const descMod = await import(`./lib/langs/${lang}.mjs`);
  const extSet = descMod.exts instanceof Set ? descMod.exts : new Set(descMod.exts || []);
  console.log(`== ${lang}（ast-grep@${ver}）==`);
  if (a.m2) {
    const m2 = await m2Coverage(lang, a.nodeTypes);
    if (m2.skipped) console.log(`  M2 skipped: ${m2.skipped}`);
    else {
      console.log(`  M2 grammar覆盖: ${m2.ruleKinds}/${m2.named} 节点种 = ${m2.coverage}%` +
        (m2.unknown.length ? `  [FAIL] 规则引用 grammar 不存在的种: ${m2.unknown.join(',')}` : ''));
      if (m2.unknown.length) gateFails++;
    }
  }
  for (const c of entry.corpora || []) {
    if (a.corpus && c.name !== a.corpus) continue;
    const root = resolveCorpusPath(c.path);
    if (!fs.existsSync(root)) { console.log(`  ${c.name}: 语料缺席 ${root}（MB_CORPUS_ROOT 未就位？）——跳过`); continue; }
    const files = [...srcFiles(root, extSet)];
    const kloc = files.reduce((s, f) => s + fs.readFileSync(f, 'utf8').split('\n').length, 0) / 1000;
    const globs = c.errFixtureGlobs || [];

    const m1 = m1ParseRate(bin, LANG_AST[lang] || lang, files, globs);
    const m1ok = m1.rate >= (c.minParseRate ?? 1);
    if (!m1ok) gateFails++;
    console.log(`  ${c.name} [${c.scale}]: files=${m1.files} KLOC=${kloc.toFixed(1)} M1=${(m1.rate * 100).toFixed(2)}%` +
      `（ERROR=${m1.err}，固件豁免=${m1.errFixture}，实欠=${m1.realErr}）${m1ok ? '' : ' [FAIL]'}`);

    const fp = extractFacts(root);
    const m34 = m3m4(fp, globs, kloc);
    const m4ok = m34.malformed <= (c.maxMalformed ?? 0);
    if (!m4ok) gateFails++;
    console.log(`    M3 边产率=${m34.yieldPerKloc}/KLOC（edges=${m34.edges}/facts=${m34.facts}）` +
      ` M4 畸形名=${m34.malformed}${m4ok ? '' : ' [FAIL]'}`);
    if (m34.malformedSample.length) console.log(`      样本: ${m34.malformedSample.join(' | ')}`);

    if (a.determinism) {
      const fp2 = extractFacts(root);
      const same = fs.readFileSync(fp, 'utf8') === fs.readFileSync(fp2, 'utf8');
      if (!same) gateFails++;
      console.log(`    M5 确定性双跑: ${same ? 'byte-identical' : '[FAIL] 差异'}`);
      fs.rmSync(fp2, { force: true });
    }

    if (c.fixtures?.length) {
      for (const g of m7Fixtures(c, root, files)) {
        if (!g.ok) gateFails++;
        console.log(`    M7 固件 ${g.spec.match || '(缺match)'}: ${g.n}件` +
          (g.ok ? ' 全断言通过' : ' [FAIL]') + (g.err ? ` ${g.err}` : ''));
        for (const r of (g.rows || []).filter(r => !r.ok).slice(0, 5))
          console.log(`      FAIL ${r.file}: imports=${r.imports} decls=${r.decls} malformed=${r.malformed}`);
      }
    }
    fs.rmSync(fp, { force: true });
  }
}
if (a.gate && gateFails) { console.log(`[metrics] gate: ${gateFails} 项越阈`); process.exit(1); }
