# course-data.js 数据格式

`<课程目录>/<slug>/course-data.js` 是一门课的全部内容和进度。课程页 `course.html` 每 2.5 秒重新加载它，内容变了就重新渲染；数据有错时页面显示红框，保留上一次成功的内容，修好后自动恢复。校验规则只有一份，写在 `course.html` 里，页面和校验脚本共用，见第 9 节。

## 1. 文件形态

```text
window.LEARN_COURSE = { ……严格 JSON…… };
```

文件由三部分组成：前缀 `window.LEARN_COURSE = `、一个**严格 JSON** 对象、结尾的 `;`。页面在 `file://` 下只能用 `<script>` 加载数据，所以保留赋值语句的外壳；脚本和提醒 hook 去掉外壳后用 `JSON.parse` 读，所以外壳里必须是严格 JSON：

- 键一律加双引号，字符串一律用双引号。
- 没有注释，没有尾逗号，没有表达式（不能写 `[...].join("\n")`）。
- 字符串里的换行写成 `\n`，双引号写成 `\"`，反斜杠写成 `\\`。
- 文件以 `window.LEARN_COURSE = {` 开头、以 `};` 结尾。

## 2. 文本格式

- **带格式的文本**支持 `**粗体**`、`` `代码` `` 和 `\n` 换行，其余一切 HTML 都转义后按原文显示。适用于：卡片正文（`items`、`text`、`question`、`approach`、`answer`、`q`、`a`、`rubric`、`yours`、`why`、表格的 `headers` 和单元格、对比的 `pros`、`cons`、`conclusion`），`mission` 三项，`approach`，`resume.note`，课程 `summary`，`review[].text`，资料 `note`，代码版本的 `note`，时间线事件的 `title` 和 `detail`。
- **纯文本**，写 `**` 会原样显示：`topic`、`notice`、课程 `title`、卡片 `title`、对比的 `name`、资料 `title` 和 `author`、延伸阅读 `where`、节点和连线和分组的 `label`、标注 `text`、版本 `label`、`metricLabel`。
- `html` 卡片是唯一渲染 HTML 的地方，见第 6 节。

## 3. 顶层字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `version` | 是 | 固定为 `1` |
| `topic` | 是 | 主题名，非空 |
| `slug` | 是 | 英文 kebab-case，与课程目录名一致 |
| `template` | 是 | 套用的领域模板名（模板 frontmatter 的 `name`）；不套用时为 `null`，不能省略 |
| `templateData` | 否 | 模板自用的对象，内容由模板规定，核心不解释 |
| `mission` | 是 | `{ "why", "target", "background" }`：为什么学、学到什么程度、已有基础。三项都是字符串，可以为空字符串 |
| `approach` | 是 | 上法说明，自由文本：有没有实践、什么形式、怎么检验、怎么结课 |
| `researched` | 是 | `"yes"` 大纲经资料核对；`"no"` 想核对但做不到；`"skipped"` 模板或学习者决定不调研 |
| `resources` | 是 | 资料清单，可以为空数组，见第 4 节 |
| `notice` | 否 | 页面顶部提示条的文字，如「示范案例，请换成你自己的经历」 |
| `updatedAt` | 建议 | ISO 8601 带时区，如 `"2026-11-17T15:20:00+08:00"`；每次修改都更新 |
| `resume` | 建议 | `{ "lesson": "<课程 id>", "note": "讲到哪、下一步讲什么" }`。`note` 一句话，约 60 字以内，页头显示为「断点」；页面打开时定位到 `resume.lesson`，它变了页面会跳过去 |
| `review` | 是 | 待回顾清单，只放未解决的条目，可以为空数组，见第 5 节 |
| `growth` | 是 | 生长面板数组，可以为空数组，见第 7 节 |
| `lessons` | 是 | 课程数组，顺序即课程顺序，不能为空，见第 6 节 |

页面上 `researched` 的效果：`"no"` 时顶部显示「大纲未经资料核对」；`"yes"` 时每张卡片显示来源，有 `refs` 的显示资料名，没有的显示「未核对」（`questions`、`practice`、`note` 三种卡片不显示）；`"skipped"` 时都不显示。

## 4. resources：资料清单

```js
{ "id": "mankiw-macro", "kind": "book", "title": "《宏观经济学》", "author": "N. Gregory Mankiw", "note": "标准入门教材，每课后对照相应章节读" }
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 英文 kebab-case，全清单唯一；`readings` 和 `refs` 用它引用 |
| `kind` | 是 | `book`、`course`、`doc`、`paper`、`article`、`video`、`other` 之一 |
| `title` | 是 | 资料名 |
| `author` | 否 | 个人或机构 |
| `url` | 否 | 只写实际访问过的网址；`http(s)` 链接在页面上可以点开 |
| `note` | 是 | 这份资料覆盖什么、什么时候看。核实情况的后缀（「（章节未核对）」「（未能核实）」）加在末尾，规则见 kickoff.md |

## 5. review：待回顾

```js
{ "lesson": "inflation", "text": "说出通胀预期自我实现的机制" }
```

- `lesson` 是课程 id 或 `null`（不属于某一课的问题）。回顾答上来之后，靠它知道把哪一课改记为已掌握。
- `text` 写成下次能直接拿来问的样子。
- 新条目加在末尾，回顾时从最前面取。解决了就删掉，不留「已解决」的条目。

## 6. lessons：课程与卡片

```js
{
  "id": "monetary-policy",
  "title": "货币政策",
  "summary": "央行怎样通过利率影响经济，加息为什么会压低股价",
  "status": "current",
  "mastered": false,
  "readings": [{ "resource": "mankiw-macro", "where": "第 15 章" }],
  "cards": []
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 英文 kebab-case，全课程唯一，创建后不再改；生长元素、`resume`、`review` 都用它引用课 |
| `title`、`summary` | 是 | 标题和一句话说明 |
| `optional` | 否 | `true` 时显示「可选」 |
| `status` | 是 | `todo`、`current`、`done`、`skipped`；同一时间最多一个 `current` |
| `mastered` | 是 | 布尔。只有检验中表现出掌握才为 `true`；页面把「已讲」和「已掌握」分开显示 |
| `readings` | 是 | 延伸阅读：`[{ "resource": "<资料 id>", "where": "第 3 章第 2 节" }]`，可以为空。章节没核对的 `where` 写「章节未核对」，整份资料都要看的写「全文」 |
| `cards` | 是 | 卡片数组；`todo` 的课为空数组 |

### 卡片

所有卡片都可以带 `title`（省略时用默认标题）、`optional`（`true` 显示「可选」）和 `refs`（资料 id 的数组，表示内容出自哪些资料，规则见 lesson-guide.md「`refs` 只写真实出处」）。

| type | 默认标题 | 必需字段 | 示例 |
|---|---|---|---|
| `points` | 要点 | `items`: 字符串数组 | `{ "type": "points", "items": ["加息抬高**折现率**", "资金流向无风险资产"] }` |
| `steps` | 步骤 | `items`: 字符串数组 | `{ "type": "steps", "items": ["央行调整政策利率", "银行间利率跟随"] }` |
| `quote` | 一句话总结 | `text` | `{ "type": "quote", "text": "利率是资产的价格之锚。" }` |
| `problem` | 思考题 | `question`；可选 `approach`、`answer`（页面默认折叠） | `{ "type": "problem", "question": "为什么降息不一定救得了股市？", "answer": "……" }` |
| `qa` | 常见追问 | `items`: `[{ "q", "a" }]` | `{ "type": "qa", "items": [{ "q": "加息一定压低房价吗？", "a": "……" }] }` |
| `questions` | 你问过的 | `items`: `[{ "q", "a" }]` | 学习者插话问过的问题和回答要点 |
| `practice` | 你的练习 | `items`，见下 | 本课的检验记录 |
| `table` | 表格 | `rows`: 字符串二维数组；可选 `headers` | `{ "type": "table", "headers": ["工具", "方向"], "rows": [["加息", "收紧"]] }` |
| `compare` | 方案对比 | `options`: `[{ "name", "pros": [], "cons": [] }]`；可选 `conclusion` | 两个以上方案的优缺点和结论 |
| `chips` | 标签 | `items`: 字符串数组 | `{ "type": "chips", "items": ["GDP", "CPI", "失业率"] }` |
| `code` | 代码 | `code`；可选 `language` | 按原文显示，不渲染 mermaid；流程和结构用生长面板表达 |
| `note` | 提示 | `text` | `{ "type": "note", "text": "这一课的数字来自示例，不是真实数据。" }` |
| `html` | 补充 | `html` | 上面都覆盖不了时才用；渲染前移除脚本、事件属性、外部链接和资源 |

未知的 `type` 只产生警告，页面按原样显示内容；不要自造卡片类型。

### practice 的条目

每一项记录一次检验：

| 字段 | 必填 | 说明 |
|---|---|---|
| `q` | 是 | 题目全文 |
| `rubric` | 主观题必填 | 评分标准，发题时就写好 |
| `answer` | 否 | 参考答案。学习者作答之前不写，因为页面会显示它 |
| `yours` | 否 | 学习者的原话，一字不改 |
| `ok` | 否 | `true` 或 `false`；跳过的题省略 |
| `why` | 否 | 没掌握时写缺口在哪 |

页面按这些字段显示状态：有 `ok` 显示「答对」或「没掌握」；没有 `ok` 但有 `yours` 显示「未评」；都没有显示「待作答」。

## 7. growth：生长面板

生长面板只在课程有逐课演进的东西时启用。每个面板有 `kind` 和 `title`，`kind` 取 `diagram`、`code`、`timeline` 之一。

**面板里的元素都用课程 id 声明出现时机**：`since`（必填）表示从这一课开始出现，`until`（可选）表示从这一课开始消失，必须在 `since` 之后。本课新增的元素会高亮，并列进页面的「本课新增」。用 id 而不是序号，所以插入、删除课程不会打乱已有元素。

### diagram：方框加箭头

```js
{
  "kind": "diagram",
  "title": "货币政策的传导",
  "nodes": [
    { "id": "cb", "label": "央行", "col": 1, "row": 1, "style": "pill", "since": "monetary-policy" },
    { "id": "rate", "label": "市场利率", "col": 2, "row": 1, "since": "monetary-policy" }
  ],
  "edges": [{ "from": "cb", "to": "rate", "label": "调息", "since": "monetary-policy" }],
  "groups": [{ "id": "finance", "label": "金融体系", "members": ["cb", "rate"], "since": "monetary-policy" }],
  "annotations": [{ "node": "rate", "text": "传导有时滞", "since": "monetary-policy" }],
  "routes": [{ "lesson": "monetary-policy", "steps": ["cb", "rate"] }]
}
```

- `nodes`（必需）：`{ id, label, col, row, span?, style?, since, until? }`。`col`、`row` 是从 1 开始的整数，`span` 是占几列（整数，默认 1）。`style` 取 `box`（默认）、`pill`、`outline`、`ghost`。
- `edges`：`{ from, to, label?, style?, since, until? }`，`style` 取 `solid`（默认）或 `dashed`。
- `groups`：`{ id, label, members[], since, until? }`，边框按当前可见的成员自动计算。
- `annotations`：`{ node, text, since, until? }`，挂在节点上的小标签。
- `routes`：`{ lesson, steps[] }`，按顺序在节点上标号。从 `lesson` 那一课开始显示，直到后面的课挂了新路线。
- 版面：开题时先规划整张图，同一节点的位置在所有课里不变，这是「生长」的来源。全图控制在约 7 列 × 4 行以内；同时可见的两个节点不要占同一格；同一节点同时可见的标注不超过 3 条。`label` 尽量在 8 个字以内。
- 一课讲的是新的结构（新的对象、关系、环节），就画成节点和连线；标注只放关键参数。

### code：代码或文本的逐版演进

```js
{
  "kind": "code",
  "title": "记账脚本",
  "versions": [
    { "id": "v1", "since": "basics", "label": "v1 读入流水", "language": "python", "note": "只做读取", "code": "rows = read_csv('a.csv')\n" }
  ]
}
```

- `versions`（必需）：`{ id, since, label, language?, note?, code }`，`id` 在面板内唯一。
- 每个版本写**完整内容**：页面自动和前一个版本对比，高亮新增或改动的行。

### timeline：按时间排列的事件

```js
{
  "kind": "timeline",
  "title": "通胀与利率",
  "metricLabel": "CPI 同比",
  "better": "lower",
  "events": [
    { "since": "inflation", "title": "通胀抬头", "detail": "能源价格上涨", "metric": { "value": 6.5, "unit": "%" } }
  ]
}
```

- `events`（必需）：`{ since, title, detail?, metric? }`，`metric` 是 `{ "value": 数字, "unit": "单位" }`。事件没有 `until`。
- `better` 取 `lower`（默认，指标越低越好）或 `higher`。时间和数据量单位（`s`、`ms`、`us`、`min`、`B`、`KB`、`MB`、`GB`）会换算后比较，其他单位按原值比较，同一面板用同一类单位。

## 8. 写入清单

每一阶段写完都运行校验命令，并更新 `updatedAt`。

### 建课（学习者确认大纲之后）

写一份完整的文件（见第 10 节示例一）：

1. `version: 1`，`topic`，`slug`（与目录名一致），`template`（模板名或 `null`），套用模板时按模板要求写 `templateData`，模板要求时写 `notice`。
2. `mission`、`approach`、`researched`，内容按 kickoff.md。
3. `resources`：按 kickoff.md 由调研报告转换；没有资料时为 `[]`。
4. `lessons`：确认后的全部课程，每课有 `id`、`title`、`summary`、按需 `optional: true`、`readings`；第一课 `status: "current"`，其余 `"todo"`；全部 `mastered: false`、`cards: []`。
5. `growth`：启用的面板只建骨架（`diagram` 的 `nodes: []`，`code` 的 `versions: []`，`timeline` 的 `events: []`）；不启用时为 `[]`。
6. `review: []`；`resume: { "lesson": "<第一课 id>", "note": "准备开始第 1 课：……" }`。

### 开课

1. 本课 `status: "current"`（上一课应已是 `done`）。
2. 往面板里追加本课的生长元素，`since` 填本课 id；要移除的旧元素加 `until: "<本课 id>"`。需要标号时往 `routes` 加一条。
3. `resume: { "lesson": "<本课 id>", "note": "开始第 N 课：……" }`。

### 每讲完一段

只改 `resume.note` 和 `updatedAt`。

### 发题

往本课 `cards` 里的 `practice` 卡追加一条 `{ "q", "rubric" }`；本课还没有 `practice` 卡就新建一张。不写 `answer`。

### 评分

1. 补全这一条的 `yours`、`ok`、`answer`，没掌握时写 `why`。跳过的题不写 `ok`。
2. 本课所有评过的条目都通过：`mastered: true`。有没通过的：往 `review` 末尾加 `{ "lesson": "<本课 id>", "text": "<缺口>" }`，`mastered` 保持 `false`。

### 课末

1. 往本课 `cards` 写入卡片：至少 `points` 和 `quote`；学习者插过话加 `questions`；其余按内容选。已有的 `practice` 卡保留，卡片按讲的顺序排。
2. 本课 `status: "done"`；下一课（跳过 `skipped` 的）`status: "current"`。
3. `resume: { "lesson": "<下一课 id>", "note": "第 N 课已完成，下一课：……" }`。没有下一课时 `resume.lesson` 留在本课，`note` 写「全部课程已讲完」。

### 回顾

- 答上来：从 `review` 删掉这一条；它的 `lesson` 不为 `null`、且没有别的条目指向这一课时，把这一课 `mastered` 设为 `true`。
- 没答上来：不改数据。

### 调整大纲

- 插入：新 id，`status: "todo"`，`mastered: false`，`cards: []`。
- 删除：先改挂或删掉引用它的 `since`、`until`、`routes[].lesson`、`resume.lesson`、`review[].lesson`，再删课。
- 跳过：`status: "skipped"`，不删。
- 已学课程的卡片和生长元素不动。

## 9. 校验规则

校验命令的输出里，✗ 是错误，△ 是警告。

**错误**（页面显示红框，校验命令退出码 1，必须修好）：

- 外壳不对或外壳里不是严格 JSON。
- 缺少必填字段，或字段类型不对（如 `mastered` 不是布尔、`readings` 不是数组、`col` 不是正整数）。
- `status`、`researched`、资料 `kind`、面板 `kind`、节点 `style`、连线 `style`、`better` 的取值不在枚举内。
- 课程 id、资料 id、节点 id、版本 id 重复；`current` 多于一个；`lessons` 为空。
- 引用不存在：`resume.lesson`、`review[].lesson`、`since`、`until`、`routes[].lesson`、`readings[].resource`、`refs`、连线、分组、标注和路线引用的节点。
- `until` 不在 `since` 之后。
- 已知卡片类型缺少必需字段。

**警告**（不影响退出码，能顺手修就修）：

- `slug` 不是 kebab-case，或与目录名不一致。
- 未知的卡片类型。
- 同时可见的两个节点占同一格；同一节点同时可见的标注超过 3 条。

## 10. 完整示例

### 示例一：刚建好的课

没有调研条件、不套模板、不启用生长面板时，建课后的文件：

```js
window.LEARN_COURSE = {
  "version": 1,
  "topic": "认知心理学入门",
  "slug": "cognitive-psychology",
  "template": null,
  "mission": {
    "why": "做产品设计时想理解用户怎样注意、记忆和做决定",
    "target": "能用注意、记忆、决策偏差的基本概念解释日常现象",
    "background": "没有系统学过心理学，读过几本科普书"
  },
  "approach": "理论为主，不设动手实践。每课用复述或案例分析检验：给一个产品场景，请你用本课概念解释。最后一课综合分析一个你自己挑的产品。",
  "researched": "no",
  "resources": [],
  "updatedAt": "2026-11-17T10:00:00+08:00",
  "resume": {
    "lesson": "attention",
    "note": "准备开始第 1 课：注意"
  },
  "review": [],
  "growth": [],
  "lessons": [
    {
      "id": "attention",
      "title": "注意",
      "summary": "注意为什么有限，选择性注意怎样工作",
      "status": "current",
      "mastered": false,
      "readings": [],
      "cards": []
    },
    {
      "id": "memory",
      "title": "记忆",
      "summary": "工作记忆的容量，长时记忆怎样编码和提取",
      "status": "todo",
      "mastered": false,
      "readings": [],
      "cards": []
    },
    {
      "id": "decision",
      "title": "判断与决策",
      "summary": "启发式和常见的决策偏差",
      "status": "todo",
      "mastered": false,
      "readings": [],
      "cards": []
    },
    {
      "id": "capstone",
      "title": "综合分析",
      "summary": "用全课概念分析一个产品的设计",
      "status": "todo",
      "mastered": false,
      "readings": [],
      "cards": []
    }
  ]
};
```

### 示例二：学到一半的课

经过调研、启用了 `diagram` 面板，讲完两课：第一课掌握了，第二课检验没通过、留下一条待回顾；第三课刚开课，已经发出一道题还没作答。

```js
window.LEARN_COURSE = {
  "version": 1,
  "topic": "宏观经济学入门",
  "slug": "macro-economics",
  "template": null,
  "mission": {
    "why": "想看懂财经新闻里的利率、通胀和政策讨论",
    "target": "能解释主要宏观指标的含义，以及货币政策和财政政策怎样影响它们",
    "background": "学过一点微观经济学，没学过宏观"
  },
  "approach": "理论为主。每课用简答或案例分析检验，案例取自真实新闻。用一张图逐课长出各个宏观变量之间的关系。最后一课用全课框架分析一条最近的政策新闻。",
  "researched": "yes",
  "resources": [
    {
      "id": "mankiw-macro",
      "kind": "book",
      "title": "《宏观经济学》",
      "author": "N. Gregory Mankiw",
      "note": "标准入门教材，每课后对照相应章节读"
    },
    {
      "id": "fed-policy",
      "kind": "doc",
      "title": "Monetary Policy",
      "author": "Federal Reserve",
      "url": "https://www.federalreserve.gov/monetarypolicy.htm",
      "note": "美联储对自身政策工具的官方说明，讲货币政策时翻阅（章节未核对）"
    }
  ],
  "updatedAt": "2026-11-17T21:05:00+08:00",
  "resume": {
    "lesson": "monetary-policy",
    "note": "已发出第一道简答题，等你作答；之后讲量化宽松"
  },
  "review": [
    {
      "lesson": "inflation",
      "text": "说出通胀预期自我实现的机制"
    }
  ],
  "growth": [
    {
      "kind": "diagram",
      "title": "宏观变量之间的关系",
      "nodes": [
        { "id": "output", "label": "产出 GDP", "col": 2, "row": 1, "since": "gdp" },
        { "id": "spending", "label": "总支出", "col": 1, "row": 1, "style": "outline", "since": "gdp" },
        { "id": "prices", "label": "物价", "col": 3, "row": 1, "since": "inflation" },
        { "id": "cb", "label": "央行", "col": 1, "row": 2, "style": "pill", "since": "monetary-policy" },
        { "id": "rate", "label": "利率", "col": 2, "row": 2, "since": "monetary-policy" }
      ],
      "edges": [
        { "from": "spending", "to": "output", "label": "决定", "since": "gdp" },
        { "from": "output", "to": "prices", "label": "过热", "style": "dashed", "since": "inflation" },
        { "from": "cb", "to": "rate", "label": "调息", "since": "monetary-policy" },
        { "from": "rate", "to": "spending", "label": "抑制", "since": "monetary-policy" }
      ],
      "routes": [
        { "lesson": "monetary-policy", "steps": ["cb", "rate", "spending", "output", "prices"] }
      ]
    }
  ],
  "lessons": [
    {
      "id": "gdp",
      "title": "GDP 怎么算",
      "summary": "支出法、收入法、生产法，名义 GDP 和实际 GDP",
      "status": "done",
      "mastered": true,
      "readings": [{ "resource": "mankiw-macro", "where": "第 2 章" }],
      "cards": [
        {
          "type": "points",
          "items": [
            "支出法：GDP = 消费 + 投资 + 政府购买 + 净出口",
            "**实际 GDP** 用基年价格计算，剔除了物价变化，才能比较不同年份的产出"
          ],
          "refs": ["mankiw-macro"]
        },
        {
          "type": "practice",
          "items": [
            {
              "q": "某国今年名义 GDP 增长 8%，物价上涨 5%，实际 GDP 大约增长多少？为什么要看实际 GDP？",
              "rubric": "答出以下两点：① 实际增长约 3%（8% − 5%）；② 名义增长里有物价上涨的部分，实际 GDP 才反映产出的变化",
              "yours": "大概 3%，因为有 5% 是涨价涨出来的，东西其实没多那么多",
              "ok": true,
              "answer": "约 3%。名义 GDP 的增长 = 产出增长 + 物价上涨，扣掉 5% 的物价因素，产出只多了约 3%，所以比较不同年份要看实际 GDP。"
            }
          ]
        },
        { "type": "quote", "text": "GDP 衡量的是产出，看增长要先扣掉物价。" }
      ]
    },
    {
      "id": "inflation",
      "title": "通货膨胀",
      "summary": "通胀的成因、CPI 的算法，以及通胀预期",
      "status": "done",
      "mastered": false,
      "readings": [{ "resource": "mankiw-macro", "where": "第 5 章" }],
      "cards": [
        {
          "type": "points",
          "items": [
            "需求拉动：总支出超过产能，价格被抬高",
            "成本推动：能源、工资等成本上涨传导到售价",
            "通胀预期会自我实现：人们预期涨价，就提前要求加薪、提前购买"
          ]
        },
        {
          "type": "questions",
          "items": [
            { "q": "CPI 和 PPI 有什么区别？", "a": "CPI 是消费者买到的价格，PPI 是生产者出厂的价格；PPI 往往领先 CPI。" }
          ]
        },
        {
          "type": "practice",
          "items": [
            {
              "q": "为什么央行很在意「通胀预期」，而不只是当前的通胀率？",
              "rubric": "答出以下两点：① 预期会改变工资谈判和定价行为；② 因此预期本身会推高未来的通胀，形成自我实现",
              "yours": "因为预期高了大家会恐慌",
              "ok": false,
              "why": "没有说明预期怎样通过工资和定价行为传导；没有讲到自我实现",
              "answer": "预期通胀高时，工人要求更高的工资，企业提前提价，这些行为本身推高了实际通胀，所以预期会自我实现。央行要稳住预期，才能稳住未来的通胀。"
            }
          ]
        },
        { "type": "quote", "text": "通胀不只取决于现在发生了什么，也取决于人们相信会发生什么。" }
      ]
    },
    {
      "id": "monetary-policy",
      "title": "货币政策",
      "summary": "央行怎样通过利率影响经济，加息为什么会压低股价",
      "status": "current",
      "mastered": false,
      "readings": [
        { "resource": "mankiw-macro", "where": "第 15 章" },
        { "resource": "fed-policy", "where": "章节未核对" }
      ],
      "cards": [
        {
          "type": "practice",
          "items": [
            {
              "q": "央行加息之后，一家打算借钱扩建工厂的企业会怎么想？这对总支出有什么影响？",
              "rubric": "答出以下两点：① 借款成本上升，部分投资项目变得不划算而推迟或取消；② 投资减少使总支出下降"
            }
          ]
        }
      ]
    },
    {
      "id": "fiscal-policy",
      "title": "财政政策",
      "summary": "政府支出和税收怎样影响总需求，乘数效应",
      "status": "todo",
      "mastered": false,
      "readings": [{ "resource": "mankiw-macro", "where": "章节未核对" }],
      "cards": []
    },
    {
      "id": "open-economy",
      "title": "开放经济",
      "summary": "汇率、贸易差额和资本流动",
      "optional": true,
      "status": "todo",
      "mastered": false,
      "readings": [],
      "cards": []
    }
  ]
};
```
