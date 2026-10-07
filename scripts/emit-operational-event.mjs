import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOperationalEvent, emitEvent } from '../private/ming-skills-router/scripts/observability.mjs';

// 仓默认 telemetry sink：env 未配时落 .ming/lattice/state（gitignored 运行时面）——
// 让 gardener-trend 探针有数据可吃；仍可用 $MING_SKILLS_EVENT_FILE 覆盖。
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.MING_SKILLS_EVENT_FILE ??= path.join(ROOT, '.ming', 'lattice', 'state', 'operational-events.jsonl');

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

if (input.trim()) {
  try {
    const spec = JSON.parse(input);
    emitEvent(createOperationalEvent(spec));
  } catch (e) {
    console.error(`[emit-operational-event] 事件拒绝: ${e.message}（stdin 须为合规 JSON spec）`);
    process.exitCode = 1;
  }
}
