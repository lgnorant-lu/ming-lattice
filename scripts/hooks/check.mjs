// scripts/hooks/check.mjs
// ming-skills 提交前暂存区全项门禁检查器 (pre-commit hook 驱动)
// 包含: 大文件防御 / 乱码拦截 / 敏感密钥扫描 / Emoji 扫描 / 影响面测试分流

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadHookConfig, hasEmoji, hasMojibake } from './validate.mjs';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

// 高危生产凭据匹配正则 (排除已知测试桩或通用词)
const DANGEROUS_SECRET_PATTERNS = [
  { name: 'GitHub Personal Token', regex: /\bghp_[a-zA-Z0-9]{36,}\b/ },
  { name: 'OpenAI Secret Key', regex: /\bsk-[a-zA-Z0-9]{32,}\b/ },
  { name: 'AWS Access Key ID', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Private Key PEM', regex: /-----BEGIN (?:RSA|EC|OPENSSH|DSA|PGP) PRIVATE KEY-----/ },
];

function getStagedFiles() {
  const output = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
    cwd: ROOT_DIR,
    encoding: 'utf8'
  });
  return output.split('\0').filter(Boolean);
}

function getUnstagedFiles() {
  try {
    const output = execFileSync('git', ['diff', '--name-only', '-z'], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    return new Set(output.split('\0').filter(Boolean));
  } catch {
    return new Set();
  }
}

async function runPreCommitChecks() {
  const config = loadHookConfig(ROOT_DIR);
  const staged = getStagedFiles();

  if (staged.length === 0) {
    process.exit(0);
  }

  console.log(`[pre-commit] 开始门禁检查 (${staged.length} 个暂存文件)...`);
  let hasError = false;

  // 1. 批量检出对象元数据 (利用 git cat-file --batch-check 单次进程批量获取)
  const batchInput = staged.map(p => `:${p}`).join('\n') + '\n';
  let batchOutput = '';
  try {
    batchOutput = execFileSync('git', ['cat-file', '--batch-check'], {
      cwd: ROOT_DIR,
      input: batchInput,
      encoding: 'utf8'
    });
  } catch (e) {
    // 降级回退
    batchOutput = '';
  }

  const fileMetaMap = new Map();
  if (batchOutput) {
    const lines = batchOutput.trim().split('\n');
    for (let i = 0; i < lines.length && i < staged.length; i++) {
      const parts = lines[i].trim().split(' ');
      if (parts.length >= 3) {
        fileMetaMap.set(staged[i], { type: parts[1], size: Number(parts[2]) });
      }
    }
  }

  // 检测工作树与暂存区重叠漂移 (部分暂存感知)
  const unstagedSet = getUnstagedFiles();
  const overlappingFiles = staged.filter(f => unstagedSet.has(f));
  if (overlappingFiles.length > 0) {
    console.warn(`[pre-commit] [WARN] 检测到 ${overlappingFiles.length} 个暂存文件在工作树存在未暂存的后续修改 (例如: ${overlappingFiles.slice(0, 3).join(', ')}${overlappingFiles.length > 3 ? '...' : ''})。`);
    console.warn('        提示: 静态扫描读取暂存 blob，而测试套件基于工作树执行。若有未暂存修改，请仔细复核快照一致性！');
  }

  for (const relPath of staged) {
    const meta = fileMetaMap.get(relPath);
    const options = { cwd: ROOT_DIR, encoding: 'utf8' };
    const type = meta ? meta.type : execFileSync('git', ['cat-file', '-t', `:${relPath}`], options).trim();
    if (type !== 'blob') continue;
    const size = meta ? meta.size : Number(execFileSync('git', ['cat-file', '-s', `:${relPath}`], options).trim());

    // 大文件防御门禁 (> 50MB 严禁提交)
    if (size > 50 * 1024 * 1024) {
      console.error(`[ERROR] 拦截到超大文件: ${relPath} (${(size / 1024 / 1024).toFixed(2)} MB > 50MB 阈值)`);
      console.error('        请将其加入 .gitignore 或使用 Git LFS 管理！');
      hasError = true;
      continue;
    }

    // 只对文本与规范文件进行内容深度检测
    if (/\.(md|yaml|yml|json|ps1|js|mjs|ts)$/i.test(relPath)) {
      const content = execFileSync('git', ['cat-file', 'blob', `:${relPath}`], { ...options, maxBuffer: 50 * 1024 * 1024 });

      // 编码防污染检查 (Mojibake)
      if (config.mojibakeLevel !== 'off' && !relPath.startsWith('scripts/hooks/') && hasMojibake(content)) {
        const msg = `[${config.mojibakeLevel.toUpperCase()}] 文件包含 GBK/ANSI 转义乱码: ${relPath}`;
        if (config.mojibakeLevel === 'error') {
          console.error(msg);
          hasError = true;
        } else {
          console.warn(msg);
        }
      }

      // Emoji 绝对禁令检查 (限文档与自研技能)
      if (config.emojiLevel !== 'off' && (relPath.startsWith('private/') || relPath.startsWith('docs/') || relPath === 'README.md')) {
        if (hasEmoji(content)) {
          const msg = `[${config.emojiLevel.toUpperCase()}] 自研文件包含 Emoji 符号: ${relPath} (请使用 [禁止]/[警告] 等文本标签)`;
          if (config.emojiLevel === 'error') {
            console.error(msg);
            hasError = true;
          } else {
            console.warn(msg);
          }
        }
      }

      // 真实生产敏感密钥拦截 (排除第三方已知测试抓包案例)
      if (config.secretLevel !== 'off' && !relPath.startsWith('vertical/iwen-scraping/')) {
        for (const sec of DANGEROUS_SECRET_PATTERNS) {
          if (sec.regex.test(content)) {
            const msg = `[${config.secretLevel.toUpperCase()}] 疑似检测到真实敏感凭据 (${sec.name}): ${relPath}`;
            if (config.secretLevel === 'error') {
              console.error(msg);
              hasError = true;
            } else {
              console.warn(msg);
            }
          }
        }
      }
    }
  }

  // 2. 自动化测试影响面分流与执行 (使用 plan.mjs)
  if (config.lintLevel !== 'off' && !hasError) {
    let plan = null;
    try {
      const planModule = await import('./plan.mjs');
      plan = planModule.createPlan({ stage: 'pre-commit', files: staged });
    } catch {
      plan = null;
    }

    if (plan && plan.jobs.length === 0) {
      console.log(`[pre-commit] 影响面分析 (${plan.categories.join(', ')}): 无需执行运行期测试套件，极速放行！`);
    } else {
      const testArgs = ['tests/run.mjs', '--require-all'];
      if (plan && !plan.fallback && plan.jobs.length > 0) {
        testArgs.push('--suites', plan.jobs.join(','));
        console.log(`[pre-commit] 受影响测试调度 (${plan.jobs.length} 个套件: ${plan.jobs.join(', ')})...`);
      } else {
        console.log(`[pre-commit] 运行自动化测试全量矩阵 (${plan?.fallback || 'full'})...`);
      }

      try {
        execFileSync(process.execPath, testArgs, {
          cwd: ROOT_DIR,
          stdio: 'inherit'
        });
      } catch (e) {
        console.error('[ERROR] 自动化测试套件校验失败，禁止提交！');
        hasError = true;
      }
    }
  }

  if (hasError) {
    console.error('\n==================== [ming-skills pre-commit 门禁未通过] ====================');
    console.error('请修复上述错误后再行提交 (或检查 .hooksrc 配置)');
    console.error('=============================================================================\n');
    process.exit(1);
  }

  console.log('[pre-commit] 全项门禁检查通过！\n');
  process.exit(0);
}

runPreCommitChecks();
