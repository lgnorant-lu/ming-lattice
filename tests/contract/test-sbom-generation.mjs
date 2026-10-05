import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createCycloneDxFromLockfile, mergeCycloneDxReports, isCycloneDxFresh, generateSupplyChainSbom, loadRegistry } from '../../scripts/generate-supply-chain-sbom.mjs';

export async function run() {
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

  // 嵌套同 ref（node_modules/a/node_modules/dep@1 与根 dep@1）：
  // bom-ref 须文档内唯一归并，integrity 取首个有哈希副本不得跨副本错挂
  const dupRef = createCycloneDxFromLockfile({
    lockfileVersion: 3,
    packages: {
      'node_modules/a': { version: '1.0.0' },
      'node_modules/dep': { version: '1.0.0' },
      'node_modules/a/node_modules/dep': { version: '1.0.0', integrity: 'sha512-nestedCopy==' }
    }
  });
  const dupComponents = dupRef.components.filter(item => item['bom-ref'] === 'dep@1.0.0');
  assert.equal(dupComponents.length, 1, 'duplicate name@version must merge into a single bom-ref');
  assert.deepEqual(dupComponents[0].hashes, [{ alg: 'SHA512', content: 'nestedCopy==' }],
    'integrity must come from the copy that actually has one');

  // lockfileVersion 1（npm v6）无 packages 键——按 v2+ 解析会产"成功地空"SBOM，
  // 须显式拒绝而非静默欠账
  assert.throws(
    () => createCycloneDxFromLockfile({ lockfileVersion: 1, dependencies: { a: {} } }),
    /lockfile_v1_unsupported/);
  console.log('  -> deterministic dedupe, dependency union and source provenance passed');

  const artifactPath = path.resolve(import.meta.dirname, '../../artifacts/sbom.cdx.json');
  assert.ok(fs.existsSync(artifactPath), 'artifacts/sbom.cdx.json must exist');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  assert.equal(artifact.bomFormat, 'CycloneDX');
  assert.equal(artifact.specVersion, '1.5');
  assert.ok(Array.isArray(artifact.components) && artifact.components.length > 0);
  console.log(`  -> artifacts/sbom.cdx.json schema and component count verified (${artifact.components.length} components)`);

  const tampered = structuredClone(artifact);
  tampered.components[0].version = '999.999.999';
  assert.equal(isCycloneDxFresh(artifact, artifact), true, 'identical sbom must be fresh');
  assert.equal(isCycloneDxFresh(artifact, tampered), false, 'tampered version must be detected as stale');
  const timestampChanged = structuredClone(artifact);
  timestampChanged.metadata = timestampChanged.metadata || {};
  timestampChanged.metadata.timestamp = '2099-01-01T00:00:00.000Z';
  assert.equal(isCycloneDxFresh(artifact, timestampChanged), true, 'timestamp update alone must not invalidate freshness');
  console.log('  -> sbom freshness deep equality and tampering detection verified');

  // 提交件=再生件全比对（metadata.component.name 等全字段——生成器改动后不重跑会留旧名漂移）
  const REPO = path.resolve(import.meta.dirname, '../..');
  const fresh = generateSupplyChainSbom({
    registry: loadRegistry(REPO), repoRoot: REPO,
    generatedAt: artifact.metadata?.timestamp || '2026-01-01T00:00:00.000Z',
    allowFailures: false
  });
  assert.equal(isCycloneDxFresh(artifact, fresh.report), true,
    'committed sbom stale vs generator output —— 重跑: node scripts/generate-supply-chain-sbom.mjs --output artifacts/sbom.cdx.json');
  console.log('  -> committed sbom = regenerated output (metadata 全字段 freshness 在闸)');
}

if (process.argv[1]?.endsWith('test-sbom-generation.mjs')) run();
