// per-skill 召回覆盖测试：每个 DOMAIN_DEFS 技能的调用识别路径断言。
// 召回三层契约：
//   L1 显式点名（"用 <skill>"）— 所有 ready 技能必须可被召回（通用兜底）
//   L2 域内精召 — engineering skillTriggers 词在域门已开时必须推回本技能
//   L3 配方兜底 — 每域 defaultRecipe 必须可解且成员全 ready
// 裸词开门（skillTrigger 词无域门覆盖）由 check-skill --all 的 I 级检查报告，
// 本测试仅统计输出，不作硬断言——裸词不开门是按设计的细化词行为。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Decide } from '../../scripts/route-core.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../../config/router-manifest.json', import.meta.url), 'utf8'));
const { domains, recipes, availability } = manifest;
const allSkills = [...new Set(Object.values(domains).flatMap(d => d.skills))].sort();

const recalledBy = (decision, skill) =>
  decision.candidates.includes(skill) || decision.active_recipe.skills.includes(skill);

export function run() {
  // 1) readiness：DOMAIN_DEFS 内技能必须 ready，否则任何路径都不可调度
  for (const skill of allSkills) {
    assert.equal(availability[skill], 'ready', `${skill}: availability=${availability[skill]}`);
  }

  // 2) 显式点名召回：通用兜底契约
  for (const skill of allSkills) {
    const d = Decide(`请使用 ${skill} 完成这个任务`, manifest);
    assert.equal(d.action, 'dispatch', `${skill}: explicit-name action=${d.action}`);
    assert.ok(recalledBy(d, skill), `${skill}: explicit-name not recalled`);
  }

  // 3) engineering skillTriggers：每个技能必须有精召面；每个词在域门开时必须召回
  const engTriggers = domains.engineering?.skillTriggers || {};
  const gateOpener = domains.engineering.triggers[0];
  assert.ok(gateOpener, 'engineering domain needs at least one trigger');
  const bareMisses = [];
  for (const skill of domains.engineering.skills) {
    const terms = engTriggers[skill] || [];
    assert.ok(terms.length > 0, `${skill}: engineering skill missing skillTriggers`);
    for (const term of terms) {
      const d = Decide(`${term} 相关的${gateOpener}处理`, manifest);
      assert.ok(recalledBy(d, skill), `${skill}: skillTrigger "${term}" did not recall under open gate`);
      if (!recalledBy(Decide(`帮我处理 ${term} 相关的活`, manifest), skill)) bareMisses.push(`${skill}:${term}`);
    }
  }

  // 4) 每域 defaultRecipe 可解且成员就绪
  for (const [name, info] of Object.entries(domains)) {
    const recipe = recipes[info.defaultRecipe];
    assert.ok(recipe, `${name}: defaultRecipe ${info.defaultRecipe} missing`);
    assert.equal(recipe.domain, name, `${name}: recipe domain mismatch`);
    for (const skill of recipe.skills) {
      assert.equal(availability[skill], 'ready', `${name}/${recipe}: ${skill} not ready`);
    }
  }

  console.log(`[PASS] skill-recall: ${allSkills.length} skills name-recallable, `
    + `${Object.keys(engTriggers).length} engineering skillTriggers verified`
    + (bareMisses.length ? `; bare-term no-gate (by design or gap): ${bareMisses.length}` : ''));
}

if (process.argv[1]?.endsWith('test-skill-recall.mjs')) run();
