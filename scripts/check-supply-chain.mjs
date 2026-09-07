import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateSupplyChainSbom, generateSupplyChainSbomAsync, isCycloneDxFresh } from './generate-supply-chain-sbom.mjs';
import { generateSupplyChainSca, generateSupplyChainScaAsync, isScaReportFresh } from './generate-supply-chain-sca.mjs';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const PIN_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/;
const COMMIT_PIN = /^[0-9a-f]{7,40}$/i;
const GONE_PIN = /^gone-\d{4}-\d{2}-\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];
const SBOM_FILES = ['bom.json', 'sbom.json', 'sbom.spdx.json', 'bom.xml', 'sbom.cdx.json', 'artifacts/sbom.cdx.json', 'artifacts/bom.xml'];
const SCA_FILES = ['osv-results.json', 'osv-results.sarif', 'sca-results.json', 'sca-results.sarif', 'artifacts/sca.npm.json', 'artifacts/sca-results.sarif'];

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

function validateSbomArtifact(fullPath) {
  if (!fileOrEmpty(fullPath)) return { valid: false, code: 'sbom_empty', message: 'SBOM artifact is empty' };
  try {
    const report = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    if (typeof report !== 'object' || report === null || Array.isArray(report)) {
      return { valid: false, code: 'sbom_schema_invalid', message: 'SBOM root must be an object' };
    }
    if (report.bomFormat !== 'CycloneDX' || report.specVersion !== '1.5') {
      return { valid: false, code: 'sbom_schema_invalid', message: `unsupported bomFormat (${report.bomFormat}) or specVersion (${report.specVersion})` };
    }
    if (!Array.isArray(report.components) || report.components.length === 0) {
      return { valid: false, code: 'sbom_components_missing', message: 'SBOM contains no components' };
    }
    for (const comp of report.components) {
      if (!comp || typeof comp !== 'object' || !comp.name || typeof comp.version !== 'string') {
        return { valid: false, code: 'sbom_components_invalid', message: 'SBOM component missing name or version' };
      }
    }
    const props = Array.isArray(report.metadata?.properties) ? report.metadata.properties : [];
    const completeness = props.find(item => item && item.name === 'ming.completeness')?.value;
    const partial = completeness === 'partial';
    return { valid: true, partial, componentCount: report.components.length, report };
  } catch (err) {
    return { valid: false, code: 'sbom_json_invalid', message: `SBOM is not valid JSON: ${err.message}` };
  }
}

function validateScaArtifact(fullPath) {
  if (!fileOrEmpty(fullPath)) return { valid: false, code: 'sca_empty', message: 'SCA report artifact is empty' };
  try {
    const report = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    if (typeof report !== 'object' || report === null || Array.isArray(report)) {
      return { valid: false, code: 'sca_schema_invalid', message: 'SCA root must be an object' };
    }
    const required = ['schema_version', 'scanner', 'mode', 'network', 'status', 'findings_status', 'lockfiles_total', 'lockfiles_scanned', 'lockfiles_failed', 'summary', 'findings', 'failures'];
    for (const field of required) {
      if (!Object.hasOwn(report, field)) return { valid: false, code: 'sca_schema_invalid', message: `missing required field ${field}` };
    }
    const allowedRootProps = new Set(required);
    for (const key of Object.keys(report)) {
      if (!allowedRootProps.has(key)) {
        return { valid: false, code: 'sca_schema_invalid', message: `unexpected additional property in root: ${key}` };
      }
    }
    if (report.schema_version !== '1.0' || report.scanner !== 'npm audit' || report.mode !== 'offline' || report.network !== 'not_used') {
      return { valid: false, code: 'sca_metadata_invalid', message: `invalid sca metadata schema_version=${report.schema_version} scanner=${report.scanner} mode=${report.mode} network=${report.network}` };
    }
    if (!['complete', 'partial'].includes(report.status)) {
      return { valid: false, code: 'sca_schema_invalid', message: `invalid status: ${report.status}` };
    }
    if (!['none', 'present'].includes(report.findings_status)) {
      return { valid: false, code: 'sca_schema_invalid', message: `invalid findings_status: ${report.findings_status}` };
    }
    for (const numField of ['lockfiles_total', 'lockfiles_scanned', 'lockfiles_failed']) {
      if (typeof report[numField] !== 'number' || !Number.isInteger(report[numField]) || report[numField] < 0) {
        return { valid: false, code: 'sca_schema_invalid', message: `field ${numField} must be non-negative integer` };
      }
    }
    if (report.lockfiles_scanned + report.lockfiles_failed > report.lockfiles_total) {
      return { valid: false, code: 'sca_schema_invalid', message: 'scanned + failed exceeds lockfiles_total' };
    }
    if (!report.summary || typeof report.summary !== 'object' || Array.isArray(report.summary)) {
      return { valid: false, code: 'sca_schema_invalid', message: 'summary must be a non-empty object' };
    }
    const allowedSeverities = new Set(['info', 'low', 'moderate', 'high', 'critical']);
    for (const key of Object.keys(report.summary)) {
      if (!allowedSeverities.has(key)) {
        return { valid: false, code: 'sca_schema_invalid', message: `unexpected property in summary: ${key}` };
      }
    }
    for (const sev of allowedSeverities) {
      if (typeof report.summary[sev] !== 'number' || !Number.isInteger(report.summary[sev]) || report.summary[sev] < 0) {
        return { valid: false, code: 'sca_schema_invalid', message: `summary.${sev} must be non-negative integer` };
      }
    }
    if (!Array.isArray(report.findings) || !Array.isArray(report.failures)) {
      return { valid: false, code: 'sca_schema_invalid', message: 'findings and failures must be arrays' };
    }
    const allowedFindingProps = new Set(['source', 'name', 'severity', 'is_direct', 'range', 'via']);
    for (const item of report.findings) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return { valid: false, code: 'sca_schema_invalid', message: 'finding item must be an object' };
      }
      for (const key of Object.keys(item)) {
        if (!allowedFindingProps.has(key)) {
          return { valid: false, code: 'sca_schema_invalid', message: `unexpected property in finding item: ${key}` };
        }
      }
      if (typeof item.source !== 'string' || typeof item.name !== 'string') {
        return { valid: false, code: 'sca_schema_invalid', message: 'finding item must have string source and name' };
      }
      if (typeof item.severity !== 'string') {
        return { valid: false, code: 'sca_schema_invalid', message: 'finding item must have string severity' };
      }
      if (typeof item.is_direct !== 'boolean') {
        return { valid: false, code: 'sca_schema_invalid', message: 'finding item must have boolean is_direct' };
      }
      if (typeof item.range !== 'string' && item.range !== null) {
        return { valid: false, code: 'sca_schema_invalid', message: 'finding item range must be string or null' };
      }
      if (!Array.isArray(item.via) || item.via.some(v => typeof v !== 'string')) {
        return { valid: false, code: 'sca_schema_invalid', message: 'finding item via must be an array of strings' };
      }
    }
    const allowedFailureProps = new Set(['source', 'error']);
    for (const fail of report.failures) {
      if (!fail || typeof fail !== 'object' || Array.isArray(fail)) {
        return { valid: false, code: 'sca_schema_invalid', message: 'failure item must be an object' };
      }
      for (const key of Object.keys(fail)) {
        if (!allowedFailureProps.has(key)) {
          return { valid: false, code: 'sca_schema_invalid', message: `unexpected property in failure item: ${key}` };
        }
      }
      if (typeof fail.source !== 'string' || typeof fail.error !== 'string') {
        return { valid: false, code: 'sca_schema_invalid', message: 'failure item must have string source and error' };
      }
    }
    const partial = report.status === 'partial' || report.lockfiles_failed > 0;
    const findings = report.findings_status === 'present' || report.findings.length > 0;
    return { valid: true, partial, findings, report };
  } catch (err) {
    return { valid: false, code: 'sca_json_invalid', message: `SCA report is not valid JSON: ${err.message}` };
  }
}

function fileOrEmpty(fullPath) {
  return fs.existsSync(fullPath) && fs.statSync(fullPath).size > 0;
}

function findSbom(repoRoot) {
  for (const file of SBOM_FILES) {
    const fullPath = path.join(repoRoot, file);
    if (!fs.existsSync(fullPath)) continue;
    if (!file.endsWith('.json')) return { file, valid: false, unverified: true, code: 'sbom_format_unverified', message: `non-JSON SBOM (${file}) format is unverified without specialized parser` };
    const validated = validateSbomArtifact(fullPath);
    return { file, fullPath, ...validated };
  }
  return null;
}

function findSca(repoRoot) {
  for (const file of SCA_FILES) {
    const fullPath = path.join(repoRoot, file);
    if (!fs.existsSync(fullPath)) continue;
    if (!file.endsWith('.json')) return { file, valid: false, unverified: true, code: 'sca_format_unverified', message: `non-JSON SCA (${file}) format is unverified without specialized parser` };
    const validated = validateScaArtifact(fullPath);
    return { file, fullPath, ...validated };
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

export function checkSupplyChain({ registry, repoRoot = ROOT_DIR, checkFreshness = false } = {}) {
  const issues = [];
  for (const base of registry?.base || []) if (base) checkBase(base, repoRoot, issues);
  for (const item of registry?.vertical || []) if (item) checkExternalSource(item, 'vertical', repoRoot, issues);
  for (const item of registry?.deployable || []) if (item) checkLocalSkill(item, 'deployable', repoRoot, issues);
  for (const item of registry?.private || []) if (item) checkLocalSkill(item, 'private', repoRoot, issues);

  const sbom = findSbom(repoRoot);
  const sca = findSca(repoRoot);
  if (!sbom) {
    issues.push(issue('I', 'sbom_not_configured', 'repository', 'sbom', 'no root SBOM artifact detected; run an approved generator before release'));
  } else if (!sbom.valid) {
    issues.push(issue('E', sbom.code || 'sbom_invalid', 'repository', 'sbom', sbom.message || 'invalid SBOM artifact'));
  } else if (sbom.partial) {
    issues.push(issue('W', 'sbom_partial', 'repository', 'sbom', `detected incomplete SBOM artifact: ${sbom.file}`));
  } else {
    issues.push(issue('I', 'sbom_present', 'repository', 'sbom', `detected ${sbom.file} (${sbom.componentCount} components)`));
    if (checkFreshness && sbom.report && registry) {
      try {
        const freshSbom = generateSupplyChainSbom({
          registry,
          repoRoot,
          generatedAt: sbom.report.metadata?.timestamp || '2026-01-01T00:00:00.000Z',
          allowFailures: false
        });
        if (!isCycloneDxFresh(sbom.report, freshSbom.report)) {
          issues.push(issue('E', 'sbom_stale', 'repository', 'sbom', 'committed SBOM artifact is stale; re-run generator'));
        }
      } catch (err) {
        issues.push(issue('E', 'sbom_freshness_check_failed', 'repository', 'sbom', `failed to recompute SBOM: ${err.message}`));
      }
    }
  }

  if (!sca) {
    issues.push(issue('I', 'sca_not_configured', 'repository', 'sca', 'no root SCA report detected; run an approved scanner before release'));
  } else if (!sca.valid) {
    issues.push(issue('E', sca.code || 'sca_invalid', 'repository', 'sca', sca.message || 'invalid SCA report artifact'));
  } else if (sca.partial) {
    issues.push(issue('W', 'sca_partial', 'repository', 'sca', `detected incomplete SCA report: ${sca.file}`));
  } else if (sca.findings) {
    issues.push(issue('W', 'sca_findings_present', 'repository', 'sca', `SCA report contains findings: ${sca.file}`));
  } else {
    issues.push(issue('I', 'sca_report_present', 'repository', 'sca', `detected ${sca.file}`));
    if (checkFreshness && sca.report && registry) {
      try {
        const freshSca = generateSupplyChainSca({
          registry,
          repoRoot,
          generatedAt: sca.report.generated_at || '2026-01-01T00:00:00.000Z',
          allowFailures: false
        });
        const freshReport = freshSca.report || freshSca;
        if (!isScaReportFresh(sca.report, freshReport)) {
          issues.push(issue('E', 'sca_stale', 'repository', 'sca', 'committed SCA report is stale; re-run scanner'));
        }
      } catch (err) {
        issues.push(issue('E', 'sca_freshness_check_failed', 'repository', 'sca', `failed to recompute SCA: ${err.message}`));
      }
    }
  }

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

export async function checkSupplyChainAsync({
  registry,
  repoRoot = ROOT_DIR,
  checkFreshness = false,
  supplyChainConcurrency = 8,
  useScaCache = true,
  refreshScaCache = false,
  onSupplyChainLockfile
} = {}) {
  if (!checkFreshness) return checkSupplyChain({ registry, repoRoot, checkFreshness: false });

  const report = checkSupplyChain({ registry, repoRoot, checkFreshness: false });
  const issues = [...report.issues];
  const sbom = findSbom(repoRoot);
  if (sbom?.valid && !sbom.partial && sbom.report && registry) {
    try {
      const freshSbom = await generateSupplyChainSbomAsync({
        registry,
        repoRoot,
        generatedAt: sbom.report.metadata?.timestamp || '2026-01-01T00:00:00.000Z',
        allowFailures: false,
        concurrency: supplyChainConcurrency,
        useCache: useScaCache,
        refreshCache: refreshScaCache,
        onLockfile: onSupplyChainLockfile
      });
      if (!isCycloneDxFresh(sbom.report, freshSbom.report)) {
        issues.push(issue('E', 'sbom_stale', 'repository', 'sbom', 'committed SBOM artifact is stale; re-run generator'));
      }
    } catch (err) {
      issues.push(issue('E', 'sbom_freshness_check_failed', 'repository', 'sbom', `failed to recompute SBOM: ${err.message}`));
    }
  }

  const sca = findSca(repoRoot);
  if (sca?.valid && !sca.partial && !sca.findings && sca.report && registry) {
    try {
      const freshSca = await generateSupplyChainScaAsync({
        registry,
        repoRoot,
        concurrency: supplyChainConcurrency,
        useCache: useScaCache,
        refreshCache: refreshScaCache,
        onLockfile: onSupplyChainLockfile
      });
      if (!isScaReportFresh(sca.report, freshSca)) {
        issues.push(issue('E', 'sca_stale', 'repository', 'sca', 'committed SCA report is stale; re-run scanner'));
      }
    } catch (err) {
      issues.push(issue('E', 'sca_freshness_check_failed', 'repository', 'sca', `failed to recompute SCA: ${err.message}`));
    }
  }

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

function parseCliArgs(args) {
  const options = {
    json: false,
    strict: false,
    checkFreshness: false,
    supplyChainConcurrency: 8,
    refreshScaCache: false,
    scaTimings: false
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--check-freshness') options.checkFreshness = true;
    else if (arg === '--refresh-sca-cache') options.refreshScaCache = true;
    else if (arg === '--sca-timings') options.scaTimings = true;
    else if (arg === '--sca-concurrency' || arg === '--supply-chain-concurrency') {
      const value = args[++index];
      if (!value) throw new Error('usage: --sca-concurrency requires a value');
      options.supplyChainConcurrency = Number(value);
    } else if (arg.startsWith('--sca-concurrency=') || arg.startsWith('--supply-chain-concurrency=')) {
      options.supplyChainConcurrency = Number(arg.slice(arg.indexOf('=') + 1));
    } else {
      throw new Error('usage: node scripts/check-supply-chain.mjs [--json] [--strict] [--check-freshness] [--sca-concurrency <1-8>] [--refresh-sca-cache] [--sca-timings]');
    }
  }
  if (!Number.isInteger(options.supplyChainConcurrency) || options.supplyChainConcurrency < 1 || options.supplyChainConcurrency > 8) {
    throw new Error('usage: --supply-chain-concurrency must be an integer from 1 to 8');
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let options;
  try {
    options = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
  if (options) {
    void (async () => {
      try {
        const registry = loadRegistry(path.join(ROOT_DIR, 'registry.yaml'));
        const timings = [];
        const report = options.checkFreshness
          ? await checkSupplyChainAsync({
            registry,
            repoRoot: ROOT_DIR,
            checkFreshness: true,
            supplyChainConcurrency: options.supplyChainConcurrency,
            useScaCache: true,
            refreshScaCache: options.refreshScaCache,
            onSupplyChainLockfile: options.scaTimings ? timing => timings.push(timing) : undefined
          })
          : checkSupplyChain({ registry, repoRoot: ROOT_DIR, checkFreshness: false });
        if (options.scaTimings && options.checkFreshness) {
          const slowest = [...timings].sort((left, right) => right.durationMs - left.durationMs)[0];
          const hits = timings.filter(item => item.cacheHit).length;
          const sbomCount = timings.filter(item => item.kind === 'sbom').length;
          const scaCount = timings.filter(item => item.kind !== 'sbom').length;
          console.error(`[supply-chain-timing] concurrency=${options.supplyChainConcurrency} sbom=${sbomCount} sca=${scaCount} cache_hits=${hits} slowest=${slowest?.kind || 'none'}:${slowest?.source || 'none'}:${slowest?.durationMs || 0}ms`);
        }
        if (options.json) console.log(JSON.stringify(report, null, 2));
        else printText(report);
        process.exitCode = supplyChainExitCode(report, { strict: options.strict });
      } catch (error) {
        console.error(`supply_chain_failed: ${error.message}`);
        process.exitCode = 1;
      }
    })();
  }
}
