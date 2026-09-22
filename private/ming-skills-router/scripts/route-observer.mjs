// private/ming-skills-router/scripts/route-observer.mjs
// Stage-0 纯观测 UserPromptSubmit hook：stdin JSON -> Decide -> append .logs/route-observed.jsonl
//
// 契约：stdout 恒空、exit 恒 0、永不注入——advisory 通道 fail-silent，
// 观察者崩了也不许阻塞或改写 prompt。与 route-core --miss-log 的区别：
// miss 台账只记弱判定，本台账记全量决策（离线 recall 需要分母）。
//
// 挂法（Claude Code settings.json）：
//   "hooks": { "UserPromptSubmit": [{ "hooks": [{ "type": "command",
//     "command": "node D:/dogepy/skills-collection/scripts/route-observer.mjs" }] }] }
// 挂法（Devin CLI .devin/hooks.v1.json）：
//   { "UserPromptSubmit": [{ "matcher": "", "hooks": [{ "type": "command",
//     "command": "node D:/dogepy/skills-collection/scripts/route-observer.mjs --src devin-hook" }] }] }
// 其他宿主：同形 stdin JSON 即可，字段提取是宽容多名的（见 FIELD_CANDIDATES）。
//
// 配置：MING_SKILLS_OBSERVE_LOG=<path|off>（默认 <repoRoot>/.logs/route-observed.jsonl）
//       MING_SKILLS_OBSERVE_SRC=<label>  （默认 claude-hook，其他宿主改标识）
// 轮换：文件 > 1MB 时整体改名为 .1.jsonl（单代，上限约 2MB 足迹）
// 无实时会话态：session_seq 等离线可导出量不落文件（消融结论 2026-09-22）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Decide } from './route-core.mjs';

const OBSERVED_SCHEMA = 'route-observed/1';
const HINT_EXCERPT_MAX = 1000;   // 明文截断界：语义分析够用，限制单事件体量
const LOG_MAX_BYTES = 1024 * 1024; // 1MB 触发单代轮换
const STDIN_MAX_BYTES = 8 * 1024 * 1024; // 输入上限，超限按损坏输入记一条
const DEFAULT_LOG = path.resolve(fileURLToPath(import.meta.url), '../../../..', '.logs', 'route-observed.jsonl');

// 宽容字段提取：同名异构的宿主 payload 共用一份小适配表
const FIELD_CANDIDATES = {
  hint: ['prompt', 'hint', 'message', 'content'],
  session: ['session_id', 'session', 'conversation_id'],
  transcript: ['transcript_path', 'transcript'],
  cwd: ['cwd', 'workspace']
};

function pick(payload, key) {
  const value = FIELD_CANDIDATES[key]
    .map(name => payload?.[name])
    .find(v => typeof v === 'string' && v.length > 0);
  return value ?? null;
}

function loadManifest() {
  const manifestPath = path.resolve(fileURLToPath(import.meta.url), '../../config/router-manifest.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function rotateIfNeeded(file) {
  try {
    if (fs.statSync(file).size > LOG_MAX_BYTES) {
      fs.rmSync(`${file}.1`, { force: true });
      fs.renameSync(file, `${file}.1`);
    }
  } catch {
    // ENOENT = 首次写入，其余异常交给 append 的失败分支处理
  }
}

function appendRecord(file, record) {
  rotateIfNeeded(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
}

function baseRecord(src) {
  return { v: OBSERVED_SCHEMA, ts: new Date().toISOString(), src };
}

function readStdin() {
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise(resolve => {
    const chunks = [];
    let size = 0;
    process.stdin.on('data', chunk => {
      size += chunk.length;
      if (size <= STDIN_MAX_BYTES) chunks.push(chunk);
    });
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(''));
  });
}

export async function runObserverCli(args = process.argv.slice(2)) {
  const startedAt = process.hrtime.bigint();
  const elapsedMs = () => Number(process.hrtime.bigint() - startedAt) / 1e6;
  let src = process.env.MING_SKILLS_OBSERVE_SRC || 'claude-hook';
  const logFile = process.env.MING_SKILLS_OBSERVE_LOG ?? DEFAULT_LOG;
  if (logFile === 'off') return 0;
  const positionals = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--src') {
      // 缺值不致命：保持默认 src，observer 永不为参数问题非零退出
      if (args[index + 1] && !args[index + 1].startsWith('--')) src = args[++index];
    } else if (arg.startsWith('--src=')) {
      src = arg.slice('--src='.length) || src;
    } else {
      positionals.push(arg);
    }
  }

  const record = baseRecord(src);
  try {
    let raw = await readStdin();
    if (!raw && positionals.length) raw = JSON.stringify({ prompt: positionals.join(' ') }); // 手动冒烟入口
    if (!raw.trim()) {
      record.error = 'empty_stdin';
    } else {
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        record.error = 'bad_stdin_json';
        record.bytes = raw.length;
      }
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const hint = pick(payload, 'hint') ?? '';
        record.session = pick(payload, 'session');
        record.transcript = pick(payload, 'transcript');
        record.cwd = pick(payload, 'cwd') ?? process.cwd();
        record.hint = hint.slice(0, HINT_EXCERPT_MAX);
        record.hint_len = hint.length;
        try {
          record.decision = Decide(hint, loadManifest());
        } catch (error) {
          record.error = 'decide_failed';
          record.error_type = error?.constructor?.name ?? 'Error';
        }
      } else if (!record.error) {
        record.error = 'bad_stdin_shape';
        record.bytes = raw.length;
      }
    }
  } catch (error) {
    record.error = 'observer_failed';
    record.error_type = error?.constructor?.name ?? 'Error';
  }
  record.elapsed_ms = Math.round(elapsedMs() * 100) / 100;

  try {
    appendRecord(logFile, record);
  } catch {
    console.error('route_observe_failed: output unavailable'); // exit 0 依旧
  }
  return 0;
}

const isEntryScript = process.argv[1] && (() => {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isEntryScript) {
  process.exitCode = await runObserverCli();
}
