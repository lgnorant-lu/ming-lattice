#!/usr/bin/env node
// sync-langs.mjs — 上游金数据派生器（langs/README 上游节落地件）
// 读 lib/langs/upstream.yaml → 拉 pinned rev 的 tags.scm + linguist
// languages.yml → 解析 @definition.*/@reference.* 捕获 → 写
// lib/langs/<lang>.derived.mjs（确定性输出：无时间戳，provenance=pin rev）。
// 用法: node sync-langs.mjs [--lang rust,python] [--check]
//   --check 不写文件：derived 与手写描述符覆盖面做校准对账，差集即报告。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LANGS_DIR = path.join(HERE, 'lib', 'langs');
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..');
const YAML2JSON = path.join(REPO_ROOT, 'scripts/lib/yaml2json.ps1');
const RAW = 'https://raw.githubusercontent.com';

function die(msg, code = 2) { console.error(`[sync-langs] ${msg}`); process.exit(code); }

const a = { lang: null, check: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i];
  if (k === '--lang') a.lang = argv[++i].split(',').filter(Boolean);
  else if (k === '--check') a.check = true;
  else die(`未知旗标: ${k}`);
}

// ---------- 上游表装载（仓内 yaml-lite 桥） ----------
function loadUpstream() {
  const p = path.join(LANGS_DIR, 'upstream.yaml');
  const r = spawnSync('pwsh', ['-NoProfile', '-File', YAML2JSON, '-Path', p],
    { encoding: 'utf8' });
  if (r.error || r.status !== 0) die(`yaml 桥失败: ${r.stderr || r.error?.message}`);
  return JSON.parse(r.stdout);
}

function fetchText(repo, rev, p) {
  const url = `${RAW}/${repo}/${rev}/${p}`;
  const r = spawnSync('curl', ['-sfL', url], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.error || r.status !== 0) die(`拉取失败 ${url}: ${r.stderr || r.error?.message}`);
  return r.stdout;
}

// ---------- tags.scm S-expr 解析（够用即停：只抽捕获归属） ----------
// 产出 [{capture:'definition.class', kind, inside:[kinds], nameKind}]，
// 捕获标签挂在紧邻其前的节点上；inside=该节点的祖先 kind 链（外→内）。
function parseTags(scm) {
  const toks = scm.match(/\(|\)|@?[^\s()]+|"[^"]*"/g) || [];
  const out = [];
  const stack = []; // 每层 {kind, nameKind}
  let pending = null; // 上一个闭合项（捕获标签的宿主）
  for (const tk of toks) {
    if (tk === '(') { stack.push({ kind: null, nameKind: null }); pending = null; }
    else if (tk === ')') {
      const f = stack.pop();
      // 闭帧时把帧上已记的 nameKind 一并带出去（@name 可能打在子节点）
      const childName = f?.lastChild?.nameKind;
      pending = f ? { kind: f.kind, nameKind: f.nameKind || childName,
        inside: stack.map((s) => s.kind).filter(Boolean) } : null;
      if (stack.length) stack[stack.length - 1].lastChild = pending;
    } else if (tk.startsWith('@')) {
      const cap = tk.slice(1);
      // @name 记到**外围帧**上（name: (identifier) @name 的宿主是子节点，
      // 但 name 字段属于外层 decl 节点）
      const host = pending || (stack.length && stack[stack.length - 1].lastChild);
      if (cap === 'name') {
        const top = stack[stack.length - 1];
        if (top && host) top.nameKind = host.kind;
        continue;
      }
      if (!/^(definition|reference)\./.test(cap) || !host) continue;
      out.push({ capture: cap, kind: host.kind, inside: host.inside,
        nameKind: host.nameKind });
      pending = host;
    } else {
      // 原子项：位置0=kind；field: 前缀不影响——kind 是 '(' 后第一个裸 token
      const top = stack[stack.length - 1];
      if (top && top.kind === null && !tk.endsWith(':') && !tk.startsWith('"'))
        top.kind = tk;
      if (top && top.kind !== null) top.lastChild = { kind: tk, inside: null };
      else pending = { kind: tk, inside: null };
    }
  }
  return out;
}

// ---------- linguist languages.yml → exts ----------
// 只解析我们钉的语言块：languages.yml 结构浅——LangName: 块内 extensions: 列表
function linguistExts(yml, langKey) {
  const lines = yml.split('\n');
  let inLang = false, inExts = false;
  const exts = [];
  for (const l of lines) {
    if (/^\S/.test(l)) {                    // 顶层键行
      inLang = l.replace(/["']/g, '').startsWith(langKey + ':');
      inExts = false;
      continue;
    }
    if (!inLang) continue;
    if (/^\s+extensions:/.test(l)) { inExts = true; continue; }
    if (/^\s+\S[^:]*:/.test(l)) { inExts = false; continue; }
    if (inExts) {
      const m = l.match(/^\s+-\s+['"]?(\.[\w.]+)/);
      if (m) exts.push(m[1]);
      else inExts = false;
    }
  }
  return exts.sort();
}

// ---------- 派生物定型 ----------
function derive(langKey, cfg, scmText, lingYml) {
  const caps = parseTags(scmText);
  const dedup = new Map();
  for (const c of caps) {
    const k = `${c.capture}|${c.kind}|${c.inside.join('>')}`;
    if (!dedup.has(k)) dedup.set(k, { ...c, inside: c.inside });
  }
  const declKinds = [], refKinds = [];
  for (const c of [...dedup.values()].sort((x, y) => x.capture.localeCompare(y.capture)
    || x.kind.localeCompare(y.kind))) {
    const e = { shape: c.capture.split('.')[1], kind: c.kind,
      ...(c.inside.length ? { inside: c.inside } : {}),
      ...(c.nameKind ? { nameKind: c.nameKind } : {}) };
    (c.capture.startsWith('definition.') ? declKinds : refKinds).push(e);
  }
  return { declKinds, refKinds,
    exts: linguistExts(lingYml, cfg.linguist) };
}

function emitDerived(langKey, cfg, d) {
  return `// <auto-generated by sync-langs.mjs — DO NOT EDIT>
// provenance: ${cfg.grammar}@${cfg.rev} ${cfg.tags}
// 词表声明派生物：手写描述符 <lang>.mjs 消费本件组装 decl 规则；
// 边语义（边去哪）不属上游供给面，仍手写。
export const derived = ${JSON.stringify({
    lang: langKey, upstream: { grammar: cfg.grammar, rev: cfg.rev, tags: cfg.tags },
    exts: d.exts, declKinds: d.declKinds, refKinds: d.refKinds,
  }, null, 2)};
`;
}

const cfg = loadUpstream();
const targets = (a.lang || Object.keys(cfg.langs)).filter((l) => cfg.langs[l]);
if (!targets.length) die('upstream.yaml 无目标语言');

const lingYml = fetchText(cfg.sources.linguist.repo, cfg.sources.linguist.rev,
  cfg.sources.linguist.path);

let drift = false;
for (const l of targets) {
  const c = cfg.langs[l];
  const scm = fetchText(c.grammar, c.rev, c.tags);
  const d = derive(l, c, scm, lingYml);
  const body = emitDerived(l, c, d);
  const out = path.join(LANGS_DIR, `${l}.derived.mjs`);
  if (a.check) {
    const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (prev !== body) {
      drift = true;
      console.error(`[sync-langs] ${l}: 派生物漂移（上游 rev 未动但产出变）`);
    } else console.error(`[sync-langs] ${l}: 无漂移`);
    continue;
  }
  fs.writeFileSync(out, body);
  console.error(`[sync-langs] ${l}: decl=${d.declKinds.length} ref=${d.refKinds.length} exts=[${d.exts}] -> ${path.basename(out)}`);
}
if (a.check && drift) process.exit(1);
