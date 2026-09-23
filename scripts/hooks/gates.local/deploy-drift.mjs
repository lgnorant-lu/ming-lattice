// scripts/hooks/gates.local/deploy-drift.mjs
// 部署漂移对账门（仓专）——registry deploy 声明 vs 客户端技能目录实际链接。
//
// 不变量：registry 声明 deploy.claude:true（含 base.modules 的 [claude]）的包
//   ⟺ 客户端技能目录里存在指向本仓的链接。
//   外国链接（指向非本仓路径）不管；指向本仓但不在声明集的 = 孤儿链。
//
// 配置：gate.deploy-drift.level（默认 warn——漂移提醒不阻断）
//   gate.deploy-drift.cadence=<dur>   引擎级 TTL 节流
//   gate.deploy-drift.target=<dir>    客户端技能目录（默认 %USERPROFILE%/.cc-switch/skills）

import fs from 'node:fs';
import path from 'node:path';

// registry.yaml 行级解析：deployable/private 段 deploy.claude:true + base 段 modules.<name>: [claude]
function declaredDeploys(text) {
  const names = new Set();
  const lines = text.split('\n');
  let sec = null, inModules = false, cur = null, curHasDeploy = false;
  const flush = () => { if (cur && curHasDeploy) names.add(cur); cur = null; curHasDeploy = false; };
  for (const ln of lines) {
    const top = ln.match(/^(\w+):\s*$/);
    if (top) { flush(); sec = top[1]; inModules = false; continue; }
    if (/^\s+-\s+name:\s*/.test(ln)) { flush(); cur = ln.split('name:')[1].trim(); continue; }
    if (sec === 'base') {
      if (/^\s{4}modules:\s*$/.test(ln)) { inModules = true; continue; }
      if (inModules) {
        const mm = ln.match(/^\s{6}(\S+):\s*\[([^\]]*)\]/);
        if (mm) { if (mm[2].includes('claude')) names.add(mm[1]); continue; }
        if (/^\s{4}\w/.test(ln)) inModules = false;
      }
    }
    if (cur && /^\s{6}claude:\s*true/.test(ln)) curHasDeploy = true;
  }
  flush();
  return names;
}

export const gate = {
  id: 'deploy-drift',
  configKeys: ['target'],
  stages: ['pre-commit', 'post-merge', 'post-checkout'],
  family: 'gate',
  defaultLevel: 'warn',
  needsAllFiles: false,
  globs: [],
  exclude: [],
  async run(ctx) {
    const regPath = path.join(ctx.root, 'registry.yaml');
    if (!fs.existsSync(regPath)) return [];                       // 无 registry 契约=不适用
    let declared;
    try { declared = declaredDeploys(fs.readFileSync(regPath, 'utf8')); }
    catch { return [{ gate: 'deploy-drift', file: 'registry.yaml', message: 'registry.yaml 存在但不可读——部署声明对账无法进行' }]; }

    const target = (ctx.gateConfig?.target || process.env.DEPLOY_DRIFT_TARGET
      || path.join(process.env.USERPROFILE || process.env.HOME || '', '.cc-switch', 'skills'));
    if (!fs.existsSync(target)) return [];                      // 无客户端目录（CI/裸环境）=不适用

    const repoRoot = path.resolve(ctx.root).toLowerCase();
    const links = new Map();                                    // name -> 指向本仓的链接目标
    for (const e of fs.readdirSync(target, { withFileTypes: true })) {
      let dst;
      try { dst = fs.readlinkSync(path.join(target, e.name)); }
      catch { continue; }                                       // 非链接（复制面/外国文件）不管
      if (path.resolve(dst).toLowerCase().startsWith(repoRoot)) links.set(e.name, dst);
    }

    const findings = [];
    for (const name of declared) {
      if (!links.has(name)) {
        findings.push({ gate: 'deploy-drift', file: 'registry.yaml', matchText: name,
          message: `声明 deploy.claude 但未链接到客户端：${name}（跑 pwsh scripts/sync.ps1 物化）` });
      }
    }
    for (const name of links.keys()) {
      if (!declared.has(name)) {
        findings.push({ gate: 'deploy-drift', file: '.cc-switch', matchText: name,
          message: `孤儿链：${name} 指向本仓但 registry 无 deploy.claude 声明（registry 漏登或残留链）` });
      }
    }
    return findings;
  },
};
