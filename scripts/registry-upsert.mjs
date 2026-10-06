#!/usr/bin/env node
// registry-upsert.mjs — registry.yaml 条目安全编辑（替代 python 手编——防"整行变注释"类事故）
// 用法:
//   add:    node scripts/registry-upsert.mjs add --section vertical|deployable|private --name <n> [--repo <url>]
//           [--pin <40hex>] [--path <p>] [--weight core|heavy] [--domain <d>] [--note "s"]
//           [--deploy c1,c2] [--metaSystem] [--sourceGone]
//   set:    node scripts/registry-upsert.mjs set --name <n> [--pin <h>] [--enabled true|false]
//           [--weight core|heavy] [--acquiredAt <date>]
//   remove: node scripts/registry-upsert.mjs remove --name <n>
//   candidate: node scripts/registry-upsert.mjs candidate --name <n> --domain <d> --rationale "s"
//              --evidence "s" [--evidence "s2"] --graduation "s" [--openedAt YYYY-MM-DD] [--path <p>]
// 契约: --dry-run 预览零落盘；名唯一(全段)/pin 40hex/weight 词表/domain 入登记/deploy 客户名⊆targets
//       全 fail-closed；行级精准改写，不动注释与其他条目。
//       candidates 候审区走专属 candidate 动词——rationale/evidence/graduation/openedAt 四字段必填。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRegistryLite } from './lib/registry-lite.mjs';

const REPO_ROOT = process.env.REG_UPSERT_ROOT
  ? path.resolve(process.env.REG_UPSERT_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REG = path.join(REPO_ROOT, 'registry.yaml');

const die = m => { console.error(`[E] ${m}`); process.exit(2); };
const args = process.argv.slice(2);
const verb = args[0];
if (!['add', 'set', 'remove', 'candidate'].includes(verb)) die('用法: add|set|remove|candidate（--help 见头注）');
const opts = { _: [] };
const VALUE = new Set(['--section', '--name', '--repo', '--pin', '--path', '--weight', '--domain', '--note', '--deploy', '--enabled', '--acquiredAt', '--rationale', '--graduation', '--evidence', '--openedAt']);
for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (VALUE.has(a)) {
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) die(`旗标 ${a} 缺值`);
    if (a === '--evidence') (opts[a] ??= []).push(v); else opts[a] = v; i++;
  } else if (['--dry-run', '--metaSystem', '--sourceGone'].includes(a)) opts[a] = true;
  else die(a.startsWith('--') ? `未知旗标: ${a}` : `不接受位置参数: ${a}`);
}
const dry = !!opts['--dry-run'];

const regText = fs.readFileSync(REG, 'utf8');
const regEol = regText.includes('\r\n') ? '\r\n' : '\n';     // 行尾保真——lite 已剥 \r\n，回写按原位
const reg0 = parseRegistryLite(regText);
const lines = reg0.lines;                                    // 改写面直接操行数组
// 段范围/条目定位/词表 → 共享 lite 解析层
const sectionRange = (sec) => reg0.sections.get(sec) ?? null;
const entryAt = (name) => {
  const e = reg0.entries.find(x => x.name === name);
  return e ? { start: e.lineStart, end: e.lineEnd, section: e.section } : null;
};
const allNames = () => reg0.entries.map(e => e.name);
// 段尾插位：回退过空行与顶格注释横幅——横幅属于下一段门面，插在其后=
// 条目跨横幅悬进下一段视觉区（独立行级解析器按顶格行切段时会漏读）
const insertAt = (sec) => {
  const [s, e] = sectionRange(sec) ?? die(`registry 无 ${sec}: 段`);
  let ins = e;
  while (ins > s && (!lines[ins - 1].trim() || lines[ins - 1].startsWith('#'))) ins--;
  return ins;
};
const targetsKeys = () => new Set(reg0.targets.keys());
const domainVocab = () => {
  const l = reg0.lists.get('domains');
  return l?.length ? new Set(l) : null;
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
  // candidates 候审区条目有专属 schema（rationale/evidence/graduation/openedAt）——
  // 通用模板会产畸形件，暂不放行；候审登记用 fixture 级手工或未来专用动词
  if (!['vertical', 'deployable', 'private'].includes(sec)) die('--section 须 vertical|deployable|private（candidates 候审区 schema 不同，暂不放行）');
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

  const ins = insertAt(sec);
  if (dry) { console.log(`[dry-run] 将于 registry.yaml:${ins + 1}(${sec}: 段尾) 插入:\n${ent.join('\n')}`); process.exit(0); }
  lines.splice(ins, 0, ...ent);
  fs.writeFileSync(REG, lines.join(regEol));
  console.log(`[upsert] ${sec}/${opts['--name']} 已登记（: ${ins + 1} 行位）`);

} else if (verb === 'candidate') {
  // 候审区专属 schema——rationale/evidence/graduation/openedAt 全必填 fail-closed
  assertCommon();
  if (allNames().includes(opts['--name'])) die(`重名: ${opts['--name']}（registry 全段唯一）`);
  for (const f of ['--rationale', '--graduation']) if (!opts[f]) die(`候审条目缺必填 ${f}`);
  const evidence = opts['--evidence'] ?? [];
  if (!evidence.length) die('候审条目缺必填 --evidence（至少一条，可重复旗标）');
  const dv = domainVocab();
  if (!opts['--domain']) die('候审条目缺必填 --domain');
  if (dv && !dv.has(opts['--domain'])) die(`domain=${opts['--domain']} 不在 domains: 词表`);
  const openedAt = opts['--openedAt'] || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(openedAt)) die(`openedAt 非 YYYY-MM-DD: ${openedAt}`);
  const candPath = opts['--path'] || `private/${opts['--domain']}/${opts['--name']}`;
  if (/^(?:[a-zA-Z]:[\\/]|[\\/])|\.\./.test(candPath)) die(`path 非法（禁绝对路径/盘符/.. 穿越）: ${candPath}`);
  const q = s => `"${String(s).replace(/"/g, '\\"')}"`;
  const ent = [
    `  - name: ${opts['--name']}`,
    `    domain: ${opts['--domain']}`,
    `    path: ${candPath}`,
    `    rationale: ${q(opts['--rationale'])}`,
    `    evidence:`,
    ...evidence.map(ev => `      - ${q(ev)}`),
    `    graduation: ${q(opts['--graduation'])}`,
    `    openedAt: ${openedAt}`,
  ];
  const ins0 = insertAt('candidates');
  if (dry) { console.log(`[dry-run] 将于 registry.yaml:${ins0 + 1}(candidates: 段尾) 插入:\n${ent.join('\n')}`); process.exit(0); }
  lines.splice(ins0, 0, ...ent);
  fs.writeFileSync(REG, lines.join(regEol));
  console.log(`[upsert] candidates/${opts['--name']} 候审登记（: ${ins0 + 1} 行位，graduation 触发时再晋升）`);

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
  fs.writeFileSync(REG, lines.join(regEol));
  console.log(`[upsert] ${opts['--name']} 字段已写: ${sets.map(([k]) => k).join(', ')}`);

} else { // remove
  assertCommon();
  const blk = entryAt(opts['--name']);
  if (!blk) die(`无此条目: ${opts['--name']}`);
  if (dry) { console.log(`[dry-run] 将删除 ${blk.section}/${opts['--name']} 行块 ${blk.start + 1}-${blk.end}`); process.exit(0); }
  lines.splice(blk.start, blk.end - blk.start);
  fs.writeFileSync(REG, lines.join(regEol));
  console.log(`[upsert] ${blk.section}/${opts['--name']} 已移除（git 可回溯）`);
}
