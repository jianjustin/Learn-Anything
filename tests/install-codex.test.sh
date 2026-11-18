#!/usr/bin/env bash
# install-codex.sh 的测试。执行到的 codex 是下面的桩，不触碰任何真实的 Codex 配置；配置文件写在临时 HOME 里。
# 任何一项不符，退出码为 1。
set -u
cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd -P)

SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT
export HOME="$SANDBOX/home"
mkdir -p "$HOME"
unset CODEX_HOME XDG_CONFIG_HOME LEARN_ANYTHING_CONFIG
CFG="$HOME/.config/learn-anything/config.json"
STUB_DIR="$SANDBOX/bin"
mkdir -p "$STUB_DIR"
export STUB_LOG="$SANDBOX/stub.log"

# 桩 codex：每次调用把参数（空格隔开）记一行；按环境变量模拟 list 的结果和失败
cat >"$STUB_DIR/codex" <<'STUB'
#!/usr/bin/env bash
echo "$*" >>"$STUB_LOG"
case "$*" in
  "plugin marketplace list --json")
    [ -z "${STUB_LIST_GARBAGE-}" ] || { echo "not json"; exit 0; }
    printf '{"marketplaces":[{"name":"personal","root":"/x"}'
    [ -z "${STUB_MARKET_PRESENT-}" ] || printf ',{"name":"learn-anything-local","root":"/y"}'
    echo ']}'
    ;;
  "plugin list --json")
    [ -z "${STUB_LIST_GARBAGE-}" ] || { echo "not json"; exit 0; }
    printf '{"installed":[{"pluginId":"learn-anything@other","installed":true}'
    [ -z "${STUB_PLUGIN_PRESENT-}" ] || printf ',{"pluginId":"learn-anything@learn-anything-local","installed":true}'
    echo '],"available":[]}'
    ;;
  "plugin marketplace add "*)
    [ -z "${STUB_FAIL_ADD-}" ] || { echo "stub: add failed" >&2; exit 1; }
    ;;
esac
exit 0
STUB
chmod +x "$STUB_DIR/codex"
export PATH="$STUB_DIR:$PATH"
if [ "$(command -v codex)" != "$STUB_DIR/codex" ]; then
  echo "中止：解析到的 codex 不是桩（$(command -v codex)），不敢往下跑。" >&2
  exit 1
fi

if [ -x /bin/bash ]; then BASH_BIN=/bin/bash; else BASH_BIN=bash; fi
CONFIG_JS="$ROOT/plugins/learn-anything/skills/learn/scripts/config.mjs"

fails=0
pass=0
ok() { pass=$((pass + 1)); }
bad() { echo "FAIL: $1" >&2; fails=$((fails + 1)); }
expect_eq() { if [ "$2" = "$3" ]; then ok; else bad "$1"; printf '  期望：%s\n  实际：%s\n' "$3" "$2" >&2; fi; }

# run [环境变量=值]... -- <install-codex.sh 的参数>...：清空日志后运行，结果放在 out、rc、log
run() {
  local -a envs=()
  while [ $# -gt 0 ] && [ "$1" != "--" ]; do envs[${#envs[@]}]=$1; shift; done
  shift
  : >"$STUB_LOG"
  if [ "${#envs[@]}" -gt 0 ]; then
    out=$(env "${envs[@]}" "$BASH_BIN" install-codex.sh "$@" 2>&1); rc=$?
  else
    out=$("$BASH_BIN" install-codex.sh "$@" 2>&1); rc=$?
  fi
  log=$(cat "$STUB_LOG")
}

nl=$'\n'

# ---- dry-run：只打印，不调用 codex，不写配置 ----
run -- --dry-run --courses-dir /data/c --guokao-repo /data/g
expect_eq "dry-run 退出码" "$rc" 0
expect_eq "dry-run 输出" "$out" "+ codex plugin marketplace list --json  # 只读：看是否已有 learn-anything-local
+ codex plugin marketplace add $ROOT  # 已添加则跳过
+ codex plugin list --json  # 只读：看是否已有 learn-anything@learn-anything-local
+ codex plugin add learn-anything@learn-anything-local  # 已安装则跳过
+ node $CONFIG_JS set --courses-dir /data/c --guokao-repo /data/g"
expect_eq "dry-run 不调用 codex" "$log" ""
[ ! -e "$CFG" ] && ok || bad "dry-run 不写配置文件"

run -- --dry-run --uninstall
expect_eq "dry-run 卸载输出" "$out" "+ codex plugin list --json  # 只读：看是否已有 learn-anything@learn-anything-local
+ codex plugin remove learn-anything@learn-anything-local  # 已不在则跳过
+ codex plugin marketplace list --json  # 只读：看是否已有 learn-anything-local
+ codex plugin marketplace remove learn-anything-local  # 已不在则跳过"

run -- --dry-run --reinstall
case $out in *"+ codex plugin remove learn-anything@learn-anything-local  # 未安装则跳过$nl+ codex plugin add learn-anything@learn-anything-local"*) ok ;; *) bad "dry-run 重装：先移除再安装" ;; esac

# ---- 参数不对：退出 2 ----
for args in "--courses-dir rel" "--courses-dir=" "--courses-dir" "--guokao-repo x" "--reinstall --uninstall" "--uninstall --courses-dir /a" "--uninstall --guokao-repo /a" "--foo"; do
  # shellcheck disable=SC2086
  run -- $args
  expect_eq "参数不对退出 2：$args" "$rc" 2
  expect_eq "参数不对不调用 codex：$args" "$log" ""
done

# ---- 缺少 codex：退出 1 ----
NODE_ONLY="$SANDBOX/node-only"
mkdir -p "$NODE_ONLY"
ln -s "$(command -v node)" "$NODE_ONLY/node"
out=$(PATH="$NODE_ONLY:/usr/bin:/bin" "$BASH_BIN" install-codex.sh 2>&1); rc=$?
expect_eq "缺少 codex 退出 1" "$rc" 1
case $out in *"找不到 codex 命令"*) ok ;; *) bad "缺少 codex 的提示" ;; esac

# ---- 全新安装：添加、安装、写配置 ----
run -- --courses-dir /data/courses/
expect_eq "全新安装退出码" "$rc" 0
expect_eq "全新安装调用的命令" "$log" "plugin marketplace list --json
plugin marketplace add $ROOT
plugin list --json
plugin add learn-anything@learn-anything-local"
expect_eq "配置文件写入课程目录（去掉末尾斜杠）" "$(node "$CONFIG_JS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).courses_dir))')" /data/courses
case $out in *"writable_roots"*) ok ;; *) bad "提示把课程目录加进 writable_roots" ;; esac

# 只给 --guokao-repo：按键合并，课程目录保留
run STUB_MARKET_PRESENT=1 STUB_PLUGIN_PRESENT=1 -- --guokao-repo /data/guokao
expect_eq "已安装时跳过添加和安装" "$log" "plugin marketplace list --json
plugin list --json"
case $out in *"已添加，跳过"*"已安装，跳过"*) ok ;; *) bad "已安装时说明跳过" ;; esac
expect_eq "按键合并" "$(node -e 'const c=require(process.argv[1]);process.stdout.write(c.courses_dir+" "+c.guokao_repo)' "$CFG")" "/data/courses /data/guokao"

# ---- 重装：先移除再安装；没装过就直接安装 ----
run STUB_MARKET_PRESENT=1 STUB_PLUGIN_PRESENT=1 -- --reinstall
expect_eq "重装调用的命令" "$log" "plugin marketplace list --json
plugin list --json
plugin remove learn-anything@learn-anything-local
plugin add learn-anything@learn-anything-local"
run STUB_MARKET_PRESENT=1 -- --reinstall
expect_eq "没装过时重装只安装" "$log" "plugin marketplace list --json
plugin list --json
plugin add learn-anything@learn-anything-local"

# ---- 读不出现状：当作还没有，照常添加和安装 ----
run STUB_LIST_GARBAGE=1 --
expect_eq "现状读不懂时照常添加和安装" "$log" "plugin marketplace list --json
plugin marketplace add $ROOT
plugin list --json
plugin add learn-anything@learn-anything-local"

# ---- 添加 marketplace 失败：不再安装，配置照写，退出 1 ----
rm -f "$CFG"
run STUB_FAIL_ADD=1 -- --courses-dir /data/x
expect_eq "添加失败退出 1" "$rc" 1
case $log in *"plugin add"*) bad "添加失败后不应再安装" ;; *) ok ;; esac
[ -f "$CFG" ] && ok || bad "添加失败时配置文件照写"

# ---- 卸载：在就移除，不在就跳过；不动配置文件 ----
run STUB_MARKET_PRESENT=1 STUB_PLUGIN_PRESENT=1 -- --uninstall
expect_eq "卸载退出码" "$rc" 0
expect_eq "卸载调用的命令" "$log" "plugin list --json
plugin remove learn-anything@learn-anything-local
plugin marketplace list --json
plugin marketplace remove learn-anything-local"
[ -f "$CFG" ] && ok || bad "卸载不删配置文件"
run -- --uninstall
expect_eq "已不在时卸载只读现状" "$log" "plugin list --json
plugin marketplace list --json"

echo "install-codex.test.sh：通过 $pass 项，失败 $fails 项"
[ "$fails" -eq 0 ]
