# learn-anything

[English](README.md) | 简体中文

learn-anything 是一个 Claude Code plugin，用来系统地学一个主题。你说想学什么，它先问清楚你为什么学、已有什么基础，联网调研后给出一份有出处的大纲，然后分段讲授、逐课检验。课程内容和进度都落在一个本地的离线课程页里，换个会话也能从断点接着学。

这一版只支持 Claude Code，需要 **node 20 或更高版本**（plugin 的脚本和提醒 hook 都用 node 运行）。

## 它做什么

- **任意主题都能开课。** 开题时问两件事：为什么学、已有哪些基础；调研后给出带资料清单的大纲，每课标出对应的书和章节，确认后才建课。
- **分段讲，逐课检验。** 每段只讲一个点，段末停下等你；每课至少出一道题，作答后评分。主观题交给独立的评分子代理盲评。
- **「讲过」和「掌握」分开记。** 一课讲完记为已讲，只有检验里表现出掌握才记为已掌握；没掌握的缺口进待回顾清单，下次续学先回顾。
- **没核对的内容如实标出。** 大纲没经资料核对时，页面顶部会提示；每张卡片标出来源资料，没有来源的标「未核对」。
- **离线课程页。** 每门课一个单文件 HTML，零外部请求，直接用浏览器打开（`file://` 即可）。边讲边更新，页面每 2.5 秒重新加载数据。有逐课演进的东西时，用「生长面板」（方框加箭头的图、代码逐版演进、时间线）一课一课长出来。
- **总览页。** 课程目录下的 `index.html` 列出全部课程：已讲几课、已掌握几课、待回顾几条、断点在哪里。
- **回顾提醒。** 新会话启动时，如果有待回顾的内容，会出现一行提醒，同一天不重复。
- **领域模板。** 在通用流程上叠加某个领域的专门做法。目前自带面试模板。

## 安装

先把仓库克隆到本地，在仓库根目录运行：

```bash
bash install.sh --courses-dir <课程目录>
```

`<课程目录>` 是存放全部课程的目录，必须是绝对路径，建议先建好。脚本会对每个 Claude Code 配置目录依次执行：

1. `claude plugin marketplace add <仓库根>`：把仓库根作为本地 marketplace（名字 `learn-anything-local`）添加进去；
2. `claude plugin install learn-anything@learn-anything-local --scope user`；
3. 给了 `--courses-dir` 时，`claude plugin configure learn-anything@learn-anything-local --values-stdin`，把课程目录配置进去。

plugin 直接从仓库源目录加载，之后仓库里的改动在下次会话生效。安装完成后开一个新会话。

**重复运行是安全的。** 每个目录先用只读命令 `claude plugin marketplace list --json` 和 `claude plugin list --json` 看现状：marketplace 已经添加就不再添加，plugin 已经安装（user 范围）就不再安装；给了 `--courses-dir` 时 `configure` 总会执行。所以改课程目录只要重新运行 `bash install.sh --courses-dir <新目录>`。读不出现状（命令失败或输出看不懂）时不猜，照常添加和安装。

处理哪些配置目录：

- 不给 `--config-dir` 时：Claude Code 的默认目录（`~/.claude`）；`~/.claude-ccswitch`（存在时）；环境变量 `CLAUDE_CONFIG_DIR` 指向的目录（已设置且不同于前两者时）。
- 给了 `--config-dir <目录>`（可重复）时，只处理给出的目录。
- 默认目录的命令不加前缀，其他目录的命令加 `CLAUDE_CONFIG_DIR=<目录>` 前缀。

其他选项：

- `--dry-run`：只打印要执行的命令（每条一行，以 `+ ` 开头），不执行。想先看看会做什么时用它。上面两条只读的 list 命令也会打印出来；`add` 和 `install` 行末标注「已添加（已安装）则跳过」，表示真正运行时现状已经满足就不会执行。
- `--uninstall`：对每个配置目录卸载 plugin 并移除 marketplace，已经不在的那一步跳过。不会动课程目录里的任何文件。
- 参数不认识、`--courses-dir` 的值为空或不是绝对路径时，脚本以退出码 2 退出；找不到 `claude`、node 低于 20、`HOME` 没有设置、或者某条命令失败时，以退出码 1 退出。某个配置目录失败不会拦住后面的目录，失败的目录会在输出里点名。

## 课程存在哪

所有课程存在同一个全局目录里，由 plugin 的配置项 `courses_dir` 指定。skill 不在当前工作目录里找课程。

```text
<课程目录>/
├── index.html          # 总览页
├── index-data.js       # 课程登记表
└── <课程名>/            # 每门课一个目录
    ├── course.html     # 课程页
    └── course-data.js  # 这门课的全部内容和进度，唯一的进度来源
```

设置或修改这个目录有两种办法：重新运行 `bash install.sh --courses-dir <新目录>`，或者在 Claude Code 里运行 `/plugin configure learn-anything@learn-anything-local`。没配置时，skill 会停下并告诉你怎么配置，不会在别的位置建课。

`course-data.js` 的内容是 `window.LEARN_COURSE = <严格 JSON>;`。脚本和提醒 hook 只用 `JSON.parse` 读它，不执行它。

## 开课和续学

在 Claude Code 里直接说：

```text
我想学宏观经济学
```

或者用命令 `/learn-anything:learn` 加上主题。skill 也会按描述自动触发：学习任意主题、系统学习、继续学习、面试准备类请求都归它。带考公关键词（国考、行测、申论等）的请求不归它。

开课的过程：先问你为什么学、想学到什么程度、已有什么基础；调研后在对话里给出大纲，包括资料清单、逐课的延伸阅读、没能核实的资料和拟定的课程名；你确认后才建课并打开课程页，然后开始第一课。

**续学**：说「继续学习」或「继续上次的 xx」。不带主题时会列出全部课程，让你选；选定后先用两三句话回顾学到哪，有待回顾的条目先回顾，再从断点接着讲。续学只依据课程数据文件，不依赖会话历史。

学习中可以随时调整大纲：增删课程、调整顺序、跳过可选课。

## 课程页上有什么

- 页头：主题、为什么学、学到什么程度、已有基础、上法；进度（已讲几课、已掌握几课、待回顾几条）和断点。
- 左侧大纲：每课的状态（正在讲、已讲、已掌握、可选、已跳过）和延伸阅读；待回顾清单；资料清单。
- 每课的卡片：要点、步骤、表格、对比、问答、思考题、练习记录等。练习记录显示每道题答对、没掌握、已跳过还是待作答。
- 生长面板：图、代码、时间线随课程逐课演进，本课新增的元素会高亮。图可以导出 SVG 和 PNG。
- 数据有错时页面显示红框，保留上一次成功的内容，修好后自动恢复。

## 面试模板

自带一个 `interview` 模板，用于面试准备类请求：系统设计、知识点（八股）、项目经历复盘、模拟面试。开题时 skill 读各模板的说明，请求命中就在大纲开头说明「本课套用面试模板」，你可以说不用。

套用后：默认不做联网调研（你明确想要时照常调研）；大纲突出面试官会深挖的部分；课中穿插面试题，面试题同时算作本课的检验；最后一课把全课串成一条讲得出来的路线。模板的规则与通用规则冲突时，以模板为准。

## 写一个新模板

模板放在 plugin 的 `skills/learn/templates/<名字>/` 下，入口是 `TEMPLATE.md`，开头写三项 frontmatter：

```markdown
---
name: <模板名>        # 写进课程数据的 template 字段
match: <一句话>       # 什么样的请求套用这个模板
research: run         # run：照常调研；skip：不调研
---

# 模板正文：大纲骨架、讲课规则、卡片与面板的约定、结课形式
```

开题时 skill 读每个 `templates/*/TEMPLATE.md` 的 frontmatter，拿 `match` 对照你的请求。命中后先读模板正文再写大纲和讲课；续学一门套用了模板的课时也一样。模板可以带自己的辅助文件（`interview` 模板有 `outline-patterns.md` 和 `lesson-guide.md`），在正文里说明什么时候读。模板不能改变数据格式，只能使用已有字段和 `templateData`。

## 示例

`examples/` 下有两门可以直接用浏览器打开的示例课程，和一个总览页：

- `examples/index.html`：总览页。
- `examples/macro-intro/course.html`：「宏观经济学入门」，通用流程，手写。里面的教材、作者和网址都是虚构的，只用来演示课程页的样子，页面顶部有说明。
- `examples/realtime-billing/course.html`：「设计一个实时计费系统」，套用面试模板，由旧的面试课转换而来，有架构图。

## 迁移旧的面试课程

从之前的 interview-sprint 迁移课程：

```bash
node plugins/learn-anything/skills/learn/scripts/migrate-interview.mjs <旧课程目录> <课程目录>
```

脚本只读旧目录，把新课程写到 `<课程目录>/<课程名>/` 并登记；转换后校验，并核对课数、每课卡片数、各面板元素数与源文件一致。旧课程没有记录过掌握的证据，所以迁移来的课程全部显示为「已讲」。

## 开发与测试

仓库根是本地 marketplace，plugin 本体在 `plugins/learn-anything/`；plugin 目录里没有 `package.json`，也没有 npm 依赖。

```text
plugins/learn-anything/   # plugin：skill、子代理、hook、脚本、页面模板、领域模板
tests/                    # 单元测试、页面测试、样例数据、辅助代码
examples/                 # 示例课程
install.sh                # 安装脚本
```

运行全部测试：

```bash
bash tests/run-all.sh
```

它依次做：把两份页面模板同步到 `examples/`；单元测试（`node --test tests/unit`）；页面测试（`node --test tests/e2e`）；`bash tests/install.test.sh`；`claude plugin validate plugins/learn-anything --strict`。每一步都会跑，任何一步失败，最后退出码为 1。

页面测试需要 `playwright-core` 和本机的 Chrome（或 Chromium）。`playwright-core` 在本地、`PLAYWRIGHT_CORE_PATH` 指向的位置或 npm 全局目录里找得到即可。页面测试被跳过（比如浏览器启动不了）算失败。`install.sh` 的测试全部使用 `--dry-run`，不会改动任何真实的 Claude Code 配置。

单独校验一门课的数据：

```bash
node plugins/learn-anything/skills/learn/scripts/validate.mjs <课程目录>/<课程名>/course-data.js
```
