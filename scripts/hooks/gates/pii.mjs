// scripts/hooks/gates/pii.mjs
// 个人数据卫生门——与 secrets 互补：secrets 管凭据密钥，PII 管个人标识泄漏
// （威胁模型：单作者公开仓的个人邮箱/家目录回流 + 日志/文档实数据误入库）
//
// 层：
//   家目录路径  —— C:\Users\<name>\ / macOS /Users/<name>/ / Linux /home/<name>/
//                 全报 error（69a7aca 全局升格后统一阻塞级；fixture 名白名单除外。
//                 /home 原 warn 因 CTF 题目密度——升格后由 gate.pii.exclude 域调承担豁免）
//   个人邮箱域  —— CN 个人域（qq/foxmail/163/126/139/sina/sohu/aliyun/yeah/189）报 error
//                 gmail/outlook 等国际域不报（示例文档合法密度太高，属噪声面）
//   手机号      —— 中国手机 1[3-9]xxxxxxxxx 报 error（升格后统一阻塞级；夹具走 exclude）
//   私网 IP     —— 显式弃扫：RFC1918 在部署文档/夹具中合法密度极高，噪声>信号
//
// 配置：gate.pii.level（默认 error）；通用键 globs/exclude 可用
//      例 .hooksrc: gate.pii.exclude=vertical/**（vendored 上游内容归上游卫生）

const TEXT_EXT = /\.(md|yaml|yml|json|ps1|js|mjs|ts|tsx|jsx|txt|toml|xml|html|css|py|go|rs|java|c|h|cpp|sh|bat|env|ini|cfg|conf|properties|tf|hcl|jsonl|csv|log)$/i;

// fixture 常用名白名单——这些用户名在测试/示例语义下不构成个人泄漏
const FIXTURE_NAMES = new Set([
  'user', 'username', 'example', 'sample', 'test', 'tester', 'demo',
  'admin', 'administrator', 'root', 'guest', 'public', 'default',
  'xxx', 'yyy', 'your', 'you', 'name', 'someone', 'anyone', 'me', 'my',
  'alice', 'bob', 'carol', 'dave', 'eve', 'mallory', 'oscar', 'trent',
  'ctf', 'player', 'private', 'share', 'shared', 'work', 'workspace',
]);

const WIN_HOME = /C:\\Users\\([A-Za-z0-9_.-]+)\\/gi;
const MAC_HOME = /\/Users\/([a-zA-Z0-9_.-]+)\//g;
const NIX_HOME = /\/home\/([a-zA-Z0-9_.-]+)\//g;
const CN_MAIL = /\b[A-Za-z0-9._%+-]+@(?:qq|foxmail|163|126|139|sina|sohu|aliyun|yeah|189)\.(?:com|net|cn)\b/gi;
const CN_PHONE = /\b1[3-9]\d{9}\b/g;

function scanHomePaths(content, file, findings) {
  for (const [re, label, level] of [
    [WIN_HOME, 'Windows 家目录', 'error'],
    [MAC_HOME, 'macOS 家目录', 'error'],
    [NIX_HOME, 'Linux 家目录', 'error'],
  ]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      const name = m[1].toLowerCase();
      if (FIXTURE_NAMES.has(name)) continue;
      findings.push({
        gate: 'pii', file, level,
        matchText: m[0],
        message: `疑似个人${label}路径: ${m[0]}（应改占位符/相对路径）`,
      });
    }
  }
}

export const gate = {
  id: 'pii',
  configKeys: [],
  stages: ['pre-commit'],
  family: 'gate',
  defaultLevel: 'error',
  globs: ['*'],
  exclude: [],
  async run(ctx) {
    const findings = [];
    for (const p of ctx.files) {
      if (!TEXT_EXT.test(p)) continue;
      let content;
      try { content = ctx.read(p); } catch { continue; }

      scanHomePaths(content, p, findings);

      CN_MAIL.lastIndex = 0;
      let m;
      while ((m = CN_MAIL.exec(content)) !== null) {
        findings.push({
          gate: 'pii', file: p, level: 'error',
          matchText: m[0],
          message: `疑似个人邮箱: ${m[0]}（公开仓勿烙个人邮箱——改用 noreply）`,
        });
      }

      CN_PHONE.lastIndex = 0;
      while ((m = CN_PHONE.exec(content)) !== null) {
        findings.push({
          gate: 'pii', file: p, level: 'error',
          matchText: m[0],
          message: `疑似手机号: ${m[0]}（若非测试夹具请脱敏）`,
        });
      }
    }
    return findings;
  },
};
