#!/usr/bin/env node
// docclass（内置目录件, outputs=findings, phases=[staged,ci,manual]）：
// docClass 头判定——`lib/docclass.mjs` 内核的 driving port 消费面。
//   遍历域 = facts 的 file facts（继承 extract 的 walk/gitignore 语义；
//   staged 相位只见暂存单元集，增量语义天然正确——classify 是纯路径
//   判定，与文件是否被内容扫描无关，故 gitignored 治理文档在本机照常
//   判定、CI 无该文件集则真空通过，与"distill gitignored 是设计特性"
//   同构）。
//   流程：classify() 纯路径先筛 → 命中类才读文件 → scanDocs 聚合判定。
//   未治理路径零读取开销；读文件失败=error finding（非静默跳过）。
// config.spec=<docclass.yaml 仓根相对路径> 必填，须解析在仓根内——
// spec 装载 fail-closed（未知键/非法形状/schemaVersion≠1 即 die→
// runner 记 docclass:crash error，门禁不白放）。
// 产出：findings JSONL——issue.level E→error / W→warn，
//   rule=docclass:<内核rule>[:<field>]（field 并入 rule 保 finding 稳定键）。
// argv: --facts F --root R --config JSON [--apply]
import fs from 'node:fs';
import path from 'node:path';
import { parseJsonl } from '../lib/facts.mjs';
import { loadSpecText, classify, scanDocs } from '../lib/docclass.mjs';

const argv = process.argv;
const take = (k) => argv[argv.indexOf(k) + 1];
const root = path.resolve(take('--root'));
const cfg = JSON.parse(take('--config') || '{}');
const die = (m) => { console.error(`[docclass] ${m}`); process.exit(2); };
if (!cfg.spec) die('需要 config.spec=<docclass.yaml 仓根相对路径>');
const specPath = path.resolve(root, cfg.spec);
if (!(specPath === root || specPath.startsWith(root + path.sep)))
  die(`spec 越出仓根: ${cfg.spec}`);
if (!fs.existsSync(specPath)) die(`spec 不存在: ${cfg.spec}`);
const { spec, errors: specErrs } = loadSpecText(
  fs.readFileSync(specPath, 'utf8'), cfg.spec);
if (!spec) die(`spec 装载失败: ${specErrs.join(' | ').slice(0, 400)}`);

// 遍历域=facts file facts（去重——同一 rel 可能多事实行）
const rels = new Set();
for (const f of parseJsonl(fs.readFileSync(take('--facts'), 'utf8')))
  if (f.kind === 'file') rels.add(f.file);

// classify 先筛——命中类才读件（未治理路径零 IO）
const docs = [], out = [];
for (const rel of [...rels].sort()) {
  if (!classify(rel, spec)) continue;
  let text;
  try { text = fs.readFileSync(path.resolve(root, rel), 'utf8'); }
  catch (e) {
    out.push({ rule: 'docclass:read', severity: 'error', unit: rel,
      file: rel, expect: '可读 utf8', observed: e.message.slice(0, 200) });
    continue;
  }
  docs.push({ rel, text });
}

// scanDocs results 与 docs 同序——zip 回 rel（结果对象不带 rel 键）
const { results, counts } = scanDocs(docs, spec);
for (const [j, r] of results.entries())
  for (const i of r.issues)
    out.push({
      rule: `docclass:${i.rule}${i.field ? ':' + i.field : ''}`,
      severity: i.level === 'E' ? 'error' : 'warn',
      unit: docs[j].rel, file: docs[j].rel, fix: i.msg });
for (const l of out) console.log(JSON.stringify(l));
console.error(`[docclass] spec=${cfg.spec} classified=${counts.classified}` +
  ` unclassified=${counts.unclassified} E=${counts.E} W=${counts.W}`);
