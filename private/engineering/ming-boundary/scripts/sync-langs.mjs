#!/usr/bin/env node
// sync-langs.mjs — 上游金数据派生器 CLI 壳（langs/README 上游节落地件）
// 解析/派生/一致性核在 lib/langs/derive.mjs（纯函数，可离线单测）。
// 用法: node sync-langs.mjs [--lang rust,python] [--check|--heads|--verify]
//   （默认）    拉 pinned rev 的 tags.scm + linguist → 写 <lang>.derived.mjs
//   --check    在线对账：重拉 pinned 源重派生，与盘上 derived 比字节（漂移=1）
//   --heads    在线漂移报告：upstream.yaml pin vs 各 grammar 仓 HEAD
//              （只报告不代改——升 pin 是人审事；exit 0=无漂移 1=有漂移）
//   --verify   离线门禁：derived 头注 provenance.rev == upstream.yaml pin
//              （零网络零 curl；stale/missing/orphan 任一 → exit 1）
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { derive, emitDerived, checkDerivedConsistency }
  from './lib/langs/derive.mjs';
import { loadYaml } from './lib/yaml.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LANGS_DIR = path.join(HERE, 'lib', 'langs');
const RAW = 'https://raw.githubusercontent.com';

function die(msg, code = 2) { console.error(`[sync-langs] ${msg}`); process.exit(code); }

const a = { lang: null, check: false, heads: false, verify: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i];
  if (k === '--lang') a.lang = argv[++i].split(',').filter(Boolean);
  else if (k === '--check') a.check = true;
  else if (k === '--heads') a.heads = true;
  else if (k === '--verify') a.verify = true;
  else die(`未知旗标: ${k}`);
}
if ([a.check, a.heads, a.verify].filter(Boolean).length > 1)
  die('--check/--heads/--verify 互斥');

// ---------- 上游表装载（lib/yaml.mjs：lite 解析优先，pwsh 桥兜底） ----------
function loadUpstream() {
  return loadYaml(path.join(LANGS_DIR, 'upstream.yaml'));
}

// Node 22 全局 fetch——去 curl 依赖（win32 无 curl.exe 的老镜像也能跑）
async function fetchText(repo, rev, p) {
  const url = `${RAW}/${repo}/${rev}/${p}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) die(`拉取失败 ${url}: HTTP ${r.status}`);
  return r.text();
}

const cfg = loadUpstream();
const targets = (a.lang || Object.keys(cfg.langs)).filter((l) => cfg.langs[l]);
if (!targets.length) die('upstream.yaml 无目标语言');

// ---------- --verify：离线 pin 对 derived 对账（门禁层） ----------
if (a.verify) {
  const yamlText = fs.readFileSync(path.join(LANGS_DIR, 'upstream.yaml'), 'utf8');
  const derivedSources = {};
  for (const l of targets) {
    const p = path.join(LANGS_DIR, `${l}.derived.mjs`);
    if (fs.existsSync(p)) derivedSources[l] = fs.readFileSync(p, 'utf8');
  }
  const states = checkDerivedConsistency(yamlText, derivedSources);
  let bad = 0;
  for (const [l, s] of Object.entries(states)) {
    if (s.state !== 'ok') bad++;
    console.error(`[sync-langs] verify ${l}: ${s.state}` +
      (s.state === 'stale' ? ` pin=${s.pin.slice(0, 7)} derived=${String(s.rev).slice(0, 7)}` : ''));
  }
  process.exit(bad ? 1 : 0);
}

// ---------- --heads：pin vs 远端 HEAD 漂移报告 ----------
if (a.heads) {
  let drift = 0;
  for (const l of targets) {
    const c = cfg.langs[l];
    const r = spawnSync('git', ['ls-remote', `https://github.com/${c.grammar}`,
      'HEAD'], { encoding: 'utf8' });
    const head = r.status === 0 ? (r.stdout.match(/^([0-9a-f]{40})/) || [])[1] : null;
    if (!head) { console.error(`[sync-langs] heads ${l}: ls-remote 失败（网络?）`); continue; }
    const same = head === c.rev;
    if (!same) drift++;
    console.error(`[sync-langs] heads ${l}: pin=${c.rev.slice(0, 7)} ` +
      `HEAD=${head.slice(0, 7)} ${same ? 'OK' : 'DRIFT（升 pin 须人审+重生成）'}`);
  }
  process.exit(drift ? 1 : 0);
}

// ---------- 默认/--check：拉取派生（在线） ----------
const lingYml = await fetchText(cfg.sources.linguist.repo, cfg.sources.linguist.rev,
  cfg.sources.linguist.path);

let drift = false;
for (const l of targets) {
  const c = cfg.langs[l];
  const scm = await fetchText(c.grammar, c.rev, c.tags);
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
