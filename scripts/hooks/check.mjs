// scripts/hooks/check.mjs
// ming-skills 提交前暂存区全项门禁检查器 (pre-commit hook 驱动)
// 包含: 大文件防御 / 乱码拦截 / 敏感密钥扫描 / Emoji 扫描 / lint.ps1 完整性验证

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadHookConfig, hasEmoji, hasMojibake } from './validate.mjs';

const ROOT_DIR = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1'), '..');

// 高危生产凭据匹配正则 (排除已知测试桩或通用词)
const DANGEROUS_SECRET_PATTERNS = [
  { name: 'GitHub Personal Token', regex: /\bghp_[a-zA-Z0-9]{36,}\b/ },
  { name: 'OpenAI Secret Key', regex: /\bsk-[a-zA-Z0-9]{32,}\b/ },
  { name: 'AWS Access Key ID', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Private Key PEM', regex: /-----BEGIN (?:RSA|EC|OPENSSH|DSA|PGP) PRIVATE KEY-----/ },
];

function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACMR', {
      cwd: ROOT_DIR,
      encoding: 'utf8'
    });
    return output.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function runPreCommitChecks() {
  const config = loadHookConfig(ROOT_DIR);
  const staged = getStagedFiles();

  if (staged.length === 0) {
    process.exit(0);
  }

  console.log(`[pre-commit] 开始门禁检查 (${staged.length} 个暂存文件)...`);
  let hasError = false;

  for (const relPath of staged) {
    const fullPath = path.join(ROOT_DIR, relPath);
    if (!fs.existsSync(fullPath)) continue;

    const stat = fs.statSync(fullPath);

    // 1. 大文件防御门禁 (> 50MB 严禁提交)
    if (stat.size > 50 * 1024 * 1024) {
      console.error(`[ERROR] 拦截到超大文件: ${relPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB > 50MB 阈值)`);
      console.error('        请将其加入 .gitignore 或使用 Git LFS 管理！');
      hasError = true;
    }

    // 只对文本与规范文件进行内容深度检测
    if (/\.(md|yaml|yml|json|ps1|js|mjs|ts)$/i.test(relPath)) {
      let content = '';
      try {
        content = fs.readFileSync(fullPath, 'utf8');
      } catch (e) {
        continue;
      }

      // 2. 编码防污染检查 (Mojibake)
      if (config.mojibakeLevel !== 'off' && !relPath.startsWith('scripts/hooks/') && hasMojibake(content)) {
        const msg = `[${config.mojibakeLevel.toUpperCase()}] 文件包含 GBK/ANSI 转义乱码: ${relPath}`;
        if (config.mojibakeLevel === 'error') {
          console.error(msg);
          hasError = true;
        } else {
          console.warn(msg);
        }
      }

      // 3. Emoji 绝对禁令检查 (限文档与自研技能)
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

      // 4. 真实生产敏感密钥拦截 (排除第三方已知测试抓包案例)
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

  // 5. 自动化测试金字塔与完整性门禁 (执行 tests/run.mjs)
  if (config.lintLevel !== 'off' && !hasError) {
    console.log('[pre-commit] 运行自动化测试套件 (tests/run.mjs)...');
    try {
      execSync('node tests/run.mjs', {
        cwd: ROOT_DIR,
        stdio: 'inherit'
      });
    } catch (e) {
      console.error('[ERROR] 自动化测试套件校验失败，禁止提交！');
      hasError = true;
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
