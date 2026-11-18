# 在 Codex 里运行

只在 Codex 里读本文（判断办法：SKILL.md「路径约定」里的 `${CLAUDE_SKILL_DIR}` 没有被换成实际路径）。Claude Code 不需要读。

本 skill 的流程、数据格式和讲课规则在 Codex 里完全不变。区别只在三处：路径和配置从哪来，弹窗提问和子代理用什么代替，以及沙箱。下面逐一说明。

## 1. 三个路径

- **skill 目录**：本文上一级的目录，也就是 Codex 技能列表里 `SKILL.md` 所在的目录（技能列表给的路径去掉末尾的 `/SKILL.md`）。
- **课程目录和国考题库**：运行 `node <skill 目录>/scripts/config.mjs`，读出这两项。它输出一行 JSON：`courses_dir`（课程目录）、`guokao_repo`（国考题库）、`file`（配置文件的位置）；没配置的项是 `null`。

拿到之后，SKILL.md、references 和模板里的 `${CLAUDE_SKILL_DIR}` 一律换成 skill 目录的实际路径，`${user_config.courses_dir}` 换成 `courses_dir`，`${user_config.guokao_repo}` 换成 `guokao_repo`，再运行命令。命令里不要留下 `${...}`，shell 会把它当成变量展开。

**课程目录没配置就停下。** `courses_dir` 是 `null` 时，告诉学习者用下面任一方式配置，然后结束本次调用，不在任何别的位置建课或找课：

- 在 learn-anything 仓库根目录运行 `bash install-codex.sh --courses-dir <绝对路径>`；
- 或者运行 `node <skill 目录>/scripts/config.mjs set --courses-dir <绝对路径>`。学习者在对话里给出一个绝对路径、请你替他配置时，你可以直接运行这条。

国考课的 `guokao_repo` 同理：是 `null` 时停下，配置方式是同样两条命令，参数换成 `--guokao-repo <绝对路径>`。

`config.mjs` 退出码 1 时，把 ✗ 后面的信息原样告诉学习者，然后停下，不要手改配置文件。

SKILL.md 和国考模板里写的 `/plugin configure` 和 `bash install.sh` 是 Claude Code 的配置方式，在 Codex 里改用上面两种。

## 2. 工具对照

| SKILL.md、references 和模板里写的 | 在 Codex 里怎么做 |
|---|---|
| 用 `AskUserQuestion` 弹窗问 | 在对话里给出编号选项，问题和选项都照原文，然后结束本轮，等学习者回复。不要用 `request_user_input_async` 代替，也不要替学习者选。学习者回复之前，不做依赖这个答案的事：确认大纲之前不建任何文件，重开、删除之前不改文件。 |
| 用 Agent 工具调用 `learn-anything:course-researcher` 或 `learn-anything:answer-grader` | 用 `spawn_agent` 开子代理，见第 3 节 |
| 用 Read 读文件的指定几行（比如国考模板里按 `offset`、`limit` 读单个条目） | 用 `sed -n '<起始行>,<结束行>p' <文件>`，范围和原文一样，只读到下一个条目之前 |
| frontmatter 里的 `allowed-tools` | Codex 不读它。运行脚本时可能需要学习者批准，见第 4 节 |

## 3. 子代理

本 skill 明确要求用子代理做两件事：开题调研（`course-researcher`）和主观题评分（`answer-grader`）。在 Codex 里这样调用：

1. 读 `<skill 目录>/../../agents/<名字>.md`，取 frontmatter（两条 `---` 之间的部分）之后的全部正文。
2. 用 `spawn_agent` 开一个子代理，`fork_turns` 设为 `"none"`，不让它继承当前对话。评分必须盲评：继承了对话，它就能看到讲课内容和你的倾向。不设 `model` 和 `reasoning_effort`，除非学习者要求。
3. 任务内容按这个顺序拼：第 1 步取到的正文原样放在最前面；接着一行工具约束；空一行；最后是 references 里规定的提示（调研是 kickoff.md 的六项任务书，评分是 lesson-guide.md 的三项），格式、顺序和标签都照原样。评分提示的「学习者的原话」必须保持在最后，所以工具约束只能放在它前面。
   - 调研子代理的工具约束：「只用网页搜索和读取网页查资料，不改任何文件。」
   - 评分子代理的工具约束：「不读任何文件，不运行命令，不联网。」
4. 用 `wait_agent` 等它交回，等待时间给长一些（调研可能要几分钟，可以设 10 分钟）。子代理的最终回答就是调研报告，或者评分的 JSON。

**子代理用不了时**（没有 `spawn_agent` 工具、调用报错、一直等不到结果），按 references 里写的「子代理用不了」处理：调研记 `researched: "no"`，凭你自己的知识出大纲，并告诉学习者大纲没有经过资料核对；评分改为当场判。子代理没有联网能力时，它交回的资料清单是「无」，同样记 `researched: "no"`。

## 4. 沙箱和审批

课程目录通常不在当前工作目录里。Codex 的沙箱可能拦下写入课程目录的操作，包括写 `course-data.js` 和运行建课脚本，或者每次都要求批准。遇到拦截时，按 Codex 的流程请学习者批准，不要改到别的目录去写。学习者想免去每次批准，可以把课程目录加进 Codex 的可写目录（写法见仓库 README 的 Codex 一节）。

打开课程页的 `open` 被拦下时，把课程页的绝对路径告诉学习者。

改 `course-data.js` 用你平常的编辑方式。SKILL.md「文件操作规则」照常适用：先读再改，严格 JSON，每次写完都运行校验。
