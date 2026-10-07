import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run as runValidateUnit } from './unit/test-validate-hooks.test.mjs';
import { run as runBuildManifestUnit } from './unit/test-build-manifest.test.mjs';
import { run as runCheckSkillUnit } from './unit/test-check-skill.test.mjs';
import { run as runScaffoldSkillUnit } from './unit/test-scaffold-skill.test.mjs';
import { run as runScaffoldRepoUnit } from './unit/test-scaffold-repo.test.mjs';
import { run as runInstallHooksUnit } from './unit/test-install-hooks.test.mjs';
import { run as runBootstrapUnit } from './unit/test-bootstrap.test.mjs';
import { run as runMingUnit } from './unit/test-ming.test.mjs';
import { run as runAdapterContract } from './contract/test-adapter-contract.mjs';
import { run as runObservabilityContract } from './contract/test-observability-contract.mjs';
import { run as runRouteDecisionCompatibility } from './contract/test-route-decision-compatibility.mjs';
import { run as runSupplyChainGate } from './contract/test-supply-chain-gate.mjs';
import { run as runSbomGeneration } from './contract/test-sbom-generation.mjs';
import { run as runScaGeneration } from './contract/test-sca-generation.mjs';
import { run as runRegistryParity } from './contract/test-registry-parity.test.mjs';
import { createOperationalEvent, emitEvent } from '../private/ming-skills-router/scripts/observability.mjs';
import { run as runCliIntegration } from './integration/test-cli-tools.test.mjs';
import { run as runRouteEffects } from './evals/test-route-effects.mjs';
import { run as runSkillRecall } from './evals/test-skill-recall.mjs';
import { run as runLexicalLayer } from './unit/test-lexical-layer.test.mjs';
import { run as runGardenerTrend } from './unit/test-gardener-trend.test.mjs';
import { run as runHookEngine } from './unit/test-hook-engine.test.mjs';
import { run as runEolGate } from './unit/test-eol-gate.test.mjs';
import { run as runLintContract } from './contract/test-lint-contract.mjs';
import { run as runHookPlannerContract } from './contract/test-hook-planner.mjs';
import { run as runRouteObserver } from './contract/test-route-observer.mjs';
import { run as runFetchCli } from './unit/test-fetch.test.mjs';
import { run as runMingBoundary } from './unit/test-ming-boundary.test.mjs';
import { run as runDocclass } from './unit/test-docclass.test.mjs';
import { run as runVerifyGates } from './unit/test-verify-gates.test.mjs';
import { run as runHostTools } from './unit/test-host-tools.test.mjs';
import { run as runCorpusMetrics } from './unit/test-corpus-metrics.test.mjs';
import { run as runDistillIndex } from './unit/test-distill-index.test.mjs';
import { run as runPropCli } from './unit/test-prop-cli.test.mjs';
import { run as runSpawnBound } from './unit/test-spawn-bound.test.mjs';
import { run as runTmpReaper } from './unit/test-tmp-reaper.test.mjs';
import { run as runAgentsDrift } from './contract/test-agents-drift.mjs';

const root = path.resolve(import.meta.dirname, '..');
// 仓默认 telemetry sink（与 emit-operational-event.mjs 同一约定）：env 未配时落
// .ming/lattice/state（gitignored 运行时面），让 gardener-trend 探针有连续数据可吃。
process.env.MING_SKILLS_EVENT_FILE ??= path.join(root, '.ming', 'lattice', 'state', 'operational-events.jsonl');
const startedAt = process.hrtime.bigint();
const requireAll = process.argv.includes('--require-all');
const suitesArgIndex = process.argv.indexOf('--suites');
const selectedSuites = suitesArgIndex >= 0 && process.argv[suitesArgIndex + 1]
  ? new Set(process.argv[suitesArgIndex + 1].split(',').map(s => s.trim()).filter(Boolean))
  : null;
const profileArgIndex = process.argv.indexOf('--profile');
const selectedProfile = profileArgIndex >= 0 && process.argv[profileArgIndex + 1]
  ? process.argv[profileArgIndex + 1].trim()
  : null;

const allowedArgs = new Set(['--require-all', '--suites', '--profile']);
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (!allowedArgs.has(arg)) {
    console.error('usage: node tests/run.mjs [--require-all] [--suites <name1,name2>] [--profile <quick|full>]');
    process.exit(2);
  }
  if (arg === '--suites' || arg === '--profile') {
    const val = process.argv[i + 1];
    if (!val || val.startsWith('--')) {
      console.error(`missing required value for ${arg}`);
      process.exit(2);
    }
    i++; // skip value
  }
}
const hasPwsh = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8', timeout: 10000 }).status === 0;
const hasGit = spawnSync('git', ['--version'], { timeout: 10000 }).status === 0;
const node = (...args) => execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit', timeout: 120000 });
export const allSuites = [
  { name: 'hook-validation', tier: 'unit', run: runValidateUnit },
  { name: 'manifest-unit', tier: 'unit', run: runBuildManifestUnit },
  { name: 'check-skill-unit', tier: 'unit', run: runCheckSkillUnit },
  { name: 'scaffold-skill', tier: 'unit', run: runScaffoldSkillUnit },
  { name: 'scaffold-domains', tier: 'unit', run: () => node('private/engineering/ming-l-paradigm/scripts/scaffold-domains.test.mjs') },
  { name: 'scaffold-repo', tier: 'unit', run: runScaffoldRepoUnit },
  { name: 'install-hooks', tier: 'unit', run: runInstallHooksUnit },
  { name: 'bootstrap', tier: 'unit', run: runBootstrapUnit },
  { name: 'ming', tier: 'unit', run: runMingUnit },
  { name: 'ming-l-audit', tier: 'contract', run: () => node('private/engineering/ming-l-paradigm/scripts/audit-domains.mjs', 'docs') },
  { name: 'route-golden', tier: 'contract', run: () => node('tests/test-route-decision.mjs') },
  { name: 'skill-conformance', tier: 'contract', run: () => node('private/engineering/ming-skill-forge/scripts/check-skill.mjs', '--all') },
  { name: 'adapter-contract', tier: 'contract', run: runAdapterContract },
  { name: 'observability-contract', tier: 'contract', run: runObservabilityContract },
  { name: 'route-decision-compatibility', tier: 'contract', run: runRouteDecisionCompatibility },
  { name: 'supply-chain-gate', tier: 'contract', run: runSupplyChainGate },
  { name: 'sbom-generation', tier: 'contract', run: runSbomGeneration },
  { name: 'sca-generation', tier: 'contract', run: runScaGeneration },
  { name: 'registry-parity', tier: 'contract', run: runRegistryParity },
  { name: 'lint-contract', tier: 'contract', pwsh: true, run: runLintContract },
  { name: 'hook-planner', tier: 'contract', run: runHookPlannerContract },
  { name: 'route-observer', tier: 'contract', run: runRouteObserver },
  { name: 'route-effects', tier: 'eval', run: runRouteEffects },
  { name: 'lexical-layer', tier: 'unit', run: runLexicalLayer },
  { name: 'gardener-trend', tier: 'unit', run: runGardenerTrend },
  { name: 'hook-engine', tier: 'unit', git: true, run: runHookEngine },
  { name: 'eol-gate', tier: 'unit', git: true, run: runEolGate },
  { name: 'fetch-cli', tier: 'unit', git: true, run: runFetchCli },
  { name: 'ming-boundary', tier: 'unit', run: runMingBoundary },
  { name: 'docclass', tier: 'unit', run: runDocclass },
  { name: 'verify-gates', tier: 'unit', run: runVerifyGates },
  { name: 'host-tools', tier: 'unit', run: runHostTools },
  { name: 'corpus-metrics', tier: 'unit', run: runCorpusMetrics },
  { name: 'distill-index-unit', tier: 'unit', run: runDistillIndex },
  { name: 'prop-cli', tier: 'unit', run: runPropCli },
  { name: 'spawn-bound', tier: 'unit', run: runSpawnBound },
  { name: 'tmp-reaper', tier: 'unit', run: runTmpReaper },
  { name: 'agents-drift', tier: 'contract', run: runAgentsDrift },
  { name: 'test-coverage', tier: 'contract', run: () => node('scripts/check-test-coverage.mjs') },
  { name: 'boundary-live', tier: 'contract', run: () => {
    // 真仓事实提取 + 根级 boundaries.yaml 契约评估（ADR-0008 实例化闸门）
    const factsFile = path.join(os.tmpdir(), `skc-mb-live-${process.pid}.jsonl`);
    try {
      node('private/engineering/ming-boundary/scripts/extract-facts.mjs', '--out', factsFile);
      node('private/engineering/ming-boundary/scripts/check-boundaries.mjs', '--facts', factsFile);
    } finally {
      fs.rmSync(factsFile, { force: true });
    }
  } },
  { name: 'skill-recall', tier: 'eval', run: runSkillRecall },
  { name: 'recall-eval', tier: 'eval', run: () => node('tests/evals/eval-recall.mjs', '--gate') },
  { name: 'route-safety', tier: 'contract', run: () => node('--test', 'tests/contract/test-route-safety.test.mjs') },
  { name: 'hook-index', tier: 'integration', git: true, run: () => node('--test', 'tests/integration/test-hook-index.test.mjs') },
  { name: 'yaml-contract', tier: 'contract', pwsh: true, run: () => execFileSync('pwsh', ['-NoProfile', '-File', 'tests/unit/test-yaml-lite.test.ps1'], { cwd: root, stdio: 'inherit', timeout: 30000 }) },
  { name: 'update-policy', tier: 'unit', pwsh: true, run: () => execFileSync('pwsh', ['-NoProfile', '-File', 'tests/unit/test-update-policy.test.ps1'], { cwd: root, stdio: 'inherit', timeout: 60000 }) },
  { name: 'cli-isolated', tier: 'integration', pwsh: true, run: runCliIntegration },
  { name: 'manifest-freshness', tier: 'contract', run: () => node('scripts/build-router-manifest.mjs', '--check') },
  { name: 'distill-index', tier: 'contract', run: () => node('private/ming-distiller/scripts/check-index.mjs') },
  { name: 'skill-index', tier: 'contract', run: () => node('scripts/check-skill-index.mjs') }
];

const VALID_TEST_PROFILES = new Set(['quick', 'full']);
if (selectedProfile && !VALID_TEST_PROFILES.has(selectedProfile)) {
  console.error(`unknown profile: ${selectedProfile}. Valid choices: quick, full`);
  process.exit(2);
}

let suites = allSuites;
if (selectedProfile === 'quick') {
  suites = allSuites.filter(s => !s.pwsh);
}
if (selectedSuites) {
  for (const name of selectedSuites) {
    if (!allSuites.some(s => s.name === name)) {
      console.error(`unknown suite: ${name}`);
      process.exit(2);
    }
  }
  suites = suites.filter(s => selectedSuites.has(s.name));
}
if (suites.length === 0) {
  console.error('no suites selected to run');
  process.exit(2);
}
let passed = 0;
let failed = 0;
let skipped = 0;
for (const suite of suites) {
  if ((suite.pwsh && !hasPwsh) || (suite.git && !hasGit)) {
    console.log(`[SKIP] ${suite.name}: ${suite.pwsh ? 'PowerShell 7' : 'Git'} is unavailable`);
    skipped++;
    continue;
  }
  try {
    await suite.run();
    passed++;
  } catch (error) {
    console.error(`[FAIL] ${suite.name}: ${error.message}`);
    failed++;
  }
}
console.log(`Suites: passed=${passed} failed=${failed} skipped=${skipped} total=${suites.length}`);
try {
  emitEvent(createOperationalEvent({
    event: 'test.suite_finished',
    duration: Number(process.hrtime.bigint() - startedAt) / 1e6,
    ok: failed === 0 && (!requireAll || skipped === 0),
    errorCode: failed || (requireAll && skipped) ? 'test_failed' : null,
    fields: { passed_suites: passed, failed_suites: failed, skipped_suites: skipped, total_suites: suites.length }
  }));
} catch {
  console.error('test_observability_failed: event output unavailable');
}
process.exitCode = failed || (requireAll && skipped) ? 1 : 0;
