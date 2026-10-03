import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';

const project = path.resolve(import.meta.dirname, '../..');
for (const scenario of ['staged-secret', 'unstaged-secret', 'deleted-working-file', 'unicode-path']) {
  test(`index scanning: ${scenario}`, () => {
    const temp = fs.mkdtempSync(path.join(process.env.SKILLS_TEST_TMPDIR || os.tmpdir(), 'ming-index-'));
    try {
      const root = path.join(temp, 'repo with spaces');
      // 引擎化后 check.mjs 是薄入口——整套 hooks 目录（engine/lib/gates）都需就位
      fs.cpSync(path.join(project, 'scripts/hooks'), path.join(root, 'scripts/hooks'), { recursive: true });
      fs.writeFileSync(path.join(root, '.hooksrc'), 'lintLevel=off\nsecretLevel=error\n');
      execFileSync('git', ['init', '-q', root], { timeout: 30_000 });
      const file = scenario === 'unicode-path' ? '\u914d\u7f6e space.json' : 'config.json';
      const full = path.join(root, file);
      const secret = JSON.stringify({ token: 'ghp_' + 'A'.repeat(36) });
      fs.writeFileSync(full, scenario === 'unstaged-secret' ? '{}' : secret);
      execFileSync('git', ['add', '--', file], { cwd: root, timeout: 30_000 });
      if (scenario === 'deleted-working-file') fs.rmSync(full);
      else fs.writeFileSync(full, scenario === 'unstaged-secret' ? secret : '{}');
      // 引擎全量在负载/AV 下实测 >30s flake——预算提到 120s（有界不缺席）
      const result = spawnSync(process.execPath, [path.join(root, 'scripts/hooks/check.mjs')], { cwd: root, encoding: 'utf8', timeout: 120_000 });
      assert.equal(result.status, scenario === 'unstaged-secret' ? 0 : 1, result.stderr);
      if (scenario !== 'unstaged-secret') assert.ok(result.stderr.includes(file), result.stderr);
    } finally {
      // 同 test-cli-tools：Windows 拆台 EBUSY 竞态——重试吸收瞬时锁
      fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    }
  });
}
