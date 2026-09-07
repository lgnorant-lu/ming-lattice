import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');

export function run() {
  console.log('[TEST CONTRACT] lint contract modes (text, json, observability)...');
  const temp = fs.mkdtempSync(path.join(process.env.SKILLS_TEST_TMPDIR || os.tmpdir(), 'ming-lint-contract-'));
  try {
    // 1. JSON mode test on real repo
    const jsonRun = spawnSync('pwsh', ['-NoProfile', '-File', path.join(root, 'scripts/lint.ps1'), '-Json'], {
      cwd: root, encoding: 'utf8', timeout: 30000
    });
    assert.equal(jsonRun.status, 0, `lint -Json failed: ${jsonRun.stderr}`);
    const issues = JSON.parse(jsonRun.stdout.trim());
    assert.ok(Array.isArray(issues), 'lint -Json output must be a valid array');
    const jsonErrors = issues.filter(i => i.level === 'E').length;

    // 2. Text/JSON parity and event contract use the synthetic fixture below;
    // the real repository is scanned once to keep the contract suite bounded.
    const eventFile = path.join(temp, 'lint-events.ndjson');
    // 3. Synthetic oracle fixture tests (valid vs invalid skills)
    const fixtureDir = path.join(temp, 'fixture-repo');
    const fixturePrivate = path.join(fixtureDir, 'private');
    fs.mkdirSync(path.join(fixturePrivate, 'valid-skill', 'references'), { recursive: true });
    fs.writeFileSync(path.join(fixturePrivate, 'valid-skill', 'references', 'guide.md'), '# Guide\n');
    fs.writeFileSync(path.join(fixturePrivate, 'valid-skill', 'SKILL.md'),
      '---\nname: valid-skill\ndescription: A perfectly valid synthetic skill with more than twenty characters.\n---\n[Guide](references/guide.md)\n');

    fs.mkdirSync(path.join(fixturePrivate, 'broken-skill'), { recursive: true });
    fs.writeFileSync(path.join(fixturePrivate, 'broken-skill', 'SKILL.md'),
      '---\nname: broken-skill\ndescription: Too short\n---\n[missing](references/missing.md)\n');

    const fixtureRegistry = path.join(fixtureDir, 'registry.yaml');
    fs.writeFileSync(fixtureRegistry, `version: 1
targets:
  test_client: ${JSON.stringify(path.join(fixtureDir, 'targets'))}
base: []
vertical: []
deployable: []
private:
  - name: valid-skill
    path: private/valid-skill
    enabled: true
    deploy:
      test_client: true
  - name: broken-skill
    path: private/broken-skill
    enabled: true
    deploy:
      test_client: true
`);

    const fixtureJsonRun = spawnSync('pwsh', [
      '-NoProfile',
      '-File', path.join(root, 'scripts/lint.ps1'),
      '-RegistryPath', fixtureRegistry,
      '-RepoRoot', fixtureDir,
      '-Json'
    ], { cwd: root, encoding: 'utf8', timeout: 30000 });
    assert.equal(fixtureJsonRun.status, 0, `fixture JSON run failed: ${fixtureJsonRun.stderr}`);
    const fixtureIssues = JSON.parse(fixtureJsonRun.stdout.trim());
    assert.equal(fixtureIssues.length, 3, 'synthetic fixture must produce exactly 3 issues');
    assert.equal(fixtureIssues.filter(i => i.level === 'E').length, 0, 'synthetic fixture must produce 0 errors');
    assert.equal(fixtureIssues.filter(i => i.level === 'W').length, 2, 'synthetic fixture must produce exactly 2 warnings');
    assert.equal(fixtureIssues.filter(i => i.level === 'I').length, 1, 'synthetic fixture must produce exactly 1 info');
    assert.ok(fixtureIssues.some(i => i.name === 'broken-skill' && i.msg.includes('description 过短')), 'must detect short description');
    assert.ok(fixtureIssues.some(i => i.name === 'broken-skill' && i.msg.includes('引用的文件不存在')), 'must detect missing reference');
    assert.ok(fixtureIssues.some(i => i.name === 'broken-skill' && i.msg.includes('单文件 skill')), 'must detect single-file skill info');
    assert.ok(!fixtureIssues.some(i => i.name === 'valid-skill'), 'valid skill must produce no issues at all');

    const fixtureTextRun = spawnSync('pwsh', ['-NoProfile', '-File', path.join(root, 'scripts/lint.ps1'), '-RegistryPath', fixtureRegistry, '-RepoRoot', fixtureDir], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, MING_SKILLS_EVENT_FILE: eventFile, MING_SKILLS_WORK_UNIT_ID: 'lint-contract-1' }
    });
    assert.equal(fixtureTextRun.status, 0, `fixture text run failed: ${fixtureTextRun.stderr}`);
    const textSummaryMatch = fixtureTextRun.stdout.match(/ERROR=(\d+)\s+WARN=(\d+)\s+INFO=(\d+)/);
    assert.ok(textSummaryMatch, 'text output must contain summary line with ERROR/WARN/INFO');
    const textErrors = Number(textSummaryMatch[1]);
    const textWarns = Number(textSummaryMatch[2]);
    const textInfos = Number(textSummaryMatch[3]);
    assert.equal(textErrors, fixtureIssues.filter(i => i.level === 'E').length);
    assert.equal(textWarns, fixtureIssues.filter(i => i.level === 'W').length);
    assert.equal(textInfos, fixtureIssues.filter(i => i.level === 'I').length);

    assert.ok(fs.existsSync(eventFile), 'lint.checked event must be recorded in event file');
    const event = JSON.parse(fs.readFileSync(eventFile, 'utf8').trim());
    assert.equal(event.event, 'lint.checked');
    assert.equal(event.ok, textErrors === 0);
    assert.equal(typeof event.duration_ms, 'number');
    assert.equal(event.sources_checked, 2);
    assert.equal(event.error_count, textErrors);
    assert.equal(event.warn_count, textWarns);
    assert.equal(event.info_count, textInfos);

    console.log(`  -> text, JSON and event modes verified (${jsonErrors} real-repo errors, synthetic fixtures passed)`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith('test-lint-contract.mjs')) run();
