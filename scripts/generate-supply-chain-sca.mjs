import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { findRegistryPackageLockfiles } from './generate-supply-chain-sbom.mjs';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];
const AUDIT_ARGS = ['audit', '--package-lock-only', '--omit=dev', '--omit=optional', '--offline', '--json'];
const DEFAULT_CONCURRENCY = 8;
const MAX_CONCURRENCY = 8;
const MAX_AUDIT_OUTPUT = 32 * 1024 * 1024;
const CACHE_VERSION = '1';

function auditCommand(lockfile) {
  const args = [...AUDIT_ARGS];
  if (process.platform === 'win32') return { executable: process.env.ComSpec, args: ['/d', '/s', '/c', [NPM_COMMAND, ...args].join(' ')] };
  return { executable: NPM_COMMAND, args };
}

function npmCommand(args) {
  if (process.platform === 'win32') return { executable: process.env.ComSpec, args: ['/d', '/s', '/c', [NPM_COMMAND, ...args].join(' ')] };
  return { executable: NPM_COMMAND, args };
}

function hashText(value) {
  return createHash('sha256').update(value).digest('hex');
}

function lockfileHash(lockfile) {
  return hashText(fs.readFileSync(lockfile));
}

function cacheIndexFingerprint(cacheRoot) {
  const indexRoot = path.join(cacheRoot, '_cacache', 'index-v5');
  if (!fs.existsSync(indexRoot)) return null;
  const records = [];
  const firstLevel = fs.readdirSync(indexRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  for (const first of firstLevel) {
    const firstPath = path.join(indexRoot, first.name);
    const secondLevel = fs.readdirSync(firstPath, { withFileTypes: true }).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    for (const second of secondLevel) {
      const secondPath = path.join(firstPath, second.name);
      const stat = fs.statSync(secondPath);
      records.push(`${first.name}/${second.name}|${stat.size}|${stat.mtimeMs}`);
    }
  }
  return hashText(records.join('\n'));
}

function readCacheContext() {
  try {
    const versionCommand = npmCommand(['--version']);
    const npmVersion = String(execFileSync(versionCommand.executable, versionCommand.args, {
      encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024
    })).trim();
    const cacheCommand = npmCommand(['config', 'get', 'cache', '--offline']);
    const cacheRoot = String(execFileSync(cacheCommand.executable, cacheCommand.args, {
      encoding: 'utf8', timeout: 30000, maxBuffer: 64 * 1024 * 1024
    })).trim();
    const advisoryFingerprint = cacheIndexFingerprint(cacheRoot);
    if (!advisoryFingerprint) return null;
    return {
      node_version: process.version,
      npm_version: npmVersion,
      audit_args: AUDIT_ARGS,
      advisory_fingerprint: advisoryFingerprint
    };
  } catch {
    return null;
  }
}

function cacheKey(lockfile, context) {
  return hashText(JSON.stringify({ version: CACHE_VERSION, lockfile: lockfileHash(lockfile), context }));
}

function readCachedAudit(cachePath, key, lockfileDigest, context) {
  try {
    if (!fs.existsSync(cachePath) || fs.statSync(cachePath).size > MAX_AUDIT_OUTPUT) return null;
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (cached.version !== CACHE_VERSION || cached.key !== key || cached.lockfile_sha256 !== lockfileDigest
      || JSON.stringify(cached.context) !== JSON.stringify(context)
      || !cached.report?.auditReportVersion) return null;
    return cached.report;
  } catch {
    return null;
  }
}

function writeCachedAudit(cachePath, key, lockfileDigest, context, report) {
  let temporary;
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    temporary = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify({
      version: CACHE_VERSION,
      key,
      lockfile_sha256: lockfileDigest,
      context,
      report
    })}\n`, 'utf8');
    fs.renameSync(temporary, cachePath);
  } catch {
    if (temporary) {
      try { fs.rmSync(temporary, { force: true }); } catch { }
    }
  }
}

function readAudit(lockfile) {
  const command = auditCommand(lockfile);
  try {
    return JSON.parse(execFileSync(command.executable, command.args, {
      cwd: path.dirname(lockfile),
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    }));
  } catch (error) {
    if (error.stdout) {
      try {
        const report = JSON.parse(String(error.stdout));
        if (report.auditReportVersion) return report;
      } catch { }
    }
    throw new Error('npm_audit_unavailable');
  }
}

function readAuditAsync(lockfile) {
  const command = auditCommand(lockfile);
  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args, {
      cwd: path.dirname(lockfile),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stdoutBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      if (!settled) {
        settled = true;
        reject(new Error('npm_audit_unavailable'));
      }
    }, 120000);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_AUDIT_OUTPUT) {
        child.kill();
        finish(new Error('npm_audit_output_too_large'));
        return;
      }
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', () => {});
    child.once('error', () => finish(new Error('npm_audit_unavailable')));
    child.once('close', code => {
      try {
        const report = JSON.parse(stdout);
        if (code === 0 || report.auditReportVersion) finish(null, report);
        else finish(new Error('npm_audit_unavailable'));
      } catch {
        finish(new Error('npm_audit_unavailable'));
      }
    });
  });
}

function summarize(report) {
  const vulnerabilities = report.metadata?.vulnerabilities || {};
  return Object.fromEntries(SEVERITIES.map(level => [level, Number(vulnerabilities[level] || 0)]));
}

function normalizeFindings(report, source) {
  return Object.entries(report.vulnerabilities || {}).map(([name, finding]) => ({
    source,
    name,
    severity: finding.severity || 'unknown',
    is_direct: finding.isDirect === true,
    range: typeof finding.range === 'string' ? finding.range : null,
    via: Array.isArray(finding.via)
      ? finding.via.map(item => typeof item === 'string' ? item : item?.source || item?.title || 'advisory').filter(Boolean)
      : []
  })).sort((left, right) => `${left.source}:${left.name}`.localeCompare(`${right.source}:${right.name}`));
}

function emptySummary() {
  return Object.fromEntries(SEVERITIES.map(level => [level, 0]));
}

export function generateSupplyChainSca({ registry, repoRoot = ROOT_DIR } = {}) {
  const root = path.resolve(repoRoot);
  const lockfiles = findRegistryPackageLockfiles(registry, root);
  const failures = [];
  const findings = [];
  const summary = emptySummary();
  let scanned = 0;
  for (const lockfile of lockfiles) {
    const source = path.relative(root, lockfile).split(path.sep).join('/');
    try {
      const report = readAudit(lockfile);
      scanned++;
      const current = summarize(report);
      for (const level of SEVERITIES) summary[level] += current[level];
      findings.push(...normalizeFindings(report, source));
    } catch (error) {
      failures.push({ source, error: error.message });
    }
  }
  return {
    schema_version: '1.0',
    scanner: 'npm audit',
    mode: 'offline',
    network: 'not_used',
    status: failures.length > 0 ? 'partial' : 'complete',
    findings_status: findings.length > 0 ? 'present' : 'none',
    lockfiles_total: lockfiles.length,
    lockfiles_scanned: scanned,
    lockfiles_failed: failures.length,
    summary,
    findings,
    failures
  };
}

export async function generateSupplyChainScaAsync({
  registry,
  repoRoot = ROOT_DIR,
  concurrency = DEFAULT_CONCURRENCY,
  useCache = true,
  refreshCache = false,
  cacheDir,
  onLockfile
} = {}) {
  const root = path.resolve(repoRoot);
  const lockfiles = findRegistryPackageLockfiles(registry, root);
  const results = new Array(lockfiles.length);
  const limit = Math.min(MAX_CONCURRENCY, Number.isInteger(concurrency) && concurrency > 0 ? concurrency : DEFAULT_CONCURRENCY);
  const cacheContext = (useCache || refreshCache) ? readCacheContext() : null;
  const resolvedCacheDir = cacheDir || path.join(root, '.cache', 'supply-chain', 'sca');
  const lockfileObserver = typeof onLockfile === 'function' ? onLockfile : null;
  let cursor = 0;

  async function worker() {
    while (cursor < lockfiles.length) {
      const index = cursor++;
      const lockfile = lockfiles[index];
      const source = path.relative(root, lockfile).split(path.sep).join('/');
      const startedAt = Date.now();
      let cacheHit = false;
      try {
        const lockfileDigest = cacheContext ? lockfileHash(lockfile) : null;
        const key = cacheContext ? cacheKey(lockfile, cacheContext) : null;
        const cachePath = key ? path.join(resolvedCacheDir, `${key}.json`) : null;
        let report = cachePath && useCache && !refreshCache
          ? readCachedAudit(cachePath, key, lockfileDigest, cacheContext)
          : null;
        if (report) {
          cacheHit = true;
        } else {
          report = await readAuditAsync(lockfile);
          if (cachePath) writeCachedAudit(cachePath, key, lockfileDigest, cacheContext, report);
        }
        results[index] = { source, report };
      } catch (error) {
        results[index] = { source, error };
      }
      try { lockfileObserver?.({ source, durationMs: Date.now() - startedAt, cacheHit, ok: !results[index].error }); } catch { }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, lockfiles.length) }, () => worker()));

  const failures = [];
  const findings = [];
  const summary = emptySummary();
  let scanned = 0;
  for (const result of results) {
    if (result.error) {
      failures.push({ source: result.source, error: result.error.message });
      continue;
    }
    scanned++;
    const current = summarize(result.report);
    for (const level of SEVERITIES) summary[level] += current[level];
    findings.push(...normalizeFindings(result.report, result.source));
  }
  return {
    schema_version: '1.0',
    scanner: 'npm audit',
    mode: 'offline',
    network: 'not_used',
    status: failures.length > 0 ? 'partial' : 'complete',
    findings_status: findings.length > 0 ? 'present' : 'none',
    lockfiles_total: lockfiles.length,
    lockfiles_scanned: scanned,
    lockfiles_failed: failures.length,
    summary,
    findings,
    failures
  };
}

function parseArgs(args) {
  let output;
  let check = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--output') {
      output = args[++index];
      if (!output) throw new Error('usage: --output requires a path');
    } else if (arg.startsWith('--output=')) {
      output = arg.slice('--output='.length);
      if (!output) throw new Error('usage: --output requires a path');
    } else if (arg === '--check') {
      check = true;
    } else {
      throw new Error('usage: node scripts/generate-supply-chain-sca.mjs [--output <path>] [--check]');
    }
  }
  return { output, check };
}

function loadRegistry(repoRoot) {
  return JSON.parse(execFileSync('pwsh', ['-NoProfile', '-File', path.join(repoRoot, 'scripts/read-registry.ps1'), '-RegistryPath', path.join(repoRoot, 'registry.yaml')], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024
  }));
}

export function normalizeScaReport(report) {
  if (!report || typeof report !== 'object') return {};
  const copy = structuredClone(report);
  delete copy.generated_at;
  delete copy.timestamp;
  return copy;
}

export function isScaReportFresh(existing, fresh) {
  const normExisting = normalizeScaReport(existing);
  const normFresh = normalizeScaReport(fresh);
  return JSON.stringify(normExisting) === JSON.stringify(normFresh);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const targetFile = options.output ? path.resolve(options.output) : path.join(ROOT_DIR, 'artifacts/sca.npm.json');

    if (options.check) {
      if (!fs.existsSync(targetFile)) {
        console.error(`sca_check_failed: ${targetFile} does not exist`);
        process.exit(1);
      }
      const existing = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
      const report = generateSupplyChainSca({ registry: loadRegistry(ROOT_DIR), repoRoot: ROOT_DIR });
      if (!isScaReportFresh(existing, report)) {
        console.error(`sca_stale: artifacts/sca.npm.json content does not match current lockfiles or audit results`);
        process.exit(1);
      }
      console.log('sca_checked: artifacts/sca.npm.json is fresh');
      process.exit(0);
    }

    const report = generateSupplyChainSca({ registry: loadRegistry(ROOT_DIR), repoRoot: ROOT_DIR });
    const content = `${JSON.stringify(report, null, 2)}\n`;
    if (options.output) {
      const outputPath = path.resolve(options.output);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, content, 'utf8');
      console.error(`sca_written=${outputPath}`);
    } else {
      process.stdout.write(content);
    }
    console.error(`sca_lockfiles=${report.lockfiles_total} sca_scanned=${report.lockfiles_scanned} sca_failed=${report.lockfiles_failed} network=not_used`);
    process.exitCode = report.status === 'partial' ? 1 : 0;
  } catch (error) {
    console.error(`sca_generation_failed: ${error.message}`);
    process.exitCode = 1;
  }
}
