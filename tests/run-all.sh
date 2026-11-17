#!/usr/bin/env bash
# 汇总所有测试；任何一步失败，最终退出码为 1。后续任务会往里加步骤。
set -u
cd "$(dirname "$0")/.." || exit 1

status=0

echo "== node --test tests/unit =="
node --test tests/unit || status=1

exit "$status"
