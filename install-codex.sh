#!/usr/bin/env bash
# learn-anything 的 Codex 安装脚本：添加本地 marketplace、安装 plugin，并按需把课程目录和国考题库仓库写进配置文件。
# 兼容 macOS 自带的 bash 3.2。
#
# 用法：bash install-codex.sh [--courses-dir <绝对路径>] [--guokao-repo <绝对路径>] [--reinstall | --uninstall] [--dry-run]
#   --courses-dir <绝对路径>  把课程目录写进配置文件（安装时才有意义）
#   --guokao-repo <绝对路径>  把国考题库仓库写进配置文件（可选，安装时才有意义）
#   --reinstall               改了仓库之后用：plugin 已安装就先移除再安装（marketplace 保留）。
#                             Codex 运行的是缓存里的拷贝，重装才会换成仓库里的新版
#   --uninstall               移除 plugin 和 marketplace；不动配置文件和课程目录里的任何文件。不能与 --reinstall 同用
#   --dry-run                 只打印命令（每条一行，以 "+ " 开头），不执行
#
# Codex 没有 Claude Code 的 userConfig，课程目录和国考题库存在一个 JSON 配置文件里，由 skill 的 scripts/config.mjs 读写：
# 默认 ~/.config/learn-anything/config.json（XDG_CONFIG_HOME 设置了就放在它下面，LEARN_ANYTHING_CONFIG 可以直接指定文件）。
# 写入按键合并：只给 --courses-dir 或只给 --guokao-repo 都不会清掉另一项。
#
# 处理的是 codex 命令当前使用的配置目录（环境变量 CODEX_HOME，没设置时是 ~/.codex）。
# 重复运行是安全的：先用 codex plugin marketplace list --json 和 codex plugin list --json（只读）查看现状，
# 已添加、已安装的不再重复；读不出现状时不猜：安装当作「还没有」照常添加和安装，卸载当作「还在」照常移除，
# --reinstall 当作「已安装」先移除再安装。
# 退出码：0 成功，1 缺少 codex 或 node、HOME 不可用、或某条命令失败，2 参数不对。
set -u

MARKETPLACE=learn-anything-local
PLUGIN=learn-anything@$MARKETPLACE

die_usage() {
  echo "install-codex.sh: $1" >&2
  echo "用法：bash install-codex.sh [--courses-dir <绝对路径>] [--guokao-repo <绝对路径>] [--reinstall | --uninstall] [--dry-run]" >&2
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
config_script="$repo_root/plugins/learn-anything/skills/learn/scripts/config.mjs"

has_cntrl() {
  case $1 in
    *[[:cntrl:]]*) return 0 ;;
    *) return 1 ;;
  esac
}

# 参数 ------------------------------------------------------------------
courses_dir=
courses_given=0
guokao_repo=
guokao_given=0
uninstall=0
reinstall=0
dry_run=0

while [ $# -gt 0 ]; do
  case $1 in
    --courses-dir)
      [ $# -ge 2 ] || die_usage "--courses-dir 需要一个路径"
      courses_dir=$2; courses_given=1; shift 2 ;;
    --courses-dir=*)
      courses_dir=${1#--courses-dir=}; courses_given=1; shift ;;
    --guokao-repo)
      [ $# -ge 2 ] || die_usage "--guokao-repo 需要一个路径"
      guokao_repo=$2; guokao_given=1; shift 2 ;;
    --guokao-repo=*)
      guokao_repo=${1#--guokao-repo=}; guokao_given=1; shift ;;
    --uninstall) uninstall=1; shift ;;
    --reinstall) reinstall=1; shift ;;
    --dry-run) dry_run=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die_usage "未知参数：$1" ;;
  esac
done

[ "$uninstall" -eq 1 ] && [ "$reinstall" -eq 1 ] && die_usage "--reinstall 和 --uninstall 不能同时给"

# check_path <参数名> <值>：非空、绝对路径、没有控制字符，且不与 --uninstall 同用
check_path() {
  [ -n "$2" ] || die_usage "$1 的值不能为空"
  [ "$uninstall" -eq 0 ] || die_usage "$1 只在安装时使用，不能与 --uninstall 同用"
  case $2 in
    /*) ;;
    *) die_usage "$1 必须是绝对路径：$2" ;;
  esac
  has_cntrl "$2" && die_usage "$1 里不能有换行、制表符等控制字符"
  return 0
}
[ "$courses_given" -eq 1 ] && check_path --courses-dir "$courses_dir"
[ "$guokao_given" -eq 1 ] && check_path --guokao-repo "$guokao_repo"

# 环境检查 --------------------------------------------------------------
case ${HOME:-} in
  /*) ;;
  *)
    echo "HOME 没有设置，或者不是绝对路径（当前值：${HOME:-<未设置>}）：无法确定 Codex 的配置目录。" >&2
    exit 1
    ;;
esac

if ! command -v codex >/dev/null 2>&1; then
  echo "找不到 codex 命令：请先安装 Codex CLI，并确认 codex 在 PATH 里。" >&2
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

# 执行 ------------------------------------------------------------------
# 命令行显示用：只有安全字符的原样输出，其余整体加单引号
shquote() {
  case $1 in
    '') printf "''" ;;
    *[!A-Za-z0-9_@%+=:,./-]*) printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")" ;;
    *) printf '%s' "$1" ;;
  esac
}

cmd_line() {
  local line= a
  for a in "$@"; do line="$line $(shquote "$a")"; done
  printf '%s' "${line# }"
}

# 一步：dry-run 只打印（note 非空时作为行尾注释），否则执行；标准输入接空设备，免得命令去读终端
# step <note> <命令>...
step() {
  local note=$1
  shift
  if [ "$dry_run" -eq 1 ]; then
    if [ -n "$note" ]; then echo "+ $(cmd_line "$@")  # $note"; else echo "+ $(cmd_line "$@")"; fi
    return 0
  fi
  "$@" </dev/null
}

# 读出现状（只读）。结果放在 state：0 在，1 不在，2 读不出来（命令失败或输出看不懂）。dry-run 只打印命令，state 记为 2。
# codex_state marketplace|plugin <名字或 id>
codex_state() {
  local kind=$1 want=$2 out rc
  local -a cmd
  if [ "$kind" = marketplace ]; then cmd=(codex plugin marketplace list --json); else cmd=(codex plugin list --json); fi
  if [ "$dry_run" -eq 1 ]; then
    echo "+ $(cmd_line "${cmd[@]}")  # 只读：看是否已有 $want"
    state=2
    return 0
  fi
  if ! out=$("${cmd[@]}" </dev/null 2>/dev/null); then
    state=2
    return 0
  fi
  # marketplace 看 marketplaces[].name；plugin 看 installed[] 里 pluginId 相同且 installed 为 true
  printf '%s' "$out" | node -e '
    let s = "";
    process.stdin.on("data", (d) => { s += d; }).on("end", () => {
      try {
        const [kind, want] = process.argv.slice(1);
        const data = JSON.parse(s);
        const list = kind === "marketplace" ? data.marketplaces : data.installed;
        if (!Array.isArray(list)) process.exit(2);
        const ok = (x) => x !== null && typeof x === "object";
        const hit = list.some((x) => ok(x) && (kind === "marketplace" ? x.name === want : x.pluginId === want && x.installed !== false));
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
failed=0
fail_step() {
  failed=1
  echo "✗ $1 失败" >&2
}

if [ "$dry_run" -eq 0 ]; then
  echo "== Codex 配置目录 ${CODEX_HOME:-$HOME/.codex} =="
  [ -n "$courses_dir" ] && [ ! -d "$courses_dir" ] && echo "提示：课程目录 $courses_dir 还不存在，请先创建它。" >&2
  [ -n "$guokao_repo" ] && [ ! -d "$guokao_repo" ] && echo "提示：国考题库仓库 $guokao_repo 还不存在，请先创建它或确认路径。" >&2
fi

if [ "$uninstall" -eq 1 ]; then
  # 目标已经不在就跳过；两步互不依赖：plugin 没装上时仍要移除 marketplace
  codex_state plugin "$PLUGIN"
  if [ "$dry_run" -eq 0 ] && [ "$state" -eq 1 ]; then
    echo "plugin $PLUGIN 已不在，跳过移除"
  else
    step "已不在则跳过" codex plugin remove "$PLUGIN" || fail_step "移除 plugin"
  fi
  codex_state marketplace "$MARKETPLACE"
  if [ "$dry_run" -eq 0 ] && [ "$state" -eq 1 ]; then
    echo "marketplace $MARKETPLACE 已不在，跳过移除"
  else
    step "已不在则跳过" codex plugin marketplace remove "$MARKETPLACE" || fail_step "移除 marketplace"
  fi
  [ "$dry_run" -eq 1 ] || echo "配置文件和课程目录都没有动。"
else
  installed=1
  codex_state marketplace "$MARKETPLACE"
  if [ "$dry_run" -eq 0 ] && [ "$state" -eq 0 ]; then
    echo "marketplace $MARKETPLACE 已添加，跳过"
  else
    step "已添加则跳过" codex plugin marketplace add "$repo_root" || { fail_step "添加 marketplace"; installed=0; }
  fi
  if [ "$installed" -eq 1 ]; then
    codex_state plugin "$PLUGIN"
    if [ "$reinstall" -eq 1 ]; then
      # 重装：已安装（或读不出现状）就先移除，连同缓存；移除失败就不再往下装
      if [ "$dry_run" -eq 0 ] && [ "$state" -eq 1 ]; then
        echo "plugin $PLUGIN 还没安装，直接安装"
      else
        step "未安装则跳过" codex plugin remove "$PLUGIN" || { fail_step "移除 plugin（重装）"; installed=0; }
      fi
      [ "$installed" -eq 1 ] && { step "" codex plugin add "$PLUGIN" || fail_step "安装 plugin"; }
    elif [ "$dry_run" -eq 0 ] && [ "$state" -eq 0 ]; then
      echo "plugin $PLUGIN 已安装，跳过"
    else
      step "已安装则跳过" codex plugin add "$PLUGIN" || fail_step "安装 plugin"
    fi
  fi

  # 配置文件与 plugin 装没装上无关，给了就写
  # bash 3.2 在 set -u 下展开空数组会报错，所以按下标追加，只在非空时展开
  set_args=()
  if [ -n "$courses_dir" ]; then set_args[${#set_args[@]}]=--courses-dir; set_args[${#set_args[@]}]=$courses_dir; fi
  if [ -n "$guokao_repo" ]; then set_args[${#set_args[@]}]=--guokao-repo; set_args[${#set_args[@]}]=$guokao_repo; fi
  if [ "${#set_args[@]}" -gt 0 ]; then
    step "" node "$config_script" set "${set_args[@]}" || fail_step "写入配置文件"
  fi

  if [ "$dry_run" -eq 0 ]; then
    current=$(node "$config_script" 2>/dev/null)
    cfg_courses=$(printf '%s' "$current" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).courses_dir||"")}catch{}})' 2>/dev/null)
    if [ -z "$cfg_courses" ]; then
      echo "提示：课程目录还没配置。带上 --courses-dir <绝对路径> 重新运行本脚本，否则 skill 会停下要你先配置。"
    else
      echo "课程目录：$cfg_courses"
      echo "提示：Codex 的沙箱默认只能写当前工作目录。想免去每次写课程时的批准，可以在 ${CODEX_HOME:-$HOME/.codex}/config.toml 里加（已有这一节就把路径并进 writable_roots）："
      echo "  [sandbox_workspace_write]"
      echo "  writable_roots = [\"$cfg_courses\"]"
    fi
    echo "安装完成后新开一个 Codex 会话。"
  fi
fi

if [ "$failed" -ne 0 ]; then
  echo "有命令执行失败，见上面的输出。" >&2
  exit 1
fi
exit 0
