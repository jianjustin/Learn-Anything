// 解析 Markdown 开头 `---` 之间的 `key: value` 行。
// 只在第一个冒号处切分，值两端成对的引号去掉。不支持多行值和嵌套。
export function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) value = value.slice(1, -1);
    data[key] = value;
  }
  return { data, body: text.slice(m[0].length) };
}
