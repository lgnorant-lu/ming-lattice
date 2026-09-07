import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function property(name, value) {
  return { name, value: String(value) };
}

function addProperty(properties, name, value) {
  if (!properties.some(item => item.name === name && item.value === value)) properties.push(property(name, value));
}

function componentKey(component) {
  return component['bom-ref'] || component.purl || `${component.group || ''}/${component.name || 'unknown'}@${component.version || ''}`;
}

function addSourceProperty(component, source) {
  const copy = structuredClone(component);
  copy.properties = Array.isArray(copy.properties) ? copy.properties : [];
  addProperty(copy.properties, 'ming.source_lockfile', source);
  copy.properties.sort((left, right) => `${left.name}:${left.value}`.localeCompare(`${right.name}:${right.value}`));
  return copy;
}

function serialNumber(payload) {
  const digest = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return `urn:uuid:${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
}

function packageNameFromPath(packagePath) {
  const marker = '/node_modules/';
  const markerIndex = packagePath.lastIndexOf(marker);
  if (markerIndex >= 0) return packagePath.slice(markerIndex + marker.length);
  if (packagePath.startsWith('node_modules/')) return packagePath.slice('node_modules/'.length);
  return null;
}

function packageRef(name, version) {
  return `${name}@${version}`;
}

function resolvePackagePath(packagePath, dependencyName, packageEntries) {
  const segments = packagePath.split('/');
  for (let index = segments.length; index >= 0; index--) {
    const prefix = segments.slice(0, index).join('/');
    const candidate = `${prefix ? `${prefix}/` : ''}node_modules/${dependencyName}`;
    if (packageEntries.has(candidate)) return candidate;
  }
  return `node_modules/${dependencyName}`;
}

function lockfileHash(integrity) {
  const match = typeof integrity === 'string' ? integrity.match(/^(sha\d+)-(.+)$/) : null;
  return match ? [{ alg: match[1].toUpperCase(), content: match[2] }] : undefined;
}

export function createCycloneDxFromLockfile(lockfile) {
  const packageEntries = new Map(Object.entries(lockfile.packages || {}));
  const included = new Map();
  for (const [packagePath, entry] of packageEntries) {
    if (!packagePath || typeof entry?.version !== 'string' || entry.dev === true || entry.optional === true) continue;
    const name = packageNameFromPath(packagePath);
    if (!name) continue;
    const ref = packageRef(name, entry.version);
    included.set(packagePath, { name, version: entry.version, ref });
  }
  const components = [...included.values()]
    .sort((left, right) => left.ref.localeCompare(right.ref))
    .map(({ name, version, ref }) => {
      const packagePath = [...included.entries()].find(([, item]) => item.ref === ref)?.[0];
      const entry = packageEntries.get(packagePath);
      const component = { type: 'library', name, version, 'bom-ref': ref, purl: `pkg:npm/${name}@${version}` };
      const hashes = lockfileHash(entry?.integrity);
      if (hashes) component.hashes = hashes;
      return component;
    });
  const dependencies = [];
  for (const [packagePath, item] of included) {
    const entry = packageEntries.get(packagePath);
    const dependsOn = new Set();
    for (const dependencyName of Object.keys(entry.dependencies || {})) {
      const dependencyPath = resolvePackagePath(packagePath, dependencyName, packageEntries);
      const dependency = included.get(dependencyPath);
      if (dependency) dependsOn.add(dependency.ref);
    }
    dependencies.push({ ref: item.ref, dependsOn: [...dependsOn].sort() });
  }
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    components,
    dependencies: dependencies.sort((left, right) => left.ref.localeCompare(right.ref))
  };
}

export function mergeCycloneDxReports(reports, { generatedAt, partial = false, failedSources = [], fallbackSources = [] } = {}) {
  const components = new Map();
  const dependencies = new Map();
  const sourceFiles = reports.map(item => item.source).sort();

  for (const { source, report } of reports) {
    for (const component of report.components || []) {
      const key = componentKey(component);
      const enriched = addSourceProperty(component, source);
      if (!components.has(key)) components.set(key, enriched);
      else {
        const current = components.get(key);
        current.properties = Array.isArray(current.properties) ? current.properties : [];
        for (const item of enriched.properties || []) addProperty(current.properties, item.name, item.value);
        current.properties.sort((left, right) => `${left.name}:${left.value}`.localeCompare(`${right.name}:${right.value}`));
      }
    }
    for (const dependency of report.dependencies || []) {
      if (typeof dependency.ref !== 'string' || !dependency.ref) continue;
      if (!dependencies.has(dependency.ref)) dependencies.set(dependency.ref, new Set());
      for (const ref of dependency.dependsOn || []) if (typeof ref === 'string' && ref) dependencies.get(dependency.ref).add(ref);
    }
  }

  const componentList = [...components.values()].sort((left, right) => componentKey(left).localeCompare(componentKey(right)));
  const dependencyList = [...dependencies.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([ref, dependsOn]) => ({ ref, dependsOn: [...dependsOn].sort() }));
  const properties = [
    property('ming.scope', 'registry-lockfiles'),
    property('ming.network', 'not_used'),
    property('ming.lockfiles', reports.length),
    property('ming.completeness', partial ? 'partial' : 'complete'),
    property('ming.failed_lockfiles', failedSources.length),
    property('ming.fallback_lockfiles', fallbackSources.length)
  ];
  const payload = { sourceFiles, components: componentList, dependencies: dependencyList, properties };
  const metadata = {
    component: { type: 'application', name: 'ming-skills-collection' },
    properties: [
      ...properties,
      ...sourceFiles.map(source => property('ming.source_lockfile', source)),
      ...failedSources.map(source => property('ming.failed_lockfile', source)),
      ...fallbackSources.map(source => property('ming.fallback_lockfile', source))
    ]
  };
  if (generatedAt) metadata.timestamp = generatedAt;
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: serialNumber(payload),
    version: 1,
    metadata,
    components: componentList,
    dependencies: dependencyList
  };
}

export function findPackageLockfiles(rootPath) {
  const files = [];
  const visit = directory => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && entry.name === 'package-lock.json') files.push(fullPath);
    }
  };
  visit(rootPath);
  return files.sort();
}

function registryRoots(registry, repoRoot) {
  const roots = new Set();
  for (const section of ['base', 'vertical', 'deployable', 'private']) {
    for (const item of registry?.[section] || []) {
      if (typeof item?.path !== 'string') continue;
      const fullPath = path.resolve(repoRoot, item.path);
      if (fullPath.startsWith(`${path.resolve(repoRoot)}${path.sep}`)) roots.add(fullPath);
    }
  }
  return [...roots].sort();
}

export function findRegistryPackageLockfiles(registry, repoRoot = ROOT_DIR) {
  return [...new Set(registryRoots(registry, path.resolve(repoRoot)).flatMap(findPackageLockfiles))].sort();
}

function loadRegistry(repoRoot) {
  return JSON.parse(execFileSync('pwsh', [
    '-NoProfile',
    '-File',
    path.join(repoRoot, 'scripts/read-registry.ps1'),
    '-RegistryPath',
    path.join(repoRoot, 'registry.yaml')
  ], { cwd: repoRoot, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 }));
}

function readNpmSbom(lockfile) {
  const npmArgs = [
    'sbom',
    '--sbom-format',
    'cyclonedx',
    '--package-lock-only',
    '--omit=dev',
    '--omit=optional',
    '--offline'
  ];
  const command = process.platform === 'win32'
    ? [NPM_COMMAND, ...npmArgs].join(' ')
    : null;
  const executable = process.platform === 'win32' ? process.env.ComSpec : NPM_COMMAND;
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', command] : npmArgs;
  try {
    const raw = execFileSync(executable, args, {
      cwd: path.dirname(lockfile),
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const report = JSON.parse(raw);
    if (report.bomFormat !== 'CycloneDX' || report.specVersion !== '1.5') throw new Error('npm_sbom_schema_unsupported');
    return { report, fallback: false };
  } catch {
    return { report: createCycloneDxFromLockfile(JSON.parse(fs.readFileSync(lockfile, 'utf8'))), fallback: true };
  }
}

export function generateSupplyChainSbom({ registry, repoRoot = ROOT_DIR, generatedAt, allowFailures = false } = {}) {
  const reports = [];
  const failures = [];
  const fallbackSources = [];
  const root = path.resolve(repoRoot);
  const lockfiles = findRegistryPackageLockfiles(registry, root);
  for (const lockfile of [...new Set(lockfiles)].sort()) {
    const source = path.relative(root, lockfile).split(path.sep).join('/');
    try {
      const result = readNpmSbom(lockfile);
      reports.push({ source, report: result.report });
      if (result.fallback) fallbackSources.push(source);
    } catch (error) {
      failures.push({ source, error: String(error.message || error).slice(0, 240) });
    }
  }
  if (failures.length > 0 && !allowFailures) {
    throw new Error(`sbom_generation_failed: ${failures.map(item => item.source).join(', ')}`);
  }
  return {
    report: mergeCycloneDxReports(reports, {
      generatedAt,
      partial: failures.length > 0,
      failedSources: failures.map(item => item.source),
      fallbackSources
    }),
    processed: reports.length,
    failures
  };
}

function parseArgs(args) {
  let output;
  let generatedAt;
  let allowFailures = false;
  let check = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--output') {
      output = args[++index];
      if (!output) throw new Error('usage: --output requires a path');
    }
    else if (arg.startsWith('--output=')) output = arg.slice('--output='.length);
    else if (arg === '--generated-at') generatedAt = args[++index];
    else if (arg.startsWith('--generated-at=')) generatedAt = arg.slice('--generated-at='.length);
    else if (arg === '--allow-failures') allowFailures = true;
    else if (arg === '--check') check = true;
    else throw new Error('usage: node scripts/generate-supply-chain-sbom.mjs [--output <path>] [--generated-at <ISO>] [--allow-failures] [--check]');
  }
  if (output === '') throw new Error('usage: --output requires a path');
  return { output, generatedAt, allowFailures, check };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const targetFile = options.output ? path.resolve(options.output) : path.join(ROOT_DIR, 'artifacts/sbom.cdx.json');

    if (options.check) {
      if (!fs.existsSync(targetFile)) {
        console.error(`sbom_check_failed: ${targetFile} does not exist`);
        process.exit(1);
      }
      const existing = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
      const result = generateSupplyChainSbom({
        registry: loadRegistry(ROOT_DIR),
        repoRoot: ROOT_DIR,
        generatedAt: existing.metadata?.timestamp || '2026-01-01T00:00:00.000Z',
        allowFailures: options.allowFailures
      });
      const generatedCompCount = result.report.components?.length || 0;
      const existingCompCount = existing.components?.length || 0;
      if (generatedCompCount !== existingCompCount || result.failures.length > 0) {
        console.error(`sbom_stale: component count changed (existing=${existingCompCount}, generated=${generatedCompCount})`);
        process.exit(1);
      }
      console.log('sbom_checked: artifacts/sbom.cdx.json is fresh');
      process.exit(0);
    }

    const result = generateSupplyChainSbom({
      registry: loadRegistry(ROOT_DIR),
      repoRoot: ROOT_DIR,
      generatedAt: options.generatedAt,
      allowFailures: options.allowFailures
    });
    const content = `${JSON.stringify(result.report, null, 2)}\n`;
    if (options.output) {
      const outputPath = path.resolve(options.output);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, content, 'utf8');
      console.error(`sbom_written=${outputPath}`);
    } else {
      process.stdout.write(content);
    }
    console.error(`sbom_lockfiles=${result.processed} sbom_failures=${result.failures.length} network=not_used`);
    process.exitCode = result.failures.length > 0 ? 1 : 0;
  } catch (error) {
    console.error(`sbom_generation_failed: ${error.message}`);
    process.exitCode = 1;
  }
}
