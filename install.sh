#!/usr/bin/env bash
# learn-anything 的安装脚本：对每个 Claude Code 配置目录添加本地 marketplace、安装 plugin，并按需配置课程目录和国考题库仓库。
# 兼容 macOS 自带的 bash 3.2：不用关联数组、mapfile、${var,,}。
#
# 用法：bash install.sh [--courses-dir <绝对路径>] [--guokao-repo <绝对路径>] [--config-dir <目录>]... [--reinstall | --uninstall] [--dry-run]
#   --courses-dir <绝对路径>  安装后把 plugin 的 courses_dir 配置为这个目录（安装时才有意义）
#   --guokao-repo <绝对路径>  安装后把 plugin 的 guokao_repo 配置为国考题库仓库的目录（可选，安装时才有意义）
#   --config-dir <目录>       只处理给出的配置目录，可重复；不给时处理默认目录、~/.claude-ccswitch（存在时）、
#                             以及环境变量 CLAUDE_CONFIG_DIR 指向的目录（已设置且不同于前两者时）。
#                             目录不存在时打印一行提示，照常继续
#   --reinstall               改了仓库之后用：plugin 已安装就先卸载再安装（marketplace 保留），没安装就直接安装。
#                             Claude Code 可能用的是缓存里的拷贝，重装才会换成仓库里的新版
#   --uninstall               卸载 plugin 并移除 marketplace（不动课程目录里的任何文件）；不能与 --reinstall 同用
#   --dry-run                 只打印命令（每条一行，以 "+ " 开头），不执行
#
# configure 的语义（2026-11-18 在 Claude Code 2.1.318 上实测）：在临时配置目录里装好 plugin，先 configure {"courses_dir":"/tmp/a"}，
# 再 configure {"guokao_repo":"/tmp/b"}，settings.json 的 pluginConfigs 里两个键都在：configure 按键合并，不会清掉没给的项。
# 所以只给 --courses-dir 或只给 --guokao-repo 都安全，不需要「两项一起给」的提示。
#
# 默认配置目录（~/.claude）的命令不加前缀；其他目录的命令加 CLAUDE_CONFIG_DIR=<目录> 前缀。
# 重复运行是安全的：每个目录先用 claude plugin marketplace list --json 和 claude plugin list --json（只读）查看现状，
# marketplace 已添加就不再添加，plugin 已安装就不再安装；给了 --courses-dir 或 --guokao-repo 时 configure 总会执行（只带给了的那几项）。
# 卸载同理：目标已经不在就跳过那一步。读不出现状（命令失败或输出看不懂）时不猜：安装当作「还没有」照常添加和安装，
# 卸载当作「还在」照常卸载。--dry-run 也会打印这两条只读命令，并把 add、install、uninstall、remove 标注为「已存在（已不在）则跳过」。
# --reinstall 读不出现状时当作「已安装」，先卸载再安装。
# 退出码：0 成功，1 缺少 claude 或 node、HOME 不可用、或某条命令失败，2 参数不对。
set -u

MARKETPLACE=learn-anything-local
PLUGIN=learn-anything@$MARKETPLACE

die_usage() {
  echo "install.sh: $1" >&2
  echo "用法：bash install.sh [--courses-dir <绝对路径>] [--guokao-repo <绝对路径>] [--config-dir <目录>]... [--reinstall | --uninstall] [--dry-run]" >&2
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
courses_given=0
guokao_repo=
guokao_given=0
config_dirs=()
uninstall=0
reinstall=0
dry_run=0

while [ $# -gt 0 ]; do
  case $1 in
    --courses-dir)
      [ $# -ge 2 ] || die_usage "--courses-dir 需要一个路径"
      courses_dir=$2
      courses_given=1
      shift 2
      ;;
    --courses-dir=*)
      courses_dir=${1#--courses-dir=}
      courses_given=1
      shift
      ;;
    --guokao-repo)
      [ $# -ge 2 ] || die_usage "--guokao-repo 需要一个路径"
      guokao_repo=$2
      guokao_given=1
      shift 2
      ;;
    --guokao-repo=*)
      guokao_repo=${1#--guokao-repo=}
      guokao_given=1
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
    --reinstall) reinstall=1; shift ;;
    --dry-run) dry_run=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die_usage "未知参数：$1" ;;
  esac
done

[ "$uninstall" -eq 1 ] && [ "$reinstall" -eq 1 ] && die_usage "--reinstall 和 --uninstall 不能同时给"

if [ "$courses_given" -eq 1 ]; then
  [ -n "$courses_dir" ] || die_usage "--courses-dir 的值不能为空"
  [ "$uninstall" -eq 0 ] || die_usage "--courses-dir 只在安装时使用，不能与 --uninstall 同用"
  case $courses_dir in
    /*) ;;
    *) die_usage "--courses-dir 必须是绝对路径：$courses_dir" ;;
  esac
  has_cntrl "$courses_dir" && die_usage "--courses-dir 里不能有换行、制表符等控制字符"
  courses_dir=$(trim_slash "$courses_dir")
fi

if [ "$guokao_given" -eq 1 ]; then
  [ -n "$guokao_repo" ] || die_usage "--guokao-repo 的值不能为空"
  [ "$uninstall" -eq 0 ] || die_usage "--guokao-repo 只在安装时使用，不能与 --uninstall 同用"
  case $guokao_repo in
    /*) ;;
    *) die_usage "--guokao-repo 必须是绝对路径：$guokao_repo" ;;
  esac
  has_cntrl "$guokao_repo" && die_usage "--guokao-repo 里不能有换行、制表符等控制字符"
  guokao_repo=$(trim_slash "$guokao_repo")
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
# 默认配置目录是 $HOME/.claude；HOME 没设置或不是绝对路径时，算出来的会是 /.claude 之类，不能往下走
case ${HOME:-} in
  /*) ;;
  *)
    echo "HOME 没有设置，或者不是绝对路径（当前值：${HOME:-<未设置>}）：无法确定默认的 Claude Code 配置目录。" >&2
    exit 1
    ;;
esac

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
    [ -d "${config_dirs[$i]}" ] || echo "提示：配置目录 ${config_dirs[$i]} 还不存在，照常继续（claude 会按需创建它）。" >&2
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
failed_dirs=

# 组装命令行显示用的文字（不含 "+ " 前缀）
# claude_line <配置目录，空表示默认> <标准输入内容，空表示没有> <claude 的参数>...
claude_line() {
  local dir=$1 input=$2 line= a
  shift 2
  [ -n "$input" ] && line="printf %s $(shquote "$input") | "
  [ -n "$dir" ] && line="${line}CLAUDE_CONFIG_DIR=$(shquote "$dir") "
  line="${line}claude"
  for a in "$@"; do line="$line $(shquote "$a")"; done
  printf '%s' "$line"
}

# 真正执行一条 claude 命令；不带标准输入内容时，标准输入接空设备，免得 claude 去读终端
# claude_exec <配置目录，空表示默认> <标准输入内容，空表示没有> <claude 的参数>...
claude_exec() {
  local dir=$1 input=$2
  shift 2
  if [ -n "$dir" ]; then
    if [ -n "$input" ]; then
      printf '%s' "$input" | env "CLAUDE_CONFIG_DIR=$dir" claude "$@"
    else
      env "CLAUDE_CONFIG_DIR=$dir" claude "$@" </dev/null
    fi
  else
    if [ -n "$input" ]; then
      printf '%s' "$input" | claude "$@"
    else
      claude "$@" </dev/null
    fi
  fi
}

# 一步：dry-run 只打印（note 非空时作为行尾注释），否则执行，失败时返回非 0
# claude_step <配置目录> <标准输入内容> <note> <claude 的参数>...
claude_step() {
  local dir=$1 input=$2 note=$3
  shift 3
  if [ "$dry_run" -eq 1 ]; then
    if [ -n "$note" ]; then echo "+ $(claude_line "$dir" "$input" "$@")  # $note"; else echo "+ $(claude_line "$dir" "$input" "$@")"; fi
    return 0
  fi
  claude_exec "$dir" "$input" "$@"
}

# 读出现状（只读）。结果放在 state：0 在，1 不在，2 读不出来（命令失败或输出看不懂）
# dry-run 只打印命令，state 记为 2。
# claude_state <配置目录> marketplace|plugin <名字或 id>
claude_state() {
  local dir=$1 kind=$2 want=$3 out rc
  local -a cmd
  if [ "$kind" = marketplace ]; then cmd=(plugin marketplace list --json); else cmd=(plugin list --json); fi
  if [ "$dry_run" -eq 1 ]; then
    echo "+ $(claude_line "$dir" "" "${cmd[@]}")  # 只读：看是否已有 $want"
    state=2
    return 0
  fi
  if ! out=$(claude_exec "$dir" "" "${cmd[@]}" 2>/dev/null); then
    state=2
    return 0
  fi
  # 只认 JSON 数组：marketplace 看 name；plugin 看 id，并且要装在 user 范围
  printf '%s' "$out" | node -e '
    let s = "";
    process.stdin.on("data", (d) => { s += d; }).on("end", () => {
      try {
        const [kind, want] = process.argv.slice(1);
        const list = JSON.parse(s);
        if (!Array.isArray(list)) process.exit(2);
        const hit = list.some((x) => x !== null && typeof x === "object" && (kind === "marketplace" ? x.name === want : x.id === want && x.scope === "user"));
        process.exit(hit ? 0 : 1);
      } catch {
        process.exit(2);
      }
    });
  ' "$kind" "$want" 2>/dev/null
  rc=$?
  case $rc in
    0|1) state=$rc ;;
    *) state=2 ;;
  esac
  return 0
}

state=2

if [ "$uninstall" -eq 0 ] && [ "$dry_run" -eq 0 ] && [ -n "$courses_dir" ] && [ ! -d "$courses_dir" ]; then
  echo "提示：课程目录 $courses_dir 还不存在，请先创建它。" >&2
fi

if [ "$uninstall" -eq 0 ] && [ "$dry_run" -eq 0 ] && [ -n "$guokao_repo" ] && [ ! -d "$guokao_repo" ]; then
  echo "提示：国考题库仓库 $guokao_repo 还不存在，请先创建它或确认路径。" >&2
fi

# configure 的 JSON 只放给了的那几项（configure 按键合并，见头注释）
values=
if [ -n "$courses_dir" ]; then
  values="\"courses_dir\":\"$(json_escape "$courses_dir")\""
fi
if [ -n "$guokao_repo" ]; then
  [ -n "$values" ] && values="$values,"
  values="$values\"guokao_repo\":\"$(json_escape "$guokao_repo")\""
fi
[ -n "$values" ] && values="{$values}"

# 记一次失败：立刻说明是哪个配置目录的哪一步
fail_step() {
  failed=1
  case " $failed_dirs " in
    *" $label "*) ;;
    *) failed_dirs="$failed_dirs $label" ;;
  esac
  echo "✗ $label：$1 失败" >&2
}

i=0
while [ "$i" -lt "${#targets[@]}" ]; do
  dir=${targets[$i]}
  i=$((i + 1))
  if [ -n "$dir" ]; then label="配置目录 $dir"; else label="默认配置目录"; fi
  [ "$dry_run" -eq 1 ] || echo "== $label =="
  if [ "$uninstall" -eq 1 ]; then
    # 目标已经不在就跳过；两步互不依赖：plugin 没装上时仍要移除 marketplace
    claude_state "$dir" plugin "$PLUGIN"
    if [ "$dry_run" -eq 0 ] && [ "$state" -eq 1 ]; then
      echo "plugin $PLUGIN 已不在，跳过卸载"
    else
      claude_step "$dir" "" "已不在则跳过" plugin uninstall "$PLUGIN" --scope user || fail_step "卸载 plugin"
    fi
    claude_state "$dir" marketplace "$MARKETPLACE"
    if [ "$dry_run" -eq 0 ] && [ "$state" -eq 1 ]; then
      echo "marketplace $MARKETPLACE 已不在，跳过移除"
    else
      claude_step "$dir" "" "已不在则跳过" plugin marketplace remove "$MARKETPLACE" || fail_step "移除 marketplace"
    fi
  else
    # 已有的不重复添加、安装，重复运行才安全。读不出现状（state 为 2）时照常添加和安装。
    # 后一步依赖前一步：添加或安装失败就跳过这个目录剩下的步骤，继续下一个目录
    claude_state "$dir" marketplace "$MARKETPLACE"
    if [ "$dry_run" -eq 0 ] && [ "$state" -eq 0 ]; then
      echo "marketplace $MARKETPLACE 已添加，跳过"
    else
      claude_step "$dir" "" "已添加则跳过" plugin marketplace add "$repo_root" || { fail_step "添加 marketplace"; continue; }
    fi
    claude_state "$dir" plugin "$PLUGIN"
    if [ "$reinstall" -eq 1 ]; then
      # 重装：已安装（或读不出现状）就先卸载；卸载失败就不再往下装，免得装出两份
      if [ "$dry_run" -eq 0 ] && [ "$state" -eq 1 ]; then
        echo "plugin $PLUGIN 还没安装，直接安装"
      else
        claude_step "$dir" "" "未安装则跳过" plugin uninstall "$PLUGIN" --scope user || { fail_step "卸载 plugin（重装）"; continue; }
      fi
      claude_step "$dir" "" "" plugin install "$PLUGIN" --scope user || { fail_step "安装 plugin"; continue; }
    elif [ "$dry_run" -eq 0 ] && [ "$state" -eq 0 ]; then
      echo "plugin $PLUGIN 已安装，跳过"
    else
      claude_step "$dir" "" "已安装则跳过" plugin install "$PLUGIN" --scope user || { fail_step "安装 plugin"; continue; }
    fi
    if [ -n "$values" ]; then
      claude_step "$dir" "$values" "" plugin configure "$PLUGIN" --values-stdin || fail_step "配置 plugin 选项"
    fi
  fi
done

if [ "$reinstall" -eq 1 ] && [ -z "$courses_dir" ]; then
  echo "提示：重装后请确认课程目录的配置还在：在 Claude Code 里运行 /plugin configure $PLUGIN 查看，或者带上 --courses-dir 重新运行本脚本。"
fi

if [ "$reinstall" -eq 1 ] && [ -z "$guokao_repo" ]; then
  echo "提示：重装后请确认国考题库仓库（guokao_repo）的配置还在：在 Claude Code 里运行 /plugin configure $PLUGIN 查看，或者带上 --guokao-repo 重新运行本脚本。"
fi

if [ "$failed" -ne 0 ]; then
  echo "有命令执行失败：${failed_dirs# }。见上面的输出。" >&2
  exit 1
fi
exit 0
