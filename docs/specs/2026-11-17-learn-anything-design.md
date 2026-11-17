# learn-anything 设计文档

- 日期：2026-11-17
- 状态：设计已确认，待实施
- 读者：实现者（人或 agent）。本文记录已经做出的决定和理由。没有写到的细节见第 7 节。

## 1. 意图

想系统地学一个主题时，现在只有两条路：

- 直接让 Claude 讲。没有大纲，没有进度，讲完就散。
- 把主题硬套进为面试或考公写的 skill。美股波段交易就被套成了一门「面试课」，最后一课是面试串讲。

learn-anything 是一个 Claude Code plugin。对任意主题，它先问清学习者为什么学、已有什么基础，联网调研后给出一份有出处的大纲，然后分段讲授、逐课检验。内容和进度落在一个本地离线课程页里，可以跨会话续学。面试这类领域的专门做法以「领域模板」的形式叠加在通用流程上。

## 2. 目标、非目标、反目标

### 目标（第一版）

- G1 任意主题都能开课：开题提问、资料调研、带资料清单的大纲、分段讲授、逐课检验、续学时先回顾。
- G2 课程用自己的大纲保证完整。书和其他资料按课挂载为延伸阅读，标到章节。
- G3 上法由 skill 按主题判断，不设课型，不设选项表。
- G4 「已讲」和「已掌握」分开记录。
- G5 面试模板：行为与原 interview-sprint 一致。
- G6 把现有两门有进度的面试课程迁移过来。
- G7 验收通过后 interview-sprint 在本机退役。

### 非目标（第一版不做，以后可以做）

- 算法排期的复习和到期日。
- 支持 Codex、pi 等其他工具。
- guokao 模板，以及其他最佳实践模板。
- 发布到公共 marketplace。

### 反目标（做了算错）

- 不修改 guokao-sprint 的任何文件。
- 不删除、不改写现有课程的原目录。迁移只读源文件，输出写到新位置。
- hook 和常规脚本不把课程数据当代码执行，只按 JSON 解析。唯一的例外是迁移脚本读取旧格式文件。
- 不做打卡、连续天数和内疚式提醒。
- 不修改复制到课程目录里的页面模板。

## 3. 约束

- 运行环境：Claude Code（开发机为 2.1.318），node 20 及以上（开发机为 v26.8.2）。node 是硬依赖。
- 课程页是单个 HTML 文件，零外部依赖，在 `file://` 下可用。
- 进度的唯一来源是每门课的 `course-data.js`。不另建进度文件。
- 直接在 `main` 分支上开发。
- 讲课语言跟随学习者。仓库文档以中文为主，README 中英双语。
- 开发机有两个 Claude 配置目录：`~/.claude`（桌面应用）和 `~/.claude-ccswitch`（命令行别名）。安装和退役都要覆盖两处。

## 4. 方案概览

```text
Learn-Anything/                          # 仓库根，也是本地 marketplace 的根
├── .claude-plugin/marketplace.json      # 本地 marketplace，指向 ./plugins/learn-anything
├── plugins/learn-anything/              # plugin 本体，只有这个目录会被加载
│   ├── .claude-plugin/plugin.json       # name、version、userConfig.courses_dir
│   ├── skills/learn/
│   │   ├── SKILL.md
│   │   ├── references/                  # kickoff.md、lesson-guide.md、data-format.md
│   │   ├── templates/interview/         # TEMPLATE.md、outline-patterns.md、lesson-guide.md
│   │   ├── assets/                      # course.html、index.html
│   │   └── scripts/                     # validate、new-course、migrate-interview、review-reminder，及 lib/
│   ├── agents/                          # course-researcher.md、answer-grader.md
│   └── hooks/hooks.json                 # SessionStart 提醒
├── tests/                               # unit、e2e、fixtures、helpers、run-all.sh
├── examples/                            # 示例课程
├── docs/specs/、docs/superpowers/plans/
├── install.sh
└── README.md、README.zh-CN.md
```

skill 的调用名是 `/learn-anything:learn`，也会按描述自动触发。

## 5. 已确定的设计

### 5.1 存放位置

- 所有课程存在一个全局目录里，由 plugin 的用户配置项 `courses_dir`（类型 `directory`）指定。开发机配置为 `/Users/chenjianrui/projects`。
- skill 不在当前工作目录里找课程。
- SKILL.md 用 `${user_config.courses_dir}` 取得路径。脚本一律从命令行参数接收目录，不自己读配置。

```text
<courses_dir>/
├── index.html          # 从 assets/index.html 原样复制
├── index-data.js       # window.LEARN_INDEX
└── <slug>/             # 每门课一个目录，slug 为英文 kebab-case
    ├── course.html     # 从 assets/course.html 原样复制
    └── course-data.js  # window.LEARN_COURSE
```

### 5.2 数据文件的形态

```js
window.LEARN_COURSE = {
  "version": 1
};
```

- 文件由三部分组成：前缀 `window.LEARN_COURSE = `、一个严格的 JSON 对象、结尾的 `;`。
- 页面在 `file://` 下只能用 `<script>` 加载数据，所以保留赋值语句的外壳。
- 外壳里必须是严格 JSON：键加双引号，不能有注释、尾逗号和表达式。这样脚本和 hook 去掉外壳后用 `JSON.parse` 读取，不执行文件内容。
- `index-data.js` 同理：`window.LEARN_INDEX = {"version":1,"courses":[{"slug":"x","dir":"x"}]};`。

### 5.3 课程数据的字段

顶层字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `version` | 是 | 固定为 `1` |
| `topic` | 是 | 主题名 |
| `slug` | 是 | 英文 kebab-case，与目录名一致 |
| `template` | 是 | 套用的领域模板名，如 `"interview"`；不套用时为 `null` |
| `templateData` | 否 | 模板自用的对象。核心不解释它的内容 |
| `mission` | 是 | `{ "why", "target", "background" }`：为什么学、学到什么程度、已有基础。迁移来的课程可以是空字符串 |
| `approach` | 是 | 上法说明，自由文本：有没有实践、什么形式、怎么检验、怎么结课 |
| `researched` | 是 | `"yes"` 大纲经资料核对；`"no"` 想核对但没有联网能力；`"skipped"` 模板或学习者决定不调研 |
| `resources` | 是 | 资料清单，可以为空数组 |
| `notice` | 否 | 页面顶部的提示条文字，如「示范案例，请换成你自己的经历」 |
| `updatedAt` | 建议 | ISO 8601 带时区，每次修改都更新 |
| `resume` | 建议 | `{ "lesson": "<课程 id>", "note": "讲到哪、下一步讲什么" }` |
| `review` | 是 | 待回顾清单，只放未解决的条目，可以为空数组 |
| `growth` | 是 | 生长面板数组，可以为空数组 |
| `lessons` | 是 | 课程数组，顺序即课程顺序，不能为空 |

`resources` 的每一项：`{ "id", "kind", "title", "author"?, "url"?, "note" }`。`kind` 取 `book`、`course`、`doc`、`paper`、`article`、`video`、`other` 之一。`note` 写这份资料覆盖什么、什么时候看。

`review` 的每一项：`{ "lesson": "<课程 id>" 或 null, "text": "要回顾的点" }`。

`lessons` 的每一项：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 英文 kebab-case，创建后不再改 |
| `title`、`summary` | 是 | 标题和一句话说明 |
| `optional` | 否 | `true` 显示「可选」 |
| `status` | 是 | `todo`、`current`、`done`、`skipped`；同一时间最多一个 `current` |
| `mastered` | 是 | 布尔。只有检验中表现出掌握才为 `true` |
| `readings` | 是 | 延伸阅读：`[{ "resource": "<资料 id>", "where": "第 3 章第 2 节" }]`，可以为空 |
| `cards` | 是 | 卡片数组；`todo` 的课为空数组 |

### 5.4 卡片

所有卡片都可以带 `title`、`optional` 和 `refs`。`refs` 是资料 id 的数组，表示这张卡片的内容出自哪些资料。

| type | 默认标题 | 字段 |
|---|---|---|
| `points` | 要点 | `items: string[]` |
| `steps` | 步骤 | `items: string[]` |
| `quote` | 一句话总结 | `text` |
| `problem` | 思考题 | `question`、`approach`?、`answer`?（答案默认折叠） |
| `qa` | 常见追问 | `items: [{ q, a }]` |
| `questions` | 你问过的 | `items: [{ q, a }]` |
| `practice` | 你的练习 | `items`，见下 |
| `table` | 表格 | `headers`?、`rows: string[][]` |
| `compare` | 方案对比 | `options: [{ name, pros[], cons[] }]`、`conclusion`? |
| `chips` | 标签 | `items: string[]` |
| `code` | 代码 | `code`、`language`? |
| `note` | 提示 | `text` |
| `html` | 补充 | `html`，渲染前清洗：移除脚本、事件属性、外部链接和资源 |

`practice` 的每一项记录一次检验：

| 字段 | 必填 | 说明 |
|---|---|---|
| `q` | 是 | 题目全文 |
| `rubric` | 主观题必填 | 评分标准，发题时就写好 |
| `answer` | 否 | 参考答案。学习者作答之前不写，因为页面会显示它 |
| `yours` | 否 | 学习者的原话 |
| `ok` | 否 | `true` 或 `false`；跳过的题省略 |
| `why` | 否 | 没掌握时写缺口在哪 |

文本格式：卡片正文支持 `**粗体**`、`` `代码` `` 和 `\n` 换行。其他 HTML 一律转义后按原文显示，`html` 卡片除外。标题类字段是纯文本。

### 5.5 生长面板

生长面板只在课程有演进过程时启用。每个面板有 `kind` 和 `title`。面板里的元素用课程 id 声明出现时机：`since` 必填，表示从这一课开始出现；`until` 可选，表示从这一课开始消失。

| kind | 用途 | 元素 |
|---|---|---|
| `diagram` | 方框加箭头的图：架构图、概念图、流程 | `nodes`、`edges`、`groups`、`annotations`、`routes` |
| `code` | 代码或文本的逐版演进，相邻版本自动对比 | `versions` |
| `timeline` | 按时间排列的事件，可带指标条 | `events`、`metricLabel`?、`better`? |

元素字段：

- `nodes`：`{ id, label, col, row, span?, style?, since, until? }`。按网格定位，位置确定后不再改。`style` 取 `box`（默认）、`pill`、`outline`、`ghost`。
- `edges`：`{ from, to, label?, style?, since, until? }`。`style` 取 `solid`（默认）或 `dashed`。
- `groups`：`{ id, label, members[], since, until? }`。
- `annotations`：`{ node, text, since, until? }`。
- `routes`：`{ lesson, steps[] }`，按顺序给节点标号。从 `lesson` 那一课开始显示，直到后面的课挂了新路线。
- `versions`：`{ id, since, label, language?, note?, code }`。每个版本写完整内容。
- `events`：`{ since, title, detail?, metric?: { value, unit } }`。`better` 取 `lower`（默认）或 `higher`。

### 5.6 校验规则

校验逻辑只有一份，写在 `course.html` 的核心脚本里，页面和 `validate.mjs` 共用。

错误（页面显示红框，`validate.mjs` 退出码 1）：

- 外壳或 JSON 不合法。
- 缺少必填字段，或字段类型不对。
- `status`、`researched`、资料 `kind`、面板 `kind` 的取值不在枚举内。
- 课程 id 重复；`current` 多于一个。
- 引用不存在：`resume.lesson`、`review[].lesson`、`since`、`until`、`routes[].lesson`、`readings[].resource`、`refs`、连线和分组引用的节点。
- `until` 不在 `since` 之后。
- 已知卡片类型缺少必需字段。

警告（可折叠显示，不影响退出码）：

- `slug` 不是 kebab-case，或与目录名不一致。
- 未知的卡片类型（按原样显示内容）。
- 同时可见的两个节点占同一格；同一节点同时可见的标注超过 3 条。

### 5.7 课程页与总览页

`course.html`：

- 结构上分两个脚本块。`course-core` 是纯逻辑，不碰 DOM，导出 `window.CourseCore`。`course-app` 负责渲染和加载。`validate.mjs` 和单元测试从 HTML 里抽出 `course-core` 在 node 里运行。
- 每 2.5 秒重新加载同目录的 `course-data.js`，内容变了才重新渲染。重新渲染时保留学习者正在看的那一课，只有 `resume.lesson` 变了才跳转。
- 数据出错时显示错误框并保留上一次成功的内容，数据修好后自动恢复。
- 显示的内容：
  - 页头：主题、目标、上法、断点说明、进度。
  - 提示条：`notice`；`researched` 为 `"no"` 时显示「大纲未经资料核对」。
  - 课程列表：每课的状态、「可选」标记，「已讲」和「已掌握」分开显示。
  - 待回顾清单、资料清单。
  - 生长面板，以及「本课新增」。
  - 当前课的卡片和延伸阅读。
- 来源标记：`researched` 为 `"yes"` 时，有 `refs` 的卡片显示资料名，没有 `refs` 的卡片显示「未核对」。`questions`、`practice`、`note` 三种卡片不显示来源标记。`researched` 为其他值时不显示逐卡标记。
- 交互：左右方向键切换课程；「播放生长」自动逐课前进；`diagram` 面板可导出 SVG 和 PNG。
- 跟随系统的深浅色；窄屏变为单栏。

`index.html`：

- 读取 `index-data.js`，再逐个加载各课的 `course-data.js`。
- 每门课显示：主题、模板标记、已讲课数与总课数、已掌握课数、待回顾条数、断点说明、更新时间。
- 按更新时间倒序。加载失败的课程单独列出并说明原因。
- 课程目录只允许相对路径，拒绝协议、`..` 和绝对路径。

### 5.8 入口与开题

入口：

- 带主题：先看总览里有没有相同或相近的课。有就用弹窗问续学、重开还是另开一门。
- 不带主题，或只说「继续学习」：列出全部课程和进度，让学习者选。

开题的步骤：

1. **提问**。在对话里问两件事：为什么学、想学到什么程度；已有哪些基础。请求里已经说过的不再问。
2. **匹配模板**。读取各模板的匹配说明，判断主题是否命中。
3. **调研**。把调研交给 `course-researcher` 子代理，并先告诉学习者这一步要几分钟。模板声明不调研、或学习者说不用调研时跳过，记 `researched: "skipped"`。没有联网能力或子代理不可用时，由 skill 凭自身知识出大纲，记 `researched: "no"`。
4. **给出大纲**。在对话里依次给出：
   - 套用的模板（如有）。
   - 上法说明及理由：有没有实践、什么形式、怎么检验、怎么结课、是否启用生长面板。
   - 资料清单的要点。
   - 大纲：每课一行，标题、一句话说明、对应的延伸阅读；非重点课标「可选」。
   - 拟定的 slug。
5. **确认**。用弹窗问确认还是调整。确认之前不创建任何文件。
6. **建课**。运行 `new-course.mjs`，写入 `course-data.js`，运行校验，打开课程页，开始第一课。

### 5.9 每课的讲解与检验

- 开课先改页面：本课设为 `current`，写入本课的生长增量，更新 `resume`。
- 分段讲：每段只讲一个点，约 300 字以内，段末停下等学习者。学习者说「直接讲完这课」时连续讲完，但仍按段组织。
- 学习者插话：先回答。偏离本课的简要回答，并说明放到后面哪一课，或记入待回顾。问过的问题课末写进 `questions` 卡。
- 每讲完一段更新 `resume.note` 和 `updatedAt`。
- 每课至少一次检验，形式由 skill 按主题定：复述、简答、案例分析、做练习、推进项目。流程：
  1. 发题时先把题目和评分标准写进本课的 `practice` 卡，不写参考答案，然后停下等作答。
  2. 作答后评分。主观作答交给 `answer-grader` 子代理；客观题和能直接运行验证的练习当场判。学习者说「直接评」时不用子代理。
  3. 补全这一条的 `yours`、`ok`、`why`、`answer`。
  4. 表现出掌握：本课 `mastered` 设为 `true`。否则往 `review` 里加一条，写明缺口。
- 学习者说「跳过」时不做检验：`mastered` 保持 `false`，不加待回顾。
- 课末：对话里给 3–5 条小结；写入本课卡片，至少有 `points` 和 `quote`；本课设为 `done`，下一课设为 `current`，`resume` 指向下一课。
- 讲完就推进，检验没通过也不卡住进度。

### 5.10 续学、回顾与调整大纲

续学：

1. 读课程数据，用两三句话回顾学到哪。不依赖会话历史。
2. 待回顾清单不为空时先回顾：取最早的一两条，让学习者凭记忆回答。
   - 答上来：删除这一条。对应的课没有其他待回顾条目时，把它的 `mastered` 设为 `true`。
   - 没答上来：简要重讲，条目保留。
   - 学习者说「跳过回顾」时直接继续。
3. 从断点继续。有已发出但未作答的检验时，把题目原样再发一次。

调整大纲：学习中可以增删课程、调整顺序、跳过可选课。只改涉及的课，已学课程的卡片和生长元素不变。删除一课之前先处理引用它的元素。删除、重排、重开属于大改动，先说明影响并得到确认。

### 5.11 领域模板

- 一个模板是 `templates/<name>/` 下的一组说明文件。入口是 `TEMPLATE.md`。
- `TEMPLATE.md` 的 frontmatter：
  - `name`：模板名，写进课程数据的 `template`。
  - `match`：一句话说明什么样的请求套用这个模板。
  - `research`：`run` 或 `skip`。
- 正文说明这个领域的大纲骨架、讲课规则、卡片与面板的约定、结课形式。可以引用同目录的其他文件。
- 选用方式：自动匹配。命中时在大纲开头说明「本课套用某某模板」，学习者可以说不用。
- 模板的规则与通用规则冲突时，以模板为准。模板不能改变数据格式，只能使用已有字段和 `templateData`。

面试模板（`interview`）：

- 匹配面试准备类请求：系统设计、知识点、经历复盘、模拟面试。
- `research: skip`。
- 内容从 interview-sprint 开发仓库的当前工作副本移植：三类主题的大纲骨架、组件课四步、核心链路课、面试题的数量和题型、追问链、面试串讲、示范案例的提醒。
- 命名对应：`architecture` 面板改为 `diagram`；`interview` 卡改为标题是「面试题」的 `problem` 卡；`quote` 卡的标题写「面试怎么讲」；`demoCase` 改为 `notice`。
- 主题类型（`system-design`、`knowledge`、`experience`）存进 `templateData.type`。
- 课中的面试题同时算作本课的检验，记进 `practice` 卡并参与「已掌握」和待回顾。

### 5.12 子代理

`course-researcher`：

- 工具：联网搜索和网页抓取。
- 输入：主题、学习目标和基础、学习者指定的书或资料（如有）、讲课语言。
- 任务：找这个主题公认的课纲、经典教材的目录和权威资料，交叉比对后给出大纲草案。
- 输出：资料清单；大纲草案，每课带延伸阅读；对上法的建议；没找到可靠资料的部分；未能核实的项。
- 规则：章节号必须在目录原文里核对过，核对不了就只写书名并注明。不把营销内容当资料。

`answer-grader`：

- 不读任何文件。输入只有题目、评分标准和学习者的原话。
- 输出：是否掌握、命中了哪些要点、缺了哪些、一句反馈。
- 规则：只对照评分标准判断，不因表达流畅加分。

### 5.13 SessionStart 提醒

- 只在新会话启动时运行。
- 读取 `courses_dir` 下各课的 `review`，统计条数。
- 有待回顾内容、今天还没提醒过时，输出一行：共有几门课、几条待回顾，说「继续学习」可以先回顾。同时把这句话加进模型上下文。
- 没有待回顾内容、今天已经提醒过、目录不存在或数据读不出来时，不输出任何内容，退出码 0。
- 「今天是否提醒过」记在 plugin 的持久数据目录里。

### 5.14 脚本

| 脚本 | 用法 | 行为 |
|---|---|---|
| `validate.mjs` | `<course-data.js>` | 用页面的核心逻辑校验。退出码 0 通过，1 有错误，2 参数不对 |
| `new-course.mjs` | `<courses_dir> <slug>` | 建目录，复制 `course.html`；`index.html` 不存在时复制；把课程登记进 `index-data.js`。目录已存在时拒绝并退出 1。不写 `course-data.js`。输出课程页的绝对路径 |
| `migrate-interview.mjs` | `<旧课程目录> <courses_dir>` | 把旧格式课程转换后写入新位置，见 5.15 |
| `review-reminder.mjs` | `<courses_dir>` | SessionStart 提醒，见 5.13 |

### 5.15 课程迁移

- 只迁移两门：`billing-system` 和 `customer-service-agent`，都在 `workspaces/skills/interview_sprint/.interview_points/` 下。
- 其余 4 门只有大纲，不迁移。想学时在 learn-anything 里重新开题。
- 转换规则：
  - 全局变量改为 `LEARN_COURSE`，内容写成严格 JSON。
  - `template` 设为 `"interview"`，原 `type` 移到 `templateData.type`。
  - `demoCase: true` 改为对应文字的 `notice`。
  - `mission` 三项为空字符串，`approach` 为空字符串，`researched` 为 `"skipped"`，`resources` 为空。
  - `review` 的每条字符串改为 `{ "lesson": null, "text": 原文 }`。
  - 面板 `architecture` 改为 `diagram`；节点类型 `service`、`store`、`external`、`placeholder` 分别改为 `box`、`pill`、`outline`、`ghost`。
  - `interview` 卡改为 `problem` 卡，原来没有标题的补上「面试题」。原来没有标题的 `quote` 卡补上「面试怎么讲」。
  - 每课加 `mastered: false` 和空的 `readings`。旧课程没有记录过掌握的证据。
- 脚本不修改源目录。转换后运行校验，并核对课数、每课卡片数、各面板元素数与源文件一致。

### 5.16 触发、安装与退役

触发（写进 skill 的描述）：

- 学习任意主题、系统学习、继续学习、面试准备类请求都归 learn-anything。
- 带考公词的请求不归它，归 guokao-sprint。

安装：

- 仓库根是一个本地 marketplace。通过本地路径添加后，plugin 直接从源目录加载，改动在下次会话生效。
- `install.sh` 对两个配置目录分别添加 marketplace 并安装 plugin。
- 安装后把 `courses_dir` 配置为 `/Users/chenjianrui/projects`。

退役（验收通过后，动手前再向用户确认一次）：

- 只删除两个配置目录里的 `skills/interview-sprint` 链接。
- 不动 `~/.local/share/interview-sprint`、开发仓库和 GitHub 仓库。

## 6. 验收标准

### 自动化

- `bash tests/run-all.sh` 全部通过，没有被跳过的测试。
- `claude plugin validate plugins/learn-anything --strict` 通过。

### 人工验收

| 检验什么 | 主题 | 期望看到 |
|---|---|---|
| 通用流程，理论为主并挂书 | 一门金融或心理学的课，题目由用户定 | 开题问目标和基础；调研后给出带资料清单的大纲；每课标注对应的书和章节 |
| 通用流程，理论加实践 | 美股波段交易，重新开题 | 不套面试骨架；skill 自己判断要不要实践、用什么形式 |
| 面试模板 | golang-core，重新开题 | 自动匹配面试模板；课的结构与原 interview-sprint 一致；最后一课是面试串讲 |
| 迁移 | customer-service-agent | 内容完整；能从上次的断点接着学 |
| 迁移 | billing-system | 总览页显示为已学完；课程页内容完整 |

前三门各自至少走完：开题；讲完第一课并做一次检验；换一个新会话续学并先回顾。

另外确认：新会话启动时，有待回顾内容会出现一行提醒，同一天不重复。

## 7. 留给实现者决定

- 页面的视觉设计，只要满足 5.7 的内容和行为。
- `diagram` 的布局常量和连线算法。
- `answer-grader` 的工具设置。文档没有「不带任何工具」的写法，可以只列一个最小工具，并在提示词里禁止读文件。
- SessionStart 的输出字段。文档没有写明 `systemMessage` 在 SessionStart 下是否显示给用户，实测后选定。
- 主对话调用 plugin 子代理时的确切名称。文档没有写明，预期是 `learn-anything:course-researcher`，实测后写进 SKILL.md。
- `courses_dir` 未配置时 `${user_config.courses_dir}` 的替换结果。实测后在 SKILL.md 里写兜底。
- marketplace 条目的 `source` 写法，以 `claude plugin validate` 通过为准。
- e2e 测试的浏览器驱动。参考做法是 playwright-core 加本机 Chrome。

## 8. 讨论中我（设计者）做出的决定

下面这些没有逐条问过用户，是我根据已确认的结论补上的。

1. **数据文件里用严格 JSON。** hook 在每个会话里运行，不应该执行课程数据。严格 JSON 也让模型更不容易写出半合法的文件。
2. **node 是硬依赖。** 只面向 Claude Code 之后，hook 和脚本都需要它，校验也从可选变成每次写入后必做。
3. **课程目录用 plugin 的官方配置项。** 不自造配置文件。
4. **plugin 本体放在 `plugins/learn-anything/` 下。** 这样测试、文档和示例不会进入 plugin，也符合文档里本地 marketplace 的写法。
5. **面板和卡片改用不带领域色彩的名字。** `architecture` 改为 `diagram`，`interview` 卡改为 `problem`，节点类型改为四种外观名，`demoCase` 改为通用的 `notice`。依据是「从零写，不带领域痕迹」。
6. **`researched` 用三个取值。** 「没法核对」要提示学习者，「模板决定不调研」不需要提示，两者要分得开。
7. **面试模板不做调研。** 原 interview-sprint 没有这一步，保持一致。学习者想要时可以明说。
8. **面试题同时算作检验。** 这样面试课也有「已掌握」和待回顾，不需要另出一道题。
9. **迁移来的课程 `mastered` 全部为 `false`。** 旧数据里没有掌握的证据，页面上如实显示为「已讲」。
10. **待回顾条目带课程 id。** 回顾答上来之后要知道把哪一课改记为「已掌握」。
11. **提醒只在新会话启动时触发，每天最多一次。** 恢复会话、清空和压缩上下文时不提醒。
12. **保留 `diagram` 的 SVG 和 PNG 导出。** 这是 interview-sprint 最近加的功能，迁移后不应该变少。

## 9. 后续迭代

- 最佳实践模板，包括 guokao 模板。并入 guokao 时，真题库、出处规则和脚本原样保留。
- 算法排期的复习和到期提醒。
- 支持 Codex 和 pi。
- 用 `claude plugin eval` 做行为测试。
