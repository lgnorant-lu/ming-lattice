import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { run as runValidateUnit } from './unit/test-validate-hooks.test.mjs';
import { run as runBuildManifestUnit } from './unit/test-build-manifest.test.mjs';
import { run as runAdapterContract } from './contract/test-adapter-contract.mjs';
import { run as runObservabilityContract } from './contract/test-observability-contract.mjs';
import { run as runRouteDecisionCompatibility } from './contract/test-route-decision-compatibility.mjs';
import { run as runSupplyChainGate } from './contract/test-supply-chain-gate.mjs';
import { run as runSbomGeneration } from './contract/test-sbom-generation.mjs';
import { run as runScaGeneration } from './contract/test-sca-generation.mjs';
import { createOperationalEvent, emitEvent } from '../private/ming-skills-router/scripts/observability.mjs';
import { run as runCliIntegration } from './integration/test-cli-tools.test.mjs';
import { run as runRouteEffects } from './evals/test-route-effects.mjs';
import { run as runLintContract } from './contract/test-lint-contract.mjs';
import { run as runHookPlannerContract } from './contract/test-hook-planner.mjs';

const root = path.resolve(import.meta.dirname, '..');
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
  { name: 'route-golden', tier: 'contract', run: () => node('tests/test-route-decision.mjs') },
  { name: 'adapter-contract', tier: 'contract', run: runAdapterContract },
  { name: 'observability-contract', tier: 'contract', run: runObservabilityContract },
  { name: 'route-decision-compatibility', tier: 'contract', run: runRouteDecisionCompatibility },
  { name: 'supply-chain-gate', tier: 'contract', run: runSupplyChainGate },
  { name: 'sbom-generation', tier: 'contract', run: runSbomGeneration },
  { name: 'sca-generation', tier: 'contract', run: runScaGeneration },
  { name: 'lint-contract', tier: 'contract', pwsh: true, run: runLintContract },
  { name: 'hook-planner', tier: 'contract', run: runHookPlannerContract },
  { name: 'route-effects', tier: 'eval', run: runRouteEffects },
  { name: 'route-safety', tier: 'contract', run: () => node('--test', 'tests/contract/test-route-safety.test.mjs') },
  { name: 'hook-index', tier: 'integration', git: true, run: () => node('--test', 'tests/integration/test-hook-index.test.mjs') },
  { name: 'yaml-contract', tier: 'contract', pwsh: true, run: () => execFileSync('pwsh', ['-NoProfile', '-File', 'tests/unit/test-yaml-lite.test.ps1'], { cwd: root, stdio: 'inherit', timeout: 30000 }) },
  { name: 'cli-isolated', tier: 'integration', pwsh: true, run: runCliIntegration },
  { name: 'manifest-freshness', tier: 'contract', run: () => node('scripts/build-router-manifest.mjs', '--check') }
];

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
