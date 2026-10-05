#!/usr/bin/env sh
# scripts/install-hooks.sh — 一键安装与配置 ming-skills Git Hooks (Linux/macOS/Git Bash)
# 用法:
#   ./install-hooks.sh              本仓安装
#   ./install-hooks.sh -t <repo>    脚手架模式：kit 铺进目标仓（转调 install-hooks.mjs，无 pwsh 环境通道）
#     附加旗标透传: --force --with-boundary --dry-run

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [ "$1" = "-t" ] || [ "$1" = "--target" ]; then
  shift
  exec node scripts/install-hooks.mjs --target "$@"
fi

git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true

echo "========================================================"
echo "  ming-skills Git Hooks 门禁体系安装成功！"
echo "  - core.hooksPath = .githooks"
echo "  - commit-msg     : 强制 Conventional Commits 格式 + 禁 Emoji"
echo "  - pre-commit     : 编码防乱码 + 密钥防泄漏 + 大文件 + lint.ps1 验证"
echo "========================================================"
