// guokao 模板的公共函数：迁移脚本和模板自己的脚本共用。
// 两张由 templateData.growth 生成的表格卡（题型地图、真题覆盖）带 generated 标记，用标记找到它们、原地重写。
// 这里出错抛普通 Error，由调用方决定怎么报。
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
