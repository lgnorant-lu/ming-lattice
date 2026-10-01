#!/usr/bin/env bash
# install.sh — host-tools POSIX 部署适配器（Linux/macOS/Git Bash 通用）
# 与 install.ps1 同职不同端：shims→~/.local/bin（chmod +x，POSIX 刚需）、
# hints 托管块→~/.bashrc + ~/.zshrc（存在的都挂）、tools 入口
# 用法: ./install.sh [--uninstall]   HT_HOME 注入可隔离测试
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
home="${HT_HOME:-$HOME}"
bindir="$home/.local/bin"
uninstall=0
[ "${1:-}" = "--uninstall" ] && uninstall=1

if [ "$uninstall" = 1 ]; then
  for s in "$here"/shims/*; do
    n=$(basename "$s")
    [ -f "$bindir/$n" ] && rm "$bindir/$n" && echo "removed $bindir/$n"
  done
  [ -f "$bindir/tools" ] && rm "$bindir/tools" && echo "removed $bindir/tools"
  echo 'rc 托管块请手动删除（>>> ming host-tools hints 段）——不动用户手改区'
  exit 0
fi

mkdir -p "$bindir"
for s in "$here"/shims/*; do
  n=$(basename "$s")
  # LF + UTF-8 无 BOM 落盘（POSIX shebang 对 CRLF/BOM 零容忍）
  tr -d '\r' < "$s" | sed '1s/^\xef\xbb\xbf//' > "$bindir/$n"
  chmod +x "$bindir/$n"
  echo "shim -> $bindir/$n"
done

# tools 入口
cat > "$bindir/tools" <<EOF
#!/usr/bin/env bash
exec node "$here/tools.mjs" "\$@"
EOF
chmod +x "$bindir/tools"
echo "tools -> $bindir/tools"

# hints 托管块：存在的 rc 都挂（幂等——已有块则原位刷新）
hints="$(node "$here/tools.mjs" gen-hints)"
for rc in "$home/.bashrc" "$home/.zshrc"; do
  [ -f "$rc" ] || continue
  # BOM/UTF-16 体检：脏则原位修（留 .bak）
  if head -c 2 "$rc" | grep -q $'\xff\xfe'; then
    cp "$rc" "$rc.bak"
    iconv -f UTF-16LE -t UTF-8 "$rc.bak" | sed '1s/^\xef\xbb\xbf//' > "$rc"
    echo "$rc UTF-16 已修（备份 $rc.bak）"
  elif head -c 3 "$rc" | grep -q $'\xef\xbb\xbf'; then
    sed -i '1s/^\xef\xbb\xbf//' "$rc"
    echo "$rc UTF-8 BOM 已剥"
  fi
  if grep -q '>>> ming host-tools hints' "$rc"; then
    # 原位换块（awk 切标记段）
    awk -v block="$hints" '
      /^# >>> ming host-tools hints >>>/ { printf "%s\n", block; skip=1; next }
      /^# <<< ming host-tools hints <<</ { skip=0; next }
      !skip { print }
    ' "$rc" > "$rc.tmp" && mv "$rc.tmp" "$rc"
    echo "$rc hints 块已刷新"
  else
    printf '\n%s\n' "$hints" >> "$rc"
    echo "$rc 挂载 hints 托管块"
  fi
done
echo '完成。tools doctor 验证部署健康度'
