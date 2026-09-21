// scripts/hooks/gates/secrets.mjs
// 敏感凭据拦截门（多层规则设计——原生门：多模式分项标签+熵过滤+编码配对是声明式吃不下的）
//
// 三层结构：
//   L1 签名层 —— 服务商密钥指纹，近零误报，随门等级（默认 error）
//   L2 通用赋值层 —— key|token|secret\s*[:=] + 香农熵 + 占位符白名单，
//                 默认 warn（gate.secrets.genericLevel 调级，off 关闭）
//   L3 编码层 —— UTF-16LE/BE 转码重扫（BOM/NUL 率检测）；
//               可疑文件名内 base64 串解码回喂 L1（每文件封顶 20 次）
//
// 配置：gate.secrets.level / secretLevel（旧键）；gate.secrets.exclude 追加排除 glob；
//       gate.secrets.genericLevel=L2 等级；gate.secrets.b64Level=L3 命中等级（默认 warn）
// 展示：密钥样本只出打码形态（前4…后4），永不打印全文；
//       matchText 存原始命中仅供 baseline 身份哈希（sha1，不落明文）

import path from 'node:path';

// ---- L1 服务商签名层（近零误报）----
const SIGNATURE_PATTERNS = [
  { name: 'GitHub PAT',            regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/ },
  { name: 'GitHub Fine-Grained PAT', regex: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/ },
  { name: 'OpenAI/Anthropic Key',  regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Stripe Key',            regex: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { name: 'Stripe Webhook Secret', regex: /\bwhsec_[A-Za-z0-9]{32,}\b/ },
  { name: 'AWS Access Key',        regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'Aliyun AccessKey',      regex: /\bLTAI[A-Za-z0-9]{12,}\b/ },
  { name: 'Tencent SecretId',      regex: /\bAKID[A-Za-z0-9]{13,}\b/ },
  { name: 'Slack Token',           regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Slack App Token',       regex: /\bxapp-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Google API Key',        regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'GitLab PAT',            regex: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'npm Token',             regex: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { name: 'PyPI Token',            regex: /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{16,}\b/ },
  { name: 'HuggingFace Token',     regex: /\bhf_[A-Za-z0-9]{30,}\b/ },
  { name: 'DigitalOcean Token',    regex: /\bdop_v1_[a-f0-9]{64}\b/ },
  { name: 'SendGrid Key',          regex: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/ },
  { name: 'JWT',                   regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'Private Key PEM',       regex: /-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----/ },
];

// ---- L2 通用赋值层 ----
const GENERIC_ASSIGN = /\b(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?key|auth[_-]?token|access[_-]?token|client[_-]?secret|private[_-]?key|passwd|password)\b["']?\s*[:=]\s*["']([A-Za-z0-9+/=_\-]{20,})["']/gi;
// 占位符白名单——文档示例/模板变量常见形态（误报抑制先于上报）
const PLACEHOLDER = /your[-_ ]|example|sample|placeholder|dummy|changeme|insert|redact|removed|xxx|\.\.\.|\$\{|<[a-z-]+>|\*{3,}|REPLACE|TODO|fake|mock|none|null/i;

// ---- L0 文件名层：私钥文件名即违规（不读内容——防 id_rsa/test host key 类入仓事故）----
const KEYFILE_NAME = /(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519|\.env\.production|\.env\.prod)|\.(pem|p12|pfx|key)$/i;
const KEYFILE_ALLOW = /\.(example|sample|template|dist)\.|test|fixture|mock/i;

// ---- L3 编码层 ----
const SUSPICIOUS_NAME = /env|config|secret|cred|token|\.rc$|settings|\.local/i;
const B64_CANDIDATE = /\b[A-Za-z0-9+/]{40,}={0,2}\b/g;
const B64_DECODE_CAP = 20;

const TEXT_EXT = /\.(md|yaml|yml|json|ps1|js|mjs|ts|txt|toml|xml|html|css|py|go|rs|java|c|h|cpp|sh|bat|env|ini|cfg|conf|properties|tf|hcl|lock)$/i;

function shannonEntropy(s) {
  const freq = new Map();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function mask(s) {
  return s.length > 8 ? `${s.slice(0, 4)}…${s.slice(-4)}` : '…';
}

// UTF-16 判定：BOM 或前 200 字符 NUL 率 >15%
function tryUtf16(buf) {
  if (typeof buf !== 'string') return null;
  if (buf.charCodeAt(0) === 0xFEFF) return buf.slice(1);
  const head = buf.slice(0, 200);
  const nul = (head.match(/\x00/g) ?? []).length;
  if (head.length > 20 && nul / head.length > 0.15) {
    return buf.replace(/\x00/g, ''); // UTF-16LE ASCII 区近似还原（足够签名匹配）
  }
  return null;
}

function scanL1(content, file, layer, findings, forcedLevel) {
  for (const sec of SIGNATURE_PATTERNS) {
    sec.regex.lastIndex = 0;
    let m;
    const re = new RegExp(sec.regex.source, sec.regex.flags.includes('g') ? sec.regex.flags : sec.regex.flags + 'g');
    while ((m = re.exec(content)) !== null) {
      findings.push({
        gate: 'secrets', file,
        level: forcedLevel, // undefined → 门级
        matchText: m[0],    // 原始命中仅入身份 sha1，不打印
        message: `疑似敏感凭据 (${sec.name}${layer ? '/' + layer : ''}): ${file} — 样本 ${mask(m[0])}`,
      });
    }
  }
}

export const gate = {
  id: 'secrets',
  stages: ['pre-commit'],
  family: 'gate',
  defaultLevel: 'error',
  globs: ['*'],
  // 仓专排除走 gate.secrets.exclude 配置（如 vendored fixture 目录）——默认值须仓中性
  exclude: [],
  async run(ctx) {
    const findings = [];
    const genericLevel = ctx.gateConfig?.genericLevel ?? 'warn';
    const b64Level = ctx.gateConfig?.b64Level ?? 'warn';

    for (const p of ctx.files) {
      // L0：私钥文件名命中（不看内容不看扩展名白名单）
      if (KEYFILE_NAME.test(p) && !KEYFILE_ALLOW.test(p)) {
        findings.push({
          gate: 'secrets', file: p,
          matchText: `keyfile:${path.basename(p)}`,
          message: `疑似私钥/凭据文件名: ${p}（测试用密钥应写进 TempDir，勿入仓）`,
        });
      }
      if (!TEXT_EXT.test(p)) continue;
      let content;
      try { content = ctx.read(p); } catch { continue; }

      // UTF-16 转码重扫（编码配对——Windows PowerShell 重定向产物常 UTF-16LE）
      const utf16 = tryUtf16(content);
      const texts = utf16 ? [content, utf16] : [content];

      for (const text of texts) {
        scanL1(text, p, utf16 && text === utf16 ? 'utf16' : null, findings);

        if (genericLevel !== 'off') {
          GENERIC_ASSIGN.lastIndex = 0;
          let m;
          while ((m = GENERIC_ASSIGN.exec(text)) !== null) {
            const val = m[1];
            if (PLACEHOLDER.test(val)) continue;
            if (shannonEntropy(val) < 3.8) continue; // 低熵（重复串/序号）不算凭据
            findings.push({
              gate: 'secrets', file: p,
              level: genericLevel,
              matchText: val,
              message: `疑似凭据赋值 (generic/entropy ${shannonEntropy(val).toFixed(1)}): ${p} — 样本 ${mask(val)}`,
            });
          }
        }
      }

      // base64 夹带限域解：仅可疑文件名（配置/凭据类）
      if (b64Level !== 'off' && SUSPICIOUS_NAME.test(p)) {
        const candidates = content.match(B64_CANDIDATE) ?? [];
        let decoded = 0;
        for (const c of candidates) {
          if (decoded >= B64_DECODE_CAP) break;
          try {
            const plain = Buffer.from(c, 'base64').toString('utf8');
            if (!plain || plain === c) continue;
            decoded++;
            // 回喂 L1：解码串命中签名即报
            const before = findings.length;
            scanL1(plain, p, 'b64', findings, b64Level);
            for (let i = before; i < findings.length; i++) {
              findings[i].message = findings[i].message.replace('样本', 'b64解码命中，样本');
            }
          } catch { /* 非 b64 跳过 */ }
        }
      }
    }
    return findings;
  },
};
