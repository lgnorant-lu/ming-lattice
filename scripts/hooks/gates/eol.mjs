// scripts/hooks/gates/eol.mjs
// EOL 契约门——.gitattributes 声明面 vs staged blob 实测面对账
// 配置：gate.eol.level（默认 error）
//   gate.eol.pinGlobs 强制 LF 钉制域（默认 .githooks/**,*.sh——POSIX shebang 字节敏感）
//
// 发现族：
//   [error] eol=lf 域的 staged blob 含 CRLF——porcelain 下不可达，
//           attrs 漂移 / plumbing 旁路 / 钉后未 renormalize 才会出现
//   [error] 钉制域文件 eol 未解析为 lf——checkout CRLF 让 `#!...\r` shebang 失效
//   [warn ] 无钉制似文本 blob 含 CRLF 入 index——建议铺 eol 基线（或钉 -text/eol=crlf）
//
// 边界：eol=crlf 声明或 text=unset(-text/binary) 的文件不辖（仓策略明确）。
// fixable：归一化工作区字节 CRLF→LF；钉缺席类须改 .gitattributes（非内容面，不代修）。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { matchAnyGlobs } from '../lib/matcher.mjs';

const NUL = '\0';
const BINARY_SNIFF = 8000;          // 与 git buffer_is_binary 的嗅探窗口同量级
const DEFAULT_PIN_GLOBS = '.githooks/**,*.sh';

// git check-attr -z eol text --stdin → path\0attr\0value\0 三元组流
function batchAttrs(root, files) {
  const input = files.map(f => f + NUL).join('');
  const out = execFileSync('git', ['check-attr', '-z', 'eol', 'text', '--stdin'], {
    cwd: root, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60_000,
    stdio: ['pipe', 'pipe', 'pipe'],   // stdin 须 pipe 喂 --stdin 清单
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  const map = new Map();
  const tok = out.split(NUL);
  for (let i = 0; i + 2 < tok.length; i += 3) {
    const [file, attr, val] = [tok[i], tok[i + 1], tok[i + 2]];
    if (!map.has(file)) map.set(file, {});
    map.get(file)[attr] = val;
  }
  return map;
}

const isBinaryish = s => s.slice(0, BINARY_SNIFF).includes(NUL);
const hasCrlf = s => s.includes('\r\n');

export const gate = {
  id: 'eol',
  configKeys: ['pinGlobs'],
  stages: ['pre-commit'],
  family: 'gate',
  defaultLevel: 'error',
  fixable: true,
  globs: ['*'],
  exclude: [], // 仓专排除走 gate.eol.exclude 配置——默认值须仓中性
  async run(ctx) {
    const findings = [];
    if (!ctx.files.length) return findings;
    const pinGlobs = String(ctx.gateConfig?.pinGlobs ?? DEFAULT_PIN_GLOBS)
      .split(',').map(s => s.trim()).filter(Boolean);
    let attrs;
    try { attrs = batchAttrs(ctx.root, ctx.files); }
    catch (e) {
      return [{ gate: 'eol', file: '(repo)', level: 'warn',
        message: `git check-attr 失败——eol 契约无法判定: ${e.message}` }];
    }
    for (const p of ctx.files) {
      const a = attrs.get(p) || {};
      let content;
      try { content = ctx.read(p); } catch { continue; }

      // 钉制域：shebang 字节敏感面必须落 eol=lf
      if (matchAnyGlobs(p, pinGlobs) && a.eol !== 'lf') {
        findings.push({ gate: 'eol', file: p,
          message: `${p}: 钉制域文件 eol=${a.eol ?? '?'}（需 lf）——`
            + `.gitattributes 补 "text eol=lf" 钉或跑 install-hooks 铺基线` });
        continue;
      }

      if (!hasCrlf(content)) continue;

      if (a.eol === 'lf') {
        findings.push(isBinaryish(content)
          ? { gate: 'eol', file: p, level: 'warn',
              message: `${p}: eol=lf 声明但内容含 NUL——auto 判二进制钉不生效（属意文本请显式 text）` }
          : { gate: 'eol', file: p,
              message: `${p}: eol=lf 声明但 staged blob 含 CRLF——`
                + `git add --renormalize ${p} 或查 .gitattributes 漂移` });
        continue;
      }

      // 无钉制面：策略明确的（-text / eol=crlf）放行；其余似文本裸 CRLF 即警告
      if (a.text === 'unset' || a.eol === 'crlf' || isBinaryish(content)) continue;
      findings.push({ gate: 'eol', file: p, level: 'warn',
        message: `${p}: staged blob 含 CRLF 且无 eol 钉制——入 index 留 CRLF，`
          + `建议铺 eol 基线（run fix 可修工作区）` });
    }
    return findings;
  },
  // 工作区修复（run fix 专用；ctx.read 走工作区源）——只归一化字节，
  // 钉缺席类属配置面不在此修（提示文案指路）。
  // fix 收全域文件非仅发现集——eol=crlf/-text 声明域必须豁免，
  // 否则 .bat/.cmd 的声明契约被自己剥掉。
  async fix(ctx) {
    const fixed = [];
    let attrs;
    try { attrs = batchAttrs(ctx.root, ctx.files); } catch { attrs = new Map(); }
    for (const p of ctx.files) {
      const a = attrs.get(p) || {};
      if (a.eol === 'crlf' || a.text === 'unset') continue;
      const abs = path.join(ctx.root, p);
      let buf;
      try { buf = fs.readFileSync(abs); } catch { continue; }
      if (buf.slice(0, BINARY_SNIFF).includes(0)) continue;
      const text = buf.toString('utf8');
      if (!hasCrlf(text)) continue;
      if (!ctx.dryRun) fs.writeFileSync(abs, text.replace(/\r\n/g, '\n'));
      fixed.push(p);
    }
    return fixed;
  },
};
