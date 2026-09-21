// scripts/hooks/gates/link-rot.mjs
// 死链检查门（周期维度第二消费方——网络 IO 贵，靠 cadence 节流搭 hook 便车）
// 配置：
//   gate.link-rot.globs=<CSV>      扫描域（默认空——off-until-configured，仓专域走配置）
//   gate.link-rot.cadence=<dur>    引擎级 TTL（建议 7d）——state.json lastRun 节流
//   gate.link-rot.maxUrls=<n>      单次检查 URL 上限（默认 50；超出截断并提示）
//   gate.link-rot.timeoutMs=<ms>   单 URL 超时（默认 5000）
//   gate.link-rot.ignore=<CSV>     子串过滤——命中的 URL 跳过（如 localhost,example.com）
// 契约：扫 globs 域内工作区文件提取 http(s) URL → HEAD 探测（405/501 回退 GET，
//   跟随重定向）→ 404/410 判死链 warn；其余 4xx/5xx/超时/网络错误判不可达 warn。
//   401/403 视为可达（服务端活着，只是鉴权——不是 rot）。
//   全部 URL 网络错误时合并为单条"疑似离线"提醒，不刷屏。
//   只挂非阻断 stage（post-merge/post-checkout）——网络检查永不阻断提交。

import fs from 'node:fs';
import path from 'node:path';
import { matchAnyGlobs } from '../lib/matcher.mjs';
import { fileSource } from '../lib/files.mjs';

const URL_RE = /https?:\/\/[^\s)\]<>"'`]+/g;
const TRAIL_RE = /[.,;:!?)\]}'"*]+$/;

// 提取文本中的 http(s) URL（剥离常见尾标点——markdown/散文里 ) . , 是句法不是 URL 一部分）
export function extractLinks(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(URL_RE)) {
      const url = m[0].replace(TRAIL_RE, '');
      if (url.length > 'http://x'.length) out.push({ url, line: i + 1 });
    }
  }
  return out;
}

// 单 URL 探测 → 'ok' | 'dead' | 'unreachable' | 'timeout' | 'error'
export async function checkLink(url, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ac.signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ac.signal });
    }
    const s = res.status;
    if (s === 404 || s === 410) return 'dead';
    if ((s >= 200 && s < 400) || s === 401 || s === 403) return 'ok';
    return 'unreachable';
  } catch (e) {
    return e.name === 'AbortError' ? 'timeout' : 'error';
  } finally {
    clearTimeout(t);
  }
}

// 扫文件清单收集 URL → Map<url, {file, line}>（去重保留首见位置）
export function scanLinks(root, files, scanGlobs, ignoreSubs) {
  const seen = new Map();
  for (const p of files.filter(f => matchAnyGlobs(f, scanGlobs))) {
    let text;
    try { text = fs.readFileSync(path.join(root, p), 'utf8'); } catch { continue; }
    for (const { url, line } of extractLinks(text)) {
      if (ignoreSubs.some(s => url.includes(s))) continue;
      if (!seen.has(url)) seen.set(url, { file: p, line });
    }
  }
  return seen;
}

async function mapPool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

export const gate = {
  id: 'link-rot',
  configKeys: ['maxUrls', 'timeoutMs', 'ignore'],
  stages: ['post-merge', 'post-checkout'],
  family: 'gate',
  defaultLevel: 'warn',
  needsAllFiles: true,
  expensive: true,
  globs: ['*'],
  exclude: [],
  async run(ctx) {
    const cfg = ctx.gateConfig ?? {};
    const scan = (cfg.globs ?? '').split(',').map(s => s.trim()).filter(Boolean);
    if (!scan.length) return [];
    const maxUrls = parseInt(cfg.maxUrls ?? '50', 10) || 50;
    const timeoutMs = parseInt(cfg.timeoutMs ?? '5000', 10) || 5000;
    const ignore = (cfg.ignore ?? '').split(',').map(s => s.trim()).filter(Boolean);
    let all;
    try { all = fileSource(ctx.root, { source: 'all' }).list(); }
    catch { return []; }
    const seen = scanLinks(ctx.root, all, scan, ignore);
    const urls = [...seen.keys()].slice(0, maxUrls);
    if (!urls.length) return [];
    const statuses = await mapPool(urls, 8, u => checkLink(u, timeoutMs));
    const findings = [];
    // 全军覆没（无一个 ok/dead/unreachable 状态响应）→ 合并单条疑似离线
    const allNetFail = urls.length > 0 && statuses.every(s => s === 'error' || s === 'timeout');
    if (allNetFail) {
      findings.push({
        gate: 'link-rot', file: '-',
        message: `${urls.length} 个 URL 全部网络不可达——疑似离线/代理失效，本次不计死链`,
      });
      return findings;
    }
    for (const [i, u] of urls.entries()) {
      const st = statuses[i];
      if (st === 'ok') continue;
      const loc = seen.get(u);
      const why = st === 'dead' ? '死链 (404/410)'
        : st === 'timeout' ? `超时 (>${timeoutMs}ms)`
        : st === 'unreachable' ? '服务端错误 (5xx/其他)'
        : '网络错误';
      findings.push({
        gate: 'link-rot', file: loc.file, matchText: u,
        message: `${loc.file}:${loc.line} ${why}: ${u}`,
      });
    }
    if (seen.size > urls.length) {
      findings.push({
        gate: 'link-rot', file: '-',
        message: `URL 超上限截断: 已查 ${urls.length}/${seen.size}（gate.link-rot.maxUrls 可调）`,
      });
    }
    return findings;
  },
};
