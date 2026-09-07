import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findRegistryPackageLockfiles } from './generate-supply-chain-sbom.mjs';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];

function auditCommand(lockfile) {
  const args = ['audit', '--package-lock-only', '--omit=dev', '--omit=optional', '--offline', '--json'];
  if (process.platform === 'win32') return { executable: process.env.ComSpec, args: ['/d', '/s', '/c', [NPM_COMMAND, ...args].join(' ')] };
  return { executable: NPM_COMMAND, args };
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
      if (
        report.lockfiles_total !== existing.lockfiles_total ||
        report.lockfiles_scanned !== existing.lockfiles_scanned ||
        report.findings.length !== existing.findings.length ||
        report.status !== existing.status
      ) {
        console.error(`sca_stale: scan results changed (existing_lockfiles=${existing.lockfiles_total}, current=${report.lockfiles_total})`);
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
