import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createRouteDecidedEvent,
  createRouteFailedEvent,
  emitEvent,
  hashHint,
  resolveWorkUnitId
} from './observability.mjs';

export {
  createRouteDecidedEvent,
  createRouteFailedEvent,
  emitEvent,
  hashHint,
  resolveWorkUnitId
} from './observability.mjs';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isStringArray = value => Array.isArray(value) && value.every(item => typeof item === 'string');
const isSkillName = value => typeof value === 'string' && value.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

export function Decide(hint, manifest) {
  const text = (typeof hint === 'string' ? hint : '').trim().toLowerCase()
    .replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, '')
    .replace(/^\s*>.*$/gm, '');
  const matches = (value, term) => {
    if (typeof term !== 'string' || !term) return false;
    const literal = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const left = /^[a-z0-9_]/i.test(term) ? '(^|[^a-z0-9_-])' : '';
    const right = /[a-z0-9_]$/i.test(term) ? '($|[^a-z0-9_-])' : '';
    return new RegExp(`${left}${literal}${right}`, 'i').test(value);
  };
  const has = (...terms) => terms.some(term => matches(text, term));
  const readOnly = /(?:不(?:要)?|禁止|勿)(?:再|直接|擅自)?(?:修改|改动|实现|写入|执行)|\b(?:read[- ]only|do not (?:edit|modify|implement|execute)|don't (?:edit|modify|implement|execute))\b/i.test(text);
  const mode = readOnly || has('审阅', '审计', '复查', 'review', 'audit') ? 'review'
    : has('规划', '商讨', '先计划', 'plan', 'brainstorm') ? 'plan'
    : has('解释', '讲述', '盘点', '讲解', '讨论', '找找', 'explain', 'overview', 'catalog') ? 'explain'
    : 'implement';
  const decision = {
    schemaVersion: '2.0', mode, domain: 'none', confidence: 'none', candidates: [],
    active_recipe: { name: '', skills: [] }, action: 'handoff', side_effects: 'none',
    must_not: ['initReverseCase', 'create_work_dir'], reasons: []
  };
  if (mode !== 'implement') decision.must_not.push('modify_files', 'install_tools', 'execute_target');
  if (!text.trim()) {
    decision.reasons.push('empty_hint');
    return decision;
  }
  if (manifest?.version !== '2.0.0' || !isRecord(manifest.domains) || !isRecord(manifest.recipes) || !isRecord(manifest.availability)) {
    decision.reasons.push('invalid_manifest');
    return decision;
  }

  const { domains, recipes, availability } = manifest;
  for (const recipe of Object.values(recipes)) {
    if (!isRecord(recipe) || !domains[recipe.domain] || !isStringArray(recipe.skills) || !recipe.skills.every(isSkillName)) {
      decision.reasons.push('invalid_recipe_definition');
      return decision;
    }
  }
  const clauses = text.split(/[，,。；;\n!?？！]|\bbut\b|但是|而是/);
  const negated = clause => /不(?:要|用|使用|加载|启用|运行)|禁止|排除|无需|\b(?:do not|don't|without|exclude|not using)\b/.test(clause);
  const activeText = clauses.filter(clause => !negated(clause)).join(' ');
  const activeHas = (...terms) => terms.some(term => matches(activeText, term));
  const excluded = new Set();
  const explicit = new Map();
  const scores = {};
  const candidatesByDomain = {};

  for (const [name, info] of Object.entries(domains)) {
    if (!isRecord(info) || !isStringArray(info.skills) || !info.skills.every(isSkillName)
      || !isStringArray(info.triggers) || !isStringArray(info.negatives)
      || (info.qualityGateTriggers !== undefined && !isStringArray(info.qualityGateTriggers))
      || (info.skillTriggers !== undefined && (!isRecord(info.skillTriggers)
        || !Object.entries(info.skillTriggers).every(([skill, terms]) => isSkillName(skill) && isStringArray(terms))))) {
      decision.reasons.push('invalid_domain_definition');
      return decision;
    }
    for (const skill of info.skills) {
      if (clauses.some(clause => negated(clause) && matches(clause, skill))) excluded.add(skill);
      if (matches(activeText, skill)) explicit.set(skill, name);
    }
    const triggerTerms = [...info.triggers, ...(info.qualityGateTriggers || [])];
    scores[name] = triggerTerms.filter(term => term !== 'hook' && matches(activeText, term)).length;
  }
  for (const skill of excluded) explicit.delete(skill);
  for (const [name, info] of Object.entries(domains)) {
    candidatesByDomain[name] = info.skills.filter(skill => availability[skill] === 'ready' && !excluded.has(skill));
  }
  for (const [skill, domain] of explicit) {
    if (availability[skill] !== 'ready') {
      decision.action = 'ask';
      decision.reasons.push(`skill_unavailable: ${skill}`);
      return decision;
    }
    scores[domain] = (scores[domain] || 0) + 2;
    decision.reasons.push(`explicit_skill_hit: ${skill}`);
  }

  const positive = name => (scores[name] || 0) > 0;
  const qualityGate = (domains.engineering?.qualityGateTriggers || []).some(term => matches(activeText, term));
  const conflicting = positive('reverse') && (positive('testing') || positive('ui')) && !positive('protocol');
  if (conflicting) {
    decision.domain = 'mixed';
    decision.confidence = 'medium';
    decision.action = 'ask';
    decision.candidates = [...new Set(['testing', 'reverse', 'ui', 'engineering']
      .filter(positive).flatMap(name => candidatesByDomain[name] || []))];
    decision.reasons.push('incompatible_primary_domains');
    return decision;
  }

  const domain = qualityGate && positive('engineering') ? 'engineering'
    : ['testing', 'protocol', 'reverse', 'ui', 'engineering'].find(positive);
  if (!domain) {
    decision.reasons.push('no_domain_triggers_matched');
    return decision;
  }
  decision.domain = domain;
  decision.confidence = scores[domain] >= 2 ? 'high' : 'medium';
  decision.candidates = [...new Set([
    ...(candidatesByDomain[domain] || []),
    ...(positive('engineering') ? candidatesByDomain.engineering || [] : [])
  ])];

  let recipeKey = domains[domain].defaultRecipe;
  if (domain === 'engineering' && qualityGate) recipeKey = 'quality-gate-governance';
  const named = [...explicit.keys()];
  let targetSkills = named.filter(skill => explicit.get(skill) === domain);
  if (domain === 'testing') {
    const catalog = activeHas('盘点', '讲述', '找找', '覆盖设计', '规范族', '体系', 'overview', 'catalog');
    const brownfield = activeHas('表征', '锁定', '遗留', 'characterization', 'characterize', 'brownfield', 'golden master');
    const cli = activeHas('cli', '脚本', '退出码', '命令行', 'command-line');
    const ffi = activeHas('ffi', 'v8', 'pyo3', '跨语言', '嵌入');
    const pipeline = activeHas('爬虫', '采集', 'scraper', '清洗', 'pipeline');
    recipeKey = mode === 'review' || mode === 'plan' ? 'testing-review'
      : catalog ? 'testing-overview-catalog'
      : brownfield ? (cli ? 'cli-tool-characterize' : 'characterization-brownfield')
      : cli ? 'cli-tool-spec' : ffi ? 'embed-ffi-greenfield'
      : pipeline ? 'scraper-pipeline' : 'spec-driven-greenfield';
    if (!targetSkills.length) targetSkills = [...(recipes[recipeKey]?.skills || [])];
    if (!targetSkills.includes('testing-core-oracle')) targetSkills.unshift('testing-core-oracle');
    if (cli) targetSkills.push('testing-scenario-cli');
    if (ffi) targetSkills.push('testing-scenario-embed-ffi');
    if (pipeline) targetSkills.push('testing-scenario-scraper');
    for (const [language, terms] of Object.entries({
      rust: ['rust', 'cargo', 'miri', 'proptest'],
      python: ['python', 'pytest', 'hypothesis'],
      js: ['js', 'ts', 'javascript', 'typescript', 'node', 'node.js', 'react', 'vitest', 'jest'],
      go: ['go', 'golang']
    })) {
      if (activeHas(...terms)) targetSkills.push(`testing-${language}-idiom`);
    }
    if (activeHas('性质测试', '变异', 'hypothesis', 'proptest', 'property-based', 'mutation', 'fuzz')) {
      targetSkills.push('testing-property-mutation');
    }
    if (mode === 'review' || mode === 'plan' || (mode === 'explain' && !catalog)) {
      targetSkills = targetSkills.filter(skill => !skill.startsWith('testing-workflow-') || explicit.has(skill));
    }
    if (mode === 'implement' && targetSkills.filter(skill => skill.startsWith('testing-workflow-')).length > 1) {
      decision.action = 'ask';
      decision.reasons.push('conflicting_workflow_drivers');
      return decision;
    }
  } else if (!targetSkills.length) {
    targetSkills = domain === 'engineering' ? [] : [...(recipes[recipeKey]?.skills || [])];
  }

  if (domain === 'engineering' || positive('engineering')) {
    for (const [skill, terms] of Object.entries(domains.engineering?.skillTriggers || {})) {
      if (explicit.has(skill) || terms.some(term => matches(activeText, term))) targetSkills.push(skill);
    }
    targetSkills.push(...named.filter(skill => explicit.get(skill) === 'engineering'));
    if (!targetSkills.length) targetSkills = [...(recipes[recipeKey]?.skills || [])];
  }
  targetSkills = [...new Set(targetSkills)].filter(skill => !excluded.has(skill));
  if (domain === 'testing' && !targetSkills.includes('testing-core-oracle')) {
    decision.action = 'ask';
    decision.reasons.push('required_oracle_excluded');
    return decision;
  }
  const unavailable = targetSkills.filter(skill => availability[skill] !== 'ready');
  if (unavailable.length || !targetSkills.length || !recipes[recipeKey]) {
    decision.action = 'ask';
    decision.reasons.push(unavailable.length ? `recipe_unavailable: ${unavailable.join(', ')}` : 'missing_recipe');
    return decision;
  }
  decision.candidates = [...new Set([...decision.candidates, ...targetSkills])];
  decision.active_recipe = { name: recipeKey, skills: targetSkills };
  decision.action = 'dispatch';
  decision.reasons.push(`domain_selected: ${domain}`);
  return decision;
}

export function adapt(decision) {
  const fallback = {
    injectedCandidates: [], loadSkills: [], allowCaseInit: false, promptAction: 'handoff',
    mustNot: ['initReverseCase', 'create_work_dir', 'modify_files', 'install_tools', 'execute_target']
  };
  if (decision?.schemaVersion !== '2.0' || decision.side_effects !== 'none'
    || !['testing', 'reverse', 'protocol', 'ui', 'engineering', 'mixed', 'none'].includes(decision.domain)
    || !['high', 'medium', 'low', 'none'].includes(decision.confidence)
    || !['review', 'explain', 'plan', 'implement'].includes(decision.mode)
    || !['dispatch', 'ask', 'handoff'].includes(decision.action)
    || !isStringArray(decision.candidates) || !decision.candidates.every(isSkillName)
    || !isStringArray(decision.must_not) || !isStringArray(decision.reasons)
    || typeof decision.active_recipe?.name !== 'string'
    || !isStringArray(decision.active_recipe.skills) || !decision.active_recipe.skills.every(isSkillName)
    || decision.active_recipe.skills.some(skill => !decision.candidates.includes(skill))
    || (decision.action === 'dispatch' && (['none', 'mixed'].includes(decision.domain)
      || !decision.active_recipe.name || !decision.active_recipe.skills.length))
    || (decision.mode === 'implement' && decision.must_not.includes('modify_files'))) return fallback;

  const promptAction = decision.action === 'handoff' ? 'handoff'
    : decision.action === 'ask' ? 'ask_clarification'
    : decision.mode === 'explain' ? 'overview_explain' : decision.mode;
  return {
    injectedCandidates: [...decision.candidates],
    loadSkills: decision.action === 'dispatch' ? [...decision.active_recipe.skills] : [],
    allowCaseInit: false,
    promptAction,
    mustNot: [...new Set([...decision.must_not, 'initReverseCase', 'create_work_dir',
      ...(decision.mode !== 'implement' ? ['modify_files', 'install_tools', 'execute_target'] : [])])]
  };
}

export function route(hint) {
  const root = path.resolve(import.meta.dirname, '..');
  const manifestPath = path.join(root, 'config/router-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return Decide(hint, manifest);
}

function parseCliArgs(args) {
  const hint = [];
  let eventFile = process.env.MING_SKILLS_EVENT_FILE;
  let workUnitId = process.env.MING_SKILLS_WORK_UNIT_ID;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--event-file') {
      if (!args[index + 1]) throw new Error('usage: --event-file requires a path');
      eventFile = args[++index];
    } else if (arg.startsWith('--event-file=')) {
      eventFile = arg.slice('--event-file='.length);
      if (!eventFile) throw new Error('usage: --event-file requires a path');
    } else if (arg === '--work-unit-id') {
      if (!args[index + 1]) throw new Error('usage: --work-unit-id requires a value');
      workUnitId = args[++index];
    } else if (arg.startsWith('--work-unit-id=')) {
      workUnitId = arg.slice('--work-unit-id='.length);
      if (!workUnitId) throw new Error('usage: --work-unit-id requires a value');
    } else {
      hint.push(arg);
    }
  }
  return { hint: hint.join(' '), eventFile, workUnitId };
}

function elapsedMs(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1e6;
}

export function runRouteCli(args = process.argv.slice(2)) {
  const startedAt = process.hrtime.bigint();
  let options;
  try {
    options = parseCliArgs(args);
    const decision = route(options.hint);
    console.log(JSON.stringify(decision, null, 2));
    if (options.eventFile) {
      try {
        emitEvent(createRouteDecidedEvent({
          hint: options.hint,
          decision,
          duration: elapsedMs(startedAt),
          workUnitId: options.workUnitId
        }), options.eventFile);
      } catch {
        console.error('route_observability_failed: event output unavailable');
      }
    }
    return 0;
  } catch (error) {
    const hint = options?.hint ?? args.filter(arg => !arg.startsWith('--')).join(' ');
    if (options?.eventFile) {
      try {
        emitEvent(createRouteFailedEvent({
          hint,
          duration: elapsedMs(startedAt),
          workUnitId: options.workUnitId,
          error
        }), options.eventFile);
      } catch {
        console.error('route_observability_failed: event output unavailable');
      }
    }
    console.error(`route_failed: ${error.message}`);
    return 1;
  }
}

function isEntryScript() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryScript()) {
  process.exitCode = runRouteCli();
}
