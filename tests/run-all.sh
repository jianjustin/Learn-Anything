#!/usr/bin/env bash
# 汇总所有测试。每一步都会运行，任何一步失败，最终退出码为 1，这样一次运行能看到所有问题。
set -u
cd "$(dirname "$0")/.." || exit 1

status=0
ASSETS=plugins/learn-anything/skills/learn/assets

echo "== 同步 examples/ 里的页面模板 =="
# 示例里的 course.html、index.html 必须与模板逐字节一致，这里以模板为准重新复制
for dir in examples/*/; do
  [ -f "${dir}course-data.js" ] || continue
  cp "$ASSETS/course.html" "${dir}course.html" || status=1
done
cp "$ASSETS/index.html" examples/index.html || status=1

echo "== node --test tests/unit =="
node --test tests/unit || status=1

# 页面测试：屏幕上看 spec 输出，另写一份 TAP 用来数被跳过的测试。
# 浏览器起不来时测试会被跳过；跳过不算通过。
echo "== node --test tests/e2e =="
tap="$(mktemp)"
node --test --test-concurrency=1 --test-timeout=180000 \
  --test-reporter=spec --test-reporter-destination=stdout \
  --test-reporter=tap --test-reporter-destination="$tap" \
  tests/e2e || status=1
skipped="$(sed -n 's/^# skip\(ped\)\{0,1\} \([0-9][0-9]*\)$/\2/p' "$tap" | tail -n 1)"
rm -f "$tap"
if [ -z "$skipped" ]; then
  echo "没有读到页面测试的统计结果" >&2
  status=1
elif [ "$skipped" != "0" ]; then
  echo "有 $skipped 个页面测试被跳过（浏览器没有启动），按失败处理" >&2
  status=1
fi

echo "== bash tests/install.test.sh =="
bash tests/install.test.sh || status=1

echo "== claude plugin validate plugins/learn-anything --strict =="
claude plugin validate plugins/learn-anything --strict || status=1

if [ "$status" -eq 0 ]; then
  echo "全部通过"
else
  echo "有步骤失败，见上面的输出" >&2
fi
exit "$status"
