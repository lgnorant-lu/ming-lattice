// tests/unit/test-corpus-metrics.test.mjs
// 单元测试: private/engineering/ming-boundary/scripts/metrics.mjs + corpus.yaml schema
// 覆盖: corpus 注册表形状 / M1 门（errFixture 豁免） / M4 畸形名门 /
//       --gate 越阈 fail / MB_CORPUS_ROOT 相对路径解析 / --corpus 过滤 /
//       M5 双跑确定性 / 语料缺席跳过（非崩）
// 全 fixture 在 os.tmpdir 下临时生成——合成 .rs 语料，不触真仓。

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseYamlLite }
  from '../../private/engineering/ming-boundary/scripts/lib/yaml.mjs';

const PKG = path.resolve(import.meta.dirname, '../../private/engineering/ming-boundary');
const METRICS = path.join(PKG, 'scripts/metrics.mjs');

function mkCorpus() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-corpus-'));
  const src = path.join(root, 'tiny');
  fs.mkdirSync(path.join(src, 'test_data', 'err'), { recursive: true });
  fs.writeFileSync(path.join(src, 'lib.rs'),
    'use std::collections::HashMap;\npub fn f() {}\npub struct S { pub x: i32 }\n');
  fs.writeFileSync(path.join(src, 'mod.rs'), 'mod lib;\nuse crate::lib::f;\nfn g() { f(); }\n');
  // 故意残缺固件（errFixtureGlobs 应豁免）
  fs.writeFileSync(path.join(src, 'test_data', 'err', 'broken.rs'), 'fn broken(\n');
  const yaml = path.join(root, 'corpus.yaml');
  fs.writeFileSync(yaml,
`version: 1
langs:
  rust:
    corpora:
      - name: tiny
        path: tiny
        scale: small
        minParseRate: 1.0
        maxMalformed: 0
        errFixtureGlobs: ['test_data/']
      - name: tiny-strict
        path: tiny
        scale: small
        minParseRate: 1.0
        maxMalformed: 0
        errFixtureGlobs: []
`, 'utf8');
  return { root, yaml };
}

function metrics(env, args) {
  return spawnSync(process.execPath, [METRICS, ...args],
    { encoding: 'utf8', env: { ...process.env, ...env } });
}

export async function run() {
  // —— 真注册表 schema ——
  const reg = parseYamlLite(fs.readFileSync(path.join(PKG, 'corpus.yaml'), 'utf8'));
  assert.equal(reg.version, 1);
  for (const [lang, e] of Object.entries(reg.langs || {})) {
    assert.ok(Array.isArray(e.corpora) && e.corpora.length, `${lang}: corpora 非空`);
    for (const c of e.corpora) {
      assert.ok(c.name && c.path && c.scale, `${lang}.${c.name}: name/path/scale 必填`);
      assert.ok(Array.isArray(c.errFixtureGlobs), `${lang}.${c.name}: errFixtureGlobs 数组`);
      assert.ok(c.minParseRate == null || (c.minParseRate >= 0 && c.minParseRate <= 1), `${lang}.${c.name}: minParseRate ∈[0,1]`);
      if (c.fixtures != null) {
        assert.ok(Array.isArray(c.fixtures), `${lang}.${c.name}: fixtures 数组`);
        for (const s of c.fixtures)
          assert.ok(s.match, `${lang}.${c.name}: fixtures spec 须有 match`);
      }
    }
  }

  const { root, yaml } = mkCorpus();
  const env = { MB_CORPUS_ROOT: root };

  // —— 豁免面：errFixtureGlobs 命中 test_data/err → tiny 应达标 ——
  const r1 = metrics(env, ['--corpus-file', yaml, '--corpus', 'tiny', '--no-m2', '--gate']);
  assert.equal(r1.status, 0, r1.stderr + r1.stdout);
  assert.match(r1.stdout, /tiny \[small\]: files=3/);
  assert.match(r1.stdout, /M1=100\.00%/);           // 残缺件被豁免
  assert.match(r1.stdout, /固件豁免=1，实欠=0/);
  assert.match(r1.stdout, /M3 边产率=\d+\.\d+\/KLOC/);
  assert.match(r1.stdout, /M4 畸形名=0/);

  // —— 严面：tiny-strict 无豁免 → 同语料 M1 越阈 → gate exit 1 ——
  const r2 = metrics(env, ['--corpus-file', yaml, '--corpus', 'tiny-strict', '--no-m2', '--gate']);
  assert.equal(r2.status, 1, '无豁免时残缺件应拉低 M1 触发 gate fail');
  assert.match(r2.stdout, /\[FAIL\]/);
  assert.match(r2.stdout, /实欠=1/);

  // —— M5 确定性 ——
  const r3 = metrics(env, ['--corpus-file', yaml, '--corpus', 'tiny', '--no-m2', '--determinism']);
  assert.equal(r3.status, 0);
  assert.match(r3.stdout, /M5 确定性双跑: byte-identical/);

  // —— MB_CORPUS_ROOT 缺席 fail-closed ——
  const env2 = { ...process.env }; delete env2.MB_CORPUS_ROOT;
  const r4 = spawnSync(process.execPath, [METRICS, '--corpus-file', yaml, '--corpus', 'tiny', '--no-m2'],
    { encoding: 'utf8', env: env2 });
  assert.equal(r4.status, 2);
  assert.match(r4.stderr, /MB_CORPUS_ROOT/);

  // —— 语料目录缺席 → 跳过不崩 ——
  const yamlMiss = path.join(root, 'corpus-miss.yaml');
  fs.writeFileSync(yamlMiss,
    'version: 1\nlangs:\n  rust:\n    corpora:\n      - name: ghost\n        path: nonexistent-dir\n        scale: small\n        minParseRate: 1.0\n        maxMalformed: 0\n        errFixtureGlobs: []\n', 'utf8');
  const r5 = metrics(env, ['--corpus-file', yamlMiss, '--no-m2']);
  assert.equal(r5.status, 0, r5.stderr);
  assert.match(r5.stdout, /语料缺席.*跳过/);

  // —— --corpus 过滤：tiny-strict 不应出现在 tiny 的输出 ——
  assert.ok(!r1.stdout.includes('tiny-strict'), '--corpus 过滤生效');

  // —— M7 fixtures：断言通过 / spec 零命中=漂移 FAIL / minDecls 越阈 FAIL ——
  const yamlFix = path.join(root, 'corpus-fix.yaml');
  fs.writeFileSync(yamlFix,
`version: 1
langs:
  rust:
    corpora:
      - name: tiny-fix
        path: tiny
        scale: small
        minParseRate: 1.0
        maxMalformed: 0
        errFixtureGlobs: ['test_data/']
        fixtures:
          - match: 'lib\\.rs$'
            minImports: 1
            minDecls: 1
            maxMalformed: 0
`, 'utf8');
  const f1 = metrics(env, ['--corpus-file', yamlFix, '--no-m2', '--gate']);
  assert.equal(f1.status, 0, f1.stdout + f1.stderr);
  assert.match(f1.stdout, /M7 固件 .*1件 全断言通过/);

  const yamlFixBad = path.join(root, 'corpus-fix-bad.yaml');
  fs.writeFileSync(yamlFixBad,
`version: 1
langs:
  rust:
    corpora:
      - name: tiny-fix
        path: tiny
        scale: small
        minParseRate: 1.0
        maxMalformed: 0
        errFixtureGlobs: ['test_data/']
        fixtures:
          - match: 'no_such_fixture'
          - match: 'lib\\.rs$'
            minDecls: 99
`, 'utf8');
  const f2 = metrics(env, ['--corpus-file', yamlFixBad, '--no-m2', '--gate']);
  assert.equal(f2.status, 1, '零命中漂移 + minDecls 越阈应 gate fail');
  assert.match(f2.stdout, /no_such_fixture: 0件 \[FAIL\]/);
  assert.match(f2.stdout, /FAIL .*lib\.rs.*decls=2/);


  // —— --sync：本地仓物化/pinned/drift 三态 ——
  const srcRepo = path.join(root, 'src-repo');
  fs.mkdirSync(srcRepo, { recursive: true });
  const g = (d, args) => spawnSync('git', args, { cwd: d, encoding: 'utf8' });
  g(srcRepo, ['init', '-q']);
  fs.writeFileSync(path.join(srcRepo, 'a.rs'), 'fn a() {}\n');
  g(srcRepo, ['add', '.']);
  g(srcRepo, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'c1']);
  const rev = g(srcRepo, ['rev-parse', 'HEAD']).stdout.trim();
  assert.match(rev, /^[0-9a-f]{40}$/);
  const syncYaml = path.join(root, 'corpus-sync.yaml');
  fs.writeFileSync(syncYaml,
`version: 1
langs:
  rust:
    corpora:
      - name: local
        path: local-clone
        repo: '${srcRepo.replace(/\\/g, '/')}'
        rev: ${rev}
        scale: small
        minParseRate: 1.0
        maxMalformed: 0
        errFixtureGlobs: []
`, 'utf8');
  // 物化
  const s1 = metrics(env, ['--corpus-file', syncYaml, '--sync']);
  assert.equal(s1.status, 0, s1.stdout + s1.stderr);
  assert.match(s1.stdout, /\[ok\].*local.*materialized/);
  assert.ok(fs.existsSync(path.join(root, 'local-clone', 'a.rs')), 'clone 落盘');
  // pinned 复核
  const s2 = metrics(env, ['--corpus-file', syncYaml, '--sync']);
  assert.match(s2.stdout, /\[ok\].*local.*pinned/);
  // drift：物化仓挪 HEAD → FAIL 且不覆写
  g(path.join(root, 'local-clone'), ['checkout', '-qb', 'wip']);
  fs.writeFileSync(path.join(root, 'local-clone', 'b.rs'), 'fn b() {}\n');
  g(path.join(root, 'local-clone'), ['add', '.']);
  g(path.join(root, 'local-clone'), ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'c2']);
  const s3 = metrics(env, ['--corpus-file', syncYaml, '--sync']);
  assert.equal(s3.status, 1, 'drift 应 FAIL');
  assert.match(s3.stdout, /\[FAIL\].*drift.*≠ pin/);
  assert.ok(fs.existsSync(path.join(root, 'local-clone', 'b.rs')), 'drift 不覆写既有 checkout');
  // 无 repo 条目跳过（不崩）
  const s4 = metrics(env, ['--corpus-file', yaml, '--sync']);
  assert.equal(s4.status, 0);

  console.log('    corpus-metrics: 注册表 schema / M1 豁免门 / M4 门 / M5 双跑 / fail-closed / 缺席跳过 全绿');
}
