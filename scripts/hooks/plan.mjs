// scripts/hooks/plan.mjs
// ming-skills 门禁影响面计划器 (Affected Impact Planner)
// 依据暂存区 (pre-commit) 或推送引用 (pre-push) 的变更文件，确定执行门禁任务集合。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');

export const GLOBAL_UPGRADE_PATTERNS = [
  /^registry\.yaml$/,
  /^\.hooksrc$/,
  /^\.githooks\//,
  /^scripts\/hooks\//,
  /^scripts\/lib\//,
  /^tests\/run\.mjs$/,
  /^config\/router-manifest\.json$/,
  /^private\/ming-skills-router\//
];

export const CATEGORY_RULES = [
  {
    name: 'docs',
    test: file => /^docs\/|^README\.md$|\.md$|^LICENSE$/i.test(file),
    jobs: [] // 仅需暂存区静态防御扫描，0 个测试套件
  },
  {
    name: 'router',
    test: file => /^scripts\/route-|^scripts\/build-router-manifest\.mjs$|^tests\/benchmarks\/|^config\//.test(file),
    jobs: [
      'manifest-unit',
      'route-golden',
      'adapter-contract',
      'route-decision-compatibility',
      'route-effects',
      'route-safety',
      'manifest-freshness'
    ]
  },
  {
    name: 'supply_chain',
    test: file => /^artifacts\/|^scripts\/(?:check|generate)-supply-chain|^docs\/schemas\/.*(?:supply-chain|sbom|sca)/.test(file),
    jobs: [
      'supply-chain-gate',
      'sbom-generation',
      'sca-generation'
    ]
  },
  {
    name: 'cli',
    test: file => /^scripts\/[a-z0-9-_]+\.ps1$|^tests\/integration\/test-cli-tools/.test(file),
    jobs: [
      'cli-isolated',
      'yaml-contract',
      'lint-contract'
    ]
  },
  {
    name: 'observability',
    test: file => /observability/i.test(file),
    jobs: [
      'observability-contract'
    ]
  },
  {
    name: 'tests',
    test: file => /^tests\//.test(file),
    resolveJobs: file => {
      if (/test-validate-hooks/.test(file)) return ['hook-validation'];
      if (/test-build-manifest/.test(file)) return ['manifest-unit'];
      if (/test-adapter-contract/.test(file)) return ['adapter-contract'];
      if (/test-observability-contract/.test(file)) return ['observability-contract'];
      if (/test-route-decision-compatibility/.test(file)) return ['route-decision-compatibility'];
      if (/test-supply-chain-gate/.test(file)) return ['supply-chain-gate'];
      if (/test-sbom-generation/.test(file)) return ['sbom-generation'];
      if (/test-sca-generation/.test(file)) return ['sca-generation'];
      if (/test-lint-contract/.test(file)) return ['lint-contract'];
      if (/test-route-effects/.test(file)) return ['route-effects'];
      if (/test-route-safety/.test(file)) return ['route-safety'];
      if (/test-hook-index/.test(file)) return ['hook-index'];
      if (/test-yaml-lite/.test(file)) return ['yaml-contract'];
      if (/test-cli-tools/.test(file)) return ['cli-isolated'];
      if (/test-hook-planner/.test(file)) return ['hook-planner'];
      return ['hook-validation', 'manifest-unit', 'adapter-contract'];
    }
  }
];

export const ALL_SUITE_NAMES = [
  'hook-validation',
  'manifest-unit',
  'route-golden',
  'adapter-contract',
  'observability-contract',
  'route-decision-compatibility',
  'supply-chain-gate',
  'sbom-generation',
  'sca-generation',
  'lint-contract',
  'hook-planner',
  'route-effects',
  'route-safety',
  'hook-index',
  'yaml-contract',
  'cli-isolated',
  'manifest-freshness'
];

/**
 * 核心计划规划器
 * @param {Object} options
 * @param {'pre-commit'|'pre-push'} options.stage
 * @param {string[]} options.files - 相对仓库根目录的文件路径
 * @returns {Object} 规划报告
 */
export function createPlan({ stage = 'pre-commit', files = [] } = {}) {
  const normalizedFiles = files.map(f => f.replace(/\\/g, '/')).filter(Boolean);
  const categories = new Set();
  const jobs = new Set();
  const explanations = [];
  let fallback = null;

  if (normalizedFiles.length === 0) {
    return {
      stage,
      snapshot: stage === 'pre-commit' ? 'staged' : 'pushed_refs',
      files: [],
      categories: [],
      jobs: [],
      fallback: null,
      explanations: ['no modified files detected']
    };
  }

  // 1. 检查全局升级规则 (fail-closed)
  for (const file of normalizedFiles) {
    for (const pattern of GLOBAL_UPGRADE_PATTERNS) {
      if (pattern.test(file)) {
        fallback = 'global_upgrade_fail_closed';
        explanations.push(`file '${file}' matches global upgrade rule '${pattern.source}', upgrading to full test matrix`);
        return {
          stage,
          snapshot: stage === 'pre-commit' ? 'staged' : 'pushed_refs',
          files: normalizedFiles,
          categories: ['global_infrastructure'],
          jobs: ALL_SUITE_NAMES,
          fallback,
          explanations
        };
      }
    }
  }

  // 2. 逐文件进行分类映射
  for (const file of normalizedFiles) {
    let matched = false;
    for (const rule of CATEGORY_RULES) {
      if (rule.test(file)) {
        matched = true;
        categories.add(rule.name);
        const resolved = rule.resolveJobs ? rule.resolveJobs(file) : rule.jobs;
        for (const j of resolved) jobs.add(j);
        explanations.push(`file '${file}' mapped to category '${rule.name}' -> +[${resolved.join(', ') || 'static-only'}]`);
      }
    }
    // 未知路径：直接 fail-closed 升级全量
    if (!matched) {
      fallback = 'unknown_path_fail_closed';
      explanations.push(`unrecognized path '${file}' has no deterministic classifier, fail-closed upgrading to full matrix`);
      return {
        stage,
        snapshot: stage === 'pre-commit' ? 'staged' : 'pushed_refs',
        files: normalizedFiles,
        categories: [...categories, 'unknown'],
        jobs: ALL_SUITE_NAMES,
        fallback,
        explanations
      };
    }
  }

  // 3. 结果排序（保持确定性输出）
  return {
    stage,
    snapshot: stage === 'pre-commit' ? 'staged' : 'pushed_refs',
    files: [...normalizedFiles].sort(),
    categories: [...categories].sort(),
    jobs: [...jobs].sort(),
    fallback: null,
    explanations
  };
}

/**
 * 获取当前 git 暂存区文件列表
 */
export function getStagedFiles(cwd = ROOT) {
  try {
    const output = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    return output.split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * 命令行入口
 */
export function runCli() {
  const args = process.argv.slice(2);
  let stage = 'pre-commit';
  let explain = false;
  let json = false;
  let customFiles = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--stage') {
      stage = args[++i];
    } else if (arg === '--explain') {
      explain = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--files') {
      customFiles = args[++i].split(',').map(s => s.trim()).filter(Boolean);
    } else {
      console.error('usage: node scripts/hooks/plan.mjs [--stage <pre-commit|pre-push>] [--explain] [--json] [--files <f1,f2>]');
      process.exit(2);
    }
  }

  const files = customFiles || (stage === 'pre-commit' ? getStagedFiles() : []);
  const plan = createPlan({ stage, files });

  if (json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  console.log(`[plan] stage=${plan.stage} snapshot=${plan.snapshot} files=${plan.files.length} categories=[${plan.categories.join(', ')}] jobs=[${plan.jobs.join(', ')}]${plan.fallback ? ` fallback=${plan.fallback}` : ''}`);
  if (explain) {
    console.log('Explanations:');
    for (const exp of plan.explanations) {
      console.log(`  - ${exp}`);
    }
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/hooks/plan.mjs')) {
  runCli();
}