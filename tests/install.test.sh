#!/usr/bin/env bash
# install.sh 的测试。全部使用 --dry-run（或者在到达 claude 之前就会退出的参数），不触碰任何真实的 Claude Code 配置。
# 任何一项不符，退出码为 1。
set -u
cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd -P)

# macOS 自带 bash 3.2：有的话就用它跑，保证脚本在最老的 bash 上也能用
if [ -x /bin/bash ]; then BASH_BIN=/bin/bash; else BASH_BIN=bash; fi

fails=0
pass=0
ok() { pass=$((pass + 1)); }
bad() { echo "FAIL: $1" >&2; fails=$((fails + 1)); }

# 取 stdout 里以 "+ " 开头的行
plus_lines() { printf '%s\n' "$1" | grep '^+ '; }
count_matching() { printf '%s\n' "$1" | grep -c -- "$2"; }

expect_count() { # <说明> <文本> <模式> <期望个数>
  local n
  n=$(count_matching "$2" "$3")
  if [ "$n" = "$4" ]; then ok; else bad "$1：模式 $3 期望 $4 行，实际 $n 行"; fi
}
expect_has() { # <说明> <文本> <模式>
  if printf '%s\n' "$2" | grep -q -- "$3"; then ok; else bad "$1：缺少 $3"; fi
}
expect_not() { # <说明> <文本> <模式>
  if printf '%s\n' "$2" | grep -q -- "$3"; then bad "$1：不该出现 $3"; else ok; fi
}
expect_code() { # <说明> <实际> <期望>
  if [ "$2" = "$3" ]; then ok; else bad "$1：退出码期望 $3，实际 $2"; fi
}

# 1. 两个配置目录 + 课程目录：正好 6 条命令，各 3 条
out=$("$BASH_BIN" install.sh --dry-run --config-dir /tmp/a --config-dir /tmp/b --courses-dir /tmp/c 2>&1); code=$?
expect_code "两个目录" "$code" 0
plus=$(plus_lines "$out")
expect_count "两个目录" "$plus" '^+ ' 6
expect_count "两个目录" "$plus" 'CLAUDE_CONFIG_DIR=/tmp/a ' 3
expect_count "两个目录" "$plus" 'CLAUDE_CONFIG_DIR=/tmp/b ' 3
expect_count "两个目录" "$plus" 'marketplace add ' 2
expect_count "两个目录" "$plus" 'install learn-anything@learn-anything-local --scope user' 2
expect_count "两个目录" "$plus" 'configure learn-anything@learn-anything-local --values-stdin' 2
expect_has "marketplace 加的是仓库根" "$plus" "marketplace add $ROOT\$"
expect_has "课程目录写进标准输入" "$plus" '{"courses_dir":"/tmp/c"}'

# 命令顺序：add、install、configure
first_three=$(printf '%s\n' "$plus" | head -n 3)
expect_has "顺序" "$(printf '%s\n' "$first_three" | sed -n 1p)" 'marketplace add'
expect_has "顺序" "$(printf '%s\n' "$first_three" | sed -n 2p)" ' install '
expect_has "顺序" "$(printf '%s\n' "$first_three" | sed -n 3p)" 'configure'

# 2. 不给 --courses-dir：没有 configure 行
out=$("$BASH_BIN" install.sh --dry-run --config-dir /tmp/a 2>&1); code=$?
expect_code "无课程目录" "$code" 0
plus=$(plus_lines "$out")
expect_count "无课程目录" "$plus" '^+ ' 2
expect_not "无课程目录" "$out" 'configure'

# 3. 卸载：有 uninstall 和 marketplace remove；没有单独的 install 命令（"uninstall" 里的 install 不算）
out=$("$BASH_BIN" install.sh --uninstall --dry-run --config-dir /tmp/a 2>&1); code=$?
expect_code "卸载" "$code" 0
plus=$(plus_lines "$out")
expect_count "卸载" "$plus" '^+ ' 2
expect_has "卸载" "$plus" 'plugin uninstall learn-anything@learn-anything-local --scope user'
expect_has "卸载" "$plus" 'marketplace remove learn-anything-local'
expect_not "卸载" "$plus" ' plugin install '
expect_not "卸载" "$plus" 'marketplace add'

# 4. 参数错误：退出码 2
"$BASH_BIN" install.sh --dry-run --nope >/dev/null 2>&1; expect_code "未知参数" "$?" 2
"$BASH_BIN" install.sh --dry-run --courses-dir relative/dir >/dev/null 2>&1; expect_code "相对的课程目录" "$?" 2
"$BASH_BIN" install.sh --dry-run --courses-dir >/dev/null 2>&1; expect_code "--courses-dir 缺参数" "$?" 2
"$BASH_BIN" install.sh --dry-run --config-dir >/dev/null 2>&1; expect_code "--config-dir 缺参数" "$?" 2
"$BASH_BIN" install.sh --dry-run --config-dir relative >/dev/null 2>&1; expect_code "相对的配置目录" "$?" 2
"$BASH_BIN" install.sh --dry-run --uninstall --courses-dir /tmp/c >/dev/null 2>&1; expect_code "卸载时给课程目录" "$?" 2
"$BASH_BIN" install.sh --dry-run --courses-dir "$(printf '/tmp/a\nb')" >/dev/null 2>&1; expect_code "课程目录含换行" "$?" 2

# 5. 默认目录：默认目录不加前缀；~/.claude-ccswitch 存在时处理它；CLAUDE_CONFIG_DIR 指向别处时也处理它
home=$(mktemp -d)
out=$(HOME="$home" env -u CLAUDE_CONFIG_DIR "$BASH_BIN" install.sh --dry-run 2>&1); code=$?
expect_code "默认目录" "$code" 0
plus=$(plus_lines "$out")
expect_count "默认目录，没有 ccswitch" "$plus" '^+ ' 2
expect_not "默认目录没有前缀" "$plus" 'CLAUDE_CONFIG_DIR'

mkdir "$home/.claude-ccswitch"
out=$(HOME="$home" env -u CLAUDE_CONFIG_DIR "$BASH_BIN" install.sh --dry-run --courses-dir /tmp/c 2>&1)
plus=$(plus_lines "$out")
expect_count "默认加 ccswitch" "$plus" '^+ ' 6
expect_count "默认加 ccswitch" "$plus" "CLAUDE_CONFIG_DIR=$home/.claude-ccswitch " 3
expect_count "默认加 ccswitch" "$plus" 'CLAUDE_CONFIG_DIR' 3

out=$(HOME="$home" CLAUDE_CONFIG_DIR=/tmp/other "$BASH_BIN" install.sh --dry-run 2>&1)
plus=$(plus_lines "$out")
expect_count "环境变量的目录" "$plus" '^+ ' 6
expect_count "环境变量的目录" "$plus" 'CLAUDE_CONFIG_DIR=/tmp/other ' 2
expect_count "环境变量的目录，默认目录仍无前缀" "$plus" '^+ claude ' 2

# 环境变量指向默认目录或 ccswitch 时不重复处理
out=$(HOME="$home" CLAUDE_CONFIG_DIR="$home/.claude/" "$BASH_BIN" install.sh --dry-run 2>&1)
expect_count "环境变量等于默认目录" "$(plus_lines "$out")" '^+ ' 4
out=$(HOME="$home" CLAUDE_CONFIG_DIR="$home/.claude-ccswitch" "$BASH_BIN" install.sh --dry-run 2>&1)
expect_count "环境变量等于 ccswitch" "$(plus_lines "$out")" '^+ ' 4

# 给了 --config-dir 就只处理给出的目录，环境变量和 ccswitch 都不管
out=$(HOME="$home" CLAUDE_CONFIG_DIR=/tmp/other "$BASH_BIN" install.sh --dry-run --config-dir /tmp/a 2>&1)
plus=$(plus_lines "$out")
expect_count "只处理给出的目录" "$plus" '^+ ' 2
expect_not "只处理给出的目录" "$plus" '/tmp/other'
# 重复给同一个目录只算一次；给的是默认目录时不加前缀
out=$(HOME="$home" "$BASH_BIN" install.sh --dry-run --config-dir /tmp/a --config-dir /tmp/a/ --config-dir "$home/.claude" 2>&1)
plus=$(plus_lines "$out")
expect_count "去重" "$plus" '^+ ' 4
expect_count "默认目录无前缀" "$plus" '^+ claude ' 2
rm -rf "$home"

# 6. 带空格、引号、反斜杠和中文的路径：命令行里被正确引用，传给 configure 的 JSON 能被解析回原路径
weird='/tmp/课程 "x" \y'"'"'z'
out=$("$BASH_BIN" install.sh --dry-run --config-dir "/tmp/配置 目录" --courses-dir "$weird" 2>&1); code=$?
expect_code "特殊路径" "$code" 0
conf_line=$(plus_lines "$out" | grep 'configure')
expect_has "配置目录被引用" "$conf_line" "CLAUDE_CONFIG_DIR='/tmp/配置 目录' claude"
# 打印出来的命令是合法的 shell：定义一个把标准输入原样吐出来的 claude 函数，再执行这一行，管道里读到的就是 JSON
claude() { cat; }
json=$(eval "${conf_line#+ }")
got=$(printf '%s' "$json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);process.stdout.write(Object.keys(v).join(",")+"|"+v.courses_dir)})' 2>&1)
if [ "$got" = "courses_dir|$weird" ]; then ok; else bad "特殊路径的 JSON 解析不回原路径：$got"; fi

# 7. 环境缺失：找不到 claude、找不到 node、node 太老，都以 1 退出并说明原因
empty=$(mktemp -d)
err=$(PATH="$empty" "$BASH_BIN" install.sh --dry-run --config-dir /tmp/a 2>&1 >/dev/null); code=$?
expect_code "没有 claude" "$code" 1
expect_has "没有 claude" "$err" 'claude'

printf '#!/bin/sh\nexit 0\n' >"$empty/claude"; chmod +x "$empty/claude"
err=$(PATH="$empty" "$BASH_BIN" install.sh --dry-run --config-dir /tmp/a 2>&1 >/dev/null); code=$?
expect_code "没有 node" "$code" 1
expect_has "没有 node" "$err" 'node'

printf '#!/bin/sh\necho 18\n' >"$empty/node"; chmod +x "$empty/node"
err=$(PATH="$empty" "$BASH_BIN" install.sh --dry-run --config-dir /tmp/a 2>&1 >/dev/null); code=$?
expect_code "node 太老" "$code" 1
expect_has "node 太老" "$err" '20'

# 卸载不需要 node
PATH="$empty" "$BASH_BIN" install.sh --uninstall --dry-run --config-dir /tmp/a >/dev/null 2>&1; expect_code "卸载不查 node" "$?" 0
rm -rf "$empty"

# 8. 脚本里没有 bash 3.2 不支持的写法
if grep -vE '^[[:space:]]*#' install.sh | grep -qE 'declare -A|mapfile|readarray|\$\{[A-Za-z_]+(,,|\^\^)'; then bad "install.sh 用了 bash 3.2 不支持的写法"; else ok; fi

echo "install.sh 测试：$pass 项通过，$fails 项失败"
[ "$fails" -eq 0 ] || exit 1
exit 0
