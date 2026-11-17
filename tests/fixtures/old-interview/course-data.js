// 旧格式样例：不加引号的键、行注释、尾逗号、join 拼接的多行字符串
window.INTERVIEW_COURSE = {
  version: 1,
  topic: "订单列表接口为什么慢",
  slug: "old-interview",
  type: "experience",
  demoCase: true,
  updatedAt: "2026-11-03T15:20:00+08:00",
  resume: { lesson: "fix", note: "背景已讲完，下一步讲加索引的取舍", },
  review: ["原文一", "原文二",],
  growth: [
    {
      kind: "architecture",
      title: "系统架构",
      nodes: [
        { id: "web", label: "订单页", col: 1, row: 1, since: "bg" }, // 不写 kind
        { id: "db", label: "MySQL", col: 2, row: 1, kind: "store", since: "bg" },
        { id: "app", label: "业务服务", col: 1, row: 2, kind: "external", since: "bg" },
        { id: "box", label: "待拆开", col: 2, row: 2, kind: "placeholder", since: "bg", until: "fix" },
      ],
      edges: [{ from: "web", to: "db", label: "查询", since: "bg" }],
      groups: [{ id: "data", label: "数据域", members: ["db"], since: "bg" }],
      annotations: [{ node: "db", text: "千万行", since: "bg" }],
      routes: [{ lesson: "fix", steps: ["web", "db"] }],
    },
    {
      kind: "code",
      title: "SQL 演进",
      versions: [
        {
          id: "v1",
          since: "bg",
          label: "v1 深翻页",
          language: "sql",
          code: ["line1", "line2"].join("\n"),
        },
      ],
    },
    {
      kind: "timeline",
      title: "排查时间线",
      metricLabel: "订单列表接口 P99",
      events: [
        { since: "bg", title: "慢查询告警", detail: "翻页越往后越慢", metric: { value: 3.2, unit: "s" } },
        { since: "fix", title: "加联合索引", metric: { value: 400, unit: "ms" } },
      ],
    },
  ],
  lessons: [
    {
      id: "bg",
      title: "背景",
      summary: "接口、数据量和告警",
      status: "done",
      cards: [
        { type: "interview", question: "线上接口变慢，你先看什么？", approach: "先定位再优化", answer: "看慢查询日志" },
        { type: "interview", title: "设计题", question: "怎么设计分页？", approach: "游标", answer: "按主键游标翻页" },
        { type: "quote", text: "我先确认影响面。" },
        { type: "quote", title: "开场白", text: "这是一个订单列表变慢的案例。" },
        { type: "points", items: ["**先量后改**", "只改一个变量"] },
      ],
    },
    {
      id: "fix",
      title: "加索引",
      summary: "联合索引的列顺序",
      status: "current",
    },
  ],
};
