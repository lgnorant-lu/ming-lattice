#!/usr/bin/env node
// registry-upsert.mjs — registry.yaml 条目安全编辑（替代 python 手编——防"整行变注释"类事故）
// 用法:
//   add:    node scripts/registry-upsert.mjs add --section vertical --name <n> [--repo <url>]
//           [--pin <40hex>] [--path <p>] [--weight core|heavy] [--domain <d>] [--note "s"]
//           [--deploy c1,c2] [--metaSystem] [--sourceGone]
//   set:    node scripts/registry-upsert.mjs set --name <n> [--pin <h>] [--enabled true|false]
//           [--weight core|heavy] [--acquiredAt <date>]
//   remove: node scripts/registry-upsert.mjs remove --name <n>
// 契约: --dry-run 预览零落盘；名唯一(全段)/pin 40hex/weight 词表/domain 入登记/deploy 客户名⊆targets
//       全 fail-closed；行级精准改写，不动注释与其他条目。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = process.env.REG_UPSERT_ROOT
  ? path.resolve(process.env.REG_UPSERT_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REG = path.join(REPO_ROOT, 'registry.yaml');

const die = m => { console.error(`[E] ${m}`); process.exit(2); };
const args = process.argv.slice(2);
const verb = args[0];
if (!['add', 'set', 'remove'].includes(verb)) die('用法: add|set|remove（--help 见头注）');
const opts = { _: [] };
const VALUE = new Set(['--section', '--name', '--repo', '--pin', '--path', '--weight', '--domain', '--note', '--deploy', '--enabled', '--acquiredAt']);
for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (VALUE.has(a)) {
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) die(`旗标 ${a} 缺值`);
    opts[a] = v; i++;
  } else if (['--dry-run', '--metaSystem', '--sourceGone'].includes(a)) opts[a] = true;
  else die(a.startsWith('--') ? `未知旗标: ${a}` : `不接受位置参数: ${a}`);
}
const dry = !!opts['--dry-run'];

const lines = fs.readFileSync(REG, 'utf8').split('\n');
const topKey = l => /^[a-zA-Z]/.test(l);
// 段范围: [start, end) —— topKey 行起到下一个 topKey 行
const sectionRange = (sec) => {
  const s = lines.findIndex(l => l === `${sec}:`);
  if (s < 0) return null;
  let e = lines.length;
  for (let i = s + 1; i < lines.length; i++) if (topKey(lines[i])) { e = i; break; }
  return [s, e];
};
const entryAt = (name) => {
  for (const [s, e] of [sectionRange('vertical'), sectionRange('deployable'), sectionRange('private'), sectionRange('candidates')].filter(Boolean)) {
    for (let i = s + 1; i < e; i++) {
      const m = lines[i].match(/^ {2}- name:\s*(.+?)\s*$/);
      if (!m) continue;
      if (m[1] === name) {
        let b = i + 1;
        for (; b < e; b++) if (/^ {2}- name:/.test(lines[b]) || topKey(lines[b])) break;
        return { start: i, end: b, section: lines[s].slice(0, -1) };
      }
    }
  }
  return null;
};
const allNames = () => {
  const out = [];
  for (const l of lines) { const m = l.match(/^ {2}- name:\s*(.+?)\s*$/); if (m) out.push(m[1]); }
  return out;
};
const targetsKeys = () => {
  const r = sectionRange('targets'); if (!r) return new Set();
  const out = new Set();
  for (let i = r[0] + 1; i < r[1]; i++) { const m = lines[i].match(/^ {2}(\w+):/); if (m) out.add(m[1]); }
  return out;
};
const domainVocab = () => {
  const r = sectionRange('domains'); if (!r) return null;
  const out = new Set();
  for (let i = r[0] + 1; i < r[1]; i++) { const m = lines[i].match(/^ {2}- (\S+)/); if (m) out.add(m[1]); }
  return out.size ? out : null;
};

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX40 = /^[0-9a-f]{40}$/i;
const assertCommon = () => {
  if (!opts['--name']) die('缺 --name');
  if (!KEBAB.test(opts['--name'])) die(`name=${opts['--name']} 非 kebab`);
};

if (verb === 'add') {
  assertCommon();
  const sec = opts['--section'];
  if (!['vertical', 'deployable', 'private', 'candidates'].includes(sec)) die('--section 须 vertical|deployable|private|candidates');
  if (allNames().includes(opts['--name'])) die(`重名: ${opts['--name']}（registry 全段唯一）`);
  if (opts['--pin'] && !HEX40.test(opts['--pin'])) die(`pin 非 40-hex: ${opts['--pin']}`);
  if (sec === 'vertical' && opts['--repo'] && !opts['--pin'] && !opts['--sourceGone']) die('vertical 远端条目须 --pin 40hex（或 --sourceGone 孤本）');
  if (opts['--weight'] && !['core', 'heavy'].includes(opts['--weight'])) die(`weight 出词表 {core|heavy}: ${opts['--weight']}`);
  if (opts['--domain']) {
    const dv = domainVocab();
    if (dv && !dv.has(opts['--domain'])) die(`domain=${opts['--domain']} 不在 domains: 词表（先入表再使用）`);
  }
  const tkeys = targetsKeys();
  const deployClients = opts['--deploy'] ? opts['--deploy'].split(',').map(s => s.trim()).filter(Boolean) : [];
  for (const c of deployClients) if (!tkeys.has(c)) die(`deploy 客户名 ${c} 不在 targets: 词表`);

  const ent = [`  - name: ${opts['--name']}`];
  if (opts['--metaSystem']) ent.push('    metaSystem: true');
  if (opts['--sourceGone']) ent.push('    sourceGone: true');
  if (opts['--repo']) ent.push(`    repo: ${opts['--repo']}`);
  ent.push(`    path: ${opts['--path'] || `${sec}/${opts['--name']}`}`);
  if (opts['--pin']) ent.push(`    pin: ${opts['--pin']}`);
  if (opts['--acquiredAt']) ent.push(`    acquiredAt: ${opts['--acquiredAt']}`);
  ent.push(`    enabled: ${opts['--enabled'] === 'false' ? 'false' : 'true'}`);
  if (opts['--weight']) ent.push(`    weight: ${opts['--weight']}`);
  if (opts['--domain']) ent.push(`    domain: ${opts['--domain']}`);
  if (opts['--note']) ent.push(`    note: "${opts['--note']}"`);
  ent.push('    deploy:' + (deployClients.length ? '' : ' {}'));
  for (const c of deployClients) ent.push(`      ${c}: true`);

  const [s, e] = sectionRange(sec) ?? die(`registry 无 ${sec}: 段`);
  // 插位=段尾（下一个顶层键前）；段内保持既有顺序不动
  let ins = e;
  if (dry) { console.log(`[dry-run] 将于 registry.yaml:${ins + 1}(${sec}: 段尾) 插入:\n${ent.join('\n')}`); process.exit(0); }
  lines.splice(ins, 0, ...ent);
  fs.writeFileSync(REG, lines.join('\n'));
  console.log(`[upsert] ${sec}/${opts['--name']} 已登记（: ${ins + 1} 行位）`);

} else if (verb === 'set') {
  assertCommon();
  const FIELDS = { '--pin': 'pin', '--enabled': 'enabled', '--weight': 'weight', '--acquiredAt': 'acquiredAt' };
  const sets = Object.entries(FIELDS).filter(([f]) => opts[f] !== undefined).map(([f, k]) => [k, opts[f]]);
  if (!sets.length) die('set 无可写字段（--pin/--enabled/--weight/--acquiredAt）');
  if (opts['--pin'] && !HEX40.test(opts['--pin'])) die(`pin 非 40-hex: ${opts['--pin']}`);
  if (opts['--enabled'] && !['true', 'false'].includes(opts['--enabled'])) die('--enabled 须 true|false');
  if (opts['--weight'] && !['core', 'heavy'].includes(opts['--weight'])) die(`weight 出词表 {core|heavy}: ${opts['--weight']}`);

  const blk = entryAt(opts['--name']);
  if (!blk) die(`无此条目: ${opts['--name']}`);
  const plan = [];
  for (const [k, v] of sets) {
    const idx = lines.findIndex((l, i) => i >= blk.start && i < blk.end && new RegExp(`^ {4}${k}:`).test(l));
    if (idx >= 0) plan.push({ idx, line: `    ${k}: ${v}`, mode: 'replace' });
    else plan.push({ idx: blk.end, line: `    ${k}: ${v}`, mode: 'insert' });
  }
  if (dry) { for (const p of plan) console.log(`[dry-run] ${p.mode} :${p.idx + 1} ${p.line}`); process.exit(0); }
  for (const p of [...plan].sort((a, b) => b.idx - a.idx)) {
    if (p.mode === 'replace') lines[p.idx] = p.line; else lines.splice(p.idx, 0, p.line);
  }
  fs.writeFileSync(REG, lines.join('\n'));
  console.log(`[upsert] ${opts['--name']} 字段已写: ${sets.map(([k]) => k).join(', ')}`);

} else { // remove
  assertCommon();
  const blk = entryAt(opts['--name']);
  if (!blk) die(`无此条目: ${opts['--name']}`);
  if (dry) { console.log(`[dry-run] 将删除 ${blk.section}/${opts['--name']} 行块 ${blk.start + 1}-${blk.end}`); process.exit(0); }
  lines.splice(blk.start, blk.end - blk.start);
  fs.writeFileSync(REG, lines.join('\n'));
  console.log(`[upsert] ${blk.section}/${opts['--name']} 已移除（git 可回溯）`);
}
