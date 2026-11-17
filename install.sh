#!/usr/bin/env bash
# learn-anything 的安装脚本：对每个 Claude Code 配置目录添加本地 marketplace、安装 plugin，并按需配置课程目录。
# 兼容 macOS 自带的 bash 3.2：不用关联数组、mapfile、${var,,}。
#
# 用法：bash install.sh [--courses-dir <绝对路径>] [--config-dir <目录>]... [--uninstall] [--dry-run]
#   --courses-dir <绝对路径>  安装后把 plugin 的 courses_dir 配置为这个目录（安装时才有意义）
#   --config-dir <目录>       只处理给出的配置目录，可重复；不给时处理默认目录、~/.claude-ccswitch（存在时）、
#                             以及环境变量 CLAUDE_CONFIG_DIR 指向的目录（已设置且不同于前两者时）
#   --uninstall               卸载 plugin 并移除 marketplace（不动课程目录里的任何文件）
#   --dry-run                 只打印命令（每条一行，以 "+ " 开头），不执行
#
# 默认配置目录（~/.claude）的命令不加前缀；其他目录的命令加 CLAUDE_CONFIG_DIR=<目录> 前缀。
# 退出码：0 成功，1 缺少 claude 或 node、或某条命令失败，2 参数不对。
set -u

MARKETPLACE=learn-anything-local
PLUGIN=learn-anything@$MARKETPLACE

die_usage() {
  echo "install.sh: $1" >&2
  echo "用法：bash install.sh [--courses-dir <绝对路径>] [--config-dir <目录>]... [--uninstall] [--dry-run]" >&2
  exit 2
}

usage() {
  sed -n '2,/^set -u$/p' "$0" | sed -e '/^set -u$/d' -e 's/^# \{0,1\}//'
}

# 仓库根：本脚本所在目录
src=${BASH_SOURCE[0]}
case $src in
  */*) src_dir=${src%/*} ;;
  *) src_dir=. ;;
esac
repo_root=$(cd "$src_dir" && pwd -P) || { echo "找不到仓库根目录" >&2; exit 1; }

has_cntrl() {
  case $1 in
    *[[:cntrl:]]*) return 0 ;;
    *) return 1 ;;
  esac
}

# 去掉末尾多余的斜杠（根目录除外）
trim_slash() {
  local p=$1
  while [ "${#p}" -gt 1 ] && [ "${p%/}" != "$p" ]; do p=${p%/}; done
  printf '%s' "$p"
}

# 参数 ------------------------------------------------------------------
courses_dir=
config_dirs=()
uninstall=0
dry_run=0

while [ $# -gt 0 ]; do
  case $1 in
    --courses-dir)
      [ $# -ge 2 ] || die_usage "--courses-dir 需要一个路径"
      courses_dir=$2
      shift 2
      ;;
    --courses-dir=*)
      courses_dir=${1#--courses-dir=}
      shift
      ;;
    --config-dir)
      [ $# -ge 2 ] || die_usage "--config-dir 需要一个目录"
      config_dirs[${#config_dirs[@]}]=$2
      shift 2
      ;;
    --config-dir=*)
      config_dirs[${#config_dirs[@]}]=${1#--config-dir=}
      shift
      ;;
    --uninstall) uninstall=1; shift ;;
    --dry-run) dry_run=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die_usage "未知参数：$1" ;;
  esac
done

if [ -n "$courses_dir" ]; then
  [ "$uninstall" -eq 0 ] || die_usage "--courses-dir 只在安装时使用，不能与 --uninstall 同用"
  case $courses_dir in
    /*) ;;
    *) die_usage "--courses-dir 必须是绝对路径：$courses_dir" ;;
  esac
  has_cntrl "$courses_dir" && die_usage "--courses-dir 里不能有换行、制表符等控制字符"
  courses_dir=$(trim_slash "$courses_dir")
fi

i=0
while [ "$i" -lt "${#config_dirs[@]}" ]; do
  d=${config_dirs[$i]}
  case $d in
    /*) ;;
    *) die_usage "--config-dir 必须是绝对路径：$d" ;;
  esac
  has_cntrl "$d" && die_usage "--config-dir 里不能有换行、制表符等控制字符"
  config_dirs[$i]=$(trim_slash "$d")
  i=$((i + 1))
done

# 环境检查 --------------------------------------------------------------
if ! command -v claude >/dev/null 2>&1; then
  echo "找不到 claude 命令：请先安装 Claude Code，并确认 claude 在 PATH 里。" >&2
  exit 1
fi

if [ "$uninstall" -eq 0 ]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "找不到 node 命令：plugin 的脚本和 hook 需要 node 20 及以上。" >&2
    exit 1
  fi
  node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)
  case $node_major in
    ''|*[!0-9]*)
      echo "读不出 node 的版本号：需要 node 20 及以上。" >&2
      exit 1
      ;;
  esac
  if [ "$node_major" -lt 20 ]; then
    echo "node 版本太低（主版本 $node_major）：需要 node 20 及以上。" >&2
    exit 1
  fi
fi

# 要处理的配置目录 ------------------------------------------------------
# 空字符串表示默认目录：命令不加前缀。其余目录加 CLAUDE_CONFIG_DIR 前缀。
# 默认目录的命令不能被调用者环境里的 CLAUDE_CONFIG_DIR 带偏，所以先取走再 unset。
env_config_dir=${CLAUDE_CONFIG_DIR-}
unset CLAUDE_CONFIG_DIR
default_dir=$(trim_slash "${HOME:-}/.claude")
ccswitch_dir=$(trim_slash "${HOME:-}/.claude-ccswitch")

targets=()

add_target() {
  local d=$1 j=0
  [ "$d" = "$default_dir" ] && d=
  while [ "$j" -lt "${#targets[@]}" ]; do
    [ "${targets[$j]}" = "$d" ] && return 0
    j=$((j + 1))
  done
  targets[${#targets[@]}]=$d
}

if [ "${#config_dirs[@]}" -gt 0 ]; then
  i=0
  while [ "$i" -lt "${#config_dirs[@]}" ]; do
    add_target "${config_dirs[$i]}"
    i=$((i + 1))
  done
else
  add_target "$default_dir"
  [ -d "$ccswitch_dir" ] && add_target "$ccswitch_dir"
  if [ -n "$env_config_dir" ]; then
    case $env_config_dir in
      /*) has_cntrl "$env_config_dir" || add_target "$(trim_slash "$env_config_dir")" ;;
      *) echo "忽略 CLAUDE_CONFIG_DIR：不是绝对路径（$env_config_dir）" >&2 ;;
    esac
  fi
fi

# 执行 ------------------------------------------------------------------
# 命令行显示用：只有安全字符的原样输出，其余整体加单引号
shquote() {
  case $1 in
    '') printf "''" ;;
    *[!A-Za-z0-9_@%+=:,./-]*) printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")" ;;
    *) printf '%s' "$1" ;;
  esac
}

# JSON 字符串里的反斜杠和双引号加转义；控制字符在参数检查时已经拒绝
json_escape() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  printf '%s' "$s"
}

failed=0

# claude_step <配置目录，空表示默认> <标准输入内容，空表示没有> <claude 的参数>...
# dry-run 只打印；否则执行，失败时返回非 0
claude_step() {
  local dir=$1 input=$2 line= a
  shift 2
  if [ "$dry_run" -eq 1 ]; then
    [ -n "$input" ] && line="printf %s $(shquote "$input") | "
    [ -n "$dir" ] && line="${line}CLAUDE_CONFIG_DIR=$(shquote "$dir") "
    line="${line}claude"
    for a in "$@"; do line="$line $(shquote "$a")"; done
    echo "+ $line"
    return 0
  fi
  if [ -n "$dir" ]; then
    if [ -n "$input" ]; then
      printf '%s' "$input" | env "CLAUDE_CONFIG_DIR=$dir" claude "$@"
    else
      env "CLAUDE_CONFIG_DIR=$dir" claude "$@"
    fi
  else
    if [ -n "$input" ]; then
      printf '%s' "$input" | claude "$@"
    else
      claude "$@"
    fi
  fi
}

if [ "$uninstall" -eq 0 ] && [ "$dry_run" -eq 0 ] && [ -n "$courses_dir" ] && [ ! -d "$courses_dir" ]; then
  echo "提示：课程目录 $courses_dir 还不存在，请先创建它。" >&2
fi

if [ -n "$courses_dir" ]; then
  values="{\"courses_dir\":\"$(json_escape "$courses_dir")\"}"
else
  values=
fi

i=0
while [ "$i" -lt "${#targets[@]}" ]; do
  dir=${targets[$i]}
  i=$((i + 1))
  if [ "$dry_run" -eq 0 ]; then
    if [ -n "$dir" ]; then echo "== 配置目录 $dir =="; else echo "== 默认配置目录 =="; fi
  fi
  if [ "$uninstall" -eq 1 ]; then
    # 两步互不依赖：plugin 没装上时仍要移除 marketplace
    claude_step "$dir" "" plugin uninstall "$PLUGIN" --scope user || failed=1
    claude_step "$dir" "" plugin marketplace remove "$MARKETPLACE" || failed=1
  else
    # 后一步依赖前一步，失败就跳过这个目录剩下的步骤，继续下一个目录
    claude_step "$dir" "" plugin marketplace add "$repo_root" || { failed=1; continue; }
    claude_step "$dir" "" plugin install "$PLUGIN" --scope user || { failed=1; continue; }
    if [ -n "$values" ]; then
      claude_step "$dir" "$values" plugin configure "$PLUGIN" --values-stdin || failed=1
    fi
  fi
done

if [ "$failed" -ne 0 ]; then
  echo "有命令执行失败，见上面的输出。" >&2
  exit 1
fi
exit 0
