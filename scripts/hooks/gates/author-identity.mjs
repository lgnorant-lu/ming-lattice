// scripts/hooks/gates/author-identity.mjs
// 提交身份门——防占位/个人身份烙进提交元数据层（与 pii 门同源防线两端：
// pii 扫文件内容里的邮箱，本门堵 author/committer 元数据——历史一旦公开不可收）
//
// 威胁模型（单作者公开仓）：
//   哨兵占位  —— t@t / test@test / *@example.* / *@localhost / *@*.local|lan|internal
//               / *.test / *.invalid / 空邮箱——未配置的机器身份，公开史垃圾
//   个人邮箱域 —— CN 个人域（qq/foxmail/163/126/139/sina/sohu/aliyun/yeah/189，
//               与 pii 门同族词表）回流公开史
//   author≠committer——amend/cherry-pick/-s signoff 用 committer 侧，默认双查
//
// 配置（.hooksrc）：
//   gate.author-identity.allow   CSV 白名单 glob（* 通配，大小写不敏感）
//                                配置后 email 必须命中其一——单作者仓推荐
//                                例：gate.author-identity.allow=*@users.noreply.github.com
//   gate.author-identity.deny    CSV 追加哨兵 glob（内置基表不可卸）
//   gate.author-identity.check   both|author|committer（默认 both）
//
// 阶段：pre-commit（身份在 commit 创建时定型；pre-push 历史补扫另案）。
// 出处：GOVERNANCE-SPINE §11 候审条——spuder git-hooks / chump
//       pre-commit-git-identity / conform 外部先例已查。
// 落地注：机制 error 默认；本仓 .hooksrc 暂置 warn 待身份迁移
//        （git config user.email 是用户域，迁移后翻 error+allow 白名单）。

import { makeGit } from '../lib/files.mjs';

const SENTINEL_GLOBS = [
  't@t', 'test@test', '*@example.*', '*@localhost',
  '*@*.local', '*@*.lan', '*@*.internal', '*@*.test', '*@*.invalid',
];
// 与 pii 门同族——CN 个人邮箱域词表
const CN_MAIL_DOMAIN = /^(?:qq|foxmail|163|126|139|sina|sohu|aliyun|yeah|189)\.(?:com|net|cn)$/i;

// glob → 锚定正则：* → .*，其余字符全转义（邮件位无 ** 语义）
const globToRe = g =>
  new RegExp('^' + g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');

const csv = v => (v ?? '').split(',').map(s => s.trim()).filter(Boolean);

// "Name <email> 1791102105 +0800" → email（git var ident 输出形态）
const parseEmail = raw => (raw.match(/<([^>]*)>/) || [])[1] ?? null;

export const gate = {
  id: 'author-identity',
  configKeys: ['allow', 'deny', 'check'],
  stages: ['pre-commit'],
  family: 'gate',
  defaultLevel: 'error',
  globs: ['*'],
  exclude: [],
  async run(ctx) {
    const cfg = ctx.gateConfig ?? {};
    const git = makeGit(ctx.root);
    const check = (cfg.check ?? 'both').trim().toLowerCase();
    const findings = [];
    const deny = [...SENTINEL_GLOBS, ...csv(cfg.deny)].map(globToRe);
    const allow = csv(cfg.allow).map(globToRe);
    const vars = check === 'author' ? ['GIT_AUTHOR_IDENT']
               : check === 'committer' ? ['GIT_COMMITTER_IDENT']
               : ['GIT_AUTHOR_IDENT', 'GIT_COMMITTER_IDENT'];

    for (const v of vars) {
      const label = v === 'GIT_AUTHOR_IDENT' ? 'author' : 'committer';
      let raw;
      try { raw = git(['var', v]).trim(); }
      catch {
        findings.push({ gate: 'author-identity', file: '-',
          message: `${label} 身份未配置（git var ${v} 失败）——先设 user.name/user.email` });
        continue;
      }
      const email = parseEmail(raw);
      if (!email) {
        findings.push({ gate: 'author-identity', file: '-',
          message: `${label} 邮箱为空: ${raw}（空邮箱合法但公开史无意义）` });
        continue;
      }
      const domain = email.split('@')[1] ?? '';
      if (deny.some(re => re.test(email)) || CN_MAIL_DOMAIN.test(domain)) {
        findings.push({ gate: 'author-identity', file: '-',
          message: `${label} 命中哨兵/个人域名单: ${email}（改用 noreply 身份再提交）` });
        continue;
      }
      if (allow.length && !allow.some(re => re.test(email))) {
        findings.push({ gate: 'author-identity', file: '-',
          message: `${label} 不在白名单: ${email}（gate.author-identity.allow 限定）` });
      }
    }
    return findings;
  },
};
