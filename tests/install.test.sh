#!/usr/bin/env bash
# install.sh 的测试。全部使用 --dry-run（或者在到达 claude 之前就会退出的参数），不触碰任何真实的 Claude Code 配置。
# 任何一项不符，退出码为 1。
#
# 防护：整个文件在一个全新的临时 HOME 里运行，PATH 最前面是一个桩 claude，真实的配置碰不到。
# 桩把每次调用（CLAUDE_CONFIG_DIR、参数、标准输入）记到日志里，并按环境变量模拟 list 的结果和失败。
# 开头先确认解析到的 claude 就是这个桩，不是就整个文件中止。
set -u
cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd -P)

SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT
SANDBOX_HOME="$SANDBOX/home"
mkdir -p "$SANDBOX_HOME"
export HOME="$SANDBOX_HOME"
unset CLAUDE_CONFIG_DIR
STUB_DIR="$SANDBOX/bin"
mkdir -p "$STUB_DIR"
export STUB_LOG="$SANDBOX/stub.log"
: >"$STUB_LOG"

# 记录一次调用：一行，CCD=<CLAUDE_CONFIG_DIR 或 <unset>>，参数用 \037 隔开；带 --values-stdin 时再接 \036STDIN=<标准输入>
REC_FN='rec() {
  local a s="CCD=${CLAUDE_CONFIG_DIR-<unset>}"
  for a in "$@"; do s="$s"$'"'"'\037'"'"'"$a"; done
  case " $* " in *" --values-stdin "*) s="$s"$'"'"'\036'"'"'"STDIN=$(cat)" ;; esac
  printf "%s\n" "$s"
}'
eval "$REC_FN"

{
  echo '#!/usr/bin/env bash'
  echo '# 桩 claude：只记录，不改任何配置。'
  printf '%s\n' "$REC_FN"
  cat <<'STUB'
rec "$@" >>"$STUB_LOG"
ccd=${CLAUDE_CONFIG_DIR-}
case "$1 $2 $3" in
  "plugin marketplace list")
    [ -z "${STUB_LIST_FAIL-}" ] || { echo "stub: list failed" >&2; exit 1; }
    [ -z "${STUB_LIST_GARBAGE-}" ] || { echo "not json"; exit 0; }
    printf '[{"name":"<other>-marketplace","source":"github"},{"name":"learn-anything","source":"github"}'
    [ -z "${STUB_MARKET_PRESENT-}" ] || printf ',{"name":"learn-anything-local","source":"directory"}'
    echo ']'
    ;;
  "plugin list --json")
    [ -z "${STUB_LIST_FAIL-}" ] || { echo "stub: list failed" >&2; exit 1; }
    [ -z "${STUB_LIST_GARBAGE-}" ] || { echo "not json"; exit 0; }
    printf '[{"id":"<other>@<other>-marketplace","scope":"user"},{"id":"learn-anything@other-marketplace","scope":"user"}'
    [ -z "${STUB_PLUGIN_PRESENT-}" ] || printf ',{"id":"learn-anything@learn-anything-local","scope":"%s"}' "${STUB_PLUGIN_SCOPE:-user}"
    echo ']'
    ;;
  "plugin marketplace add")
    if [ -n "${STUB_FAIL_DIR-}" ] && [ "$ccd" = "$STUB_FAIL_DIR" ]; then echo "stub: marketplace add failed" >&2; exit 1; fi
    ;;
esac
exit 0
STUB
} >"$STUB_DIR/claude"
chmod +x "$STUB_DIR/claude"
export PATH="$STUB_DIR:$PATH"
if [ "$(command -v claude)" != "$STUB_DIR/claude" ]; then
  echo "中止：解析到的 claude 不是桩（$(command -v claude)），不敢往下跑。" >&2
  exit 1
fi
if [ "$HOME" != "$SANDBOX_HOME" ]; then
  echo "中止：HOME 不是临时目录。" >&2
  exit 1
fi

# macOS 自带 bash 3.2：有的话就用它跑，保证脚本在最老的 bash 上也能用
if [ -x /bin/bash ]; then BASH_BIN=/bin/bash; else BASH_BIN=bash; fi

fails=0
pass=0
ok() { pass=$((pass + 1)); }
bad() { echo "FAIL: $1" >&2; fails=$((fails + 1)); }

# 取 stdout 里以 "+ " 开头的行：plus_lines 只要会改配置的命令，all_plus_lines 连只读的 list 命令一起要
all_plus_lines() { printf '%s\n' "$1" | grep '^+ '; }
plus_lines() { printf '%s\n' "$1" | grep '^+ ' | grep -v ' list --json'; }
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
expect_has "marketplace 加的是仓库根" "$plus" "marketplace add $ROOT  # "
expect_has "课程目录写进标准输入" "$plus" '{"courses_dir":"/tmp/c"}'

# dry-run 也打印只读的 list 命令：每个目录各两条；add、install 标注「已有则跳过」，configure 不带注释
all=$(all_plus_lines "$out")
expect_count "list 命令" "$all" '^+ ' 10
expect_count "list 命令" "$all" 'marketplace list --json' 2
expect_count "list 命令" "$all" ' plugin list --json' 2
expect_count "list 命令的目录前缀" "$all" 'CLAUDE_CONFIG_DIR=/tmp/a .* list --json' 2
expect_count "list 命令的目录前缀" "$all" 'CLAUDE_CONFIG_DIR=/tmp/b .* list --json' 2
expect_count "add 的注释" "$all" 'marketplace add .*  # 已添加则跳过' 2
expect_count "install 的注释" "$all" 'plugin install .*  # 已安装则跳过' 2
expect_not "configure 没有注释" "$(printf '%s\n' "$all" | grep configure)" '  # '
# list 命令总在对应的 add、install 之前
order=$(printf '%s\n' "$all" | sed -n 1,5p | sed -e 's/^.*claude plugin //' -e 's/ .*$//')
if [ "$(printf '%s' "$order" | tr '\n' ',')" = "marketplace,marketplace,list,install,configure" ]; then ok; else bad "命令顺序不对：$(printf '%s' "$order" | tr '\n' ',')"; fi

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

unset -f claude

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

# 9. 参数和环境的新增检查
"$BASH_BIN" install.sh --dry-run --courses-dir "" >/dev/null 2>&1; expect_code "--courses-dir 空值" "$?" 2
"$BASH_BIN" install.sh --dry-run --courses-dir= >/dev/null 2>&1; expect_code "--courses-dir= 空值" "$?" 2
"$BASH_BIN" install.sh --dry-run --uninstall --courses-dir= >/dev/null 2>&1; expect_code "卸载时 --courses-dir= 空值" "$?" 2
"$BASH_BIN" install.sh --dry-run --config-dir "" >/dev/null 2>&1; expect_code "--config-dir 空值" "$?" 2
err=$(env -u HOME "$BASH_BIN" install.sh --dry-run 2>&1 >/dev/null); code=$?
expect_code "HOME 没设置" "$code" 1
expect_has "HOME 没设置" "$err" 'HOME'
err=$(HOME= "$BASH_BIN" install.sh --dry-run 2>&1 >/dev/null); code=$?
expect_code "HOME 为空" "$code" 1
expect_has "HOME 为空" "$err" 'HOME'
HOME=relative "$BASH_BIN" install.sh --dry-run >/dev/null 2>&1; expect_code "HOME 是相对路径" "$?" 1
HOME=/ "$BASH_BIN" install.sh --dry-run --config-dir /tmp/a >/dev/null 2>&1; expect_code "HOME 是绝对路径" "$?" 0

# 10. 真正执行（命令全部落到桩 claude 上）-------------------------------------
STUB_FLAGS='STUB_LIST_FAIL STUB_LIST_GARBAGE STUB_MARKET_PRESENT STUB_PLUGIN_PRESENT STUB_PLUGIN_SCOPE STUB_FAIL_DIR'
reset_stub() {
  local f
  for f in $STUB_FLAGS; do unset "$f"; done
  : >"$STUB_LOG"
}
# 日志里数含某组连续参数的记录（参数之间用空格写，匹配时换成 \037）
log_count() {
  local pat
  pat=$(printf '%s' "$1" | tr ' ' '\037')
  grep -c -F -- "$pat" "$STUB_LOG"
}
expect_log() { # <说明> <参数串> <期望条数>
  local n
  n=$(log_count "$2")
  if [ "$n" = "$3" ]; then ok; else bad "$1：日志里「$2」期望 $3 条，实际 $n 条"; fi
}

# 把 --dry-run 点名的命令逐条在记录函数上执行一遍，得到「应该发生的调用」，与真实执行时桩记下的日志逐字节比较
same_as_dry() { # <说明> <install.sh 的参数>...
  local label=$1 line dry exp="$SANDBOX/expected.log"
  shift
  dry=$("$BASH_BIN" install.sh --dry-run "$@" 2>&1) || { bad "$label：dry-run 失败"; return; }
  : >"$exp"
  claude() { rec "$@" >>"$exp"; }
  while IFS= read -r line; do
    # 在子进程里执行，并去掉环境里的 CLAUDE_CONFIG_DIR：默认目录的命令行没有前缀，真实执行时 install.sh 也是这样处理的
    case $line in '+ '*) ( unset CLAUDE_CONFIG_DIR; eval "${line#+ }" ) ;; esac
  done <<EOF_DRY
$dry
EOF_DRY
  unset -f claude
  : >"$STUB_LOG"
  "$BASH_BIN" install.sh "$@" >/dev/null 2>&1 || { bad "$label：真实执行退出码非 0"; return; }
  if [ -s "$exp" ] && cmp -s "$exp" "$STUB_LOG"; then ok; else bad "$label：执行的命令与 dry-run 不一致"; diff "$exp" "$STUB_LOG" | tr '\037\036' '|^' | head -10 >&2; fi
}

reset_stub
same_as_dry "首次安装，两个目录" --config-dir /tmp/a --config-dir "/tmp/b b" --courses-dir /tmp/c
n=$(wc -l <"$STUB_LOG" | tr -d ' ')
if [ "$n" = 10 ]; then ok; else bad "首次安装：日志应有 10 条，实际 $n 条"; fi
expect_log "首次安装" "plugin marketplace add $ROOT" 2
expect_log "首次安装" "plugin install learn-anything@learn-anything-local --scope user" 2
expect_log "首次安装" "plugin configure learn-anything@learn-anything-local --values-stdin" 2

# 默认目录、~/.claude-ccswitch、CLAUDE_CONFIG_DIR 三个目标；默认目录的调用里没有 CLAUDE_CONFIG_DIR
reset_stub
home2="$SANDBOX/home2"
mkdir -p "$home2/.claude-ccswitch"
HOME=$home2; export CLAUDE_CONFIG_DIR=/tmp/other
same_as_dry "默认三个目标" --courses-dir /tmp/c
unset CLAUDE_CONFIG_DIR; HOME=$SANDBOX_HOME
expect_log "默认三个目标" "CCD=<unset>" 5
expect_log "默认三个目标" "CCD=$home2/.claude-ccswitch" 5
expect_log "默认三个目标" "CCD=/tmp/other" 5

# 带空格、双引号、反斜杠、单引号和中文的课程目录：到 configure 时是合法 JSON，解析回原路径
reset_stub
weird='/tmp/课程 "x" \y'"'"'z'
"$BASH_BIN" install.sh --config-dir /tmp/a --courses-dir "$weird" >/dev/null 2>&1; expect_code "特殊路径" "$?" 0
stdin=$(grep -F "$(printf 'plugin\037configure')" "$STUB_LOG" | tr '\036' '\n' | sed -n 's/^STDIN=//p')
got=$(printf '%s' "$stdin" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);process.stdout.write(Object.keys(v).join(",")+"|"+v.courses_dir)})' 2>&1)
if [ "$got" = "courses_dir|$weird" ]; then ok; else bad "特殊路径：configure 收到的 JSON 解析不回原路径：$got"; fi

# 重复运行：已有的 marketplace 和 plugin 不再添加、安装，configure 照常执行
reset_stub
export STUB_MARKET_PRESENT=1 STUB_PLUGIN_PRESENT=1
out=$("$BASH_BIN" install.sh --config-dir /tmp/a --config-dir /tmp/b --courses-dir /tmp/c 2>&1); code=$?
expect_code "重复运行" "$code" 0
expect_log "重复运行" "plugin marketplace add" 0
expect_log "重复运行" "plugin install" 0
expect_log "重复运行" "plugin configure learn-anything@learn-anything-local --values-stdin" 2
expect_log "重复运行" "plugin marketplace list --json" 2
expect_log "重复运行" "plugin list --json" 2
expect_has "重复运行的提示" "$out" '已添加，跳过'
expect_has "重复运行的提示" "$out" '已安装，跳过'
# 不给 --courses-dir 时什么都不改
: >"$STUB_LOG"
"$BASH_BIN" install.sh --config-dir /tmp/a >/dev/null 2>&1; expect_code "重复运行，无课程目录" "$?" 0
expect_log "重复运行，无课程目录" "plugin configure" 0
expect_log "重复运行，无课程目录" "plugin install" 0

# 只有 marketplace 已有：只跳过添加
reset_stub
export STUB_MARKET_PRESENT=1
"$BASH_BIN" install.sh --config-dir /tmp/a --courses-dir /tmp/c >/dev/null 2>&1; expect_code "只有 marketplace 已有" "$?" 0
expect_log "只有 marketplace 已有" "plugin marketplace add" 0
expect_log "只有 marketplace 已有" "plugin install learn-anything@learn-anything-local --scope user" 1

# plugin 只装在 project 范围：不算已安装 user 范围，照常安装
reset_stub
export STUB_MARKET_PRESENT=1 STUB_PLUGIN_PRESENT=1 STUB_PLUGIN_SCOPE=project
"$BASH_BIN" install.sh --config-dir /tmp/a >/dev/null 2>&1; expect_code "project 范围" "$?" 0
expect_log "project 范围" "plugin install learn-anything@learn-anything-local --scope user" 1

# list 命令失败或输出看不懂：不猜，当作「还没有」，照常添加和安装
reset_stub
export STUB_LIST_FAIL=1 STUB_MARKET_PRESENT=1 STUB_PLUGIN_PRESENT=1
"$BASH_BIN" install.sh --config-dir /tmp/a >/dev/null 2>&1; expect_code "list 失败" "$?" 0
expect_log "list 失败" "plugin marketplace add" 1
expect_log "list 失败" "plugin install" 1
reset_stub
export STUB_LIST_GARBAGE=1 STUB_MARKET_PRESENT=1 STUB_PLUGIN_PRESENT=1
"$BASH_BIN" install.sh --config-dir /tmp/a >/dev/null 2>&1; expect_code "list 输出看不懂" "$?" 0
expect_log "list 输出看不懂" "plugin marketplace add" 1
expect_log "list 输出看不懂" "plugin install" 1

# 第一个目录失败：第二个目录照常处理，退出码 1，提示点名失败的目录
reset_stub
export STUB_FAIL_DIR=/tmp/a
err=$("$BASH_BIN" install.sh --config-dir /tmp/a --config-dir /tmp/b --courses-dir /tmp/c 2>&1 >/dev/null); code=$?
expect_code "第一个目录失败" "$code" 1
expect_has "失败的目录被点名" "$err" '✗ 配置目录 /tmp/a'
expect_not "没失败的目录不被点名" "$(printf '%s\n' "$err" | grep '✗')" '/tmp/b'
expect_has "最后汇总" "$err" '有命令执行失败：配置目录 /tmp/a'
expect_log "失败后第二个目录" "CCD=/tmp/b plugin marketplace add" 1
expect_log "失败后第二个目录" "CCD=/tmp/b plugin install" 1
expect_log "失败后第二个目录" "CCD=/tmp/b plugin configure" 1
expect_log "失败的目录不再继续" "CCD=/tmp/a plugin install" 0
expect_log "失败的目录不再继续" "CCD=/tmp/a plugin configure" 0

# 卸载：只有这个 plugin 的 id 和这个 marketplace 的名字会传给删除类命令；已不在的就跳过
removing() { grep -E "$(printf '\037')(uninstall|remove|rm|disable|prune)$(printf '\037')" "$STUB_LOG"; }
reset_stub
export STUB_MARKET_PRESENT=1 STUB_PLUGIN_PRESENT=1
out=$("$BASH_BIN" install.sh --uninstall --config-dir /tmp/a --config-dir /tmp/b 2>&1); code=$?
expect_code "卸载" "$code" 0
n=$(removing | wc -l | tr -d ' ')
if [ "$n" = 4 ]; then ok; else bad "卸载：删除类命令应有 4 条，实际 $n 条"; fi
kinds=$(removing | tr '\037' ' ' | sed 's/^CCD=[^ ]* //' | sort -u)
expected=$(printf '%s\n%s\n' 'plugin marketplace remove learn-anything-local' 'plugin uninstall learn-anything@learn-anything-local --scope user' | sort -u)
if [ "$kinds" = "$expected" ]; then ok; else bad "卸载：传给删除类命令的内容不对：$kinds"; fi
expect_log "卸载" "plugin install" 0
expect_log "卸载" "plugin marketplace add" 0
expect_log "卸载" "plugin configure" 0
reset_stub
out=$("$BASH_BIN" install.sh --uninstall --config-dir /tmp/a 2>&1); code=$?
expect_code "卸载，已不在" "$code" 0
n=$(removing | wc -l | tr -d ' ')
if [ "$n" = 0 ]; then ok; else bad "卸载，已不在：不该有删除类命令，实际 $n 条"; fi
expect_has "卸载，已不在的提示" "$out" '已不在，跳过'
reset_stub
export STUB_LIST_FAIL=1
"$BASH_BIN" install.sh --uninstall --config-dir /tmp/a >/dev/null 2>&1; code=$?
expect_code "卸载，list 失败" "$code" 0
n=$(removing | wc -l | tr -d ' ')
if [ "$n" = 2 ]; then ok; else bad "卸载，list 失败：读不出现状时照常卸载，应有 2 条，实际 $n 条"; fi
reset_stub

# 8. 脚本里没有 bash 3.2 不支持的写法
if grep -vE '^[[:space:]]*#' install.sh | grep -qE 'declare -A|mapfile|readarray|\$\{[A-Za-z_]+(,,|\^\^)'; then bad "install.sh 用了 bash 3.2 不支持的写法"; else ok; fi

echo "install.sh 测试：$pass 项通过，$fails 项失败"
[ "$fails" -eq 0 ] || exit 1
exit 0
