// tests/contract/test-registry-parity.test.mjs
// 双解析器 parity 契约：pwsh 正典（lib/registry.ps1 经 read-registry.ps1 JSON 桥）
// vs mjs lite 正则视图——同一 registry.yaml 两个独立读法必须产出同一条目集。
// 顺带执行正典全部结构校验：read-registry.ps1 非零退出即抛（deploy 外键/路径/
// 重名/enabled 类型/schemaVersion 等不变量当场显影——提交路径上此前无执行点）。
// SPINE 终止式 B：互证 SoT 对——两侧都可能错，差集即漂移显影。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '../..');
const REGISTRY = path.join(REPO, 'registry.yaml');
const BRIDGE = path.join(REPO, 'scripts', 'read-registry.ps1');
const SECTIONS = ['base', 'vertical', 'deployable', 'private', 'candidates'];

// 正典视图：pwsh ConvertFrom-YamlLite + Read-SkillRegistry 全量结构校验后 JSON 化
function canonicalView() {
  const out = execFileSync('pwsh', ['-NoProfile', '-File', BRIDGE, '-RegistryPath', REGISTRY],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const reg = JSON.parse(out);
  const view = {};
  for (const sec of SECTIONS) {
    view[sec] = new Set((reg[sec] || []).map(e => [e.name ?? null, e.path ?? null, e.domain ?? null].join('|')));
  }
  return view;
}

// lite 视图：与 check-skill 同族的极简正则解析（独立实现互证，不复用其代码）
function liteView() {
  const text = fs.readFileSync(REGISTRY, 'utf8');
  const view = {};
  const unq = v => v == null ? null : v.replace(/^["']|["']$/g, '');
  for (const sec of SECTIONS) {
    const m = text.match(new RegExp(`^${sec}:\\s*$`, 'm'));
    view[sec] = new Set();
    if (!m) continue;
    const rest = text.slice(m.index + m[0].length);
    const nextTop = rest.search(/^\S/m);
    const block = nextTop < 0 ? rest : rest.slice(0, nextTop);
    for (const e of block.matchAll(/-\s*name:\s*(\S+)[\s\S]*?(?=\n\s*-\s*name:|$)/g)) {
      const b = e[0];
      const pick = k => unq((b.match(new RegExp(`^\\s*${k}:\\s*(\\S+)`, 'm')) || [null, null])[1]);
      view[sec].add([unq(e[1]), pick('path'), pick('domain')].join('|'));
    }
  }
  return view;
}

export function run() {
  console.log('[TEST CONTRACT] registry 双解析器 parity（pwsh 正典 ↔ mjs lite）...');
  let canon;
  try {
    canon = canonicalView();
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log('  [SKIP] pwsh 不在 PATH——parity 跳过（正典桥须 pwsh）');
      return;
    }
    throw new Error(`正典解析失败——read-registry.ps1 非零退出=结构校验违例显影: ${e.stderr || e.message}`);
  }
  const lite = liteView();
  for (const sec of SECTIONS) {
    const onlyCanon = [...canon[sec]].filter(x => !lite[sec].has(x));
    const onlyLite = [...lite[sec]].filter(x => !canon[sec].has(x));
    assert.deepEqual(onlyCanon, [], `${sec} 区：正典视图有而 lite 无——lite 解析漏读`);
    assert.deepEqual(onlyLite, [], `${sec} 区：lite 视图有而正典无——lite 解析误读`);
  }
  console.log(`  parity 一致：${SECTIONS.map(s => `${s}=${canon[s].size}`).join(' ')}`);
}
