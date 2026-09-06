import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { run as runValidateUnit } from './unit/test-validate-hooks.test.mjs';
import { run as runBuildManifestUnit } from './unit/test-build-manifest.test.mjs';
import { run as runAdapterContract } from './contract/test-adapter-contract.mjs';
import { run as runCliIntegration } from './integration/test-cli-tools.test.mjs';

const root = path.resolve(import.meta.dirname, '..');
const requireAll = process.argv.includes('--require-all');
if (process.argv.slice(2).some(arg => arg !== '--require-all')) {
  console.error('usage: node tests/run.mjs [--require-all]');
  process.exit(2);
}
const hasPwsh = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8', timeout: 10000 }).status === 0;
const hasGit = spawnSync('git', ['--version'], { timeout: 10000 }).status === 0;
const node = (...args) => execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit', timeout: 120000 });
const suites = [
  { name: 'hook-validation', run: runValidateUnit },
  { name: 'manifest-unit', run: runBuildManifestUnit },
  { name: 'route-golden', run: () => node('tests/test-route-decision.mjs') },
  { name: 'adapter-contract', run: runAdapterContract },
  { name: 'route-safety', run: () => node('--test', 'tests/contract/test-route-safety.test.mjs') },
  { name: 'hook-index', git: true, run: () => node('--test', 'tests/integration/test-hook-index.test.mjs') },
  { name: 'yaml-contract', pwsh: true, run: () => execFileSync('pwsh', ['-NoProfile', '-File', 'tests/unit/test-yaml-lite.test.ps1'], { cwd: root, stdio: 'inherit', timeout: 30000 }) },
  { name: 'cli-isolated', pwsh: true, run: runCliIntegration },
  { name: 'manifest-freshness', pwsh: true, run: () => node('scripts/build-router-manifest.mjs', '--check') }
];
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
process.exitCode = failed || (requireAll && skipped) ? 1 : 0;
