#!/usr/bin/env sh
# scripts/install-hooks.sh — 一键安装与配置 ming-skills Git Hooks (Linux/macOS/Git Bash)

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true

echo "========================================================"
echo "  ming-skills Git Hooks 门禁体系安装成功！"
echo "  - core.hooksPath = .githooks"
echo "  - commit-msg     : 强制 Conventional Commits 格式 + 禁 Emoji"
echo "  - pre-commit     : 编码防乱码 + 密钥防泄漏 + 大文件 + lint.ps1 验证"
echo "========================================================"
