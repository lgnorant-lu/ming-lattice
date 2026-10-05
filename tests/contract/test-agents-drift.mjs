// tests/contract/test-agents-drift.mjs
// AGENTS.md 文档命令 ↔ 脚本旗标词表 漂移对账
// 判据: 工作流行内写的每个 scripts/<file> 必须存在；文档里出现的旗标必须在
//       该脚本词表内（mjs 全文 --flag 字面量 / ps1 param 名+Alias / sh 同 mjs 形态）
// 方向: 只查"文档→代码"失聪（文档写死旗标脚本不认）；文档漏写新旗标不算错
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '../..');
const agents = fs.readFileSync(path.join(REPO, 'AGENTS.md'), 'utf8');

const PWSH_HOST = new Set(['noprofile', 'file', 'command', 'executionpolicy', 'd', 's', 'c']);

// 脚本旗标词表抽取
function flagVocab(scriptRel) {
  const src = fs.readFileSync(path.join(REPO, scriptRel), 'utf8');
  if (scriptRel.endsWith('.ps1')) {
    const vocab = new Set();
    const pm = src.match(/param\s*\(([\s\S]*?)\)\s*\r?\n/);
    if (pm) {
      for (const m of pm[1].matchAll(/\$(\w+)/g)) vocab.add(m[1].toLowerCase());
      for (const m of pm[1].matchAll(/Alias\s*\(\s*'([^']+)'\s*\)/g)) vocab.add(m[1].toLowerCase());
    }
    // SupportsShouldProcess 时 -WhatIf/-Confirm 是 pwsh 内建，不在 param 里
    if (/SupportsShouldProcess/.test(src)) { vocab.add('whatif'); vocab.add('confirm'); }
    return vocab;
  }
  if (scriptRel.endsWith('.sh')) {
    // sh 词表=双横杠 + 单字母旗标（-t <repo> 形态）
    return new Set([
      ...[...src.matchAll(/--[a-z][a-z0-9-]*/g)].map(m => m[0]),
      ...[...src.matchAll(/(?<=\s)-([a-zA-Z])(?=\s|:|$|\))/g)].map(m => `-${m[1]}`),
    ]);
  }
  // mjs：全文 --flag 字面量即词表（含 usage 注释——宽出无害，方向只要 doc⊆code）
  return new Set([...src.matchAll(/--[a-z][a-z0-9-]*/g)].map(m => m[0]));
}

// 文档行 → 逐反引号命令段 → (scriptRel, [docFlags])
// 旗标归属=同段内脚本路径后的 token——跨段不串（`-t` 属 install-hooks.sh 不属同段外 ps1）
const invocations = [];
for (const line of agents.split(/\r?\n/)) {
  for (const seg of line.matchAll(/`([^`]+)`/g)) {
    const text = seg[1];
    const sm = text.match(/scripts\/([a-z0-9._-]+\.(?:mjs|ps1|sh))/i);
    if (!sm) continue;
    const scriptRel = `scripts/${sm[1]}`;
    const tail = text.slice(sm.index + sm[0].length);
    let docFlags;
    if (scriptRel.endsWith('.ps1')) {
      docFlags = [...tail.matchAll(/(?<=\s)-([A-Za-z][A-Za-z0-9]*)/g)].map(x => x[1].toLowerCase())
        .filter(f => !PWSH_HOST.has(f));
    } else if (scriptRel.endsWith('.sh')) {
      docFlags = [...tail.matchAll(/(?<=\s)-([a-zA-Z])(?=\s|$)/g)].map(x => `-${x[1]}`);
    } else {
      docFlags = [...tail.matchAll(/--[a-z][a-z0-9-]*/g)].map(x => x[0]);
    }
    // `--skip-*` 类 glob 写法不是字面旗标——剥尾横杠与星号残段
    docFlags = docFlags.filter(f => !/[-*]$/.test(f));
    invocations.push({ scriptRel, docFlags: [...new Set(docFlags)], line: text.slice(0, 120) });
  }
}
// 同行多命令串的旗标归属会串——按"旗标在任一登记脚本词表内即算过"的保守判据二次过滤
const scriptVocabs = new Map();
for (const inv of invocations) {
  if (!scriptVocabs.has(inv.scriptRel)) {
    assert.ok(fs.existsSync(path.join(REPO, inv.scriptRel)), `AGENTS 引用缺席脚本: ${inv.scriptRel}`);
    scriptVocabs.set(inv.scriptRel, flagVocab(inv.scriptRel));
  }
}
const unionVocab = new Set([...scriptVocabs.values()].flatMap(v => [...v]));

export function run() {
  console.log('[TEST CONTRACT] AGENTS.md 文档↔脚本旗标漂移...');
  const problems = [];
  for (const inv of invocations) {
    const vocab = scriptVocabs.get(inv.scriptRel);
    for (const f of inv.docFlags) {
      if (!unionVocab.has(f)) {
        problems.push(`文档旗标不在任何引用脚本词表: ${f}  ← ${inv.line}`);
      } else if (!vocab.has(f)) {
        // 归属歧义：行内另一脚本认它——不算漂移（如 `--target` 文档段同引两脚本）
        problems.push(`旗标 ${f} 不在 ${inv.scriptRel} 词表（疑归属错行） ← ${inv.line}`);
      }
    }
  }
  for (const p of problems) console.log(`  [FAIL] ${p}`);
  assert.equal(problems.length, 0, `${problems.length} 项文档↔脚本漂移`);
  console.log(`  -> ${invocations.length} 处文档命令对账通过（${scriptVocabs.size} 脚本词表）`);
}

if (process.argv[1]?.endsWith('test-agents-drift.mjs')) run();
