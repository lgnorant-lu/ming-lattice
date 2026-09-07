import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkSupplyChain, supplyChainExitCode } from '../../scripts/check-supply-chain.mjs';

const schema = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../docs/schemas/supply-chain-report.schema.json'), 'utf8'));

function writeSkill(root, relative, name) {
  const directory = path.join(root, relative);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: Supply-chain fixture skill\n---\n`, 'utf8');
}

function codes(report) {
  return new Set(report.issues.map(item => item.code));
}

export function run() {
  console.log('[TEST CONTRACT] supply-chain source and provenance gate...');
  const root = fs.mkdtempSync(path.join(process.env.SKILLS_TEST_TMPDIR || os.tmpdir(), 'ming-supply-chain-'));
  try {
    writeSkill(root, 'vertical/good-source', 'good-source');
    writeSkill(root, 'vertical/reference-dependency', 'reference-dependency');
    fs.writeFileSync(path.join(root, 'vertical/reference-dependency', 'package.json'), '{"dependencies":{"fixture":"1.0.0"}}\n', 'utf8');
    fs.mkdirSync(path.join(root, 'vertical/gone-source'), { recursive: true });
    writeSkill(root, 'deployable/good-wrapper', 'good-wrapper');
    writeSkill(root, 'private/local-skill', 'local-skill');
    writeSkill(root, 'private/no-dependencies', 'no-dependencies');
    fs.writeFileSync(path.join(root, 'vertical/good-source', 'package.json'), '{}\n', 'utf8');
    fs.writeFileSync(path.join(root, 'vertical/good-source', 'package-lock.json'), '{}\n', 'utf8');
    const good = checkSupplyChain({
      repoRoot: root,
      registry: {
        vertical: [{
          name: 'good-source', repo: 'https://github.com/example/good-source.git', path: 'vertical/good-source',
          pin: '0123456', acquiredAt: '2026-09-06', enabled: true, deploy: {}
        }, {
          name: 'gone-source', repo: 'https://github.com/example/gone-source.git', path: 'vertical/gone-source',
          pin: 'gone-2026-09-06', acquiredAt: '2026-09-06', sourceGone: true,
          note: 'source is unavailable', enabled: true, deploy: {}
        }, {
          name: 'reference-dependency', repo: 'https://github.com/example/reference-dependency.git', path: 'vertical/reference-dependency',
          pin: '0123456', acquiredAt: '2026-09-06', enabled: true, deploy: {}
        }],
        deployable: [{ name: 'good-wrapper', path: 'deployable/good-wrapper', enabled: true, deploy: { test: true } }],
        private: [{ name: 'local-skill', path: 'private/local-skill', enabled: true, deploy: { test: true } }]
      }
    });
    assert.equal(good.ok, true);
    assert.equal(good.counts.errors, 0);
    assert.equal(good.counts.warnings, 0);
    for (const field of schema.required) assert.ok(Object.hasOwn(good, field), `missing report field ${field}`);
    assert.equal(good.schema_version, schema.properties.schema_version.const);
    assert.equal(good.network, schema.properties.network.const);
    assert.equal(supplyChainExitCode(good), 0);
    assert.equal(supplyChainExitCode(good, { strict: true }), 0);
    assert.ok(good.issues.some(item => item.code === 'reference_dependency_lockfile_missing'));

    fs.writeFileSync(path.join(root, 'private/no-dependencies', 'package.json'), '{"type":"module"}\n', 'utf8');
    const noDependencyReport = checkSupplyChain({
      repoRoot: root,
      registry: { private: [{ name: 'no-dependencies', path: 'private/no-dependencies', enabled: true, deploy: {} }] }
    });
    assert.equal(noDependencyReport.issues.some(item => item.code === 'dependency_lockfile_missing'), false);

    const bad = checkSupplyChain({
      repoRoot: root,
      registry: {
        vertical: [{
          name: 'bad-source', repo: 'http://user:secret@example.invalid/repo', path: '../escape',
          pin: 'main', acquiredAt: 'today', enabled: true, deploy: {}
        }, {
          name: 'bad-gone', repo: 'https://github.com/example/bad-gone.git', path: 'vertical/missing',
          pin: 'gone-2026-09-06', acquiredAt: '2026-09-06', sourceGone: true, enabled: true, deploy: {}
        }, {
          name: 'deployed-dependency', repo: 'https://github.com/example/deployed-dependency.git', path: 'vertical/reference-dependency',
          pin: '0123456', acquiredAt: '2026-09-06', enabled: true, deploy: { test: true }
        }],
        deployable: [{ name: 'missing-wrapper', path: 'deployable/missing-wrapper', enabled: true, deploy: { test: true } }],
        private: []
      }
    });
    const badCodes = codes(bad);
    for (const code of ['source_repo_invalid', 'source_path_invalid', 'source_pin_is_mutable_tag', 'source_acquired_at_invalid', 'source_gone_provenance_incomplete', 'local_path_missing', 'sbom_not_configured', 'sca_not_configured']) {
      assert.ok(badCodes.has(code), code);
    }
    assert.ok(badCodes.has('dependency_lockfile_missing'));
    assert.ok(bad.counts.errors > 0);
    assert.equal(supplyChainExitCode(bad), 1);
    assert.equal(supplyChainExitCode({ counts: { errors: 0, warnings: 1, info: 0 } }, { strict: true }), 1);
    assert.equal(checkSupplyChain({ repoRoot: root, registry: { private: [{ name: 'local-skill', path: 'private/local-skill', enabled: true, deploy: {} }] } }).ok, true);

    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'artifacts', 'sca.npm.json'), JSON.stringify({
      schema_version: '1.0', scanner: 'npm audit', mode: 'offline', network: 'not_used',
      status: 'complete', findings_status: 'none', lockfiles_total: 1, lockfiles_scanned: 1, lockfiles_failed: 0,
      summary: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }, findings: [], failures: []
    }), 'utf8');
    const cleanSca = checkSupplyChain({ repoRoot: root, registry: { private: [] } });
    assert.ok(cleanSca.issues.some(item => item.code === 'sca_report_present'));
    assert.equal(supplyChainExitCode(cleanSca, { strict: true }), 0);

    fs.writeFileSync(path.join(root, 'artifacts', 'sca.npm.json'), JSON.stringify({
      schema_version: '1.0', scanner: 'npm audit', mode: 'offline', network: 'not_used',
      status: 'partial', findings_status: 'none', lockfiles_total: 1, lockfiles_scanned: 0, lockfiles_failed: 1,
      summary: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }, findings: [], failures: []
    }), 'utf8');
    const partialSca = checkSupplyChain({ repoRoot: root, registry: { private: [] } });
    assert.ok(partialSca.issues.some(item => item.code === 'sca_partial'));
    assert.equal(supplyChainExitCode(partialSca, { strict: true }), 1);

    fs.writeFileSync(path.join(root, 'artifacts', 'sca.npm.json'), JSON.stringify({ status: 'complete' }), 'utf8');
    const invalidSca = checkSupplyChain({ repoRoot: root, registry: { private: [] } });
    assert.ok(invalidSca.issues.some(item => item.code === 'sca_schema_invalid'));
    assert.equal(supplyChainExitCode(invalidSca), 1);

    // Negative tests for bogus status, non-integer count, empty summary
    fs.writeFileSync(path.join(root, 'artifacts', 'sca.npm.json'), JSON.stringify({
      schema_version: '1.0', scanner: 'npm audit', mode: 'offline', network: 'not_used',
      status: 'bogus', findings_status: 'none', lockfiles_total: 'x', lockfiles_scanned: 1, lockfiles_failed: 0,
      summary: {}, findings: [], failures: []
    }), 'utf8');
    const bogusSca = checkSupplyChain({ repoRoot: root, registry: { private: [] } });
    assert.ok(bogusSca.issues.some(item => item.code === 'sca_schema_invalid'));
    assert.equal(supplyChainExitCode(bogusSca), 1);

    // Non-JSON unverified test
    fs.rmSync(path.join(root, 'artifacts', 'sca.npm.json'));
    fs.writeFileSync(path.join(root, 'artifacts', 'sca-results.sarif'), '<sarif></sarif>', 'utf8');
    const unverifiedSca = checkSupplyChain({ repoRoot: root, registry: { private: [] } });
    assert.ok(unverifiedSca.issues.some(item => item.code === 'sca_format_unverified'));
    fs.rmSync(path.join(root, 'artifacts', 'sca-results.sarif'));

    fs.writeFileSync(path.join(root, 'artifacts', 'sbom.cdx.json'), JSON.stringify({
      bomFormat: 'CycloneDX', specVersion: '1.5', components: [{ 'bom-ref': 'a@1.0.0', name: 'a', version: '1.0.0' }],
      metadata: { properties: [{ name: 'ming.completeness', value: 'partial' }] }
    }), 'utf8');
    const partialSbom = checkSupplyChain({ repoRoot: root, registry: { private: [] } });
    assert.ok(partialSbom.issues.some(item => item.code === 'sbom_partial'));
    assert.equal(supplyChainExitCode(partialSbom, { strict: true }), 1);

    fs.writeFileSync(path.join(root, 'artifacts', 'sbom.cdx.json'), JSON.stringify({ bomFormat: 'SPDX' }), 'utf8');
    const invalidSbom = checkSupplyChain({ repoRoot: root, registry: { private: [] } });
    assert.ok(invalidSbom.issues.some(item => item.code === 'sbom_schema_invalid'));
    assert.equal(supplyChainExitCode(invalidSbom), 1);

    // Non-JSON unverified SBOM test
    fs.rmSync(path.join(root, 'artifacts', 'sbom.cdx.json'));
    fs.writeFileSync(path.join(root, 'artifacts', 'bom.xml'), '<bom></bom>', 'utf8');
    const unverifiedSbom = checkSupplyChain({ repoRoot: root, registry: { private: [] } });
    assert.ok(unverifiedSbom.issues.some(item => item.code === 'sbom_format_unverified'));
    fs.rmSync(path.join(root, 'artifacts', 'bom.xml'));

    // Freshness check validation with checkFreshness: true
    const realRoot = path.resolve(import.meta.dirname, '../..');
    const realRegistry = JSON.parse(fs.readFileSync(path.join(realRoot, 'config/router-manifest.json'), 'utf8')); // just dummy
    // Tamper artifacts in a temporary mock
    fs.writeFileSync(path.join(root, 'artifacts', 'sbom.cdx.json'), JSON.stringify({
      bomFormat: 'CycloneDX', specVersion: '1.5',
      components: [{ 'bom-ref': 'fake@9.9.9', name: 'fake', version: '9.9.9' }],
      metadata: { properties: [{ name: 'ming.completeness', value: 'complete' }] }
    }), 'utf8');
    const staleCheck = checkSupplyChain({
      repoRoot: root,
      registry: { vertical: [], deployable: [], private: [] },
      checkFreshness: true
    });
    assert.ok(staleCheck.issues.some(item => item.code === 'sbom_stale'), 'stale SBOM must be detected when checkFreshness is true');

    console.log('  -> external pins, provenance, local entries, lockfiles, schema validation and freshness gate passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith('test-supply-chain-gate.mjs')) run();
