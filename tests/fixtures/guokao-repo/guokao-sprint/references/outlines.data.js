// 题库大纲（测试用，格式照 guokao-sprint 的 references/outlines.data.js：JavaScript，有注释，不是严格 JSON）
window.GUOKAO_OUTLINES = {
  // 数量关系
  "xingce-shuliang": {
    topic: "数量关系",
    subject: "xingce",
    exam: { paper: "副省级", count: 15, range: "66–80", timeLimitMin: 10 },
    lessons: [
      { id: "kaoqing", title: "考情与题型地图", summary: "考几题、考什么" },
      { id: "fangcheng", title: "方程与比例", summary: "找等量关系列方程" },
      { id: "celve", title: "做与跳", summary: "限时策略", optional: false },
    ],
    typemap: {
      title: "题型地图",
      nodes: [
        { id: "fangcheng", label: "方程与比例", methods: "设未知数 · 代入排除", lesson: "fangcheng" },
        { id: "jihe", label: "几何", methods: "割补 · 相似", lesson: ["fangcheng", "celve"] },
        { id: "rongchi", label: "容斥原理", methods: "两集合公式", lesson: "celve" },
        { id: "jingji", label: "经济利润", methods: "利润 = 售价 - 成本", lesson: "celve" },
      ],
    },
  },
};
