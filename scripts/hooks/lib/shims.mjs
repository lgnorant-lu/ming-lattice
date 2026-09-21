// scripts/hooks/lib/shims.mjs
// .githooks 薄 shim 规范模板——install/doctor 生成与健康检查对账共用单一事实源
// 形态：POSIX sh + node 调度；engineRef 支持两种：
//   仓内自托管: $(dirname "$0")/../scripts/hooks/engine.mjs（相对式，默认）
//   引用模型:   绝对 store 路径（install/doctor 时烘焙）
export const HOOK_STAGES = ['pre-commit', 'commit-msg', 'pre-push', 'post-merge'];
export const REPO_ENGINE_REF = '$(dirname "$0")/../scripts/hooks/engine.mjs';

export function shimScript(stage, engineRef = REPO_ENGINE_REF) {
  const note = stage === 'post-merge' ? '（chore 族宿主：suggest-only，永不阻断）' : '';
  const arg = stage === 'commit-msg' ? ' "$1"' : '';
  const tail = stage === 'post-merge' ? 'exit 0\n' : '';
  return `#!/usr/bin/env sh\n# ming-skills ${stage} hook -> 门禁引擎调度${note}\n# 跨平台兼容 (Git for Windows / macOS / Linux)\n\nnode "${engineRef}" ${stage}${arg}\n${tail}`;
}

// 提取 shim 内 node "..." 引擎引用；非本引擎 shim 返回 null
export function shimEngineRef(text) {
  const m = text.match(/node\s+"(.*?engine\.mjs)"/);
  return m ? m[1] : null;
}
