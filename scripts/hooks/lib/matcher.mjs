// scripts/hooks/lib/matcher.mjs
// 统一 glob 匹配器（lint-staged 语义）——禁各 gate 手搓正则
//   *   → 不跨目录分隔符
//   **  → 跨目录任意
//   ?   → 单字符（不跨分隔符）
//   无斜杠 glob 匹配 basename（"*.js" 命中任意深度的 x.js）
//   有斜杠 glob 匹配仓库相对全路径（"docs/*.md" 不命中 a/docs/x.md——与 lint-staged 一致）
// 扩展：逗号分隔多 glob 在调用侧拆开；本模块只管单 glob

const REGEX_CHARS = /[.+^${}()|[\]\\]/g;

export function globToRegExp(glob) {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          // **/ 前缀或中段：零到多段目录——"**/x.js" 命中 "x.js" 与 "a/b/x.js"，但不命中 "ax.js"
          out += '(?:[^/]*/)*';
          i += 3;
        } else {
          // 句尾或独立 **：跨段任意
          out += '.*';
          i += 2;
        }
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      out += '[^/]';
      i += 1;
    } else {
      out += c.replace(REGEX_CHARS, '\\$&');
      i += 1;
    }
  }
  return new RegExp(`^${out}$`);
}

/**
 * 路径是否命中任一 glob（归一化分隔符为 /）
 */
export function matchAnyGlobs(relPath, globs) {
  const norm = relPath.replace(/\\/g, '/');
  const base = norm.split('/').pop();
  for (const g of globs) {
    const re = globToRegExp(g.trim());
    if (g.includes('/')) {
      if (re.test(norm)) return true;
    } else if (re.test(base)) {
      return true;
    }
  }
  return false;
}
