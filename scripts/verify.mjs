// scripts/verify.mjs
// ming-skills 综合质量门禁调度编排器
// 支持 profiles: quick | affected | full | release

import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createPlan, getStagedFiles } from './hooks/plan.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

const VALID_PROFILES = ['quick', 'affected', 'full', 'release'];

export function runStep(cmd, args, options = {}, json = false) {
  const display = `${cmd} ${args.join(' ')}`;
  const log = json ? console.error : console.log;
  log(`\n>>> [VERIFY] ${display}`);
  const stdio = json ? ['inherit', 'pipe', 'inherit'] : 'inherit';
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio, ...options });
  if (result.status !== 0) {
    console.error(`\n[FAIL] 门禁步骤执行失败 (exit ${result.status}): ${display}`);
    if (json && result.stdout) {
      process.stderr.write(result.stdout);
    }
    return false;
  }
  return true;
}

export function runVerification({ profile = 'full', json = false } = {}) {
  const startedAt = Date.now();
  const log = json ? console.error : console.log;
  log(`==================== [ming-skills 质量门禁: profile=${profile}] ====================`);

  let ok = true;
  const steps = [];
  const runVerifiedStep = (cmd, args, options = {}) => {
    const stepStartedAt = Date.now();
    const stepOk = runStep(cmd, args, options, json);
    const step = { command: cmd, args: [...args], ok: stepOk, durationMs: Date.now() - stepStartedAt };
    steps.push(step);
    log(`[VERIFY STEP] ${stepOk ? 'SUCCESS' : 'FAILED'} duration=${step.durationMs}ms ${cmd} ${args.join(' ')}`);
    return stepOk;
  };

  if (profile === 'quick') {
    // 快速档: 仅执行快速测试套件 (不启动外部 pwsh 进程池)
    ok = runVerifiedStep(process.execPath, ['tests/run.mjs', '--profile', 'quick']);
  } else if (profile === 'affected') {
    // 增量档: 由计划器确定受影响套件
    const staged = getStagedFiles(ROOT);
    const plan = createPlan({ stage: 'pre-commit', files: staged });
    log(`[verify:affected] 分类: [${plan.categories.join(', ')}], 任务: [${plan.jobs.join(', ')}]${plan.fallback ? ` (${plan.fallback})` : ''}`);
    if (plan.jobs.length === 0) {
      log('[verify:affected] 无受影响测试任务，直接放行。');
    } else {
      const args = ['tests/run.mjs', '--require-all'];
      if (!plan.fallback && plan.jobs.length > 0) {
        args.push('--suites', plan.jobs.join(','));
      }
      ok = runVerifiedStep(process.execPath, args);
    }
  } else if (profile === 'full') {
    // 全量档: 17 个测试套件 + 严格离线供应链静态门禁
    ok = runVerifiedStep(process.execPath, ['tests/run.mjs', '--require-all']);
    if (ok) {
      ok = runVerifiedStep(process.execPath, ['scripts/check-supply-chain.mjs', '--strict']);
    }
  } else if (profile === 'release') {
    // 发布档: 全量测试 + 严格供应链门禁 (含新鲜度比对) + 性能硬阈值 Benchmark
    ok = runVerifiedStep(process.execPath, ['tests/run.mjs', '--require-all']);
    if (ok) {
      ok = runVerifiedStep(process.execPath, ['scripts/check-supply-chain.mjs', '--strict', '--check-freshness']);
    }
    if (ok) {
      ok = runVerifiedStep(process.execPath, ['tests/benchmarks/route-performance.mjs', '--strict']);
    }
  }

  const durationMs = Date.now() - startedAt;
  log(`\n=============================================================================`);
  log(`[VERIFY RESULT] profile=${profile} status=${ok ? 'SUCCESS' : 'FAILED'} duration=${durationMs}ms`);
  log(`=============================================================================\n`);

  return { ok, profile, durationMs, steps };
}

export function runCli() {
  const args = process.argv.slice(2);
  let profile = 'full';
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--profile') {
      profile = args[++i];
      if (!VALID_PROFILES.includes(profile)) {
        console.error(`Invalid profile '${profile}'. Valid choices: ${VALID_PROFILES.join(', ')}`);
        process.exit(2);
      }
    } else if (arg === '--json') {
      json = true;
    } else {
      console.error('usage: node scripts/verify.mjs [--profile <quick|affected|full|release>] [--json]');
      process.exit(2);
    }
  }

  const result = runVerification({ profile, json });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  }
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/verify.mjs')) {
  runCli();
}
