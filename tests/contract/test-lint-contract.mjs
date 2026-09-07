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
    const jsonWarns = issues.filter(i => i.level === 'W').length;
    const jsonInfos = issues.filter(i => i.level === 'I').length;

    // 2. Text mode test on real repo with event capture
    const eventFile = path.join(temp, 'lint-events.ndjson');
    const textRun = spawnSync('pwsh', ['-NoProfile', '-File', path.join(root, 'scripts/lint.ps1')], {
      cwd: root, encoding: 'utf8', timeout: 30000,
      env: { ...process.env, MING_SKILLS_EVENT_FILE: eventFile, MING_SKILLS_WORK_UNIT_ID: 'lint-contract-1' }
    });
    assert.equal(textRun.status, 0, `lint text mode failed: ${textRun.stderr}`);
    const textSummaryMatch = textRun.stdout.match(/ERROR=(\d+)\s+WARN=(\d+)\s+INFO=(\d+)/);
    assert.ok(textSummaryMatch, 'text output must contain summary line with ERROR/WARN/INFO');
    const textErrors = Number(textSummaryMatch[1]);
    const textWarns = Number(textSummaryMatch[2]);
    const textInfos = Number(textSummaryMatch[3]);

    // Cross-mode consistency assertions
    assert.equal(textErrors, jsonErrors, 'text ERROR count must match json E count');
    assert.equal(textWarns, jsonWarns, 'text WARN count must match json W count');
    assert.equal(textInfos, jsonInfos, 'text INFO count must match json I count');

    // 3. Observability event contract
    assert.ok(fs.existsSync(eventFile), 'lint.checked event must be recorded in event file');
    const event = JSON.parse(fs.readFileSync(eventFile, 'utf8').trim());
    assert.equal(event.event, 'lint.checked');
    assert.equal(event.ok, textErrors === 0);
    assert.equal(typeof event.duration_ms, 'number');
    assert.equal(event.sources_checked, 157, 'sources_checked must equal 157');
    assert.equal(event.error_count, textErrors);
    assert.equal(event.warn_count, textWarns);
    assert.equal(event.info_count, textInfos);

    console.log(`  -> text, JSON and event modes verified (${event.sources_checked} sources, counts aligned)`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith('test-lint-contract.mjs')) run();
