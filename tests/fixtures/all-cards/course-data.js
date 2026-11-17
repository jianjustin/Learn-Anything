window.LEARN_COURSE = {
  "version": 1,
  "topic": "全部卡片样例",
  "slug": "all-cards",
  "template": null,
  "mission": {
    "why": "覆盖所有卡片类型",
    "target": "渲染与校验都能通过",
    "background": "无"
  },
  "approach": "讲授加检验；每课一张练习卡。",
  "researched": "yes",
  "notice": "这是测试样例，不是真实课程",
  "resources": [
    {
      "id": "book-a",
      "kind": "book",
      "title": "《样例之书》",
      "author": "某作者",
      "note": "覆盖基础概念，第一课前看"
    },
    {
      "id": "doc-b",
      "kind": "doc",
      "title": "样例文档",
      "url": "https://example.com/docs",
      "note": "查接口细节时翻阅"
    }
  ],
  "updatedAt": "2026-11-17T10:00:00+08:00",
  "resume": {
    "lesson": "wrap",
    "note": "讲完核心，下一步收尾"
  },
  "review": [
    {
      "lesson": "core",
      "text": "回顾缓存失效的两种做法"
    }
  ],
  "growth": [
    {
      "kind": "diagram",
      "title": "系统架构",
      "nodes": [
        {
          "id": "client",
          "label": "客户端",
          "col": 1,
          "row": 1,
          "style": "pill",
          "since": "intro"
        },
        {
          "id": "server",
          "label": "服务端",
          "col": 2,
          "row": 1,
          "since": "intro"
        },
        {
          "id": "queue",
          "label": "队列",
          "col": 2,
          "row": 2,
          "style": "outline",
          "since": "intro",
          "until": "wrap"
        },
        {
          "id": "cache",
          "label": "缓存",
          "col": 3,
          "row": 1,
          "since": "core"
        },
        {
          "id": "db",
          "label": "数据库",
          "col": 1,
          "row": 3,
          "span": 2,
          "style": "ghost",
          "since": "wrap"
        }
      ],
      "edges": [
        {
          "from": "client",
          "to": "server",
          "label": "请求",
          "since": "intro"
        },
        {
          "from": "server",
          "to": "cache",
          "style": "dashed",
          "since": "core"
        }
      ],
      "groups": [
        {
          "id": "backend",
          "label": "后端",
          "members": [
            "server",
            "cache"
          ],
          "since": "core"
        }
      ],
      "annotations": [
        {
          "node": "server",
          "text": "无状态，可水平扩展",
          "since": "core"
        }
      ],
      "routes": [
        {
          "lesson": "core",
          "steps": [
            "client",
            "server",
            "cache"
          ]
        },
        {
          "lesson": "wrap",
          "steps": [
            "client",
            "server",
            "cache",
            "db"
          ]
        }
      ]
    },
    {
      "kind": "code",
      "title": "请求处理函数",
      "versions": [
        {
          "id": "v1",
          "since": "intro",
          "label": "直接查询",
          "language": "js",
          "note": "每次都查库",
          "code": "function get(id) {\n  return db.find(id);\n}\n"
        },
        {
          "id": "v2",
          "since": "core",
          "label": "加缓存",
          "language": "js",
          "code": "function get(id) {\n  return cache.get(id) ?? db.find(id);\n}\n"
        }
      ]
    },
    {
      "kind": "timeline",
      "title": "响应耗时",
      "metricLabel": "平均耗时",
      "better": "lower",
      "events": [
        {
          "since": "intro",
          "title": "基线",
          "detail": "没有任何优化",
          "metric": {
            "value": 3.2,
            "unit": "s"
          }
        },
        {
          "since": "core",
          "title": "加缓存后",
          "metric": {
            "value": 400,
            "unit": "ms"
          }
        }
      ]
    }
  ],
  "lessons": [
    {
      "id": "intro",
      "title": "入门",
      "summary": "先建立整体印象",
      "status": "done",
      "mastered": true,
      "readings": [
        {
          "resource": "book-a",
          "where": "第 1 章"
        }
      ],
      "cards": [
        {
          "type": "points",
          "items": [
            "要点一",
            "要点二，带 **粗体** 和 `代码`"
          ],
          "refs": [
            "book-a"
          ]
        },
        {
          "type": "steps",
          "items": [
            "第一步",
            "第二步"
          ]
        },
        {
          "type": "quote",
          "text": "先有整体，再有细节。"
        },
        {
          "type": "problem",
          "question": "为什么要先看整体？",
          "approach": "想想地图和路线的关系",
          "answer": "整体让细节有位置可放。"
        }
      ]
    },
    {
      "id": "core",
      "title": "核心",
      "summary": "讲清主线机制",
      "status": "done",
      "mastered": false,
      "readings": [],
      "cards": [
        {
          "type": "qa",
          "title": "常见追问",
          "items": [
            {
              "q": "缓存会过期吗？",
              "a": "会，要设置失效时间。"
            }
          ],
          "refs": [
            "doc-b"
          ]
        },
        {
          "type": "questions",
          "items": [
            {
              "q": "你问过：为什么要队列？",
              "a": "用来削峰。"
            }
          ]
        },
        {
          "type": "practice",
          "items": [
            {
              "q": "用自己的话讲讲缓存的作用。",
              "rubric": "提到降低延迟和减轻数据库压力"
            },
            {
              "q": "什么时候缓存会出问题？",
              "rubric": "提到数据不一致",
              "yours": "不知道",
              "ok": false,
              "why": "没有想到失效问题",
              "answer": "数据更新后缓存未同步时会读到旧值。"
            }
          ]
        },
        {
          "type": "table",
          "headers": [
            "方案",
            "延迟"
          ],
          "rows": [
            [
              "无缓存",
              "高"
            ],
            [
              "有缓存",
              "低"
            ]
          ],
          "refs": [
            "doc-b"
          ]
        },
        {
          "type": "compare",
          "options": [
            {
              "name": "本地缓存",
              "pros": [
                "快"
              ],
              "cons": [
                "各节点不一致"
              ]
            },
            {
              "name": "远程缓存",
              "pros": [
                "全局一致"
              ],
              "cons": [
                "多一次网络往返"
              ]
            }
          ],
          "conclusion": "先本地，规模大了换远程。"
        }
      ]
    },
    {
      "id": "wrap",
      "title": "收尾",
      "summary": "把前面串起来",
      "status": "current",
      "mastered": false,
      "readings": [],
      "cards": [
        {
          "type": "chips",
          "items": [
            "缓存",
            "队列",
            "数据库"
          ]
        },
        {
          "type": "code",
          "language": "js",
          "code": "const x = cache.get(k);"
        },
        {
          "type": "note",
          "text": "这一课可以边看边提问。"
        },
        {
          "type": "html",
          "html": "<b>ok</b><script>window.__pwned=1</script><img src=\"x\" onerror=\"window.__pwned=1\">"
        }
      ]
    }
  ]
};
