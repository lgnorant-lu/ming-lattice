// scripts/route-core.mjs
// ming-skills 核心路由决策纯函数 (与 Harness 无关 / 零 I/O / 零副作用)
// 核心设计: 解耦 candidates (高召回供给清单) 与 active_recipe (高精度默认装配)

import fs from 'node:fs';
import path from 'node:path';

/**
 * 核心决策纯函数
 * @param {string} hint 用户意图文本
 * @param {object} manifest 编译后的机读路由清单 (RouterManifest)
 * @returns {object} RouteDecision 结构体
 */
export function Decide(hint, manifest) {
  const text = (typeof hint === 'string' ? hint : '').trim().toLowerCase();

  // 1. 空意图直接拒识
  if (!text) {
    return {
      domain: 'none',
      confidence: 'none',
      candidates: [],
      active_recipe: { name: '', skills: [] },
      action: 'handoff',
      side_effects: 'none',
      must_not: ['initReverseCase', 'create_work_dir'],
      reasons: ['empty_hint']
    };
  }

  const reasons = [];
  const domains = manifest?.domains || {};
  const recipes = manifest?.recipes || {};

  // 2. 规则 1: 显式点名具体技能包 (Explicit Skill Mention)
  for (const [domName, domInfo] of Object.entries(domains)) {
    for (const skill of (domInfo.skills || [])) {
      if (text.includes(skill.toLowerCase())) {
        reasons.push(`explicit_skill_hit: ${skill}`);
        let targetSkills = [skill];
        if (domName === 'testing' && skill !== 'testing-core-oracle') {
          targetSkills = ['testing-core-oracle', skill];
        }

        const mustNot = ['create_work_dir'];
        if (domName !== 'reverse') {
          mustNot.push('initReverseCase');
        }

        return {
          domain: domName,
          confidence: 'high',
          candidates: domInfo.skills || targetSkills, // 依然保留全域候选供模型参考
          active_recipe: {
            name: domInfo.defaultRecipe || 'explicit-dispatch',
            skills: targetSkills
          },
          action: 'dispatch',
          side_effects: 'none',
          must_not: mustNot,
          reasons
        };
      }
    }
  }

  // 3. 计算各领域正向命中与负向命中
  const domainScores = {};
  const negativeHits = {};

  for (const [domName, domInfo] of Object.entries(domains)) {
    let score = 0;
    const negs = [];

    // 正向 Triggers 命中统计
    for (const trig of (domInfo.triggers || [])) {
      if (text.includes(trig.toLowerCase())) {
        score += 1;
      }
    }

    // 负向 Negatives 命中统计
    for (const neg of (domInfo.negatives || [])) {
      if (text.includes(neg.toLowerCase())) {
        negs.push(neg);
      }
    }

    negativeHits[domName] = negs;
    domainScores[domName] = score;
  }

  // 4. 判定领域闸门
  // 注意：负向命中阻断的是该领域的单独 PRIMARY dispatch 与副作用，但在复合任务中不截断 candidates
  const isTestingPositive = (domainScores.testing || 0) > 0;
  const isReversePositive = (domainScores.reverse || 0) > 0;
  const isReverseNegHit = (negativeHits.reverse || []).length > 0;

  if (isReverseNegHit) {
    reasons.push(`negatives_hit[reverse]: ${negativeHits.reverse.join(', ')}`);
  }

  // 5. 分流逻辑决策
  // 5.1 复合意图 (Composite Domain): 同时命中测试与逆向正向特征 -> 必须输出双域完整候选集供模型裁剪
  if (isTestingPositive && isReversePositive) {
    reasons.push('composite_domain_hit: testing + reverse');
    const combinedCandidates = [
      ...(domains.testing?.skills || []),
      ...(domains.reverse?.skills || [])
    ];
    return {
      domain: 'mixed',
      confidence: 'medium',
      candidates: combinedCandidates, // 双域全量候选高召回
      active_recipe: {
        name: 'mixed-reverse-testing',
        skills: ['testing-core-oracle', 'reverse-skill-router']
      },
      action: 'ask',
      side_effects: 'none',
      must_not: ['initReverseCase', 'create_work_dir'], // 严禁副作用
      reasons
    };
  }

  // 5.2 纯测试意图 (或逆向正向为0) -> testing 域全量 11 包高召回
  if (isTestingPositive) {
    reasons.push(`domain_selected: testing (score=${domainScores.testing})`);

    // 细粒度测试配方装配逻辑 (高精度 active_recipe)
    let selectedRecipeKey = 'spec-driven-greenfield';
    if (text.includes('盘点') || text.includes('讲述') || text.includes('找找') || text.includes('覆盖设计') || text.includes('规范族') || text.includes('体系')) {
      selectedRecipeKey = 'testing-overview-catalog';
    } else if (text.includes('cli') || text.includes('脚本') || text.includes('退出码') || text.includes('命令行')) {
      selectedRecipeKey = 'cli-tool-spec';
    } else if (text.includes('ffi') || text.includes('v8') || text.includes('pyo3') || text.includes('跨语言') || text.includes('嵌入')) {
      selectedRecipeKey = 'embed-ffi-greenfield';
    } else if (text.includes('爬虫') || text.includes('采集') || text.includes('scraper') || text.includes('清洗')) {
      selectedRecipeKey = 'scraper-pipeline';
    } else if (text.includes('表征') || text.includes('锁定') || text.includes('遗留') || text.includes('characteriz')) {
      selectedRecipeKey = 'characterization-brownfield';
    }

    const recipeSkills = recipes[selectedRecipeKey]?.skills || ['testing-core-oracle', 'testing-workflow-spec'];

    return {
      domain: 'testing',
      confidence: domainScores.testing >= 2 ? 'high' : 'medium',
      candidates: domains.testing?.skills || [], // 全量 11 包完整供给，杜绝空缺
      active_recipe: {
        name: selectedRecipeKey,
        skills: recipeSkills
      },
      action: 'dispatch',
      side_effects: 'none',
      must_not: ['initReverseCase', 'create_work_dir'],
      reasons
    };
  }

  // 5.3 纯逆向意图 (正向命中且无测试负向)
  if (isReversePositive && !isReverseNegHit) {
    reasons.push(`domain_selected: reverse (score=${domainScores.reverse})`);
    return {
      domain: 'reverse',
      confidence: domainScores.reverse >= 2 ? 'high' : 'medium',
      candidates: domains.reverse?.skills || ['reverse-skill-router'],
      active_recipe: {
        name: 'reverse-general',
        skills: ['reverse-skill-router']
      },
      action: 'dispatch',
      side_effects: 'none',
      must_not: ['create_work_dir_without_auth'],
      reasons
    };
  }

  // 5.4 UI 领域意图
  if ((domainScores.ui || 0) > 0) {
    reasons.push(`domain_selected: ui (score=${domainScores.ui})`);
    return {
      domain: 'ui',
      confidence: 'high',
      candidates: domains.ui?.skills || ['ui-design-paradigms'],
      active_recipe: {
        name: 'ui-design-standard',
        skills: ['ui-design-paradigms']
      },
      action: 'dispatch',
      side_effects: 'none',
      must_not: ['initReverseCase', 'create_work_dir'],
      reasons
    };
  }

  // 5.5 零命中 -> 拒识放行
  reasons.push('no_domain_triggers_matched');
  return {
    domain: 'none',
    confidence: 'none',
    candidates: [],
    active_recipe: { name: '', skills: [] },
    action: 'handoff',
    side_effects: 'none',
    must_not: ['initReverseCase', 'create_work_dir'],
    reasons
  };
}

/**
 * 通用适配层转换函数: 将 RouteDecision 翻译为具体 Harness 执行参数
 * @param {object} decision RouteDecision 结构体
 * @returns {object} 适配结果对象
 */
export function adapt(decision) {
  if (!decision || typeof decision !== 'object') {
    return {
      injectedCandidates: [],
      loadSkills: [],
      allowCaseInit: false,
      promptAction: 'handoff'
    };
  }

  const injectedCandidates = decision.candidates || [];
  const loadSkills = decision.active_recipe?.skills || [];
  const allowCaseInit = decision.domain === 'reverse' && decision.confidence === 'high' && !decision.must_not?.includes('initReverseCase');

  let promptAction = 'implement';
  if (decision.action === 'handoff') {
    promptAction = 'handoff';
  } else if (decision.action === 'ask') {
    promptAction = 'ask_clarification';
  } else if (decision.active_recipe?.name === 'testing-overview-catalog') {
    promptAction = 'overview_explain';
  }

  return {
    injectedCandidates,
    loadSkills,
    allowCaseInit,
    promptAction
  };
}

// 辅助函数: 便捷 CLI 调试
export function route(hint) {
  const root = path.resolve(import.meta.dirname, '..');
  const manifestPath = path.join(root, 'config/router-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`router-manifest.json 不存在，请先运行 scripts/build-router-manifest.mjs 编译`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return Decide(hint, manifest);
}

// CLI 执行入口
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1'))) {
  const hintArg = process.argv.slice(2).join(' ');
  const decision = route(hintArg);
  console.log(JSON.stringify(decision, null, 2));
}
