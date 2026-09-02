// scripts/route-core.mjs
// ming-skills 核心路由决策纯函数 (与 Harness 无关 / 零 I/O / 零副作用)
// 契约: Decide(hint, manifest) -> RouteDecision

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
      skills: [],
      recipe: '',
      action: 'handoff',
      side_effects: 'none',
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
        return {
          domain: domName,
          confidence: 'high',
          skills: targetSkills,
          recipe: domInfo.defaultRecipe || '',
          action: 'dispatch',
          side_effects: 'none',
          reasons
        };
      }
    }
  }

  // 3. 计算各领域得分与负向命中
  const domainScores = {};
  const negativeHits = {};

  for (const [domName, domInfo] of Object.entries(domains)) {
    let score = 0;
    const negs = [];

    // 正向 Triggers 命中
    for (const trig of (domInfo.triggers || [])) {
      if (text.includes(trig.toLowerCase())) {
        score += 1;
      }
    }

    // 负向 Negatives 命中
    for (const neg of (domInfo.negatives || [])) {
      if (text.includes(neg.toLowerCase())) {
        negs.push(neg);
      }
    }

    negativeHits[domName] = negs;
    domainScores[domName] = score;
  }

  // 4. 关键领域闸门: 负向熔断 (特别是 reverse 桶对 testing/ui 负向硬阻断)
  for (const [domName, negs] of Object.entries(negativeHits)) {
    if (negs.length > 0) {
      reasons.push(`negatives_hit[${domName}]: ${negs.join(', ')}`);
      // 若负向命中，严厉扣分或直接熔断为 0
      domainScores[domName] = 0;
    }
  }

  // 5. 排序各领域得分
  const activeDomains = Object.entries(domainScores)
    .filter(([_, sc]) => sc > 0)
    .sort((a, b) => b[1] - a[1]);

  // 6. 分流结果判定
  // 6.1 零命中 -> 拒识 (None / Handoff)
  if (activeDomains.length === 0) {
    reasons.push('no_domain_triggers_matched');
    return {
      domain: 'none',
      confidence: 'none',
      skills: [],
      recipe: '',
      action: 'handoff',
      side_effects: 'none',
      reasons
    };
  }

  // 6.2 复合命中 (跨领域且得分相近) -> Mixed / Ask
  if (activeDomains.length >= 2 && activeDomains[0][1] === activeDomains[1][1]) {
    const dom1 = activeDomains[0][0];
    const dom2 = activeDomains[1][0];
    reasons.push(`multi_domain_hit: ${dom1}, ${dom2}`);
    const combinedSkills = [
      ...(domains[dom1]?.skills?.slice(0, 2) || []),
      ...(domains[dom2]?.skills?.slice(0, 2) || [])
    ];
    return {
      domain: 'mixed',
      confidence: 'medium',
      skills: combinedSkills,
      recipe: 'mixed-hybrid',
      action: 'ask',
      side_effects: 'none',
      reasons
    };
  }

  // 6.3 单一胜出领域 -> Dispatch
  const [winnerDomain, winScore] = activeDomains[0];
  reasons.push(`domain_selected: ${winnerDomain} (score=${winScore})`);

  let selectedRecipeKey = domains[winnerDomain]?.defaultRecipe || '';
  let selectedSkills = [...(domains[winnerDomain]?.skills || [])];

  // 细粒度测试配方装配逻辑
  if (winnerDomain === 'testing') {
    if (text.includes('ffi') || text.includes('v8') || text.includes('pyo3') || text.includes('跨语言') || text.includes('嵌入')) {
      selectedRecipeKey = 'embed-ffi-greenfield';
    } else if (text.includes('爬虫') || text.includes('采集') || text.includes('scraper') || text.includes('清洗')) {
      selectedRecipeKey = 'scraper-pipeline';
    } else if (text.includes('表征') || text.includes('锁定') || text.includes('遗留') || text.includes('characteriz')) {
      selectedRecipeKey = 'characterization-brownfield';
    } else {
      selectedRecipeKey = 'spec-driven-greenfield';
    }

    if (recipes[selectedRecipeKey]) {
      selectedSkills = recipes[selectedRecipeKey].skills;
    }
  } else if (winnerDomain === 'reverse') {
    selectedRecipeKey = 'reverse-general';
    selectedSkills = ['reverse-skill-router'];
  } else if (winnerDomain === 'ui') {
    selectedRecipeKey = 'ui-design-standard';
    selectedSkills = ['ui-design-paradigms'];
  }

  const confidence = winScore >= 2 ? 'high' : 'medium';

  return {
    domain: winnerDomain,
    confidence,
    skills: selectedSkills,
    recipe: selectedRecipeKey,
    action: 'dispatch',
    side_effects: 'none',
    reasons
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
