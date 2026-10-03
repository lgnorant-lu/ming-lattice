// test-spawn-bound.test.mjs — spawn-bound.mjs 契约测试
// 核心断言：timeout 命中绞整棵进程树（孙进程不得孤儿逃逸）。
// 双端分述：Windows=taskkill /T /F；POSIX=ps BFS+SIGKILL。
// 本仓主战场是 Windows——POSIX 路径为结构正确性实现，真树绞断言双端同测
// （祖父进程写孙 PID 到文件，超时后断言孙 PID 已死）。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnBound, spawnBoundArgv, killTree } from '../../scripts/hooks/lib/spawn-bound.mjs';

const tmpBase = process.env.SKILLS_TEST_TMPDIR || os.tmpdir();

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; } // EPERM=存在但无权——仍是活的
}

async function waitDead(pid, budgetMs = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    if (!pidAlive(pid)) return true;
    await new Promise(r => setTimeout(r, 150));
  }
  return false;
}

export async function run() {
  const tmp = fs.mkdtempSync(path.join(tmpBase, 'skc-test-spawnbound-'));
  try {
    // 1. spawnBoundArgv capture：exit-0 + stdout 捕获
    {
      const r = await spawnBoundArgv(process.execPath,
        ['-e', 'console.log("hi")'], { capture: true });
      assert.equal(r.status, 0);
      assert.equal(r.stdout.trim(), 'hi');
      assert.equal(r.timedOut, false);
      console.log('  -> capture exit-0 passed');
    }

    // 2. spawnBound shell 命令正常退出（不触发绞杀路径）
    {
      const q = process.execPath.includes(' ') ? `"${process.execPath}"` : process.execPath;
      const r = await spawnBound(`${q} -e "process.exit(0)"`, { timeoutMs: 30_000 });
      assert.equal(r.status, 0);
      assert.equal(r.timedOut, false);
      console.log('  -> spawnBound shell exit-0 passed');
    }

    // 3. timeout 命中：timedOut 置位 + 快速结算（不等子进程自然死）
    {
      const t0 = Date.now();
      const r = await spawnBoundArgv(process.execPath,
        ['-e', 'setInterval(()=>{},1e3)'], { timeoutMs: 800 });
      assert.equal(r.timedOut, true, 'timeout 应置 timedOut');
      assert.ok(Date.now() - t0 < 15_000, '结算不得超过绞杀预算');
      console.log('  -> timeout kill passed');
    }

    // 4. 树绞杀核心断言：祖父→孙 二级进程，超时后孙不得孤儿存活
    {
      const pidFile = path.join(tmp, 'grandchild.pid');
      const gp = path.join(tmp, 'grandparent.mjs');
      // 祖父：spawn 孙进程（同平台同组），把孙 PID 写出来，然后自己挂住
      fs.writeFileSync(gp,
        `import { spawn } from 'node:child_process';\n` +
        `import fs from 'node:fs';\n` +
        `const gc = spawn(process.execPath, ['-e', 'setInterval(()=>{},1e3)'],` +
        ` { stdio: 'ignore' });\n` +
        `fs.writeFileSync(${JSON.stringify(pidFile)}, String(gc.pid));\n` +
        `setInterval(()=>{},1e3);\n`);
      const t0 = Date.now();
      const r = await spawnBoundArgv(process.execPath, [gp], { timeoutMs: 1500 });
      assert.equal(r.timedOut, true);
      assert.ok(fs.existsSync(pidFile), '祖父应已写出孙 PID');
      const gpid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
      assert.ok(Number.isFinite(gpid) && gpid > 0, '孙 PID 应可读');
      const dead = await waitDead(gpid);
      assert.ok(dead,
        `孙进程 ${gpid} 在父树绞杀后仍存活——孤儿逃逸（树绞杀失效）`);
      console.log(`  -> tree-kill grandchild reaped (pid=${gpid}, ${Date.now() - t0}ms)`);
    }

    // 5. killTree 边界：null/不存在 PID 不抛
    {
      killTree(null);
      killTree(0);
      killTree(99999999); // 不存在 PID——best-effort 不抛
      console.log('  -> killTree edge cases passed');
    }

    console.log('  spawn-bound 契约断言全过');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}
