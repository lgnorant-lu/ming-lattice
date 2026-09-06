import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas/sca-report.schema.json'), 'utf8'));

export function run() {
  console.log('[TEST CONTRACT] offline SCA report artifact...');
  const reportPath = path.join(root, 'artifacts/sca.npm.json');
  assert.equal(fs.existsSync(reportPath), true, 'SCA artifact must be generated before strict tests');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  for (const field of schema.required) assert.ok(Object.hasOwn(report, field), `missing ${field}`);
  assert.equal(report.schema_version, '1.0');
  assert.equal(report.scanner, 'npm audit');
  assert.equal(report.mode, 'offline');
  assert.equal(report.network, 'not_used');
  assert.equal(report.status, 'complete');
  assert.equal(report.findings_status, 'none');
  assert.equal(report.lockfiles_total, report.lockfiles_scanned);
  assert.equal(report.lockfiles_failed, 0);
  assert.equal(report.findings.length, 0);
  assert.equal(report.summary.high, 0);
  assert.equal(report.summary.critical, 0);
  console.log(`  -> ${report.lockfiles_scanned} lockfiles scanned, no cached advisory findings`);
}

if (process.argv[1]?.endsWith('test-sca-generation.mjs')) run();
