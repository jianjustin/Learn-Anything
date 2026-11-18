# guokao 模板：learn skill 接管国考备考

日期：2026-11-18

## 1. 意图

国考备考以后统一走 learn skill，guokao-sprint 暂停使用。learn 不光要能显示从 `.guokao_points/` 迁过来的 9 门课，还要能**接着讲**，讲法保持 guokao-sprint 那一套：第 1 课考情与题型地图，中间每类题型一课（概念 → 识别线索 → 解法 → 有出处的真题示范 → 原创变式 → 错了回到概念），最后一课讲做与跳的限时策略；真题按 hold / demo / drill 三种用途限制使用。

学习者还会继续往真题库里加题、改题（包括 guokao_sprint 仓库里正在进行、尚未提交的申论题库改造），所以**题库只留一份，留在 guokao_sprint 仓库原处，learn 直接读它**。

## 2. 目标

1. 新增 `templates/guokao/` 模板。考公请求命中它，已迁移的 9 门课续学时按它讲。
2. learn 的 skill 描述放开考公：去掉「不用于考公备考……归 guokao-sprint」，加入国考、考公、公务员、行测、申论以及九个模块名作触发词。
3. 新增 plugin 配置项 `guokao_repo`（guokao_sprint 仓库的根目录，绝对路径）。`install.sh` 能设置它；SKILL.md 把它暴露给模板。
4. 已迁移的 9 门课 `template` 改为 `"guokao"`；`migrate-guokao.mjs` 以后也写 `"guokao"`。
5. 讲课时真题覆盖、题型地图的变化（示范过一道题、追加了新题）能落到课程页上的两张表格卡里。
6. 停用 guokao-sprint：删掉 `~/.claude/skills/guokao-sprint` 和 `~/.claude-ccswitch/skills/guokao-sprint` 两个符号链接。仓库本身不动。

## 3. 非目标

- 不给 learn 课程页加题型地图、真题网格这类新面板，也不改数据格式。题型地图和真题覆盖继续用两张静态表格卡显示（学习者已同意）。
- 不复制题库。真题库 md、`.data.js`、题图、`outlines.data.js`、申论给定资料、时政要点、数量关系模型笔记都只在 guokao_sprint 仓库里。
- 不改 guokao_sprint 仓库里的任何文件（包括它未提交的改动），只读。追加题目时按流程改的是仓库里的题库文件，这是学习者要求的「题库只留一份」，不算违反。
- 不保留 guokao-sprint 和 learn 并行可用：停用后考公请求只归 learn。
- 不带 guokao-sprint 的「写入后通知」（`scripts/notify.sh` 和 `GUOKAO_WEBHOOK_URL`）。学习者已确认不要，停用后这个功能随之消失。

## 4. 反目标（技术上能跑，但这样就算失败）

- hold 题的题干、选项、答案、解法、题图出现在对话或课程文件里（学习者 11-14、11-21 要做 2025、2026 整卷）。
- 模板里出现旧格式的写法（`GUOKAO_COURSE`、`examgrid` / `typemap` 面板、`image` 卡、`.guokao_points/`、bootstrap），导致讲课时照旧格式写坏课程文件。
- 题库被复制了一份，两份开始各改各的。
- 路径写死在模板里，仓库一挪 learn 就找不到题库。

## 5. 约束

- **模板不能改数据格式**（SKILL.md「领域模板」），只能用已有字段和 `templateData`。
- **`${user_config.*}` 只在 SKILL.md 和 hooks 里被替换**，模板文件是用 Read 读的，不会替换。所以仓库路径要写在 SKILL.md 的路径约定里（和「课程目录」并列），模板里引用「SKILL.md 里的国考题库路径」。
- 课程页的 html 卡只放行 `data:image` 的 `<img src>`，相对路径会被清掉，所以题图只能内嵌。
- guokao_sprint 仓库的布局：根目录下 `guokao-sprint/references/` 是数据，`guokao-sprint/scripts/zhenti-data.mjs` 从题库 md 生成 `.data.js`。配置项指向仓库根目录。
- plugin 从缓存运行：改完仓库要 `bash install.sh --reinstall`，新会话生效。

## 6. 做法（已选）

考虑过两种：

| 做法 | 内容 | 取舍 |
|---|---|---|
| 一：教法也引用仓库原文 | 模板只写入口、真题规则、learn 格式下怎么记；`lesson-guide.md` 等直接读仓库原文 | 教法只有一份；但原文和 SKILL.md 有四十来处旧格式说法，要靠一份「以本文为准」的覆盖清单压住，讲课时两份对照，容易写错 |
| **二：教法改写进模板，只有数据读仓库** | guokao-sprint 的讲法、`lesson-guide`、`outline-patterns`、追加题目流程改写成 learn 格式放进 `templates/guokao/`；数据读仓库 | 模板自成一体，没有新旧格式冲突；教法多一份，但仓库里那几份停用后没人读，不会两份同时演进 |

**学习者选了做法二。** 另外两个被排除的：整库复制进 learn-anything（学习者否了，题库只留一份）；路径写死在模板里（见反目标）。

## 7. 已经定下的部分

### 7.1 读仓库里的哪些东西

模板只从 `<guokao_repo>/guokao-sprint/references/` 读这些，读法照 guokao-sprint 原来的时机表（开讲某模块前读真题库开头的分布表和 2027 推断，示范时按题号读单个条目，等等）：

- `zhenti/<slug>.md`、`zhenti/<slug>.data.js`、`zhenti/img/`：真题库
- `zhenti/shenlun-cailiao/`：申论给定资料
- `outlines.data.js`：九门课的默认大纲
- `shizheng/<年>.md`：时政要点
- `shuliang-models.md`：数量关系子模型、复合题规律（纯教学内容，但学习者把它当资料维护，算数据，留在仓库）

`lesson-guide.md`、`outline-patterns.md`、`import-questions.md`、`data-format.md` 和 SKILL.md 的讲法改写进模板，不再读仓库里的这几份。

### 7.2 配置项

- `plugin.json` 的 `userConfig` 加 `guokao_repo`：`type: "directory"`，`required: false`，标题「国考题库仓库」。
- `install.sh` 加 `--guokao-repo <绝对路径>`，校验规则同 `--courses-dir`。
- SKILL.md 路径约定加一行「国考题库：`${user_config.guokao_repo}`」。模板规定：套用 guokao 模板时这一行为空或仍是占位符，就停下告诉学习者怎么配置，不讲课、不凭记忆出真题。
- 本机配置为 `/Users/chenjianrui/workspaces/skills/guokao_sprint`。

### 7.3 模板的 frontmatter

- `name: guokao`
- `match`：国考、考公、公务员考试备考，行测（政治理论、常识判断、言语理解与表达、数量关系、判断推理、资料分析）、申论、证监会计算机与证券期货
- `research: skip`（大纲来自 `outlines.data.js`，真题来自题库，不联网调研；`researched` 记 `"skipped"`，`resources` 为空）

### 7.4 数据怎么记（在 learn 格式里）

- **系列**：所有国考课 `series: { "name": "国考", "order": N }`，`order` 按九门课顺序（政治、常识、言语、数量、判断、资料、申论、计算机、证券期货），与 `migrate-guokao.mjs` 一致。
- **`templateData`**：`{ from, subject, exam, growth }`，迁移时已写好。
- **题库是唯一来源，课程只记自己的状态**（builder 的决定，学习者可改）：题目有哪些、用途（hold/demo/drill）、存疑、题型、次题型、各年题数，一律以仓库的 `zhenti/<slug>.md` 和 `.data.js` 为准；讲课时判断一道题能不能示范、能不能讲，只看 md 条目，不看课程里的快照。课程自己的状态只有「哪些题在课上示范过」（examgrid 条目上的 `demo: true`）。`templateData.growth` 是题库在这门课上的副本加上 demo 标记，由脚本同步，不手改。
- **两张表格卡由脚本生成**：新增一个脚本（如 `scripts/guokao-tables.mjs <课程文件>`），先从仓库的 `.data.js` 重新取 `typemap.nodes[].count` 和 `examgrid` 的 `years`、`items`（保留课程里已有的 `demo: true`；题库里已经没有的题，它的 demo 标记一并丢掉并在输出里列出来），写回 `templateData.growth`，再按它重新生成考情课末尾那两张表格卡（生成规则就是 `migrate-guokao.mjs` 里 `typemapTable`、`examgridTable` 的规则，抽出来共用），最后校验。脚本另有一个参数用来给某道题加 demo 标记。示范完一道题、追加题目之后、续学开始时都跑它，不手改表格。`typemap.nodes[].lesson` 是课程自己的（调整大纲时会改），同步时不覆盖。
- **题图**：写成 html 卡，`<figure><img src="data:image/...;base64,..."><figcaption>描述</figcaption></figure>`，规则同迁移脚本。hold 题不放题图。手写 base64 不现实，所以要有脚本做这一步（可以并进上面的脚本，或单独一个，builder 定）。
- **练习记录**：照 learn 的 `practice` 写法（发题时不写 `answer`；作答后补 `yours`、`ok`、`answer`，没掌握写 `why`），guokao 多出来的信息按迁移时的约定放：出题依据接在 `q` 末尾「出题依据：仿 2024-63（……）」；错因写在 `why` 开头「错因：审题。……」；用时接在 `yours` 末尾「（用时 N 分钟）」；组练里跳过的题记 `skipped: true`，跳题依据写进 `why`。
- **掌握与待回顾**：照 learn 的规则（按每一条检验的结果改 `mastered`，没过关的写进 `review`），下面三处由模板覆盖（学习者已同意）：
  - **第 1 课考情**：不发题（覆盖「每课至少检验一次」），课末设 `done` 时同时设 `mastered: true`。
  - **策略课组练**：整次组练算**一次**检验。开练前请学习者自己定过关门槛（正确率和用时，如「15 题对 11 题、10 分钟内」），写进组练汇总条目的 `rubric`。报告后按门槛判汇总条目的 `ok`，`mastered` 跟着这一条走；各题条目照常记 `yours`、`ok`、`answer`，但不单独改 `mastered`。有错题时只加**一条**待回顾，列出错题题号和错因，不逐题加。
  - **申论小题**：要判 `ok`（覆盖 guokao-sprint 原来的「申论不写 ok」），由讲课的人对照给定资料和参考要点来判，不交给 answer-grader（评分子代理看不到给定资料）。`rubric` 写成要点清单，发题时就写好。

### 7.5 讲法

把 guokao-sprint SKILL.md 的第 1–7、9、10 节和 `lesson-guide.md`、`outline-patterns.md` 的教学内容搬进模板，改写成 learn 的流程和数据格式。要原样保留的规则：

- 真题用途表：hold 课上只能说题号和题型，学习者明确说做完那一年整卷并要复盘时才能讲；demo 才能示范和作变式蓝本；drill 留给策略课组练；时政模拟题不是真题，要说明。计算机、证券期货、申论全部 demo（存疑、待核除外），法规题按出题当年口径。
- 第 1 课不发题；中间每课七步；最后一课策略课的组练；错了回到概念，不连刷。
- 每课至少一次检验：变式题就是这一课的检验（和面试模板「面试题算检验」同理）。

### 7.6 开课和续学

- 9 门课都已经存在。学习者点名一个模块时，用 learn 的列课程命令找到它，按续学走；所有课都是 `todo` 时按「开题」走（展示大纲，确认后第一课 `current`）。
- 课程不存在时（被删了，或以后加了新模块）：要能按 `outlines.data.js` 和题库 `.data.js` 新建。做法是在内存里拼出 guokao-sprint bootstrap 的初始状态，再交给 `migrate-guokao.mjs` 的转换逻辑，写进课程目录。可以做成 `migrate-guokao.mjs` 的一个子命令或一个新脚本，builder 定。

### 7.7 追加题目

`import-questions.md` 的七步改写进模板：第 1–5 步（确认来源、提取题干、归类、独立解与核对、追加到仓库的 `zhenti/<slug>.md` 并用仓库的 `zhenti-data.mjs` 生成 `.data.js`）照旧，改的是仓库；第 6 步「并入课程」改成跑表格脚本，从仓库同步到课程；第 7 步校验用 learn 的校验命令。

### 7.8 已迁移的 9 门课

- `template` 从 `null` 改为 `"guokao"`。`migrate-guokao.mjs` 同步改为写 `"guokao"`。`approach` 里「本课由 guokao-sprint 的课程迁移而来」保留。
- **按原练习记录推出掌握**（学习者已同意）：`done` 的课里，最后一条有 `ok` 的练习条目答对，就记 `mastered: true`；没有判过对错的条目时保持 `false`。但考情课（id 为 `kaoqing`）`done` 就记 `true`，与 7.4 一致。这条规则写进 `migrate-guokao.mjs`。
- 现有 9 门课的做法：迁移之后还没有学习记录，可以把它们挪开后用新的迁移脚本重新迁一遍（做法同 2026-11-18 第二次迁移：先确认登记表只比迁移前多这 9 门，目录挪到别处而不是删除）；也可以写一次性的修补。builder 定，结果要和重新迁移一致。

### 7.9 停用 guokao-sprint

删两个符号链接：`~/.claude/skills/guokao-sprint`、`~/.claude-ccswitch/skills/guokao-sprint`。删之前确认它们是指向 guokao_sprint 仓库的链接。`.guokao_points/` 不动。

## 8. 留给 builder 的

- 模板拆成几个文件（参照 interview 模板的 `TEMPLATE.md` + `outline-patterns.md` + `lesson-guide.md`，追加题目可以单独一份）。
- 表格脚本、题图脚本、建课逻辑的具体形态和命令行参数；SKILL.md 的 `allowed-tools` 里要不要加它们。
- `claude plugin configure --values-stdin` 只传 `guokao_repo` 时会不会清掉 `courses_dir`：要实测，`install.sh` 需要时两项一起传。
- 测试：`template-lint` 增加 guokao 模板的检查（关键规则都在、没有旧格式残留）；`skill-lint` 的描述检查改成不再要求出现 `guokao-sprint`、要求出现考公触发词；表格脚本和建课逻辑的单元测试；`migrate-guokao` 测试改为期望 `"guokao"`。
- README 中英文：配置项、guokao 模板、去掉「考公请求不归 learn」和迁移一节里「仍由 guokao-sprint 继续讲」的说法。
- 收尾：`bash install.sh --reinstall --guokao-repo ...`，新会话里实测一次「继续数量关系」。
