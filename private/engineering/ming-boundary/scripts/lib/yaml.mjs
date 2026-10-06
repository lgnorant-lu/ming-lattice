// yaml.mjs — 去 POSIX 化的 YAML 读取：纯 mjs 子集解析优先，pwsh 桥兜底。
//
// 背景：此前 check-boundaries/run-boundary/sync-langs 三处 loadYaml 一律
// spawnSync('pwsh', yaml2json.ps1)——在非 Windows/pwsh 缺席环境直接死。
// 本模块覆盖仓内契约实际用到的 YAML 子集（block map/list、flow [a,b]、
// 单双引号标量、行内注释、嵌套 map-under-list-item），strict fail-closed：
// 碰到锚/块标量/flow map/Tab 缩进等不支持构造即抛错，再由 loadYaml 回退
// pwsh 桥；桥也不可用时 die(3)。顺序刻意 lite 优先——纯函数无子进程，
// 且受 parity 测试互证（tests 断言 lite≡pwsh 输出）。
//
// 不支持（抛错回退）：|-, >- 块标量、&anchor/*alias、{flow} map、
// 跨行 flow 数组、Tab 缩进、键中含 ": " 的怪僻标量。

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..', '..');
const YAML2JSON = path.join(REPO_ROOT, 'scripts/lib/yaml2json.ps1');

function die(msg, code = 3) { console.error('[yaml] ' + msg); process.exit(code); }

// 引号感知的行内注释剥离：`key: 'a #b'  # real` —— # 前是空白且在引号外才算注释
function stripComment(line) {
  let sq = false, dq = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (sq) { if (c === "'") sq = false; continue; }
    if (dq) { if (c === '"') dq = false; continue; }
    if (c === "'") sq = true;
    else if (c === '"') dq = true;
    else if (c === '#' && (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseScalar(tok, ln) {
  tok = tok.trim();
  if (tok === '') return '';
  if (tok === 'null' || tok === '~') return null;
  if (tok === 'true') return true;
  if (tok === 'false') return false;
  if (tok.startsWith('[')) {
    if (!tok.endsWith(']')) throw new Error(`第${ln}行: 跨行/嵌套 flow 数组不支持`);
    const inner = tok.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((s) => parseScalar(s, ln));
  }
  if (tok.startsWith('{')) throw new Error(`第${ln}行: flow map {} 不支持`);
  if (tok.startsWith("'")) {
    if (!tok.endsWith("'") || tok.length < 2) throw new Error(`第${ln}行: 单引号标量未闭合`);
    return tok.slice(1, -1).replace(/''/g, "'");
  }
  if (tok.startsWith('"')) {
    if (!tok.endsWith('"') || tok.length < 2) throw new Error(`第${ln}行: 双引号标量未闭合`);
    return tok.slice(1, -1).replace(/\\(["\\nrt]|$)/g, (m, c) =>
      ({ '"': '"', '\\': '\\', n: '\n', r: '\r', t: '\t' })[c] ?? c);
  }
  if (/^[|>]/.test(tok)) throw new Error(`第${ln}行: 块标量 |/> 不支持`);
  if (/^[*&]/.test(tok)) throw new Error(`第${ln}行: 锚/别名不支持`);
  if (/^-?\d+$/.test(tok)) return parseInt(tok, 10);
  if (/^-?\d+\.\d+$/.test(tok)) return parseFloat(tok);
  return tok;
}

function splitKeyVal(text, ln) {
  // key: value —— key 为裸标识（允许 - _ .），分隔是第一个 ': ' 或行尾 ':'
  const m = /^([A-Za-z0-9_.\-]+):(\s+(.*))?$/.exec(text);
  if (!m) return null;
  return { key: m[1], val: m[3] !== undefined ? parseScalar(m[3], ln) : null, hasVal: m[3] !== undefined };
}

// 行 -> {indent, isItem, text}；空行/纯注释行返回 null
function lexLine(raw, ln) {
  if (/\t/.test(raw.match(/^\s*/)[0])) throw new Error(`第${ln}行: Tab 缩进不支持`);
  const stripped = stripComment(raw);
  if (!stripped.trim()) return null;
  const indent = stripped.match(/^ */)[0].length;
  let text = stripped.slice(indent);
  let isItem = false;
  if (text === '-' || text.startsWith('- ')) { isItem = true; text = text === '-' ? '' : text.slice(2); }
  return { indent, isItem, text, ln };
}

export function parseYamlLite(text) {
  const lines = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const l = lexLine(raw, i + 1);
    if (l) lines.push(l);
  });
  if (!lines.length) return {};
  if (lines[0].text === '---') lines.shift();
  let pos = 0;

  function parseBlock(minIndent) {
    const first = lines[pos];
    if (!first || first.indent < minIndent) return null;
    if (first.isItem) return parseList(first.indent);
    return parseMap(first.indent);
  }

  // 重复键=静默覆盖（YAML last-wins）——对契约文件即"死配置"信号，
  // warn 不 throw（兼容既有 yaml 使用者；契约侧另有 lint 位）
  const seen = (obj, key, ln) => {
    if (Object.hasOwn(obj, key))
      console.error(`[yaml-lite] 第${ln}行: 重复键 '${key}'——后者覆盖前者`);
  };

  function parseMap(indent) {
    const obj = {};
    while (pos < lines.length) {
      const l = lines[pos];
      if (l.indent < indent || l.isItem) break;
      if (l.indent > indent) throw new Error(`第${l.ln}行: 意外缩进（父键无块承接）`);
      const kv = splitKeyVal(l.text, l.ln);
      if (!kv) throw new Error(`第${l.ln}行: 无法解析 '${l.text.slice(0, 40)}'`);
      pos++;
      seen(obj, kv.key, l.ln);
      if (kv.hasVal) { obj[kv.key] = kv.val; continue; }
      // key: 无行内值——子块或空
      if (pos < lines.length && lines[pos].indent > l.indent) {
        obj[kv.key] = parseBlock(l.indent + 1);
      } else obj[kv.key] = null;
    }
    return obj;
  }

  function parseList(indent) {
    const arr = [];
    while (pos < lines.length) {
      const l = lines[pos];
      if (l.indent < indent || !l.isItem) break;
      if (l.indent > indent) throw new Error(`第${l.ln}行: 列表项意外缩进`);
      const kv = splitKeyVal(l.text, l.ln);
      if (kv && (kv.hasVal || (pos + 1 < lines.length && lines[pos + 1].indent > l.indent))) {
        // - key: v 或 - key: <子块> —— map 项，续行键在更深缩进
        const item = {};
        pos++;
        if (kv.hasVal) item[kv.key] = kv.val;
        else if (pos < lines.length && lines[pos].indent > l.indent) item[kv.key] = parseBlock(l.indent + 1);
        else item[kv.key] = null;
        // 续行 map 键：缩进 > 项缩进且非 item
        while (pos < lines.length && lines[pos].indent > l.indent && !lines[pos].isItem) {
          const c = lines[pos];
          const ckv = splitKeyVal(c.text, c.ln);
          if (!ckv) throw new Error(`第${c.ln}行: 无法解析 '${c.text.slice(0, 40)}'`);
          pos++;
          seen(item, ckv.key, c.ln);
          if (ckv.hasVal) item[ckv.key] = ckv.val;
          else if (pos < lines.length && lines[pos].indent > c.indent) item[ckv.key] = parseBlock(c.indent + 1);
          else item[ckv.key] = null;
        }
        // 续行嵌套 list（- key:\n    - a）：上面 while 已吃非 item 行；
        // 若续行是 deeper item，parseBlock 在 key 分支已处理
        arr.push(item);
        continue;
      }
      // - scalar
      arr.push(parseScalar(l.text, l.ln));
      pos++;
    }
    return arr;
  }

  const out = parseBlock(0);
  if (pos < lines.length) throw new Error(`第${lines[pos].ln}行: 解析未完全消费（结构不合法）`);
  return out;
}

export function loadYaml(p) {
  const text = fs.readFileSync(p, 'utf8');
  try {
    return parseYamlLite(text);
  } catch (liteErr) {
    const r = spawnSync('pwsh', ['-NoProfile', '-File', YAML2JSON, '-Path', p],
      { encoding: 'utf8', timeout: 120_000 }); // 与 loadRegistryCanonical 同上界——pwsh 冷启动+AV 扫描 flake 面
    if (r.status === 0 && r.stdout) return JSON.parse(r.stdout);
    die(`yaml 解析失败（lite: ${liteErr.message}；pwsh 桥: ${(r.stderr || r.error?.message || '不可用').toString().slice(0, 120)}）: ${path.basename(p)}`);
  }
}
