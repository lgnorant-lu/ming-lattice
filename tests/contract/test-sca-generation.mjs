import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateSupplyChainScaAsync, isScaReportFresh } from '../../scripts/generate-supply-chain-sca.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas/sca-report.schema.json'), 'utf8'));

export async function run() {
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

  assert.equal(isScaReportFresh(report, report), true, 'identical sca report must be fresh');
  const tampered = structuredClone(report);
  tampered.summary.high = 1;
  assert.equal(isScaReportFresh(report, tampered), false, 'severity change must be detected as stale');
  const tamperedFindings = structuredClone(report);
  tamperedFindings.findings = [{ source: 'vertical/fake', name: 'evil', severity: 'critical' }];
  assert.equal(isScaReportFresh(report, tamperedFindings), false, 'finding injection must be detected as stale');
  console.log('  -> sca freshness deep equality and tampering detection verified');

  const asyncReport = await generateSupplyChainScaAsync({ registry: { private: [] }, repoRoot: root, concurrency: 2, useCache: false });
  assert.equal(asyncReport.lockfiles_total, 0);
  assert.equal(asyncReport.lockfiles_scanned, 0);
  assert.equal(asyncReport.lockfiles_failed, 0);
  assert.deepEqual(asyncReport.findings, []);
  console.log('  -> bounded async SCA generation preserves empty-report contract');
}

if (process.argv[1]?.endsWith('test-sca-generation.mjs')) run();
