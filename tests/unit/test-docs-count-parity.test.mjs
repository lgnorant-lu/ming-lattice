// README/SKILL-INDEX 基线计数对账——repo-presentation 版本字段漂移判据的文档面变体。
// 真值源: registry-lite(base/vertical/deployable/private) + router-manifest(skills/recipes)
//        + plan.mjs ALL_SUITE_NAMES。文档内硬编码计数必须与真值相等——改规模先改文档。
// 有意不纳入: artifacts SBOM/SCA 组件数——随依赖升降高频变动, 硬断言只会制造噪音
//            (该面由 manifest-freshness/供应链门负责, 职责不重叠)。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadRegistryCanonical } from '../../scripts/lib/registry-lite.mjs';
import { ALL_SUITE_NAMES } from '../../scripts/plan.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
const skillIndex = fs.readFileSync(path.join(repoRoot, 'docs/SKILL-INDEX.md'), 'utf8');
const manifest = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'config/router-manifest.json'), 'utf8')
);

const reg = loadRegistryCanonical(path.join(repoRoot, 'registry.yaml'));
const baseMods = (reg.base || []).reduce(
  (a, b) => a + Object.values(b.modules || {}).filter(x => x && x.enabled !== false).length, 0
);
const counts = {
  baseModules: baseMods,
  vertical: (reg.vertical || []).length,
  deployable: (reg.deployable || []).length,
  privateTotal: (reg.private || []).length,
  privateEnabled: (reg.private || []).filter(x => x.enabled !== false).length,
  manifestSkills: new Set(
    Object.values(manifest.domains || {}).flatMap(d => d.skills || [])
  ).size,
  recipes: Object.keys(manifest.recipes || {}).length,
  domains: Object.keys(manifest.domains || {}).length,
  suites: ALL_SUITE_NAMES.length,
  lintSources: baseMods + (reg.vertical || []).length
    + (reg.deployable || []).length + (reg.private || []).length,
};

const esc = n => String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function run() {
  // 1. README §1 资产表: 分层规模
  assert.match(readme, new RegExp(`${esc(counts.baseModules)} 个已启用模块`),
    'README: base 已启用模块数漂移');
  assert.match(readme, new RegExp(`${esc(counts.vertical)} 个垂直参考`),
    'README: vertical 计数漂移');
  assert.match(readme, new RegExp(`${esc(counts.deployable)} 个包装技能`),
    'README: deployable 计数漂移');
  assert.match(readme, new RegExp(`${esc(counts.privateEnabled)} 个启用自研技能`),
    'README: private 启用计数漂移');
  assert.match(readme, new RegExp(`${esc(counts.privateTotal)} 登记`),
    'README: private 登记总数漂移');

  // 2. README §1 基线行: lint 源 / manifest 技能 / 套件
  assert.match(readme, new RegExp(`${esc(counts.lintSources)} 处入口源`),
    'README: lint 入口源基线漂移');
  assert.match(readme, new RegExp(`${esc(counts.lintSources)} 处校验源`),
    'README: lint 校验源(§5.2)漂移——与 §1 不一致即拦截');
  assert.match(readme, new RegExp(`${esc(counts.manifestSkills)} 个唯一技能`),
    'README: manifest 唯一技能数漂移');
  assert.match(readme, new RegExp(`${esc(counts.suites)} 个独立测试套件`),
    'README: 套件总数(§1)漂移');
  assert.match(readme, new RegExp(`${esc(counts.suites)} 个测试套件全量回归`),
    'README: 套件数(§3 verify full)漂移');
  assert.match(readme, new RegExp(`${esc(counts.suites)} 个自动化测试套件`),
    'README: 套件数(§5.2 命令表)漂移');
  assert.match(readme, new RegExp(`${esc(counts.suites)} 个测试套件详细构成`),
    'README: 套件数(§5.3 导航)漂移');
  assert.match(readme, new RegExp(`${esc(counts.recipes)} 条可执行配方`),
    'README: 配方数漂移');

  // 3. SKILL-INDEX 覆盖行同真值
  assert.match(skillIndex, new RegExp(`基座 ${esc(counts.baseModules)} 部署模块`),
    'SKILL-INDEX: base 覆盖数漂移');
  assert.match(skillIndex, new RegExp(`垂直 ${esc(counts.vertical)} 参考`),
    'SKILL-INDEX: vertical 覆盖数漂移');
  assert.match(skillIndex,
    new RegExp(`私有 ${esc(counts.privateEnabled)}（启用）/${esc(counts.privateTotal)}（登记）`),
    'SKILL-INDEX: private 覆盖数漂移');

  console.log(`docs-count-parity: ${counts.manifestSkills} skills / ` +
    `${counts.suites} suites / ${counts.lintSources} lint sources / ` +
    `private ${counts.privateEnabled}/${counts.privateTotal} — README+SKILL-INDEX 全部对账通过`);
}
