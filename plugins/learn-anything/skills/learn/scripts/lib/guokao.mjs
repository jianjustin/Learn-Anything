// guokao 模板的公共函数：迁移脚本和模板自己的脚本共用。
// 两张由 templateData.growth 生成的表格卡（题型地图、真题覆盖）带 generated 标记，用标记找到它们、原地重写。
// 表格和迁移相关的函数出错抛普通 Error，由调用方决定怎么报；读题库、同步题库的函数抛 MigrateError（命令行把它打成 ✗ 行）。
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { isSafeDir } from './course-index.mjs';
import { MigrateError, isInside, loadOldCourse } from './migrate-common.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);

export const TABLE_MARK = { typemap: 'guokao-typemap', examgrid: 'guokao-examgrid' };

export const SERIES_NAME = '国考';
// guokao-sprint 建课清单的顺序
export const SERIES_ORDER = [
  'xingce-zhengzhi', 'xingce-changshi', 'xingce-yanyu', 'xingce-shuliang', 'xingce-panduan', 'xingce-ziliao',
  'shenlun-quanjuan', 'computer-zhuanye', 'finance-jichu',
];

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
// 行内格式（**粗体**、`代码`、\n）转成 HTML，其余转义
export function inlineHtml(s) {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}
export const plainText = (s) => String(s).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\s*\n\s*/g, ' ');

// 题图的 html：图片按 data:image 内嵌，说明转义后放在图下。buffer 是图片内容
export function imageHtml(src, alt, buffer) {
  const ext = String(src).split('.').pop().toLowerCase();
  if (!Object.hasOwn(MIME, ext)) throw new Error(`图片格式不认识：${src}`);
  const text = typeof alt === 'string' ? alt : '';
  const img = `<img src="data:${MIME[ext]};base64,${buffer.toString('base64')}" alt="${escapeHtml(plainText(text))}" style="max-width:100%">`;
  return `<figure>${img}${text ? `<figcaption>${inlineHtml(text)}</figcaption>` : ''}</figure>`;
}

const lessonTitles = (lessons, ref) => (Array.isArray(ref) ? ref : [ref])
  .map((id) => lessons.find((l) => isObj(l) && l.id === id)?.title ?? id).join('、');

// 题型地图 → 表格卡
export function typemapTable(panel, lessons) {
  const nodes = list(panel.nodes).filter(isObj);
  const years = ['2024', '2025', '2026'];
  const counted = nodes.some((n) => isObj(n.count));
  const headers = ['题型', '常用方法', '对应的课', ...(counted ? years.map((y) => `${y} 题数`) : [])];
  const rows = nodes.map((n) => [
    String(n.label ?? n.id), String(n.methods ?? ''), lessonTitles(lessons, n.lesson),
    ...(counted ? years.map((y) => (isObj(n.count) && n.count[y] !== undefined ? String(n.count[y]) : '')) : []),
  ]);
  return {
    type: 'table', generated: TABLE_MARK.typemap, title: typeof panel.title === 'string' && panel.title ? panel.title : '题型地图', headers, rows,
  };
}

// 真题覆盖 → 表格卡：每个题型一行，每个年份（或卷名）一列，格子里是题号
export function examgridTable(panel, typemap) {
  const nodes = list(typemap?.nodes).filter(isObj);
  const years = list(panel.years).map(String);
  const items = list(panel.items).filter(isObj);
  for (const it of items) {
    if (!nodes.some((n) => n.id === it.type)) throw new Error(`真题覆盖里 ${it.year}-${it.no} 的题型 ${JSON.stringify(it.type)} 不在题型地图里`);
    if (!years.includes(String(it.year))) throw new Error(`真题覆盖里 ${it.year}-${it.no} 的年份不在 years 里`);
  }
  // 格子要窄：题号后面只加符号，含义写在表格标题里；复合题的第二题型留在 templateData 里
  const mark = (it) => `${it.no}${it.demo ? '★' : ''}${it.drill ? '△' : ''}${it.hold ? '▣' : ''}${it.type2 ? '◢' : ''}`;
  const rows = nodes
    .map((n) => [String(n.label ?? n.id), ...years.map((y) => items.filter((it) => it.type === n.id && String(it.year) === y).map(mark).join(' '))])
    .filter((r) => r.slice(1).some((cell) => cell !== ''));
  const title = typeof panel.title === 'string' && panel.title ? panel.title : '真题覆盖';
  return {
    type: 'table', generated: TABLE_MARK.examgrid, title: `${title}（题号；★ 已示范，△ 组练，▣ 留作整卷，◢ 复合题）`, headers: ['题型', ...years], rows,
  };
}

// 两张表格卡放在哪一课：id 为 kaoqing 的课，没有时第一课
export function tableLessonIndex(lessons) {
  const i = lessons.findIndex((l) => isObj(l) && l.id === 'kaoqing');
  return i >= 0 ? i : 0;
}

// 按 templateData.growth 生成两张表格卡放进课程，返回新对象，不改传入的。
// 课程里已有带同一标记的卡就原地替换；没有就追加到 tableLessonIndex 那一课末尾；没有 examgrid 时删掉旧的 examgrid 卡。
export function placeTables(course) {
  const growth = list(course.templateData?.growth).filter(isObj);
  const typemap = growth.find((g) => g.kind === 'typemap');
  const examgrid = growth.find((g) => g.kind === 'examgrid');
  const lessons = list(course.lessons).map((l) => (isObj(l) ? { ...l, cards: list(l.cards).slice() } : l));
  const wanted = [];
  if (typemap) wanted.push([TABLE_MARK.typemap, typemapTable(typemap, lessons)]);
  if (examgrid) wanted.push([TABLE_MARK.examgrid, examgridTable(examgrid, typemap)]);
  const marks = Object.values(TABLE_MARK);
  const isGenerated = (c, mark) => isObj(c) && c.generated === mark;

  for (const mark of marks) {
    const card = wanted.find(([m]) => m === mark)?.[1];
    let placed = false;
    for (const l of lessons) {
      if (!isObj(l)) continue;
      const cards = [];
      for (const c of l.cards) {
        if (!isGenerated(c, mark)) cards.push(c);
        else if (card && !placed) {
          cards.push(card);
          placed = true;
        }
      }
      l.cards = cards;
    }
    if (card && !placed) {
      const at = lessons[tableLessonIndex(lessons)];
      if (isObj(at)) at.cards.push(card);
    }
  }
  return { ...course, lessons };
}

// 已讲完的课是否算掌握：考情课讲完就算；其余看练习里最后一条判过对错的 ok
export function inferMastered(lesson) {
  if (lesson.status !== 'done') return false;
  if (lesson.id === 'kaoqing') return true;
  let last = false;
  for (const c of list(lesson.cards)) {
    if (!isObj(c) || c.type !== 'practice') continue;
    for (const it of list(c.items)) if (isObj(it) && typeof it.ok === 'boolean') last = it.ok;
  }
  return last;
}

// ---- 题库（guokao_sprint 仓库的 guokao-sprint/references/）：只读 ----

// 仓库路径不能用就返回一句说明，能用返回 null
export function repoProblem(repo) {
  if (typeof repo !== 'string' || repo.trim() === '') return '题库仓库路径是空的，请先在配置里设置 guokao_repo';
  if (repo.includes('${')) return `题库仓库路径里有没展开的变量：${repo}`;
  if (!path.isAbsolute(repo)) return `题库仓库路径必须是绝对路径：${repo}`;
  const outlines = path.join(repo, 'guokao-sprint', 'references', 'outlines.data.js');
  if (!existsSync(outlines)) return `题库仓库里找不到 ${outlines}`;
  return null;
}

const slugOk = (slug) => typeof slug === 'string' && isSafeDir(slug) && !slug.includes('/');

// 读题库。outline(slug)、zhenti(slug) 没有这门课时返回 null；readImage(rel) 读 zhenti/ 下的题图
export function loadRepo(repo) {
  const problem = repoProblem(repo);
  if (problem) throw new MigrateError(problem);
  const refs = path.join(repo, 'guokao-sprint', 'references');
  let outlines;
  return {
    refs,
    outline(slug) {
      if (!slugOk(slug)) throw new MigrateError(`课程的 slug 不合法：${JSON.stringify(slug)}`);
      outlines ??= loadOldCourse(path.join(refs, 'outlines.data.js'), 'GUOKAO_OUTLINES');
      return Object.hasOwn(outlines, slug) && isObj(outlines[slug]) ? outlines[slug] : null;
    },
    zhenti(slug) {
      if (!slugOk(slug)) throw new MigrateError(`课程的 slug 不合法：${JSON.stringify(slug)}`);
      const file = path.join(refs, 'zhenti', `${slug}.data.js`);
      if (!existsSync(file)) return null;
      const z = loadOldCourse(file, 'GUOKAO_ZHENTI');
      if (z.module !== undefined && z.module !== slug) throw new MigrateError(`${file} 的 module 是 ${JSON.stringify(z.module)}，与 ${slug} 不符`);
      return z;
    },
    readImage(rel) {
      if (!isSafeDir(rel)) throw new MigrateError(`题图路径不是 zhenti/ 内的相对路径：${JSON.stringify(rel)}`);
      const file = path.join(refs, 'zhenti', rel);
      let real;
      let root;
      try {
        root = realpathSync.native(refs);
        real = realpathSync.native(file);
      } catch {
        throw new MigrateError(`找不到题图：${file}`);
      }
      if (!isInside(real, root)) throw new MigrateError(`题图不在题库的 references 里：${file}`);
      return readFileSync(real);
    },
  };
}

export const questionKey = (item) => `${item.year}-${item.no}`;

const lessonIds = (ref) => (Array.isArray(ref) ? ref : [ref]);

// 按题库重算 templateData.growth：返回新的 growth，不改传入的对象。
// 题型地图：count 取题库，lesson 以课程为准；题库有、课程没有的节点按 outline 补进来。
// 真题覆盖：years、items 换成题库的，课程里已有的 demo 标记按 questionKey 保留（题库里没有或已是 hold 的题丢掉标记，列进 dropped）。
// zhenti 为 null（题库没有这门课的真题清单）时 growth 原样返回。
export function syncGrowth(course, zhenti, outline) {
  const growth = structuredClone(list(course.templateData?.growth));
  const added = [];
  const dropped = [];
  if (!isObj(zhenti)) return { growth, dropped, added };

  const courseLessons = list(course.lessons).filter(isObj).map((l) => l.id);
  const bankNodes = list(zhenti.nodes).filter(isObj);
  let typemap = growth.find((g) => isObj(g) && g.kind === 'typemap');
  if (!typemap) {
    const t = outline?.typemap;
    typemap = { kind: 'typemap', title: typeof t?.title === 'string' && t.title ? t.title : '题型地图', nodes: [] };
    growth.unshift(typemap);
  }
  typemap.nodes = list(typemap.nodes);
  for (const n of typemap.nodes) {
    const bank = isObj(n) ? bankNodes.find((b) => b.id === n.id) : undefined;
    if (bank && isObj(bank.count)) n.count = bank.count;
  }
  for (const bank of bankNodes) {
    if (typemap.nodes.some((n) => isObj(n) && n.id === bank.id)) continue;
    const spec = list(outline?.typemap?.nodes).find((n) => isObj(n) && n.id === bank.id);
    if (!spec) throw new MigrateError(`题库有新题型 ${bank.id}，但课程里没有，仓库大纲里也找不到它，补不进来`);
    const missing = lessonIds(spec.lesson).filter((id) => !courseLessons.includes(id));
    if (missing.length || spec.lesson === undefined) {
      throw new MigrateError(`新题型 ${bank.id} 对应的课 ${missing.join('、') || '（大纲没写）'} 不在课程里，补不进来`);
    }
    const node = { id: spec.id };
    for (const k of ['label', 'methods']) if (spec[k] !== undefined) node[k] = spec[k];
    node.lesson = spec.lesson;
    if (isObj(bank.count)) node.count = bank.count;
    typemap.nodes.push(node);
    added.push(bank.id);
  }

  const items = list(zhenti.items).filter(isObj);
  const oldExamgrid = growth.find((g) => isObj(g) && g.kind === 'examgrid');
  const demoKeys = new Set(list(oldExamgrid?.items).filter((it) => isObj(it) && it.demo === true).map(questionKey));
  const holdKeys = new Set(items.filter((it) => it.hold).map(questionKey));
  const bankKeys = new Set(items.map(questionKey));
  for (const key of demoKeys) if (!bankKeys.has(key) || holdKeys.has(key)) dropped.push(key);
  const newItems = items.map((it) => {
    const { demo, ...rest } = it;
    return demoKeys.has(questionKey(it)) && !it.hold ? { ...rest, demo: true } : rest;
  });
  const examgrid = oldExamgrid ?? { kind: 'examgrid', title: '真题覆盖' };
  examgrid.years = list(zhenti.years);
  examgrid.items = newItems;
  if (!oldExamgrid) growth.push(examgrid);
  return { growth, dropped, added };
}
