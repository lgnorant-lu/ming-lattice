import { createOperationalEvent, emitEvent } from '../private/ming-skills-router/scripts/observability.mjs';

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
