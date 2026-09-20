// scripts/hooks/engine.mjs
// ming-skills Git Hook 门禁引擎（gate 目录 + 声明式正则门 双源调度器）
//
// 入口契约：
//   node engine.mjs <stage> [args]   pre-commit | commit-msg <msgfile> | pre-push (stdin refs)
//   node engine.mjs run check|ci     命名运行组：check=staged 源 / ci=全跟踪文件源（CI 同构）
//   node engine.mjs run fix          自愈组：fixable 门重写工作区文件，报告清单待 re-stage
//   node engine.mjs baseline         冻结既有违规 → .hooks-baseline.json（只拦新增）
//   node engine.mjs trust            再确认 gates/ 目录完整性存值
//   node engine.mjs list             解析后的门清单（诊断用）
//
// 退出码契约：0=通过 / 1=门禁拦截 / 2=引擎自身故障（fail-closed 但可分辨）
//
// 等级语义：off < warn < error < required（required 不吃 SKIP；--no-verify 是 git 层无解，
//   真正门禁在 CI——本引擎 run ci 即 CI 侧同一配置入口）
//
// 索引保真不变量（D1）：staged 源下 gate 经 ctx.read 读索引 blob，禁止 fs.read 工作区；
//   all/range 源读工作区（CI 读已提交态，无污染问题）

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadHookEngineConfig, resolveLevel, parseSkipSet, LEVELS } from './lib/config.mjs';
import { repoRoot, fileSource, batchMeta, listUnstagedOverlap, makeGit } from './lib/files.mjs';
import { detectGitState, shouldSkip } from './lib/git-state.mjs';
import { loadBaseline, freshFindings, writeBaseline, baselinePath } from './lib/baseline.mjs';
import { checkIntegrity, writeTrust } from './lib/integrity.mjs';
import { buildDeclarativeGates } from './lib/declarative.mjs';
import { buildChores } from './lib/chores.mjs';
import { matchAnyGlobs } from './lib/matcher.mjs';

const HOOKS_DIR = path.resolve(import.meta.dirname);
const NATIVE_GATES_DIR = path.join(HOOKS_DIR, 'gates');
const LOCAL_GATES_DIR = path.join(HOOKS_DIR, 'gates.local');

// 阻断阶段：error 命中 → exit 1；其余阶段（post-merge 等）一律提醒式，exit 恒 0
const BLOCKING_STAGES = new Set(['pre-commit', 'commit-msg', 'pre-push', 'check', 'ci']);

async function loadNativeGates() {
  const gates = [];
  for (const dir of [NATIVE_GATES_DIR, LOCAL_GATES_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.mjs')).sort()) {
      const mod = await import(pathToFileURL(path.join(dir, name)).href);
      if (mod.gate) gates.push(mod.gate);
    }
  }
  return gates;
}

function reportFinding(f, level) {
  const tag = level.toUpperCase();
  const loc = f.file && f.file !== '-' ? `${f.file}${f.line ? `:${f.line}` : ''}` : '';
  const head = `[${tag}] ${f.gate}: ${loc ? loc + ' — ' : ''}${f.message}`;
  if (level === 'warn') console.warn(head);
  else console.error(head);
}

/**
 * 单阶段执行核心
 * @returns 0 通过 / 1 拦截
 */
async function runStage(stage, opts = {}) {
  const root = repoRoot();
  const cfg = loadHookEngineConfig(root);

  // gates/ 完整性提示（透明性特性：变化可见，不阻断）
  const integrityLevel = cfg.flat.integrityLevel ?? 'warn';
  if (integrityLevel !== 'off') {
    const st = checkIntegrity(root, NATIVE_GATES_DIR);
    if (st === 'changed') {
      console.warn('[engine] [WARN] gates/ 目录内容与上次确认不一致（分支切换或手工改动）——确认无误请执行: node scripts/hooks/engine.mjs trust');
    }
  }

  const nativeGates = await loadNativeGates();
  const declGates = buildDeclarativeGates(cfg);
  const chores = buildChores(cfg);
  const skip = parseSkipSet();
  const gitState = detectGitState(root);
  const blocking = BLOCKING_STAGES.has(stage);

  // 阶段上下文——post-merge 默认 ORIG_HEAD..HEAD 增量文件源
  const defaultSource = stage === 'post-merge'
    ? { source: 'range', range: 'ORIG_HEAD..HEAD' }
    : { source: 'staged' };
  const src = fileSource(root, opts.fileSource ?? defaultSource);
  const ctx = {
    root,
    stage,
    gitState,
    gateConfig: null, // 运行期指向当前门的 cfg.gates[id]
    msgPath: opts.msgPath,
    pushOps: opts.pushOps,
    read: src.read,
    meta: null,
    files: [],
  };

  if (stage === 'pre-commit' || stage === 'ci' || stage === 'check' || stage === 'post-merge') {
    try {
      ctx.files = src.list();
    } catch (e) {
      // post-merge 容错：ORIG_HEAD 缺席（非 merge 场景/直跑）时退化为空集
      if (stage === 'post-merge') return 0;
      throw e;
    }
    if (ctx.files.length === 0 && stage === 'pre-commit') return 0;
    if (src.source === 'staged') {
      const metaMap = batchMeta(root, ctx.files);
      ctx.meta = p => metaMap.get(p);
      // 部分暂存重叠提示（现状行为保留）
      const overlap = listUnstagedOverlap(root, ctx.files);
      if (overlap.length > 0) {
        console.warn(`[pre-commit] [WARN] 检测到 ${overlap.length} 个暂存文件在工作树存在未暂存的后续修改 (例如: ${overlap.slice(0, 3).join(', ')}${overlap.length > 3 ? '...' : ''})。`);
        console.warn('        提示: 静态扫描读取暂存 blob，而测试套件基于工作树执行。若有未暂存修改，请仔细复核快照一致性！');
      }
    } else {
      ctx.meta = src.meta;
    }
    // post-merge 容错：ORIG_HEAD 缺席（非 merge 场景直跑）时退化为空集
    if (stage === 'post-merge' && ctx.files.length === 0) return 0;
  }

  // baseline：仅文件型阶段应用（commit-msg 等瞬态门不冻结）
  const baselineSet = (stage === 'pre-commit' || stage === 'check' || stage === 'ci')
    ? loadBaseline(baselinePath(root, cfg)) : null;
  if (baselineSet && baselineSet.size > 0) {
    console.log(`[engine] baseline 生效中（${baselineSet.size} 条既有违规冻结，仅拦新增）`);
  }

  const applicable = [...nativeGates, ...declGates, ...chores]
    .filter(g => (g.stages ?? ['pre-commit']).includes(stage === 'ci' || stage === 'check' ? 'pre-commit' : stage));

  const errors = [];
  const warnings = [];
  let skippedExpensive = false;

  const execGates = async (list) => {
    for (const g of list) {
      const level = resolveLevel(g.id, g.defaultLevel ?? 'warn', cfg);
      if (level === 'off') continue;
      if (skip.has(g.id) && level !== 'required') {
        console.log(`[engine] SKIP 豁免: ${g.id}`);
        continue;
      }
      if (g.skipIf?.length && shouldSkip(g.skipIf, gitState)) {
        console.log(`[engine] skipIf 命中跳过: ${g.id}`);
        continue;
      }
      ctx.gateConfig = cfg.gates[g.id] ?? {};
      // 配置覆盖：gate.X.globs 整体替换感兴趣域；gate.X.exclude 在门默认排除上追加
      const cfgGlobs = ctx.gateConfig.globs?.split(',').map(s => s.trim()).filter(Boolean);
      const cfgExclude = ctx.gateConfig.exclude?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
      const effGlobs = cfgGlobs ?? g.globs;
      const effExclude = [...(g.exclude ?? []), ...cfgExclude];
      // globs/exclude 作为"感兴趣文件"短路面（needsAllFiles 门豁免）
      if (ctx.files.length && !g.needsAllFiles && effGlobs) {
        const interested = ctx.files.filter(f =>
          matchAnyGlobs(f, effGlobs) && !matchAnyGlobs(f, effExclude));
        if (interested.length === 0) continue;
        ctx.gateFiles = interested;
      } else {
        ctx.gateFiles = ctx.files;
      }
      if (g.available && !g.available(ctx)) {
        console.log(`[engine] [I] ${g.id}: 前置缺席自动跳过（按需启用）`);
        continue;
      }
      let findings;
      try {
        // 原生门 ctx.files 传过滤后清单；impact-test 类需全量的门设 needsAllFiles
        const subCtx = { ...ctx, files: g.needsAllFiles ? ctx.files : ctx.gateFiles };
        findings = await g.run(subCtx) ?? [];
      } catch (e) {
        findings = [{ gate: g.id, file: '-', message: `门执行异常: ${e.message}`, level: 'error' }];
      }
      for (const raw of findings) {
        const fLevel = raw.level ?? level;
        const row = { ...raw, resolvedLevel: fLevel };
        if (baselineSet) {
          const [marked] = freshFindings([row], baselineSet);
          if (!marked.fresh) continue; // 冻结项不出声
          row.fresh = true;
        }
        if (fLevel === 'warn') warnings.push(row);
        else errors.push(row);
      }
    }
  };

  const cheap = applicable.filter(g => !g.expensive);
  const expensive = applicable.filter(g => g.expensive);
  await execGates(cheap);
  if (errors.length === 0) {
    await execGates(expensive);
  } else if (expensive.length) {
    skippedExpensive = true;
    console.log(`[engine] 已有 error 级命中，跳过昂贵门: ${expensive.map(g => g.id).join(', ')}`);
  }

  // 非阻断阶段（chore 宿主）：全部命中降级为提醒式输出，exit 恒 0
  if (!blocking) {
    for (const w of [...warnings, ...errors]) {
      const tag = w.gate?.startsWith('chore:') ? 'chore' : 'warn';
      console.warn(`[${tag}] ${w.gate}: ${w.file && w.file !== '-' ? w.file + ' — ' : ''}${w.message}`);
    }
    return 0;
  }

  for (const w of warnings) reportFinding(w, 'warn');
  for (const e of errors) reportFinding(e, e.resolvedLevel === 'required' ? 'error' : e.resolvedLevel);

  if (errors.length > 0) {
    console.error(`\n==================== [ming-skills ${stage} 门禁未通过] ====================`);
    console.error(`拦截 ${errors.length} 项违规 (warn ${warnings.length} 项)——修复后重试，或 SKIP=<gate> 临时豁免（required 级不吃 SKIP）`);
    console.error('===========================================================================\n');
    return 1;
  }
  if (stage === 'pre-commit') console.log('[pre-commit] 全项门禁检查通过！\n');
  return 0;
}

// ---------- 命名运行组 / 管理子命令 ----------

async function cmdBaseline() {
  const root = repoRoot();
  const cfg = loadHookEngineConfig(root);
  const src = fileSource(root, { source: 'all' });
  const files = src.list();
  const nativeGates = await loadNativeGates();
  const declGates = buildDeclarativeGates(cfg);
  const findings = [];
  for (const g of [...nativeGates, ...declGates]) {
    if (g.expensive || !(g.stages ?? ['pre-commit']).includes('pre-commit')) continue;
    if (resolveLevel(g.id, g.defaultLevel ?? 'warn', cfg) === 'off') continue;
    const interested = files.filter(f => matchAnyGlobs(f, g.globs ?? ['*']) && !matchAnyGlobs(f, g.exclude ?? []));
    if (!interested.length) continue;
    try {
      const rows = await g.run({ root, files: interested, read: src.read, meta: src.meta, gateConfig: cfg.gates[g.id] ?? {} });
      findings.push(...rows);
    } catch (e) {
      console.warn(`[baseline] ${g.id} 扫描异常: ${e.message}`);
    }
  }
  const bp = baselinePath(root, cfg);
  const n = writeBaseline(bp, findings);
  console.log(`[baseline] 已冻结 ${n} 条既有违规 → ${path.relative(root, bp)}`);
  console.log('[baseline] 后续提交将只拦截新增违规。建议 review 后入仓共享冻结。');
  return 0;
}

// run fix：可自愈门的工作区修复（不碰 index——re-stage 由用户确认）
async function cmdFix() {
  const root = repoRoot();
  const cfg = loadHookEngineConfig(root);
  const src = fileSource(root, { source: 'staged' });
  let files;
  try { files = src.list(); } catch { files = []; }
  const all = [...await loadNativeGates(), ...buildDeclarativeGates(cfg)];
  const fixable = all.filter(g => g.fix && (g.stages ?? ['pre-commit']).includes('pre-commit'));
  if (!fixable.length) { console.log('[fix] 无可自愈门启用'); return 0; }
  let total = 0;
  for (const g of fixable) {
    if (resolveLevel(g.id, g.defaultLevel ?? 'warn', cfg) === 'off') continue;
    const gcfg = cfg.gates[g.id] ?? {};
    const globs = gcfg.globs?.split(',').map(s => s.trim()).filter(Boolean) ?? g.globs;
    const exclude = [...(g.exclude ?? []), ...(gcfg.exclude?.split(',').map(s => s.trim()).filter(Boolean) ?? [])];
    const scope = files.filter(f => matchAnyGlobs(f, globs ?? ['*']) && !matchAnyGlobs(f, exclude));
    if (!scope.length) continue;
    try {
      const fixed = await g.fix({ root, files: scope, gateConfig: gcfg });
      for (const p of fixed ?? []) { console.log(`[fix] ${g.id}: ${p} 已修复（请 git add 重新暂存）`); total++; }
    } catch (e) {
      console.warn(`[fix] ${g.id} 修复异常: ${e.message}`);
    }
  }
  console.log(total ? `[fix] 共修复 ${total} 个文件` : '[fix] 无需修复');
  return 0;
}

async function cmdList() {
  const root = repoRoot();
  const cfg = loadHookEngineConfig(root);
  const skip = parseSkipSet();
  for (const g of [...await loadNativeGates(), ...buildDeclarativeGates(cfg)]) {
    const level = resolveLevel(g.id, g.defaultLevel ?? 'warn', cfg);
    const flags = [
      g.declarative ? 'decl' : 'native',
      g.expensive ? 'expensive' : 'cheap',
      skip.has(g.id) && level !== 'required' ? 'SKIP' : '',
    ].filter(Boolean).join(',');
    console.log(`${level.padEnd(8)} ${g.id.padEnd(20)} [${(g.stages ?? ['pre-commit']).join('|')}] ${flags}`);
  }
  return 0;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd === 'run') {
      const group = rest.find(a => !a.startsWith('--')) ?? 'check';
      if (group === 'fix') return await cmdFix();
      const rangeArg = rest.find(a => a.startsWith('--range='))?.slice(8);
      const source = rangeArg ? { source: 'range', range: rangeArg }
        : group === 'ci' ? { source: 'all' } : { source: 'staged' };
      return await runStage(group === 'ci' ? 'ci' : 'check', { fileSource: source });
    }
    if (cmd === 'baseline') return await cmdBaseline();
    if (cmd === 'trust') { writeTrust(repoRoot()); console.log('[engine] gates/ 完整性存值已更新'); return 0; }
    if (cmd === 'list') return await cmdList();
    if (cmd === 'commit-msg') return await runStage('commit-msg', { msgPath: rest[0] });
    if (cmd === 'post-merge') return await runStage('post-merge');
    if (cmd === 'pre-push') {
      const { parsePushLines } = await import('./pre-push.mjs');
      const stdin = fs.readFileSync(0, 'utf8');
      return await runStage('pre-push', { pushOps: parsePushLines(stdin) });
    }
    if (cmd === 'pre-commit' || cmd === undefined) return await runStage('pre-commit');
    console.error(`[engine] 未知命令: ${cmd}`);
    return 2;
  } catch (e) {
    console.error(`[engine] 引擎故障: ${e.stack ?? e.message}`);
    return 2;
  }
}

const isDirect = process.argv[1]
  && /engine\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isDirect) {
  const code = await main();
  process.exit(code);
}

export { runStage, loadNativeGates };
