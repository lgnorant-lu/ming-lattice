import assert from 'node:assert/strict';
import { createCycloneDxFromLockfile, mergeCycloneDxReports } from '../../scripts/generate-supply-chain-sbom.mjs';

export function run() {
  console.log('[TEST CONTRACT] offline CycloneDX SBOM aggregation...');
  const input = [
    {
      source: 'vertical/one/package-lock.json',
      report: {
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        components: [{ 'bom-ref': 'alpha@1.0.0', name: 'alpha', version: '1.0.0' }],
        dependencies: [{ ref: 'alpha@1.0.0', dependsOn: ['beta@2.0.0'] }]
      }
    },
    {
      source: 'vertical/two/package-lock.json',
      report: {
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        components: [{ 'bom-ref': 'alpha@1.0.0', name: 'alpha', version: '1.0.0' }, { 'bom-ref': 'beta@2.0.0', name: 'beta', version: '2.0.0' }],
        dependencies: [{ ref: 'alpha@1.0.0', dependsOn: ['gamma@3.0.0'] }]
      }
    }
  ];
  const report = mergeCycloneDxReports(input, { generatedAt: '2026-09-06T00:00:00.000Z' });
  const again = mergeCycloneDxReports(input, { generatedAt: '2026-09-06T00:00:00.000Z' });
  assert.equal(report.bomFormat, 'CycloneDX');
  assert.equal(report.specVersion, '1.5');
  assert.equal(report.components.length, 2);
  assert.deepEqual(report.dependencies.find(item => item.ref === 'alpha@1.0.0').dependsOn, ['beta@2.0.0', 'gamma@3.0.0']);
  assert.equal(report.serialNumber, again.serialNumber);
  const alpha = report.components.find(item => item['bom-ref'] === 'alpha@1.0.0');
  assert.deepEqual(alpha.properties.filter(item => item.name === 'ming.source_lockfile').map(item => item.value), [
    'vertical/one/package-lock.json',
    'vertical/two/package-lock.json'
  ]);
  const fallback = createCycloneDxFromLockfile({
    lockfileVersion: 3,
    packages: {
      '': { devDependencies: { fixture: '^1.0.0' } },
      'node_modules/fixture': { version: '1.2.3', integrity: 'sha512-aW50ZWdyaXR5', dev: true },
      'node_modules/runtime': { version: '2.0.0', integrity: 'sha512-cnVudGltZQ==', dependencies: { nested: '^1.0.0' } },
      'node_modules/nested': { version: '1.1.0', integrity: 'sha512-bmVzdGVk' }
    }
  });
  assert.deepEqual(fallback.components.map(item => item['bom-ref']), ['nested@1.1.0', 'runtime@2.0.0']);
  assert.deepEqual(fallback.dependencies.find(item => item.ref === 'runtime@2.0.0').dependsOn, ['nested@1.1.0']);
  console.log('  -> deterministic dedupe, dependency union and source provenance passed');
}

if (process.argv[1]?.endsWith('test-sbom-generation.mjs')) run();
