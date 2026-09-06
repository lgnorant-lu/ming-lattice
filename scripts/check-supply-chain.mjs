import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const PIN_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/;
const COMMIT_PIN = /^[0-9a-f]{7,40}$/i;
const GONE_PIN = /^gone-\d{4}-\d{2}-\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];
const SBOM_FILES = ['bom.json', 'sbom.json', 'sbom.spdx.json', 'bom.xml', 'sbom.cdx.json', 'artifacts/sbom.cdx.json'];
const SCA_FILES = ['osv-results.json', 'osv-results.sarif', 'sca-results.json', 'sca-results.sarif', 'artifacts/sca.npm.json'];

function issue(level, code, section, name, message) {
  return { level, code, section, name, message };
}

function isSafeRelativePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !path.isAbsolute(value)
    && !/(^|[\\/])\.\.([\\/]|$)|:/.test(value);
}

function localPath(repoRoot, relative) {
  if (!isSafeRelativePath(relative)) return null;
  const root = path.resolve(repoRoot);
  const full = path.resolve(root, relative);
  const relativeToRoot = path.relative(root, full);
  return relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot) ? null : full;
}

function validRepositoryUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && url.hostname.length > 0
      && url.pathname.split('/').filter(Boolean).length >= 2
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

function normalizedPin(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? String(value) : value;
}

function checkPackageLock(fullPath, section, name, issues, { referenceOnly = false } = {}) {
  const packagePath = path.join(fullPath, 'package.json');
  if (!fs.existsSync(packagePath)) return;
  let packageManifest;
  try {
    packageManifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch {
    issues.push(issue('E', 'dependency_manifest_invalid', section, name, 'package.json is not valid JSON'));
    return;
  }
  const dependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
  if (!dependencyFields.some(field => packageManifest[field] && Object.keys(packageManifest[field]).length > 0)) return;
  if (!LOCKFILES.some(file => fs.existsSync(path.join(fullPath, file)))) {
    issues.push(issue(
      referenceOnly ? 'I' : 'W',
      referenceOnly ? 'reference_dependency_lockfile_missing' : 'dependency_lockfile_missing',
      section,
      name,
      referenceOnly
        ? 'reference-only package.json has no lockfile; it is not a deployed dependency'
        : 'deployed package.json exists without a recognized lockfile'
    ));
  }
}

function findSbom(repoRoot) {
  for (const file of SBOM_FILES) {
    const fullPath = path.join(repoRoot, file);
    if (!fs.existsSync(fullPath)) continue;
    if (!file.endsWith('.json')) return { file, partial: false };
    try {
      const report = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const partial = report.metadata?.properties?.some(item => item.name === 'ming.completeness' && item.value === 'partial') === true;
      return { file, partial };
    } catch {
      return { file, partial: true };
    }
  }
  return null;
}

function findSca(repoRoot) {
  for (const file of SCA_FILES) {
    const fullPath = path.join(repoRoot, file);
    if (!fs.existsSync(fullPath)) continue;
    if (!file.endsWith('.json')) return { file, partial: false, findings: true };
    try {
      const report = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      return {
        file,
        partial: report.status === 'partial',
        findings: report.findings_status === 'present'
      };
    } catch {
      return { file, partial: true, findings: false };
    }
  }
  return null;
}

function checkExternalSource(item, section, repoRoot, issues) {
  if (!validRepositoryUrl(item.repo)) issues.push(issue('E', 'source_repo_invalid', section, item.name, 'external source requires an HTTPS repository URL without credentials'));
  const pin = normalizedPin(item.pin);
  if (typeof pin !== 'string' || !PIN_TOKEN.test(pin)) {
    issues.push(issue('E', 'source_pin_missing_or_invalid', section, item.name, 'external source requires a bounded pin token'));
  } else if (item.sourceGone === true) {
    if (!GONE_PIN.test(pin) || typeof item.note !== 'string' || !item.note.trim()) {
      issues.push(issue('E', 'source_gone_provenance_incomplete', section, item.name, 'sourceGone entries require gone-YYYY-MM-DD pin and note'));
    }
  } else if (!COMMIT_PIN.test(pin)) {
    issues.push(issue('W', 'source_pin_is_mutable_tag', section, item.name, `pin is not a commit-shaped value: ${pin}`));
  }
  if (typeof item.acquiredAt !== 'string' || !DATE.test(item.acquiredAt)) {
    issues.push(issue('E', 'source_acquired_at_invalid', section, item.name, 'external source requires acquiredAt in YYYY-MM-DD form'));
  }

  const fullPath = localPath(repoRoot, item.path);
  if (!fullPath) {
    issues.push(issue('E', 'source_path_invalid', section, item.name, 'source path must remain below repository root'));
    return;
  }
  if (item.enabled === true && !fs.existsSync(fullPath)) {
    issues.push(issue('E', 'source_path_missing', section, item.name, 'enabled source path does not exist locally'));
  }
  if (fs.existsSync(fullPath)) {
    const referenceOnly = section === 'vertical' && !Object.values(item.deploy || {}).some(Boolean);
    checkPackageLock(fullPath, section, item.name, issues, { referenceOnly });
  }
}

function checkLocalSkill(item, section, repoRoot, issues) {
  const fullPath = localPath(repoRoot, item.path);
  if (!fullPath) {
    issues.push(issue('E', 'local_path_invalid', section, item.name, 'local path must remain below repository root'));
    return;
  }
  if (item.enabled !== true) return;
  if (!fs.existsSync(fullPath)) {
    issues.push(issue('E', 'local_path_missing', section, item.name, 'enabled local source path does not exist'));
    return;
  }
  const skillPath = path.join(fullPath, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    issues.push(issue('E', 'deployable_entry_missing', section, item.name, 'enabled local deployment unit requires SKILL.md'));
  } else {
    const text = fs.readFileSync(skillPath, 'utf8').replace(/^\uFEFF/, '');
    const actualName = text.match(/^---\r?\n[\s\S]*?^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m)?.[1]?.trim();
    if (actualName !== item.name) issues.push(issue('E', 'deployable_identity_mismatch', section, item.name, `SKILL.md name is ${actualName || 'missing'}`));
  }
  checkPackageLock(fullPath, section, item.name, issues);
}

function checkBase(base, repoRoot, issues) {
  const basePath = localPath(repoRoot, base.path);
  if (!basePath) {
    issues.push(issue('E', 'base_path_invalid', 'base', base.name, 'base path must remain below repository root'));
    return;
  }
  if (base.enabled === true && !fs.existsSync(basePath)) issues.push(issue('E', 'base_path_missing', 'base', base.name, 'enabled base source path does not exist locally'));
  for (const [name, clients] of Object.entries(base.modules || {})) {
    if (!Array.isArray(clients) || clients.length === 0 || base.enabled !== true) continue;
    const modulePath = path.join(basePath, 'skills', name);
    if (!fs.existsSync(modulePath)) issues.push(issue('E', 'base_module_missing', 'base', name, 'enabled base module path does not exist locally'));
    else checkPackageLock(modulePath, 'base', name, issues);
  }
  checkExternalSource(base, 'base', repoRoot, issues);
}

export function checkSupplyChain({ registry, repoRoot = ROOT_DIR } = {}) {
  const issues = [];
  for (const base of registry?.base || []) if (base) checkBase(base, repoRoot, issues);
  for (const item of registry?.vertical || []) if (item) checkExternalSource(item, 'vertical', repoRoot, issues);
  for (const item of registry?.deployable || []) if (item) checkLocalSkill(item, 'deployable', repoRoot, issues);
  for (const item of registry?.private || []) if (item) checkLocalSkill(item, 'private', repoRoot, issues);

  const sbom = findSbom(repoRoot);
  const sca = findSca(repoRoot);
  if (!sbom) issues.push(issue('I', 'sbom_not_configured', 'repository', 'sbom', 'no root SBOM artifact detected; run an approved generator before release'));
  else if (sbom.partial) issues.push(issue('W', 'sbom_partial', 'repository', 'sbom', `detected incomplete SBOM artifact: ${sbom.file}`));
  else issues.push(issue('I', 'sbom_present', 'repository', 'sbom', `detected ${sbom.file}`));
  if (!sca) issues.push(issue('I', 'sca_not_configured', 'repository', 'sca', 'no root SCA report detected; run an approved scanner before release'));
  else if (sca.partial) issues.push(issue('W', 'sca_partial', 'repository', 'sca', `detected incomplete SCA report: ${sca.file}`));
  else if (sca.findings) issues.push(issue('W', 'sca_findings_present', 'repository', 'sca', `SCA report contains findings: ${sca.file}`));
  else issues.push(issue('I', 'sca_report_present', 'repository', 'sca', `detected ${sca.file}`));

  const errors = issues.filter(item => item.level === 'E').length;
  const warnings = issues.filter(item => item.level === 'W').length;
  const info = issues.filter(item => item.level === 'I').length;
  return {
    schema_version: '1.0',
    network: 'not_used',
    counts: { errors, warnings, info },
    ok: errors === 0,
    issues
  };
}

export function supplyChainExitCode(report, { strict = false } = {}) {
  return report.counts.errors > 0 || (strict && report.counts.warnings > 0) ? 1 : 0;
}

function loadRegistry(registryPath) {
  return JSON.parse(execFileSync('pwsh', ['-NoProfile', '-File', path.join(ROOT_DIR, 'scripts/read-registry.ps1'), '-RegistryPath', registryPath], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024
  }));
}

function printText(report) {
  for (const item of report.issues) console.log(`[${item.level}] ${item.code}: ${item.section}/${item.name} - ${item.message}`);
  console.log(`[supply-chain] ERROR=${report.counts.errors} WARN=${report.counts.warnings} INFO=${report.counts.info} NETWORK=${report.network}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const strict = args.includes('--strict');
  if (args.some(arg => !['--json', '--strict'].includes(arg))) {
    console.error('usage: node scripts/check-supply-chain.mjs [--json] [--strict]');
    process.exitCode = 2;
  } else {
    try {
      const report = checkSupplyChain({
        registry: loadRegistry(path.join(ROOT_DIR, 'registry.yaml')),
        repoRoot: ROOT_DIR
      });
      if (json) console.log(JSON.stringify(report, null, 2));
      else printText(report);
      process.exitCode = supplyChainExitCode(report, { strict });
    } catch (error) {
      console.error(`supply_chain_failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
