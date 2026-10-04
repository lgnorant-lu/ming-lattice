// scripts/hooks/engine.mjs
// ming-skills Git Hook 门禁引擎（gate 目录 + 声明式正则门 双源调度器）
//
// 入口契约：
//   node engine.mjs <stage> [args]   pre-commit | commit-msg <msgfile> | pre-push (stdin refs)
//   node engine.mjs run check|ci     命名运行组：check=staged 源 / ci=全跟踪文件源（CI 同构）
//   node engine.mjs run fix [--dry-run]   自愈组：fixable 门重写工作区文件（--dry-run 同路径预览不写盘）
//   node engine.mjs baseline [--dry-run]  冻结既有违规 → .hooks-baseline.json（--dry-run 只预告不写）
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
import { loadHookEngineConfig, resolveLevel, resolveGateConfigFor, parseSkipSet, parseCadence, LEVELS } from './lib/config.mjs';
import { repoRoot, fileSource, batchMeta, listUnstagedOverlap, makeGit, hasStagedChanges } from './lib/files.mjs';
import { detectGitState, shouldSkip } from './lib/git-state.mjs';
import { loadBaseline, freshFindings, writeBaseline, baselinePath } from './lib/baseline.mjs';
import { checkIntegrity, writeTrust, checkAdoptionHealth, orphanGateIds, checkKeyspace, lastRunAt, stampRun, readState } from './lib/integrity.mjs';
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
      else console.warn(`[engine] [WARN] ${dir === NATIVE_GATES_DIR ? 'gates' : 'gates.local'}/${name} 未导出 gate 对象——已跳过`);
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
  // post-checkout 文件级检出（flag=0）兜底——shim 已闸控，直跑防御
  if (stage === 'post-checkout' && opts.checkout?.flag === '0') return 0;
  const root = repoRoot();
  const cfg = loadHookEngineConfig(root);

  // gates/ 完整性检查（透明性特性：变化可见；integrityLevel=error 于阻断
  // 阶段升格拦截——fail-closed 防门禁被篡改静默降级，engine trust 重签为正路）
  const integrityLevel = cfg.flat.integrityLevel ?? 'warn';
  const integrity = integrityLevel !== 'off' ? checkIntegrity(root, HOOKS_DIR) : 'ok';
  // bootstrap 首次存值亦须可见——透明性特性在"建档时刻"同样要出声
  if (integrity === 'bootstrap')
    console.log('[engine] 完整性基线首次建档——hooks 树已存值，后续改动将报 changed');
  const integrityBreach = integrity === 'changed';
  const integrityBlocking = integrityBreach && integrityLevel === 'error'
    && BLOCKING_STAGES.has(stage);
  if (integrityLevel !== 'off') {
    if (integrityBreach) {
      const imsg = 'hooks 树（根 .mjs/gates/gates.local/lib）内容与上次确认不一致（分支切换或手工改动）——确认无误请执行: node scripts/hooks/engine.mjs trust';
      if (integrityBlocking) console.error(`[engine] [ERROR] ${imsg}`);
      else console.warn(`[engine] [WARN] ${imsg}`);
    }
    // 采纳层健康：.githooks shim 模板对账 + 引擎引用可达性
    for (const f of checkAdoptionHealth(root)) {
      console.warn(`[engine] [WARN] ${f.file} — ${f.message}`);
    }
  }

  const nativeGates = await loadNativeGates();
  const declGates = buildDeclarativeGates(cfg);
  // .hooksrc gate.<id>.* 孤儿键对账——配置指向未装载的门（改名/删除残留）
  // + [glob] 分节诊断（畸形节告警 + 节内孤儿键——同族对账延伸至覆盖层）
  if (integrityLevel !== 'off') {
    const loadedIds = new Set([...nativeGates, ...declGates].map(g => g.id));
    // 声明式门 id 与原生门撞名——无覆盖语义，两者均执行（消歧提醒）
    const declIds = new Set(declGates.map(g => g.id));
    for (const g of nativeGates)
      if (declIds.has(g.id))
        console.warn(`[engine] [WARN] 声明式门 ${g.id} 与原生门撞名——两门均执行，配置面请自查`);
    for (const id of orphanGateIds(cfg.gates, loadedIds)) {
      console.warn(`[engine] [WARN] .hooksrc 孤儿键: gate.${id}.* 指向未装载的门`);
    }
    for (const w of cfg.sectionWarnings ?? []) {
      console.warn(`[engine] [WARN] .hooksrc ${w}`);
    }
    for (const sec of cfg.sections ?? []) {
      for (const k of Object.keys(sec.entries)) {
        const m = k.match(/^gate\.([^.]+)\./);
        if (m && !loadedIds.has(m[1]))
          console.warn(`[engine] [WARN] .hooksrc [${sec.glob}] 孤儿键: gate.${m[1]}.* 指向未装载的门`);
      }
    }
    // 键空间对账：.hooksrc*/.hooksrc.tmpl 的 gate.X.Y/chore.X.Y vs configKeys+通用键+声明式键
    for (const f of checkKeyspace(root, nativeGates)) {
      console.warn(`[engine] [WARN] ${f.file} — ${f.message}`);
    }
  }
  const chores = buildChores(cfg);
  const skip = parseSkipSet();
  const gitState = detectGitState(root);
  const blocking = BLOCKING_STAGES.has(stage);

  // 阶段上下文——post-merge 默认 ORIG_HEAD..HEAD；post-checkout 用 old..new
  // （clone/零 SHA 退化 'all' 源）；其余 staged
  const defaultSource = stage === 'post-merge'
    ? { source: 'range', range: 'ORIG_HEAD..HEAD' }
    : stage === 'post-checkout'
      ? (opts.checkout?.oldSha && !/^0+$/.test(opts.checkout.oldSha)
          ? { source: 'range', range: `${opts.checkout.oldSha}..${opts.checkout.newSha || 'HEAD'}` }
          : { source: 'all' })
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

  if (stage === 'pre-commit' || stage === 'ci' || stage === 'check' || stage === 'post-merge' || stage === 'post-checkout') {
    try {
      ctx.files = src.list();
    } catch (e) {
      // post-merge/post-checkout 容错：ORIG_HEAD/range 缺席（非 merge 场景/无效 SHA 直跑）时退化
      if (stage === 'post-merge' || stage === 'post-checkout') return 0;
      throw e;
    }
    // integrityBlocking 不得被零暂存早退吞掉——fail-closed 语义优先
    // 纯删除提交同理：ACMR 清单空≠无变更——needsAllFiles 门(impact-test/verify affected)
    // 对 `git rm tests/...` 类提交必须仍跑，否则覆盖自毁零门禁放行
    if (ctx.files.length === 0 && stage === 'pre-commit' && !integrityBlocking
        && !hasStagedChanges(root)) return 0;
    // stagedEmpty 回填：skipIf=staged-empty 的求值依赖作用域文件集，
    // detectGitState 构造时清单未出（range/all 源同语义=空集即空）
    gitState.stagedEmpty = ctx.files.length === 0;
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
    // post-merge/post-checkout 容错：空增量（无实质检出差异）时退化为空集
    if ((stage === 'post-merge' || stage === 'post-checkout') && ctx.files.length === 0) return 0;
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
  if (integrityBlocking) {
    errors.push({ gate: 'integrity', file: '-', level: 'error', resolvedLevel: 'error',
      message: 'hooks 树完整性与信任基线不一致——改动门禁/引擎/lib 后须 engine trust 重签，或回退未授权改动' });
  }

  const execGates = async (list) => {
    for (const g of list) {
      const level = resolveLevel(g.id, g.defaultLevel ?? 'warn', cfg);
      if (level === 'off') continue;
      // chore 门 id 带 'chore:' 前缀——配置桶与裸键归一化（level/cadence/gateConfig 同口径）
      const bareId = g.chore ? g.id.slice(6) : g.id;
      const cfgBucket = g.chore ? (cfg.chores ?? {}) : cfg.gates;
      // cadence 节流（周期维度：<n>d|h|m|s，state.json lastRun 盖戳；非法值告警并按每次跑处理）
      const cadenceRaw = cfgBucket[bareId]?.cadence;
      let cadenceMs = null;
      if (cadenceRaw !== undefined) {
        cadenceMs = parseCadence(cadenceRaw);
        if (cadenceMs === null) {
          console.warn(`[engine] [WARN] ${g.id}: cadence 值无法解析 "${cadenceRaw}"（按每次跑处理）`);
        } else if (Date.now() - lastRunAt(root, g.id) < cadenceMs) {
          console.log(`[engine] cadence 未到跳过: ${g.id}`);
          continue;
        }
      }
      if ((skip.has(g.id) || skip.has(bareId)) && level !== 'required') {
        console.log(`[engine] SKIP 豁免: ${g.id}`);
        continue;
      }
      if (g.skipIf?.length && shouldSkip(g.skipIf, gitState)) {
        console.log(`[engine] skipIf 命中跳过: ${g.id}`);
        continue;
      }
      ctx.gateConfig = cfgBucket[bareId] ?? {};
      // 分节解析：gateConfig 维持全局视图（旧门零改动）；gateConfigFor(file) 按 [glob] 节链解析
      ctx.gateConfigFor = f => resolveGateConfigFor(cfg, g.id, f);
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
      if (cadenceMs !== null) stampRun(root, g.id); // 已跑即盖戳（含异常——下次节流起算点）
      for (const raw of findings) {
        const fLevel = raw.level ?? level;
        const row = { ...raw, resolvedLevel: fLevel };
        if (baselineSet) {
          const [marked] = freshFindings([row], baselineSet);
          if (!marked.fresh) continue; // 冻结项不出声
          row.fresh = true;
          row.id = marked.id;
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

async function cmdBaseline(dryRun = false) {
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
      const rows = await g.run({ root, files: interested, read: src.read, meta: src.meta, gateConfig: cfg.gates[g.id] ?? {}, gateConfigFor: f => resolveGateConfigFor(cfg, g.id, f) });
      findings.push(...rows);
    } catch (e) {
      console.warn(`[baseline] ${g.id} 扫描异常: ${e.message}`);
    }
  }
  const bp = baselinePath(root, cfg);
  if (dryRun) {
    const byGate = {};
    for (const f of findings) byGate[f.gate] = (byGate[f.gate] ?? 0) + 1;
    console.log(`[baseline] (dry-run) 将冻结 ${findings.length} 条既有违规:`);
    for (const [g, n] of Object.entries(byGate).sort()) console.log(`  ${g}: ${n}`);
    console.log('[baseline] 未写入。确认后去掉 --dry-run 执行');
    return 0;
  }
  const n = writeBaseline(bp, findings);
  console.log(`[baseline] 已冻结 ${n} 条既有违规 → ${path.relative(root, bp)}`);
  console.log('[baseline] 后续提交将只拦截新增违规。建议 review 后入仓共享冻结。');
  return 0;
}

// run fix：可自愈门的工作区修复（不碰 index——re-stage 由用户确认）
// --dry-run：同一遍历路径预览（gate.fix 收 ctx.dryRun，只报告不写盘）
async function cmdFix(dryRun = false) {
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
      const fixed = await g.fix({ root, files: scope, gateConfig: gcfg, gateConfigFor: f => resolveGateConfigFor(cfg, g.id, f), dryRun });
      for (const p of fixed ?? []) {
        console.log(`[fix] ${g.id}: ${p} ${dryRun ? '将被修复' : '已修复（请 git add 重新暂存）'}`); total++;
      }
    } catch (e) {
      console.warn(`[fix] ${g.id} 修复异常: ${e.message}`);
    }
  }
  console.log(total
    ? `[fix] ${dryRun ? `(dry-run) 将修复 ${total} 个文件——确认后去掉 --dry-run 执行` : `共修复 ${total} 个文件`}`
    : '[fix] 无需修复');
  return 0;
}

async function cmdList() {
  const root = repoRoot();
  const cfg = loadHookEngineConfig(root);
  const skip = parseSkipSet();
  // 采纳元数据：目标仓记录的 kit 来源版本（install 写入）；源仓可达时对账落后
  const adoption = readState(root).adoption;
  if (adoption?.sourceRepo) {
    let lag = '';
    try {
      const git = makeGit(root);
      const cur = git(['-C', adoption.sourceRepo, 'rev-parse', 'HEAD']).trim();
      if (cur !== adoption.sourceRev) {
        const n = git(['-C', adoption.sourceRepo, 'rev-list', '--count', `${adoption.sourceRev}..${cur}`]).trim();
        lag = ` — 落后 ${n} 提交（重跑 install-hooks 更新）`;
      } else lag = ' — 已最新';
    } catch { /* 源仓不可达——只报记录值 */ }
    console.log(`[engine] kit 来源: ${adoption.sourceRepo}@${String(adoption.sourceRev).slice(0, 8)} 铺于 ${adoption.adoptedAt}${lag}`);
  }
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
      if (group === 'fix') return await cmdFix(rest.includes('--dry-run'));
      const rangeArg = rest.find(a => a.startsWith('--range='))?.slice(8);
      const source = rangeArg ? { source: 'range', range: rangeArg }
        : group === 'ci' ? { source: 'all' } : { source: 'staged' };
      return await runStage(group === 'ci' ? 'ci' : 'check', { fileSource: source });
    }
    if (cmd === 'baseline') return await cmdBaseline(rest.includes('--dry-run'));
    if (cmd === 'trust') { writeTrust(repoRoot()); console.log('[engine] hooks 树完整性存值已更新'); return 0; }
    if (cmd === 'list') return await cmdList();
    if (cmd === 'commit-msg') return await runStage('commit-msg', { msgPath: rest[0] });
    if (cmd === 'post-merge') return await runStage('post-merge');
    if (cmd === 'post-checkout') {
      const [oldSha, newSha, flag] = rest;
      return await runStage('post-checkout', { checkout: { oldSha, newSha, flag } });
    }
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
