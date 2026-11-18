window.GUOKAO_COURSE = {
  "version": 1,
  "topic": "数量关系",
  "slug": "xingce-shuliang",
  "subject": "xingce",
  "exam": { "paper": "副省级", "count": 15, "range": "66–80", "timeLimitMin": 10 },
  "updatedAt": "2026-11-13T12:00:00+08:00",
  "resume": { "lesson": "fangcheng", "note": "变式 2 已发出，待作答" },
  "review": [
    "第 2 课变式 1：答案对，但等量关系列错",
    "没有课号的一条"
  ],
  "growth": [
    {
      "kind": "typemap",
      "title": "题型地图",
      "nodes": [
        { "id": "fangcheng", "label": "方程与比例", "methods": "设未知数 · 代入排除", "lesson": "fangcheng", "count": { "2024": 3, "2025": 2, "2026": 0 } },
        { "id": "jihe", "label": "几何", "lesson": ["fangcheng", "celve"] },
        { "id": "rongchi", "label": "容斥原理", "lesson": "celve" }
      ]
    },
    {
      "kind": "examgrid",
      "title": "真题覆盖",
      "years": ["2024", "2025地市"],
      "items": [
        { "year": "2024", "no": 63, "type": "fangcheng", "demo": true },
        { "year": "2024", "no": 70, "type": "jihe", "img": "img/2024-70.png" },
        { "year": "2024", "no": 74, "type": "fangcheng", "type2": "jihe" },
        { "year": "2025地市", "no": 67, "type": "fangcheng", "drill": true },
        { "year": "2025地市", "no": 68, "type": "jihe", "hold": true, "type2": "beishu" }
      ]
    }
  ],
  "lessons": [
    {
      "id": "kaoqing",
      "title": "考情与题型地图",
      "summary": "考几题、考什么",
      "optional": false,
      "status": "done",
      "cards": [
        { "type": "points", "title": "要点", "items": ["共 15 题"] },
        { "type": "quote", "text": "先做方程。" }
      ]
    },
    {
      "id": "fangcheng",
      "title": "方程与比例",
      "summary": "找等量关系列方程",
      "status": "current",
      "cards": [
        { "type": "steps", "title": "真题示范 · 2024 副省级 63 题", "items": ["题干", "列式"] },
        { "type": "image", "title": "2024 副省级 70 题 题图", "src": "img/2024-70.png", "alt": "梯形 **ABCD**\n对角线交于 <O>" },
        { "type": "image", "src": "img/2024-70.png" },
        {
          "type": "practice",
          "items": [
            { "q": "原创变式 1：……", "basedOn": "仿 2024-63", "answer": "B", "yours": "B", "ok": true },
            { "q": "原创变式 2：……", "basedOn": "仿 2024-63", "answer": "D", "yours": "A", "ok": false, "cause": "reading", "why": "读错倍数" },
            { "q": "2024-65 几何", "answer": "C", "yours": "跳过", "why": "计算量大" },
            { "q": "15 题限时组练", "yours": "对 12 题", "timeMin": 11 },
            { "q": "申论小题", "yours": "要点一", "answer": "参考要点" },
            { "q": "原创变式 3：……", "basedOn": "仿 2024-63" }
          ]
        },
        { "type": "interview", "question": "为什么先设小的量？", "answer": "好算" }
      ]
    },
    {
      "id": "celve",
      "title": "做与跳",
      "summary": "限时策略",
      "status": "todo",
      "cards": []
    }
  ]
};
