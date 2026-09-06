import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const OBSERVABILITY_SCHEMA_VERSION = '1.0';
export const EVENT_NAMES = Object.freeze({
  ROUTE_DECIDED: 'route.decided',
  ROUTE_FAILED: 'route.failed',
  MANIFEST_BUILT: 'manifest.built',
  MANIFEST_FAILED: 'manifest.failed',
  TEST_SUITE_FINISHED: 'test.suite_finished',
  LINT_CHECKED: 'lint.checked',
  SYNC_COMPLETED: 'sync.completed',
  SYNC_FAILED: 'sync.failed'
});
export const ERROR_CODES = Object.freeze({
  ROUTE_FAILED: 'route_failed',
  MANIFEST_FAILED: 'manifest_failed',
  TEST_FAILED: 'test_failed',
  LINT_FAILED: 'lint_failed',
  SYNC_FAILED: 'sync_failed'
});

const SAFE_WORK_UNIT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function hashHint(hint) {
  return sha256(typeof hint === 'string' ? hint : '');
}

export function resolveWorkUnitId(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) return randomUUID();
  return SAFE_WORK_UNIT_ID.test(candidate) ? candidate : `opaque-${sha256(candidate).slice(0, 32)}`;
}

function durationMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number * 1000) / 1000;
}

function timestamp(value) {
  return typeof value === 'string' && value ? value : new Date().toISOString();
}

function errorType(value) {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(value) ? value : 'Error';
}

function commonFields({ event, hint, duration, workUnitId, at, ok, errorCode }) {
  return {
    schema_version: OBSERVABILITY_SCHEMA_VERSION,
    event,
    timestamp: timestamp(at),
    work_unit_id: resolveWorkUnitId(workUnitId),
    duration_ms: durationMs(duration),
    ok,
    error_code: errorCode,
    hint_hash: hashHint(hint)
  };
}

function commonOperationalFields({ event, duration, workUnitId, at, ok, errorCode }) {
  return {
    schema_version: OBSERVABILITY_SCHEMA_VERSION,
    event,
    timestamp: timestamp(at),
    work_unit_id: resolveWorkUnitId(workUnitId),
    duration_ms: durationMs(duration),
    ok,
    error_code: errorCode
  };
}

const OPERATIONAL_FIELD_TYPES = Object.freeze({
  'manifest.built': { domains_count: 'count', recipes_count: 'count', ready_skill_count: 'count', output_path: 'path', check_only: 'boolean' },
  'manifest.failed': { error_type: 'errorType' },
  'test.suite_finished': { passed_suites: 'count', failed_suites: 'count', skipped_suites: 'count', total_suites: 'count' },
  'lint.checked': { sources_checked: 'count', error_count: 'count', warn_count: 'count', info_count: 'count' },
  'sync.completed': { linked_count: 'count', copy_count: 'count', skipped_count: 'count', backup_count: 'count', is_dry_run: 'boolean', module_filter_count: 'count' },
  'sync.failed': { error_type: 'errorType' }
});

function normalizeOperationalField(type, value) {
  if (type === 'count') {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : 0;
  }
  if (type === 'boolean') return value === true || value === 'true';
  if (type === 'path') {
    if (typeof value !== 'string' || !value) return null;
    const normalized = value.replaceAll('\\', '/');
    return normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.includes('../') ? 'redacted' : normalized;
  }
  return errorType(value);
}

export function createOperationalEvent({ event, duration, workUnitId, at, ok = true, errorCode = null, fields = {} } = {}) {
  const fieldTypes = OPERATIONAL_FIELD_TYPES[event];
  if (!fieldTypes) throw new TypeError('operational_event_invalid');
  const normalized = {};
  for (const [name, type] of Object.entries(fieldTypes)) {
    if (Object.hasOwn(fields, name)) normalized[name] = normalizeOperationalField(type, fields[name]);
  }
  return { ...commonOperationalFields({ event, duration, workUnitId, at, ok, errorCode }), ...normalized };
}

export function createRouteDecidedEvent({ hint, decision, duration, workUnitId, at } = {}) {
  const recipe = decision?.active_recipe;
  const candidates = Array.isArray(decision?.candidates) ? decision.candidates : [];
  const skills = Array.isArray(recipe?.skills) ? recipe.skills : [];
  return {
    ...commonFields({
      event: EVENT_NAMES.ROUTE_DECIDED,
      hint,
      duration,
      workUnitId,
      at,
      ok: true,
      errorCode: null
    }),
    mode: decision?.mode,
    domain: decision?.domain,
    confidence: decision?.confidence,
    action: decision?.action,
    recipe: typeof recipe?.name === 'string' && recipe.name ? recipe.name : null,
    candidate_count: candidates.length,
    loaded_skill_count: skills.length,
    reason_codes: Array.isArray(decision?.reasons) ? decision.reasons.filter(value => typeof value === 'string') : []
  };
}

export function createRouteFailedEvent({ hint, duration, workUnitId, at, error } = {}) {
  return {
    ...commonFields({
      event: EVENT_NAMES.ROUTE_FAILED,
      hint,
      duration,
      workUnitId,
      at,
      ok: false,
      errorCode: ERROR_CODES.ROUTE_FAILED
    }),
    error_type: errorType(error?.constructor?.name)
  };
}

export function writeEvent(filePath, event) {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new TypeError('event_file_required');
  if (event === null || typeof event !== 'object' || Array.isArray(event)) throw new TypeError('event_object_required');
  fs.appendFileSync(path.resolve(filePath), `${JSON.stringify(event)}\n`, 'utf8');
}

export function emitEvent(event, filePath = process.env.MING_SKILLS_EVENT_FILE) {
  if (!filePath) return false;
  writeEvent(filePath, event);
  return true;
}
