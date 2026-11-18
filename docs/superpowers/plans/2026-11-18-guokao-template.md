# guokao 模板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** learn skill 接管国考备考：新增 `guokao` 模板和 `guokao.mjs` 脚本，题库只从 guokao_sprint 仓库读，已迁移的 9 门课改用模板，停用 guokao-sprint。

**Architecture:** 国考专用逻辑集中在 `scripts/lib/guokao.mjs`（表格卡生成、从题库同步、题图卡、初始大纲），`migrate-guokao.mjs` 和新的命令行 `scripts/guokao.mjs`（`sync` / `image` / `new` 三个子命令）共用它。仓库里的 `.data.js` 和 `outlines.data.js` 是 JavaScript（有注释），一律经已有的 `old-course-worker.mjs` 子进程读取。教法改写进 `templates/guokao/`。

**Tech Stack:** node 20+，无 npm 依赖；`node --test`；bash 3.2 兼容的 `install.sh`；playwright-core 页面检查。

**Spec:** `docs/superpowers/specs/2026-11-18-guokao-template-design.md`

## Global Constraints

- 模板不能改数据格式，只能用已有字段和 `templateData`；页面、`course.html` 校验规则不动。
- 题库只留一份：只读 `<guokao_repo>/guokao-sprint/references/`，不复制进 learn-anything，脚本不写仓库。
- 模板和 SKILL.md 里不能出现旧格式写法：`GUOKAO_COURSE`、`.guokao_points/`（停用说明除外）、`examgrid`/`typemap` 当作面板、`image` 卡、bootstrap。
- hold 题的题干、选项、答案、解法、题图不进对话和课程文件；`image` 子命令拒绝 hold 题。
- 系列名 `国考`，`order` 按 `xingce-zhengzhi, xingce-changshi, xingce-yanyu, xingce-shuliang, xingce-panduan, xingce-ziliao, shenlun-quanjuan, computer-zhuanye, finance-jichu`。
- 配置项名 `guokao_repo`，`type: "directory"`，`required: false`，标题「国考题库仓库」；本机值 `/Users/chenjianrui/workspaces/skills/guokao_sprint`。
- 不带 `notify.sh` / `GUOKAO_WEBHOOK_URL`。
- 写盘的脚本：先在内存里算好并校验，通过才写；写用 `writeDataFile`（临时文件 + 改名）。
- 与学习者沟通、文档、提交信息用简体中文。

## Review Focus

1. 题库里删掉了一道课上示范过的题：同步时它的 demo 标记丢掉，输出里点名，不报错退出。→ Task 2 测试 `sync：题库里没有的题，demo 标记丢掉并列出`
2. 题库新增了一个题型节点（追加题目第 3 步会改 `outlines.data.js`）：同步时从仓库大纲补进课程的题型地图；它对应的课在课程里不存在时报错，课程文件不动。→ Task 2 测试 `sync：题库的新节点按仓库大纲补进来，对应的课不存在时拒绝`
3. 对 hold 题调用 `image`：拒绝，退出 1，课程文件不动。→ Task 3 测试 `image：hold 题、没有题图的题拒绝`
4. `guokao_repo` 没配置、是相对路径、或指向的目录里没有 `guokao-sprint/references/`：三个子命令都退出 1，一句说明。→ Task 2 测试 `仓库路径不合法时退出 1`
5. 已经讲过课（有学习记录）的课程再跑 `sync`：除 `templateData.growth` 和两张表格卡外，`lessons`、`resume`、`review`、`mastered` 一字不变。→ Task 2 测试 `sync 只改 templateData.growth 和两张表格卡`

---

### Task 1: 迁移脚本改用 guokao 模板、推出掌握、表格卡加标记

**Files:**
- Create: `plugins/learn-anything/skills/learn/scripts/lib/guokao.mjs`
- Modify: `plugins/learn-anything/skills/learn/scripts/migrate-guokao.mjs`（`typemapTable`、`examgridTable`、`tableLessonIndex`、图片 html 拼装移到 lib；`convertCourse`、`convertLesson`）
- Test: `tests/unit/migrate-guokao.test.mjs`，`tests/unit/guokao-lib.test.mjs`（新建）

**Interfaces:**
- Produces（`lib/guokao.mjs`）：
  - `TABLE_MARK = { typemap: 'guokao-typemap', examgrid: 'guokao-examgrid' }`：两张表格卡带 `"generated": <标记>` 字段，用来找到它们。
  - `typemapTable(panel, lessons) -> card`、`examgridTable(panel, typemap) -> card`：规则不变，只多 `generated`。
  - `tableLessonIndex(lessons) -> number`
  - `placeTables(course) -> course`：返回新对象；按 `templateData.growth` 生成两张卡，课程里已有带同一标记的卡就原地替换，没有就追加到 `tableLessonIndex` 那一课末尾；没有 examgrid 时删掉旧的 examgrid 卡。
  - `imageHtml(src, alt, buffer) -> string`：现在 `convertImage` 里拼 `<figure>` 的那段。
  - `inferMastered(lesson) -> boolean`：`status !== 'done'` → false；`id === 'kaoqing'` → true；否则取所有 practice 卡条目里最后一条 `typeof ok === 'boolean'` 的 `ok`，没有则 false。
  - `SERIES_ORDER`、`SERIES_NAME` 从 migrate-guokao 移过来。

- [ ] **Step 1: 改测试**：`migrate-guokao.test.mjs` 里期望 `out.template === 'guokao'`；两张表格卡多 `generated: 'guokao-typemap'` / `'guokao-examgrid'`；新测试 `掌握按原练习记录推出`：样例里 `kaoqing`（done）为 true，`fangcheng`（current）为 false；另造一门 done 课，practice 最后一条判过的是 `ok: false`（后面还有一条没判的）→ false，最后一条判过的是 `ok: true` → true，没有判过的 → false。`guokao-lib.test.mjs`：`placeTables` 原地替换（卡片位置不变、数量不变）、没有时追加、没有 examgrid 时删掉旧卡。
- [ ] **Step 2: 跑测试，确认失败**：`node --test tests/unit/migrate-guokao.test.mjs tests/unit/guokao-lib.test.mjs`，期望 template、generated、mastered 几条 FAIL，lib 文件不存在。
- [ ] **Step 3: 实现**：建 `lib/guokao.mjs` 放上面的导出；`migrate-guokao.mjs` 改为 `template: 'guokao'`、`mastered: inferMastered(l)`（在卡片转换之后算），表格卡用 `placeTables`；文件头注释的转换规则同步改。`expectedShape` 不变。
- [ ] **Step 4: 跑测试，确认通过**：`node --test tests/unit`，全部 PASS。
- [ ] **Step 5: 提交**：`git add` 上述文件，`git commit -m "feat(guokao): 迁移脚本改用 guokao 模板，按练习记录推出掌握，表格卡加标记"`。（本仓库上一轮未提交的迁移脚本、README 改动一并在这次提交，提交信息里说明。）

### Task 2: `guokao.mjs sync`：从题库同步真题覆盖和题型地图

**Files:**
- Modify: `plugins/learn-anything/skills/learn/scripts/lib/guokao.mjs`
- Create: `plugins/learn-anything/skills/learn/scripts/guokao.mjs`
- Create: `tests/fixtures/guokao-repo/guokao-sprint/references/outlines.data.js`、`.../zhenti/xingce-shuliang.data.js`、`.../zhenti/img/2024-70.png`（与 `tests/fixtures/old-guokao` 对应：同样的三个节点和 examgrid，另加一道 hold 题和一个新节点 `jingji`，`lesson: "celve"`）
- Test: `tests/unit/guokao-cli.test.mjs`

**Interfaces:**
- Consumes：Task 1 的 `placeTables`、`TABLE_MARK`；`lib/migrate-common.mjs` 的 `loadOldCourse(file, globalName)`、`MigrateError`；`lib/data-file.mjs`；`lib/core-loader.mjs`。
- Produces（`lib/guokao.mjs`）：
  - `repoProblem(repo) -> string | null`：空、含 `${`、非绝对路径、`<repo>/guokao-sprint/references/outlines.data.js` 不存在，各返回一句说明。
  - `loadRepo(repo) -> { refs, outline(slug) -> object|null, zhenti(slug) -> object|null, readImage(rel) -> Buffer }`：`outlines.data.js` 读 `GUOKAO_OUTLINES`，`zhenti/<slug>.data.js` 读 `GUOKAO_ZHENTI`（都经 worker）；`readImage(rel)` 相对 `refs/zhenti`，`isSafeDir` 且解析符号链接后仍在 `refs` 里。
  - `questionKey(item) -> "<year>-<no>"`
  - `syncGrowth(course, zhenti, outline) -> { growth, dropped: string[], added: string[] }`：typemap 节点的 `count` 取题库；题库有、课程没有的节点从 `outline.typemap.nodes` 补（带 `lesson`），lesson 不在课程里就抛 `MigrateError`；`lesson` 以课程为准不覆盖。examgrid 的 `years`、`items` 换成题库的，按 `questionKey` 保留课程里已有的 `demo: true`；题库里没有的、带 demo 的题进 `dropped`。`zhenti` 为 null 时只保留 typemap。
- Produces（CLI）：`node guokao.mjs sync <guokao_repo> <课程文件> [--demo <行标签-题号>]...`。课程的 `template` 不是 `guokao` 时退出 1。`--demo` 给对应条目加 `demo: true`，条目不存在或是 hold 题时退出 1。成功：写回、校验，stdout 一行 `nodes=<n> items=<m> demo=<k>`，`dropped`、`added` 各一行 △ 到 stderr。退出码 0 / 1 / 2（参数不对）。

- [ ] **Step 1: 写失败测试**（`guokao-cli.test.mjs`，课程文件用 `migrate-guokao` 把 `tests/fixtures/old-guokao` 迁进临时目录得到）：
  - `sync：表格卡和 templateData.growth 跟题库一致`：新节点 `jingji` 出现在题型地图表；hold 题出现在真题覆盖表并带 `▣`。
  - `sync：--demo 加标记，hold 题和不存在的题拒绝`：`--demo 2024-70` 后表格里是 `70★`；`--demo 2025地市-68`（hold）、`--demo 2099-1` 退出 1，文件 hash 不变。
  - `sync：题库里没有的题，demo 标记丢掉并列出`：题库副本删掉 `2024-63` 后同步，stderr 含 `2024-63`，退出 0。
  - `sync：题库的新节点按仓库大纲补进来，对应的课不存在时拒绝`
  - `sync 只改 templateData.growth 和两张表格卡`：先往课程里写一条 review 和一个 `mastered: true`，同步后除这两处外 deepEqual。
  - `仓库路径不合法时退出 1`：空串、相对路径、没有 references 的目录。
  - `template 不是 guokao 时退出 1`；`缺参数退出 2`。
- [ ] **Step 2: 跑测试，确认失败**：`node --test tests/unit/guokao-cli.test.mjs`，期望全部 FAIL（脚本不存在）。
- [ ] **Step 3: 实现** `lib/guokao.mjs` 的上述导出和 `scripts/guokao.mjs` 的 `sync`；命令行入口照 `migrate-interview.mjs` 的写法（只有直接运行才执行、`MigrateError` 打 ✗ 行）。
- [ ] **Step 4: 跑测试，确认通过**：`node --test tests/unit`，全部 PASS。
- [ ] **Step 5: 提交**：`git commit -m "feat(guokao): guokao.mjs sync 从题库同步真题覆盖和题型地图"`

### Task 3: `guokao.mjs image`：把题库里的题图插进课程

**Files:**
- Modify: `plugins/learn-anything/skills/learn/scripts/guokao.mjs`
- Test: `tests/unit/guokao-cli.test.mjs`

**Interfaces:**
- Consumes：Task 1 `imageHtml`；Task 2 `loadRepo`、`questionKey`。
- Produces（CLI）：`node guokao.mjs image <guokao_repo> <课程文件> <课程 id> <行标签-题号> [--alt <描述>]`。在题库 examgrid 里找这道题；hold 题、没有 `img` 的题、课程 id 不存在时退出 1。生成 html 卡 `{ type: 'html', title: '<行标签>-<题号> 题图', html: imageHtml(...) }`，插在那一课最后一张 `steps` 卡之后，没有 `steps` 卡就追加到末尾；校验后写回，stdout 一行 `inserted <课程 id> <行标签-题号>`。

- [ ] **Step 1: 写失败测试**：`image：插在最后一张 steps 卡之后，图片内嵌`（html 含 `data:image/png;base64,` 和 `--alt` 的转义文本）；`image：没有 steps 卡时追加到末尾`；`image：hold 题、没有题图的题拒绝`（退出 1，文件 hash 不变）；`image：课程 id 不存在时退出 1`。
- [ ] **Step 2: 跑测试，确认失败**：`node --test tests/unit/guokao-cli.test.mjs`，新加的 4 条 FAIL。
- [ ] **Step 3: 实现** `image` 子命令。
- [ ] **Step 4: 跑测试，确认通过**：`node --test tests/unit`，全部 PASS。
- [ ] **Step 5: 提交**：`git commit -m "feat(guokao): guokao.mjs image 插入题库题图"`

### Task 4: `guokao.mjs new`：按默认大纲建一门国考课

**Files:**
- Modify: `plugins/learn-anything/skills/learn/scripts/lib/guokao.mjs`、`plugins/learn-anything/skills/learn/scripts/guokao.mjs`
- Test: `tests/unit/guokao-cli.test.mjs`

**Interfaces:**
- Consumes：Task 2 `loadRepo`、`repoProblem`；`migrate-guokao.mjs` 的 `convertCourse(old, readImage)`；`lib/migrate-common.mjs` 的 `writeMigrated(out, oldDir, coursesDir)`、`requireValid`；`lib/course-index.mjs` 的 `coursesDirProblem`。
- Produces：
  - `buildInitial(slug, outline, zhenti, updatedAt) -> object`：旧格式的初始课程，字段与 guokao-sprint `bootstrap.mjs` 的 `buildCourse` 相同（全部 `todo`、`cards: []`、`resume: { lesson: <第一课>, note: '尚未开始' }`、`review: []`、typemap 节点的 `count` 优先取题库、有题库再加 examgrid）。
  - CLI：`node guokao.mjs new <guokao_repo> <courses_dir> <slug>`。slug 不在大纲里、课程目录已存在时退出 1；`buildInitial` → `convertCourse` → 校验 → `writeMigrated(out, refs, coursesDir)`；stdout 只有课程页绝对路径（与 `new-course.mjs` 一致）。

- [ ] **Step 1: 写失败测试**：`new：按大纲建课，全部 todo，带系列和两张表格卡，已登记`（`series.order === 4`、`template === 'guokao'`、考情课两张卡、`index-data.js` 有这一门）；`new：大纲里没有的 slug、已存在的课程退出 1`。
- [ ] **Step 2: 跑测试，确认失败**
- [ ] **Step 3: 实现** `buildInitial` 和 `new` 子命令。
- [ ] **Step 4: 跑测试，确认通过**：`node --test tests/unit`，全部 PASS。
- [ ] **Step 5: 提交**：`git commit -m "feat(guokao): guokao.mjs new 按默认大纲建课"`

### Task 5: 配置项 `guokao_repo` 和 `install.sh --guokao-repo`

**Files:**
- Modify: `plugins/learn-anything/.claude-plugin/plugin.json`、`install.sh`、`tests/install.test.sh`、`tests/unit/manifest.test.mjs`

**Interfaces:**
- Produces：`userConfig.guokao_repo`（见 Global Constraints）。`install.sh --guokao-repo <绝对路径>` / `--guokao-repo=<路径>`：校验同 `--courses-dir`（空值、相对路径、控制字符退出 2，与 `--uninstall` 同用退出 2，去掉末尾斜杠）；给了它或 `--courses-dir` 时执行 configure，JSON 里放给了的那几项。

- [ ] **Step 1: 实测 configure 的语义**：在一个临时配置目录里（`CLAUDE_CONFIG_DIR=$(mktemp -d)`）装上 plugin，先 configure `{"courses_dir":"/tmp/a"}`，再 configure `{"guokao_repo":"/tmp/b"}`，看第二次之后 `courses_dir` 还在不在（读该目录的 `settings.json`）。把结论写进 `install.sh` 头注释。不在的话，`install.sh` 只给一项时打印提示「另一项会被清掉，请两项一起给」。
- [ ] **Step 2: 写失败测试**：`manifest.test.mjs` 断言 `guokao_repo` 的四个字段；`install.test.sh` 加：dry-run 给两项时 configure 的 JSON 解析回两个键；只给 `--guokao-repo` 时也有 configure；`--guokao-repo` 空值、相对路径、与 `--uninstall` 同用退出 2；特殊字符路径能解析回原值。
- [ ] **Step 3: 跑测试，确认失败**：`node --test tests/unit/manifest.test.mjs && bash tests/install.test.sh`
- [ ] **Step 4: 实现**：`plugin.json`、`install.sh`（参数解析、用法行、头注释、configure 条件、Step 1 的提示）。
- [ ] **Step 5: 跑测试，确认通过**：同 Step 3，全部通过。
- [ ] **Step 6: 提交**：`git commit -m "feat(guokao): 配置项 guokao_repo，install.sh 增加 --guokao-repo"`

### Task 6: guokao 模板

**Files:**
- Create: `plugins/learn-anything/skills/learn/templates/guokao/TEMPLATE.md`、`outline-patterns.md`、`lesson-guide.md`、`import-questions.md`
- Modify: `tests/unit/template-lint.test.mjs`（参数化成对每个模板跑通用检查，加 guokao 专项）

**内容来源**（guokao_sprint 仓库，只读）：`guokao-sprint/SKILL.md` 第 0–7、9、10 节和「常见错误」，`references/lesson-guide.md`、`outline-patterns.md`、`import-questions.md`。改写规则：

- frontmatter：`name: guokao`；`match: 国考、考公、公务员考试备考：行测（政治理论、常识判断、言语理解与表达、数量关系、判断推理、资料分析）、申论、证监会计算机与证券期货`；`research: skip`。
- `TEMPLATE.md` 开头写：题库路径取 SKILL.md 路径约定里的「国考题库」；为空或仍是含 `user_config` 的占位符时停下，告诉学习者用 `bash install.sh --guokao-repo <绝对路径>` 或 `/plugin configure learn-anything@learn-anything-local` 配置，不讲课、不凭记忆出真题。下文 `<题库>` 指 `<国考题库>/guokao-sprint/references`。
- 读题库的时机表照原 SKILL.md「什么时候读 references」，路径换成 `<题库>/...`；`shuliang-models.md`、`shizheng/`、`zhenti/shenlun-cailiao/` 同样读题库。
- 入口：九门课都已在课程目录里，用 learn 的列课程命令找；没有就 `node ${CLAUDE_SKILL_DIR}/scripts/guokao.mjs new "<国考题库>" "<课程目录>" <slug>`（模板里写成相对 skill 目录的 `scripts/guokao.mjs`，与 SKILL.md 的写法一致）。slug 对照表照 `outline-patterns.md`。
- 真题用途规则原样搬（hold / demo / drill 表、追加来源、时政模拟题、计算机与证券期货与申论全部 demo），并写明：判断一道题能不能用，只看题库 md 条目。
- 每课七步、第 1 课不发题、策略课、错因回链、分段话术照原文，数据写法换成 learn 的：示范完一道题跑 `guokao.mjs sync ... --demo <行标签-题号>`；带图题跑 `guokao.mjs image`；续学开始时跑一次 `guokao.mjs sync`；练习记录的四条约定（出题依据、错因、用时、跳过）、7.4 节的三处掌握规则（考情课、策略课组练、申论判 `ok` 且不交给 answer-grader）写成「覆盖」条目。
- 一句明确的话：「课中出的每一道原创变式都是一次检验，记进本课的 `practice` 卡，参与「已掌握」和待回顾。」
- `import-questions.md`：第 1–5 步照原文（改的是 `<题库>`，生成用 `node <国考题库>/guokao-sprint/scripts/zhenti-data.mjs <slug>`，在 guokao_sprint 仓库里提交）；第 6 步换成 `guokao.mjs sync`；第 7 步换成 learn 的校验命令；课程不存在时用 `guokao.mjs new`。
- 删掉：`notify.sh` 规则、`.guokao_points/` 工作区、bootstrap、`GUOKAO_COURSE` 格式说明、`image` / `examgrid` / `typemap` 的写法。

- [ ] **Step 1: 写失败测试**（`template-lint.test.mjs`）：`guokao frontmatter`（name、research、match 含「国考」「申论」）；`guokao 关键规则都在`（`hold`、`demo`、`drill`、`guokao.mjs sync`、`guokao.mjs image`、`guokao.mjs new`、`--demo`、`answer-grader`、`考情`、`做与跳`、`出题依据`、`错因`、`用时`、`skipped`、`国考题库`、上面那句检验的原话）；`guokao 没有旧格式残留`（不匹配 `/GUOKAO_COURSE/`、`/\.guokao_points/`、`/bootstrap/`、`/notify\.sh/`、`/"type": "image"/`、`/type: "image"/`、`/kind: "examgrid"/`、`/kind: "typemap"/`、`/validate\.mjs \.guokao/`）；`guokao 引用的模板内文件都存在`。
- [ ] **Step 2: 跑测试，确认失败**：`node --test tests/unit/template-lint.test.mjs`
- [ ] **Step 3: 写四个模板文件**。
- [ ] **Step 4: 跑测试，确认通过**：`node --test tests/unit`，全部 PASS。
- [ ] **Step 5: 提交**：`git commit -m "feat(guokao): guokao 模板"`

### Task 7: SKILL.md 放开考公，README 更新

**Files:**
- Modify: `plugins/learn-anything/skills/learn/SKILL.md`、`tests/unit/skill-lint.test.mjs`、`README.md`、`README.zh-CN.md`

**Interfaces:**
- Consumes：Task 5 的 `${user_config.guokao_repo}`；Task 2–4 的命令行。

- [ ] **Step 1: 改测试**：`skill-lint` 的触发词改为 `['继续学习', '系统学习', '面试', 'mock interview', '国考', '考公', '行测', '申论']`，并断言描述不含 `guokao-sprint` 和「不用于考公」；正文含 `${user_config.guokao_repo}`；`allowed-tools` 含 `Bash(node ${CLAUDE_SKILL_DIR}/scripts/guokao.mjs *)`。
- [ ] **Step 2: 跑测试，确认失败**：`node --test tests/unit/skill-lint.test.mjs`
- [ ] **Step 3: 改 SKILL.md**：描述去掉最后一句，加「也用于国考备考：国考、考公、公务员、行测、申论、数量关系、资料分析、判断推理、言语理解、常识判断、政治理论、证监会计算机、证券期货」（总长 ≤ 1536）；路径约定在「课程目录」后加「国考题库：`${user_config.guokao_repo}`。只有 guokao 模板用它，见该模板」；`allowed-tools` 加上面那条；SKILL.md 正文其余提到「考公不归本 skill」的地方删掉。
- [ ] **Step 4: 改 README 两份**：安装一节加 `--guokao-repo`；模板一节加 guokao 模板（题库留在 guokao_sprint 仓库、三个子命令）；开课一节删「考公请求不归它」；迁移国考课一节最后一段改为「迁移来的课套用 guokao 模板，由 learn 接着讲」，并写掌握按原练习记录推出。
- [ ] **Step 5: 跑全部测试**：`bash tests/run-all.sh`，最后一行「全部通过」。
- [ ] **Step 6: 提交**：`git commit -m "feat(guokao): learn 接管考公请求，README 写明 guokao 模板和配置项"`

### Task 8: 落到本机：重迁 9 门课、重装、停用 guokao-sprint、实测

不写代码，每步看结果。

- [ ] **Step 1: 重迁 9 门课**（用 bash，不用 zsh）：确认 `/Users/chenjianrui/projects/index-data.js` 去掉这 9 门后与 `<scratchpad>/index-data.before.js` 一致；9 个目录挪到 `<scratchpad>/second-run/`；还原 `index-data.js`；逐门运行 `node plugins/learn-anything/skills/learn/scripts/migrate-guokao.mjs /Users/chenjianrui/workspaces/skills/guokao_sprint/.guokao_points/<slug> /Users/chenjianrui/projects`，9 条都退出 0。期望：`template` 都是 `guokao`；数量关系、判断推理、资料分析、证券期货已讲的课里出现 `mastered: true`；源目录哈希不变。
- [ ] **Step 2: 每门课跑一次 sync**：`node plugins/learn-anything/skills/learn/scripts/guokao.mjs sync /Users/chenjianrui/workspaces/skills/guokao_sprint /Users/chenjianrui/projects/<slug>/course-data.js`，9 条退出 0；记下 △ 行（题库未提交的改动可能带来差异，原样报告给学习者）。
- [ ] **Step 3: 页面检查**：用 `<scratchpad>/check.mjs` 打开总览页和 9 门课：无报错、无外部请求、题图都显示、卡片数一致；总览页「国考」分区的已掌握数大于 0。
- [ ] **Step 4: 重装 plugin**：`bash install.sh --reinstall --courses-dir /Users/chenjianrui/projects --guokao-repo /Users/chenjianrui/workspaces/skills/guokao_sprint`，退出 0；`grep -A4 learn-anything ~/.claude/settings.json` 里两项配置都在。
- [ ] **Step 5: 停用 guokao-sprint**：`readlink ~/.claude/skills/guokao-sprint ~/.claude-ccswitch/skills/guokao-sprint` 都指向 `/Users/chenjianrui/workspaces/skills/guokao_sprint/guokao-sprint`，然后 `rm` 这两个链接（只删链接）；`ls` 确认不在。
- [ ] **Step 6: 交给学习者实测**：请学习者开一个新会话说「继续数量关系」，期望 learn 套用 guokao 模板、从断点（策略课的限时组练）接着讲。结果记进本计划这一步下面。
