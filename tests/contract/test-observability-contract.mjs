import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createRouteFailedEvent,
  createRouteDecidedEvent,
  hashHint,
  resolveWorkUnitId
} from '../../scripts/route-core.mjs';
import { createOperationalEvent } from '../../private/ming-skills-router/scripts/observability.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas/observability-event.schema.json'), 'utf8'));

function assertBaseEvent(event) {
  for (const field of schema.required) assert.ok(Object.hasOwn(event, field), `missing ${field}`);
  assert.equal(event.schema_version, schema.properties.schema_version.const);
  assert.match(event.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(event.work_unit_id, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
  assert.equal(typeof event.duration_ms, 'number');
  assert.ok(event.duration_ms >= 0);
  if (event.event === 'route.decided' || event.event === 'route.failed') assert.match(event.hint_hash, /^[a-f0-9]{64}$/);
}

export function run() {
  console.log('[TEST CONTRACT] structured observability event contract...');
  const temp = fs.mkdtempSync(path.join(process.env.SKILLS_TEST_TMPDIR || os.tmpdir(), 'ming-observability-'));
  try {
    const eventFile = path.join(temp, 'events.ndjson');
    const secretHint = '为 Rust 编写性质测试 token=ghp_sensitive_fixture /home/private';
    const result = spawnSync(process.execPath, [
      path.join(root, 'scripts/route-core.mjs'),
      '--event-file', eventFile,
      '--work-unit-id', 'route-contract-1',
      secretHint
    ], { cwd: root, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    const decision = JSON.parse(result.stdout);
    assert.equal(decision.domain, 'testing');
    assert.equal(result.stdout.split('\n').filter(Boolean).length > 1, true);

    const lines = fs.readFileSync(eventFile, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const event = JSON.parse(lines[0]);
    assertBaseEvent(event);
    assert.equal(event.event, 'route.decided');
    assert.equal(event.ok, true);
    assert.equal(event.error_code, null);
    assert.equal(event.work_unit_id, 'route-contract-1');
    assert.equal(event.hint_hash, hashHint(secretHint));
    assert.equal(event.candidate_count, decision.candidates.length);
    assert.equal(event.loaded_skill_count, decision.active_recipe.skills.length);
    assert.ok(!lines[0].includes(secretHint));
    assert.ok(!lines[0].includes('ghp_sensitive_fixture'));
    assert.ok(!lines[0].includes('/home/private'));

    const manifestEventFile = path.join(temp, 'manifest-events.ndjson');
    const manifestResult = spawnSync(process.execPath, [path.join(root, 'scripts/build-router-manifest.mjs'), '--check'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, MING_SKILLS_EVENT_FILE: manifestEventFile, MING_SKILLS_WORK_UNIT_ID: 'tool-contract-1' }
    });
    assert.equal(manifestResult.status, 0, manifestResult.stderr);
    const manifestEvent = JSON.parse(fs.readFileSync(manifestEventFile, 'utf8').trim());
    assertBaseEvent(manifestEvent);
    assert.equal(manifestEvent.event, 'manifest.built');
    assert.equal(manifestEvent.check_only, true);
    assert.equal(manifestEvent.output_path, null);

    const invalidId = 'alice@example.com with secret';
    assert.match(resolveWorkUnitId(invalidId), /^opaque-[a-f0-9]{32}$/);
    assert.ok(!JSON.stringify(createRouteDecidedEvent({ hint: secretHint, decision, duration: -1, workUnitId: invalidId })).includes(invalidId));

    const failed = createRouteFailedEvent({
      hint: secretHint,
      duration: 2.5,
      workUnitId: 'route-contract-2',
      error: new Error('secret path and token must not be serialized')
    });
    assertBaseEvent(failed);
    assert.equal(failed.event, 'route.failed');
    assert.equal(failed.ok, false);
    assert.equal(failed.error_code, 'route_failed');
    assert.equal(failed.error_type, 'Error');
    assert.ok(!JSON.stringify(failed).includes('secret path'));
    assert.ok(!JSON.stringify(failed).includes('token'));

    const manifestSpecEvent = createOperationalEvent({
      event: 'manifest.built',
      duration: 1.5,
      workUnitId: 'tool-contract-1',
      fields: { domains_count: 5, recipes_count: 10, ready_skill_count: 7, output_path: 'C:\\Users\\secret\\router.json', check_only: true, ignored_secret: 'must not appear' }
    });
    assertBaseEvent(manifestSpecEvent);
    assert.equal(manifestSpecEvent.event, 'manifest.built');
    assert.equal(manifestSpecEvent.output_path, 'redacted');
    assert.equal(Object.hasOwn(manifestSpecEvent, 'ignored_secret'), false);
    assert.equal(manifestSpecEvent.check_only, true);

    const testEvent = createOperationalEvent({
      event: 'test.suite_finished',
      duration: 4,
      fields: { passed_suites: 13, failed_suites: 0, skipped_suites: 0, total_suites: 13 }
    });
    assertBaseEvent(testEvent);
    assert.equal(testEvent.total_suites, 13);
    assert.equal(Object.hasOwn(testEvent, 'hint_hash'), false);
    const syncFailedEventFile = path.join(temp, 'sync-failed-events.ndjson');
    const syncFailedResult = spawnSync('pwsh', [
      '-NoProfile',
      '-File', path.join(root, 'scripts/sync.ps1'),
      '-RegistryPath', path.join(temp, 'nonexistent-registry.yaml')
    ], {
      cwd: root,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, MING_SKILLS_EVENT_FILE: syncFailedEventFile, MING_SKILLS_WORK_UNIT_ID: 'sync-contract-fail' }
    });
    assert.notEqual(syncFailedResult.status, 0);
    assert.ok(fs.existsSync(syncFailedEventFile), 'sync.failed event file must be written');
    const syncFailedEvent = JSON.parse(fs.readFileSync(syncFailedEventFile, 'utf8').trim());
    assertBaseEvent(syncFailedEvent);
    assert.equal(syncFailedEvent.event, 'sync.failed');
    assert.equal(syncFailedEvent.ok, false);
    assert.equal(syncFailedEvent.error_code, 'sync_failed');
    assert.ok(syncFailedEvent.error_type);

    // Preflight failure scenario 2: unavailable module requested
    const syncMissingModuleEventFile = path.join(temp, 'sync-missing-module-events.ndjson');
    const syncMissingModuleResult = spawnSync('pwsh', [
      '-NoProfile',
      '-File', path.join(root, 'scripts/sync.ps1'),
      '-Module', 'nonexistent-module-foo'
    ], {
      cwd: root,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, MING_SKILLS_EVENT_FILE: syncMissingModuleEventFile, MING_SKILLS_WORK_UNIT_ID: 'sync-contract-missing' }
    });
    assert.notEqual(syncMissingModuleResult.status, 0);
    assert.ok(fs.existsSync(syncMissingModuleEventFile), 'sync.failed event must be written on unavailable module');
    const syncMissingEvent = JSON.parse(fs.readFileSync(syncMissingModuleEventFile, 'utf8').trim());
    assertBaseEvent(syncMissingEvent);
    assert.equal(syncMissingEvent.event, 'sync.failed');
    assert.equal(syncMissingEvent.ok, false);

    // Preflight failure scenario 3: missing SKILL.md for a declared module
    const brokenRegistryDir = path.join(temp, 'sync-broken-preflight');
    fs.mkdirSync(brokenRegistryDir, { recursive: true });
    const brokenRegistryFile = path.join(brokenRegistryDir, 'registry.yaml');
    fs.writeFileSync(brokenRegistryFile, `version: 1
targets:
  claude: ${JSON.stringify(path.join(brokenRegistryDir, 'targets'))}
base: []
vertical: []
deployable: []
private:
  - name: ghost-skill
    path: private/nonexistent-ghost-skill
    enabled: true
    deploy:
      claude: true
`);
    const syncGhostEventFile = path.join(temp, 'sync-ghost-events.ndjson');
    const syncGhostResult = spawnSync('pwsh', [
      '-NoProfile',
      '-File', path.join(root, 'scripts/sync.ps1'),
      '-RegistryPath', brokenRegistryFile,
      '-RepoRoot', brokenRegistryDir
    ], {
      cwd: root,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, MING_SKILLS_EVENT_FILE: syncGhostEventFile, MING_SKILLS_WORK_UNIT_ID: 'sync-contract-ghost' }
    });
    assert.notEqual(syncGhostResult.status, 0);
    assert.ok(fs.existsSync(syncGhostEventFile), 'sync.failed event must be written when SKILL.md missing');
    const syncGhostEvent = JSON.parse(fs.readFileSync(syncGhostEventFile, 'utf8').trim());
    assertBaseEvent(syncGhostEvent);
    assert.equal(syncGhostEvent.event, 'sync.failed');
    assert.equal(syncGhostEvent.ok, false);
    assert.equal(syncGhostEvent.error_code, 'sync_failed');

    console.log('  -> event schema, independent channel, correlation ID and redaction checks passed');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith('test-observability-contract.mjs')) run();
