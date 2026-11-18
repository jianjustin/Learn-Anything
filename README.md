# learn-anything

English | [简体中文](README.zh-CN.md)

learn-anything is a Claude Code plugin for learning a topic systematically. You say what you want to learn. It asks why you are learning it and what you already know, researches the topic on the web, and proposes a course outline with sources. Then it teaches the course in short segments and checks what you learned after each lesson. Content and progress are kept in a local, offline course page, so you can pick up where you left off in a later session.

This version targets **Claude Code only**, and requires **node 20 or later** (the plugin's scripts and its reminder hook run on node).

## What it does

- **Any topic can become a course.** Before the course starts it asks two questions: why you are learning this, and what you already know. After researching, it gives an outline with a source list and the matching book and chapter for each lesson. Nothing is created until you confirm.
- **Short segments, a check after every lesson.** Each segment covers one point and stops for you. Every lesson has at least one question, graded after you answer. Open-ended answers are graded blind by a separate grader subagent.
- **"Taught" and "mastered" are recorded separately.** A lesson that has been taught is marked taught. It is marked mastered only when the check shows you got it. Gaps go on a review list, and the next session starts by reviewing them.
- **Unverified content is marked.** If the outline was not checked against sources, the page says so at the top. Every card shows the sources it came from, and a card with no source is marked "unverified".
- **An offline course page.** Each course is one self-contained HTML file with no external requests; open it in a browser straight from disk (`file://` works). It updates while you learn: the page reloads its data every 2.5 seconds. When a course has something that evolves lesson by lesson, a "growth panel" (a boxes-and-arrows diagram, code that changes version by version, or a timeline) grows lesson by lesson.
- **An overview page.** `index.html` in the courses directory lists every course: how many lessons are taught, how many mastered, how many review items are pending, and where you stopped.
- **A review reminder.** When a new session starts and there is something to review, one line of reminder appears, at most once per day.
- **Domain templates.** A template adds a domain's own way of teaching on top of the general flow. An interview template and a civil-service-exam template are included.

## Install

Clone the repository, then run this from its root:

```bash
bash install.sh --courses-dir <courses directory>
```

`<courses directory>` is where all your courses are stored. It must be an absolute path, and it is best to create it first. To study for the Chinese civil-service exam (国考), add `--guokao-repo <exam bank repository>` (the root of the guokao_sprint repository, also an absolute path; leave it out if you do not need it):

```bash
bash install.sh --courses-dir <courses directory> --guokao-repo <exam bank repository>
```

Either option can be given alone: `configure` merges by key, so an option you leave out is not cleared. For each Claude Code configuration directory the script runs, in order:

1. `claude plugin marketplace add <repository root>`: adds the repository root as a local marketplace (named `learn-anything-local`);
2. `claude plugin install learn-anything@learn-anything-local --scope user`;
3. when `--courses-dir` or `--guokao-repo` is given, `claude plugin configure learn-anything@learn-anything-local --values-stdin` to set the courses directory and the exam bank repository (only the options you gave).

Start a new session after installing.

**After changing the repository, run `bash install.sh --reinstall`.** When Claude Code installs a plugin from a local marketplace it may copy it into its own cache and run that copy instead of reading the repository directly. In that case your sessions keep using the old version, and a plain re-run skips the plugin because it is already installed. `--reinstall` uninstalls and then installs the plugin in each configuration directory (the marketplace stays); start a new session afterwards. Whether Claude Code uses a cached copy or loads the plugin in place will be confirmed on the first real install. You can pass `--courses-dir` and `--guokao-repo` along with `--reinstall`; if you don't pass `--courses-dir` (or `--guokao-repo`), the script reminds you at the end to check that the courses directory (or exam bank repository) setting is still there.

**Re-running is safe.** For each directory the script first looks at the current state with two read-only commands, `claude plugin marketplace list --json` and `claude plugin list --json`. A marketplace that is already added is not added again, and a plugin that is already installed (user scope) is not installed again. `configure` always runs when `--courses-dir` or `--guokao-repo` is given. So to change the courses directory, just re-run `bash install.sh --courses-dir <new directory>`, and to change the exam bank repository, re-run `bash install.sh --guokao-repo <new directory>`. If the state cannot be read (the command fails or its output is not understood), the script does not guess and goes ahead with the add and install.

Which configuration directories are handled:

- Without `--config-dir`: Claude Code's default directory (`~/.claude`); `~/.claude-ccswitch` if it exists; and the directory named by the `CLAUDE_CONFIG_DIR` environment variable, if it is set and differs from the first two.
- With `--config-dir <dir>` (repeatable): only the directories you give.
- Commands for the default directory have no prefix. Commands for any other directory are prefixed with `CLAUDE_CONFIG_DIR=<dir>`.

Other options:

- `--dry-run`: print the commands that would run (one per line, each starting with `+ `) without running them. Use it to see what the script will do. The two read-only list commands above are printed too, and the `add` and `install` lines end with a note that they are skipped if already present, meaning a real run will not execute them when the state is already satisfied.
- `--reinstall`: if the plugin is installed, uninstall it and install it again; if not, just install it. The marketplace stays. When the state cannot be read, the plugin is treated as installed.
- `--uninstall`: for each configuration directory, uninstall the plugin and remove the marketplace, skipping a step whose target is already gone. It does not touch any file in your courses directory. It cannot be combined with `--reinstall`.
- When a directory given with `--config-dir` does not exist, the script prints a one-line notice and carries on.
- Exit codes: 2 on an unknown argument, a `--courses-dir` or `--guokao-repo` value that is empty or not an absolute path, `--reinstall` together with `--uninstall`, or `--guokao-repo` together with `--uninstall`. The script exits with code 1 when `claude` cannot be found, node is older than 20, `HOME` is not set, or a command fails. A failure in one configuration directory does not stop the others, and the failing directory is named in the output.

## Where courses are stored

All courses live in one global directory, set by the plugin's `courses_dir` option. The skill never looks for courses in the current working directory.

```text
<courses directory>/
├── index.html          # overview page
├── index-data.js       # course registry
└── <course name>/      # one directory per course
    ├── course.html     # course page
    └── course-data.js  # everything about the course and your progress; the only source of progress
```

To set or change the directory, either re-run `bash install.sh --courses-dir <new directory>`, or run `/plugin configure learn-anything@learn-anything-local` inside Claude Code. When it is not configured, the skill stops and tells you how to configure it. It does not create a course anywhere else. The exam bank repository (`guokao_repo`) works the same way: set it with `--guokao-repo` or the same `/plugin configure`; only the civil-service-exam template uses it.

`course-data.js` contains `window.LEARN_COURSE = <strict JSON>;`. The scripts and the reminder hook read it with `JSON.parse` only; they never execute it.

Each course's `course.html` and the courses directory's `index.html` are copied from the plugin when a course is created, and they do not change when the plugin is updated. After the page templates change, run the command below to copy both pages again into the courses directory and every registered course. It overwrites only those two kinds of file and never touches `course-data.js` or anything else:

```bash
node plugins/learn-anything/skills/learn/scripts/refresh-pages.mjs <courses directory>
```

## Start a course and continue one

In Claude Code, just say:

```text
I want to learn macroeconomics
```

or use the command `/learn-anything:learn` followed by the topic. The skill also triggers automatically from its description: learning any topic, systematic study, continuing a course, interview preparation, and civil-service-exam preparation (国考, 考公, 行测, 申论 and so on) all belong to it.

How a course starts: it asks why you are learning, how far you want to get, and what you already know. After researching, it presents the outline in the conversation: the source list, the further reading for each lesson, the sources it could not verify, and a proposed course name. Only after you confirm does it create the course and open the course page. Then the first lesson begins.

**To continue**, say "continue learning" or "continue my xx course". Without a topic it lists all courses and lets you pick one. Then it summarizes in two or three sentences where you are, reviews pending items first if there are any, and carries on from where you stopped. Continuing relies on the course data file only, never on the conversation history.

You can adjust the outline at any time: add or remove lessons, reorder them, skip optional ones.

## What the course page shows

- The header: the topic, why you are learning it, how far you want to get, what you already know, and how the course is taught; progress (lessons taught, lessons mastered, review items pending) and where you stopped.
- The outline on the left: each lesson's status (in progress, taught, mastered, optional, skipped) and its further reading; the review list; the source list.
- The cards of each lesson: key points, steps, tables, comparisons, Q&A, thinking questions, practice records. A practice record shows whether each question was answered correctly, not mastered, skipped, or still waiting for an answer.
- Growth panels: diagrams, code and timelines evolve lesson by lesson, and elements added in the current lesson are highlighted. Diagrams can be exported as SVG and PNG.
- When the data has an error, the page shows a red box and keeps the last good content, then recovers by itself once the data is fixed.

## The interview template

An `interview` template is included, for interview-preparation requests: system design, knowledge topics, project-experience review, and mock interviews. At the start of a course the skill reads each template's description; if your request matches, the outline opens with "this course uses the interview template", and you can decline.

With the template: no web research by default (unless you ask for it); the outline emphasizes what interviewers dig into; interview questions are woven into the lessons and count as that lesson's check; the last lesson ties the whole course into one route you can say out loud. Where the template conflicts with the general rules, the template wins.

## The civil-service-exam template

A `guokao` template is included, for Chinese civil-service-exam (国考) requests: the 行测 modules (politics, common sense, verbal comprehension, quantitative reasoning, logical reasoning, data analysis), 申论, and the CSRC computer and securities-and-futures papers. One exam module is one course, and all of them belong to the series 「国考」. It needs `guokao_repo` to be configured first (see "Install"); when it is not, the skill stops and tells you how, and does not teach past-exam questions from memory.

With the template: the two opening questions are not asked and no web research is done; the course goes from the exam overview and question-type map, through each question type (how to recognize it, how to solve it, a past-exam question with its source), then original variants (the variants are the lesson's check), to a timed strategy lesson. The question bank stays in the guokao_sprint repository: the template never copies it into the courses directory or the plugin, and the scripts (`guokao.mjs`, `migrate-guokao.mjs`) only read its `guokao-sprint/references/`. Only when you ask to add new past-exam questions does the template's add-questions flow edit and commit files in the guokao_sprint repository (`zhenti/<slug>.md`, `<slug>.data.js`, images, and the outline when a new question type is added). Past-exam questions held back for your own full-paper practice never enter the conversation or the course file.

The template ships a script, `scripts/guokao.mjs`, with three subcommands; they rewrite the course file, so it is not edited by hand:

```bash
node plugins/learn-anything/skills/learn/scripts/guokao.mjs sync <exam bank repository> <course file> [--demo <row-label-number>]...
node plugins/learn-anything/skills/learn/scripts/guokao.mjs image <exam bank repository> <course file> <course id> <row-label-number> [--alt <description>]
node plugins/learn-anything/skills/learn/scripts/guokao.mjs new <exam bank repository> <courses directory> <slug>
```

- `sync`: recomputes the question-type map and the past-exam coverage table cards from the bank, keeping existing 「已示范」 (demonstrated) marks; `--demo` marks one past-exam question.
- `image`: embeds a question's figure from the bank as one html card, placed after that lesson's demonstration steps.
- `new`: creates a civil-service-exam course from the bank's default outline.

All three work out and validate the result in memory first, and write to disk only if it passes.

## Writing a new template

A template lives in the plugin under `skills/learn/templates/<name>/`. Its entry point is `TEMPLATE.md`, which starts with three frontmatter fields:

```markdown
---
name: <template name>        # written into the course data's template field
match: <one sentence>        # what kind of request uses this template
research: run                # run: research as usual; skip: do not research
---

# Template body: outline skeleton, teaching rules, card and panel conventions, how the course ends
```

At the start of a course the skill reads the frontmatter of every `templates/*/TEMPLATE.md` and compares `match` against your request. After a match it reads the template body before writing the outline and teaching, and does the same when continuing a course that uses the template. A template can ship helper files (the `interview` template has `outline-patterns.md` and `lesson-guide.md`); the body says when to read them. A template cannot change the data format. It can only use existing fields and `templateData`.

## Examples

`examples/` holds two courses you can open straight in a browser, plus an overview page:

- `examples/index.html`: the overview page.
- `examples/macro-intro/course.html`: "Introduction to Macroeconomics" (the page itself is in Chinese), general flow, written by hand. Its textbook, author and URL are fictional and only show what a course page looks like; the page says so at the top.
- `examples/realtime-billing/course.html`: "Design a real-time billing system", using the interview template, converted from an older interview course, with an architecture diagram.

## Migrating older interview courses

To migrate courses from the earlier interview-sprint project:

```bash
node plugins/learn-anything/skills/learn/scripts/migrate-interview.mjs <old course directory> <courses directory>
```

`<courses directory>` must be an absolute path; `<old course directory>` may be relative. The script only reads the old directory. It writes the new course to `<courses directory>/<course name>/` and registers it, then validates the result and checks that the number of lessons, cards per lesson and panel elements match the source. Old courses have no record of mastery, so every migrated lesson shows as taught. The old review list held parked questions and notes rather than gaps in mastery, so it is not migrated as review items: it becomes one note card titled 「迁移来的备忘」 ("notes carried over") at the front of the lesson you stopped at, which therefore has one card more than the source.

## Migrating older civil-service-exam courses

To migrate courses from the guokao-sprint project, one course at a time (`<old course directory>` is `.guokao_points/<course name>/`):

```bash
node plugins/learn-anything/skills/learn/scripts/migrate-guokao.mjs <old course directory> <courses directory>
```

Path rules, read-only source, validate-before-write and cleanup on failure are the same as for interview courses. What the conversion does differently:

- The `guokao` template (`template` is `"guokao"`). Every course joins the series 「国考」, so the overview page shows them together, in guokao-sprint's order of nine courses. The subject, the position in the exam paper and the two original panels are kept as they were in `templateData`.
- The question-type map and the past-exam coverage grid have no matching panel in the new format. Each becomes one table card at the end of the exam-overview lesson, which therefore has two cards more than the source. Both table cards carry a `generated` marker (`guokao-typemap`, `guokao-examgrid`), so the template can find and rewrite them in place. The coverage table has one row per question type and one column per year or paper, with question numbers in the cells; a symbol after a number marks a demonstrated, drill, held-back or compound question (the second type of a compound question is kept only in `templateData`).
- Image cards become html cards with the image embedded as a `data:image` URL in `course-data.js`, so the `img/` directory is no longer needed.
- Practice records: the question a variant was based on is appended to the question, the time taken to the answer, and the error-cause code, in Chinese, goes in front of the gap. Answers recorded as 「跳过」 ("skipped") become skipped items, with the reason for skipping in the gap.
- The old review list held questions that were not yet mastered, so it becomes review items; an item starting with 「第 N 课」 ("lesson N") is attached to lesson N, others to no lesson.
- Mastery is inferred from the old practice records: a finished (`done`) exam-overview lesson counts as mastered; any other finished lesson counts as mastered when the last practice item that was graded was answered correctly; lessons not yet finished are not mastered. A lesson that still has a review item attached to it is never counted as mastered, even if the practice records say so (review items must not point at a mastered lesson).

A migrated course uses the `guokao` template and is taught on by the learn skill from there; the old `.guokao_points/` directory is left untouched. Mastery of each course is inferred from the old practice records (see the previous item), so lessons do not all show as merely taught; the question bank needs `guokao_repo` to be configured as described under "Install".

## Development and tests

The repository root is a local marketplace and the plugin itself is in `plugins/learn-anything/`. The plugin directory has no `package.json` and no npm dependencies.

```text
plugins/learn-anything/   # the plugin: skill, subagents, hook, scripts, page templates, domain templates
tests/                    # unit tests, page tests, fixtures, helpers
examples/                 # example courses
install.sh                # install script
```

Run all the tests:

```bash
bash tests/run-all.sh
```

It runs, in order: the unit tests (`node --test tests/unit`); the page tests (`node --test tests/e2e`); `bash tests/install.test.sh`; `claude plugin validate plugins/learn-anything --strict`. Every step runs, and if any step fails the final exit code is 1. It does not change the working tree: the two page copies in `examples/` must be byte-identical to the templates, so after changing a page template run `bash tests/run-all.sh --sync`, which copies the templates into `examples/` before running the tests.

The page tests need `playwright-core` and a local Chrome (or Chromium). `playwright-core` is found if it is installed locally, at the path in `PLAYWRIGHT_CORE_PATH`, or in the global npm directory. A skipped page test (for example, when the browser cannot start) counts as a failure. Some `install.sh` tests use `--dry-run` and some really run the script; when they do, `HOME` is a temporary directory and the first `claude` on `PATH` is a stub that only records its calls, so no real Claude Code configuration is touched.

To validate one course's data on its own:

```bash
node plugins/learn-anything/skills/learn/scripts/validate.mjs <courses directory>/<course name>/course-data.js
```
