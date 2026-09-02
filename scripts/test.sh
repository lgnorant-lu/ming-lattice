#!/usr/bin/env sh
# scripts/test.sh — ming-skills 自动化测试运行器 (POSIX Shell / Linux / macOS / Git Bash)
# 职责: 薄外壳转发，将命令行参数与退出码透传给 node tests/run.mjs

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] 未找到 node 运行时，请先安装 Node.js (v18+)" >&2
    exit 1
fi

node tests/run.mjs "$@"
exit $?
