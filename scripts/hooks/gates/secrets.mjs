// scripts/hooks/gates/secrets.mjs
// 真实敏感密钥拦截门（原生门——多模式分项标签是声明式吃不下的诊断质量）
// 配置：gate.secrets.level / secretLevel（旧键）；gate.secrets.exclude 追加排除 glob

const DANGEROUS_SECRET_PATTERNS = [
  { name: 'GitHub Personal Token', regex: /\bghp_[a-zA-Z0-9]{36,}\b/ },
  { name: 'OpenAI Secret Key', regex: /\bsk-[a-zA-Z0-9]{32,}\b/ },
  { name: 'AWS Access Key ID', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Private Key PEM', regex: /-----BEGIN (?:RSA|EC|OPENSSH|DSA|PGP) PRIVATE KEY-----/ },
];

const TEXT_EXT = /\.(md|yaml|yml|json|ps1|js|mjs|ts|txt|toml|xml|html|css|py|go|rs|java|c|h|cpp|sh|bat|env|ini|cfg|conf)$/i;

export const gate = {
  id: 'secrets',
  stages: ['pre-commit'],
  family: 'gate',
  defaultLevel: 'error',
  globs: ['*'],
  // 已知第三方抓包测试案例目录——默认排除（可经 gate.secrets.exclude 覆盖）
  exclude: ['vertical/iwen-scraping/**'],
  async run(ctx) {
    const findings = [];
    for (const p of ctx.files) {
      if (!TEXT_EXT.test(p)) continue;
      let content;
      try { content = ctx.read(p); } catch { continue; }
      for (const sec of DANGEROUS_SECRET_PATTERNS) {
        if (sec.regex.test(content)) {
          findings.push({
            gate: 'secrets', file: p,
            matchText: sec.name, // 只把模式名入身份，不把密钥本身写进 findings
            message: `疑似检测到真实敏感凭据 (${sec.name}): ${p}`,
          });
        }
      }
    }
    return findings;
  },
};
