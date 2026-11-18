// 数量关系真题清单（测试用，格式照 guokao-sprint 的 references/zhenti/<slug>.data.js）
window.GUOKAO_ZHENTI = {
  "module": "xingce-shuliang",
  "years": ["2024", "2025地市"],
  "nodes": [
    { "id": "fangcheng", "label": "方程与比例", "methods": "设未知数 · 代入排除", "count": { "2024": 4, "2025": 3, "2026": 1 } },
    { "id": "jihe", "label": "几何", "methods": "割补 · 相似", "count": { "2024": 2, "2025": 2, "2026": 1 } },
    { "id": "rongchi", "label": "容斥原理", "methods": "两集合公式", "count": { "2024": 1, "2025": 1, "2026": 0 } },
    { "id": "jingji", "label": "经济利润", "methods": "利润 = 售价 - 成本", "count": { "2024": 1, "2025": 0, "2026": 0 } }
  ],
  "items": [
    { "year": "2024", "no": 63, "type": "fangcheng" },
    { "year": "2024", "no": 70, "type": "jihe", "img": "img/2024-70.png" },
    { "year": "2024", "no": 74, "type": "fangcheng", "type2": "jihe" },
    { "year": "2024", "no": 79, "type": "jingji" },
    { "year": "2025地市", "no": 67, "type": "fangcheng", "drill": true },
    { "year": "2025地市", "no": 68, "type": "jihe", "type2": "beishu", "hold": true },
    { "year": "2025地市", "no": 72, "type": "rongchi", "hold": true }
  ]
};
