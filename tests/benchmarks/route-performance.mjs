import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { buildRouterManifest } from '../../scripts/build-router-manifest.mjs';
import { Decide } from '../../scripts/route-core.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const realManifest = JSON.parse(fs.readFileSync(path.join(root, 'config/router-manifest.json'), 'utf8'));
const ROUTE_SCALES = [0, 32, 128, 512, 1024];
const REGISTRY_SCALES = [0, 32, 128, 512, 1024];
const ROUTE_ITERATIONS = 200;
const MANIFEST_ITERATIONS = 15;

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function measure(fn, iterations) {
  const firstStarted = performance.now();
  fn();
  const firstMs = performance.now() - firstStarted;
  for (let index = 0; index < 10; index++) fn();
  const samples = [];
  for (let index = 0; index < iterations; index++) {
    const started = performance.now();
    fn();
    samples.push(performance.now() - started);
  }
  return {
    first_ms: Number(firstMs.toFixed(3)),
    median_ms: Number(percentile(samples, 0.5).toFixed(3)),
    p95_ms: Number(percentile(samples, 0.95).toFixed(3)),
    iterations
  };
}

function routeManifest(scale, duplicateCount = 0) {
  const manifest = structuredClone(realManifest);
  const names = [];
  for (let index = 0; index < scale; index++) {
    const name = `benchmark-skill-${index}`;
    names.push(name);
    manifest.domains.testing.skills.push(name);
    manifest.availability[name] = 'ready';
  }
  for (let index = 0; index < duplicateCount; index++) manifest.domains.testing.skills.push('testing-core-oracle');
  return { manifest, names };
}

function syntheticRegistry(rootPath, extraCount) {
  const names = [...new Set(Object.values(realManifest.domains).flatMap(domain => domain.skills))];
  const privateEntries = [];
  for (const name of names) {
    const relative = `private/${name}`;
    fs.mkdirSync(path.join(rootPath, relative), { recursive: true });
    fs.writeFileSync(path.join(rootPath, relative, 'SKILL.md'), `---\nname: ${name}\ndescription: Synthetic benchmark skill\n---\n`, 'utf8');
    privateEntries.push({ name, path: relative, enabled: true, deploy: { test: true } });
  }
  for (let index = 0; index < extraCount; index++) {
    privateEntries.push({
      name: `registry-fixture-${index}`,
      path: `private/registry-fixture-${index}`,
      enabled: true,
      deploy: { test: true }
    });
  }
  return { private: privateEntries };
}

function run() {
  const baseDecision = Decide('为 Rust 项目编写性质测试', realManifest);
  assert.equal(baseDecision.domain, 'testing');
  assert.equal(baseDecision.action, 'dispatch');
  assert.equal(new Set(baseDecision.candidates).size, baseDecision.candidates.length);

  const routeResults = [];
  for (const scale of ROUTE_SCALES) {
    const { manifest, names } = routeManifest(scale);
    let lastDecision;
    const timing = measure(() => {
      lastDecision = Decide('为 Rust 项目编写性质测试', manifest);
    }, ROUTE_ITERATIONS);
    assert.equal(lastDecision.domain, 'testing');
    assert.equal(lastDecision.action, 'dispatch');
    assert.equal(new Set(lastDecision.candidates).size, lastDecision.candidates.length, `route dedupe scale=${scale}`);
    assert.equal(lastDecision.candidates.length, baseDecision.candidates.length + names.length, `route growth scale=${scale}`);
    assert.ok(timing.p95_ms < 25, `route p95 latency ceiling violated at scale=${scale}: ${timing.p95_ms}ms >= 25ms`);
    routeResults.push({ scenario: 'route.unique_candidates', scale, candidate_count: lastDecision.candidates.length, ...timing });
  }

  const duplicateManifest = routeManifest(0, 1024).manifest;
  let duplicateDecision;
  const duplicateTiming = measure(() => {
    duplicateDecision = Decide('为 Rust 项目编写性质测试', duplicateManifest);
  }, ROUTE_ITERATIONS);
  assert.equal(duplicateDecision.candidates.length, baseDecision.candidates.length);
  assert.equal(new Set(duplicateDecision.candidates).size, duplicateDecision.candidates.length);
  assert.ok(duplicateTiming.p95_ms < 25, `duplicate route p95 latency ceiling violated: ${duplicateTiming.p95_ms}ms >= 25ms`);
  routeResults.push({
    scenario: 'route.duplicate_candidates',
    scale: 1024,
    candidate_count: duplicateDecision.candidates.length,
    ...duplicateTiming
  });

  const temp = fs.mkdtempSync(path.join(process.env.SKILLS_TEST_TMPDIR || os.tmpdir(), 'ming-router-benchmark-'));
  const manifestResults = [];
  try {
    for (const scale of REGISTRY_SCALES) {
      const registry = syntheticRegistry(temp, scale);
      let manifest;
      const timing = measure(() => {
        manifest = buildRouterManifest({ registry, repoRoot: temp, generatedAt: '2026-01-01T00:00:00.000Z' });
      }, MANIFEST_ITERATIONS);
      assert.equal(manifest.version, '2.0.0');
      assert.equal(manifest.availability['testing-core-oracle'], 'ready');
      if (scale > 0) assert.equal(Object.hasOwn(manifest.availability, `registry-fixture-${scale - 1}`), false);
      assert.ok(!fs.existsSync(path.join(temp, 'config')), 'benchmark build must not write output');
      assert.ok(timing.p95_ms < 150, `manifest p95 latency ceiling violated at scale=${scale}: ${timing.p95_ms}ms >= 150ms`);
      manifestResults.push({ scenario: 'manifest.registry_size', scale, registry_entries: registry.private.length, ...timing });
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }

  return {
    schema_version: '1.0',
    benchmark: 'router-performance',
    node: process.version,
    note: 'Assertions cover result correctness, dedupe, growth, read-only build behavior, and performance ceilings.',
    results: [...routeResults, ...manifestResults]
  };
}

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--json')) {
  console.error('usage: node tests/benchmarks/route-performance.mjs [--json]');
  process.exit(2);
}

try {
  const report = run();
  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('router-performance: timing is informational; correctness assertions passed');
    for (const result of report.results) {
      console.log(`${result.scenario} scale=${result.scale} median_ms=${result.median_ms} p95_ms=${result.p95_ms}`);
    }
  }
} catch (error) {
  console.error(`benchmark_failed: ${error.message}`);
  process.exitCode = 1;
}
