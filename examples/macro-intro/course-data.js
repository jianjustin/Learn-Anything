window.LEARN_COURSE = {
  "version": 1,
  "topic": "宏观经济学入门",
  "slug": "macro-intro",
  "template": null,
  "mission": {
    "why": "想看懂财经新闻里的利率、通胀和政策讨论",
    "target": "能解释 GDP、通胀、利率这些指标和政策工具的含义，并说清它们之间怎样互相影响",
    "background": "学过一点微观经济学，没有学过宏观"
  },
  "approach": "理论为主，不设动手实践。每课用一道简答或案例分析题检验，案例取自常见的新闻场景。用一张图逐课长出各个宏观变量之间的关系。一课的题没答对，缺口记进待回顾，下次续学先回顾；答不上来的先重讲，不卡在这一课。",
  "researched": "yes",
  "notice": "这是一门示例课程：资料、作者、网址和章节号都是虚构的，只用来演示课程页的样子，不要照着去找这些书。",
  "resources": [
    {
      "id": "sample-macro",
      "kind": "book",
      "title": "《示例宏观经济学教材》",
      "author": "示例作者",
      "note": "虚构的入门教材，只演示资料清单的格式；每课讲完后对照相应章节读"
    },
    {
      "id": "sample-cb-guide",
      "kind": "doc",
      "title": "示例央行政策说明",
      "author": "示例央行",
      "url": "https://example.com/monetary-policy",
      "note": "虚构的央行说明，讲货币政策时翻阅（章节未核对）"
    }
  ],
  "updatedAt": "2026-11-17T21:05:00+08:00",
  "resume": {
    "lesson": "monetary-policy",
    "note": "已发出第一道简答题，等你作答；之后讲量化宽松"
  },
  "review": [
    {
      "lesson": "inflation",
      "text": "说出通胀预期自我实现的机制"
    }
  ],
  "growth": [
    {
      "kind": "diagram",
      "title": "宏观变量之间的关系",
      "nodes": [
        {
          "id": "spending",
          "label": "总支出",
          "col": 1,
          "row": 1,
          "style": "outline",
          "since": "gdp"
        },
        {
          "id": "output",
          "label": "产出 GDP",
          "col": 2,
          "row": 1,
          "since": "gdp"
        },
        {
          "id": "prices",
          "label": "物价",
          "col": 3,
          "row": 1,
          "since": "inflation"
        },
        {
          "id": "cb",
          "label": "央行",
          "col": 1,
          "row": 2,
          "style": "pill",
          "since": "monetary-policy"
        },
        {
          "id": "rate",
          "label": "利率",
          "col": 2,
          "row": 2,
          "since": "monetary-policy"
        }
      ],
      "edges": [
        {
          "from": "spending",
          "to": "output",
          "label": "决定",
          "since": "gdp"
        },
        {
          "from": "output",
          "to": "prices",
          "label": "过热",
          "style": "dashed",
          "since": "inflation"
        },
        {
          "from": "cb",
          "to": "rate",
          "label": "调息",
          "since": "monetary-policy"
        },
        {
          "from": "rate",
          "to": "spending",
          "label": "抑制",
          "since": "monetary-policy"
        }
      ],
      "annotations": [
        {
          "node": "rate",
          "text": "传导有时滞",
          "since": "monetary-policy"
        }
      ],
      "routes": [
        {
          "lesson": "monetary-policy",
          "steps": [
            "cb",
            "rate",
            "spending",
            "output",
            "prices"
          ]
        }
      ]
    }
  ],
  "lessons": [
    {
      "id": "gdp",
      "title": "GDP 怎么算",
      "summary": "支出法的四个部分，名义 GDP 和实际 GDP",
      "status": "done",
      "mastered": true,
      "readings": [
        {
          "resource": "sample-macro",
          "where": "第 2 章"
        }
      ],
      "cards": [
        {
          "type": "points",
          "items": [
            "**GDP** 是一个经济体在一定时期内生产的全部最终产品和服务的市场价值。只算最终产品，是为了不把原材料和成品重复计算",
            "支出法：GDP = 消费 + 投资 + 政府购买 + 净出口",
            "**名义 GDP** 按当年价格算，**实际 GDP** 按固定的基年价格算，扣掉了物价变化，才能比较不同年份的产出",
            "支出法、收入法、生产法理论上算出同一个数：一笔交易既是买方的支出，也是卖方的收入"
          ],
          "refs": [
            "sample-macro"
          ]
        },
        {
          "type": "table",
          "title": "支出法的四个部分",
          "headers": [
            "部分",
            "包括什么",
            "例子"
          ],
          "rows": [
            [
              "消费",
              "家庭购买商品和服务",
              "买菜、看电影、付房租"
            ],
            [
              "投资",
              "企业购买设备、建厂房，家庭买新房，库存增加",
              "工厂新买一条生产线"
            ],
            [
              "政府购买",
              "政府买商品和服务（不含转移支付）",
              "修公路、发教师工资"
            ],
            [
              "净出口",
              "出口减去进口",
              "国产手机卖到国外，减去买进口的芯片"
            ]
          ],
          "refs": [
            "sample-macro"
          ]
        },
        {
          "type": "qa",
          "items": [
            {
              "q": "二手车交易算 GDP 吗？",
              "a": "车本身不算：GDP 只计当期新生产的东西，这辆车在生产那年已经算过了。中间商赚取的服务费算，因为那是当期提供的服务。"
            },
            {
              "q": "家务劳动算 GDP 吗？",
              "a": "不算。GDP 只统计经过市场交易、有市场价格的产出，自己做饭、照顾家人没有交易，也就没有被统计，这是 GDP 的一个已知局限。"
            }
          ]
        },
        {
          "type": "practice",
          "items": [
            {
              "q": "某国今年名义 GDP 增长 8%，物价上涨 5%，实际 GDP 大约增长多少？为什么要看实际 GDP？",
              "rubric": "答出以下两点：① 实际增长约 3%（8% − 5%）；② 名义增长里有物价上涨的部分，实际 GDP 才反映产出的变化",
              "yours": "大概 3%，因为有 5% 是涨价涨出来的，东西其实没多那么多",
              "ok": true,
              "answer": "约 3%。名义 GDP 的增长 = 产出增长 + 物价上涨，扣掉 5% 的物价因素，产出只多了约 3%，所以比较不同年份要看实际 GDP。"
            },
            {
              "q": "用支出法列出 GDP 的四个组成部分，各举一个例子。",
              "rubric": "四个部分都答到：消费、投资、政府购买、净出口，每个部分的例子归类正确",
              "skipped": true
            }
          ]
        },
        {
          "type": "quote",
          "text": "GDP 衡量的是产出，看增长要先扣掉物价。"
        }
      ]
    },
    {
      "id": "inflation",
      "title": "通货膨胀",
      "summary": "通胀的成因、CPI 的含义，以及通胀预期",
      "status": "done",
      "mastered": false,
      "readings": [
        {
          "resource": "sample-macro",
          "where": "第 5 章"
        }
      ],
      "cards": [
        {
          "type": "points",
          "items": [
            "**通胀率**是物价总水平的上涨速度，常用 CPI（消费者价格指数）的同比涨幅衡量",
            "需求拉动：总支出超过经济的产能，价格被抬高",
            "成本推动：能源、工资等成本上涨，传导到售价",
            "通胀预期会自我实现：人们预期涨价，就提前要求加薪、提前购买，结果真的涨了",
            "多数央行追求的是温和而稳定的通胀（常见目标在 2% 左右），而不是零通胀"
          ],
          "refs": [
            "sample-macro"
          ]
        },
        {
          "type": "questions",
          "items": [
            {
              "q": "CPI 和 PPI 有什么区别？",
              "a": "CPI 是消费者买到的商品和服务的价格，PPI 是生产者出厂的价格；PPI 反映成本端，往往领先 CPI。"
            }
          ]
        },
        {
          "type": "practice",
          "items": [
            {
              "q": "为什么央行很在意「通胀预期」，而不只是当前的通胀率？",
              "rubric": "答出以下两点：① 预期会改变工资谈判和定价行为；② 因此预期本身会推高未来的通胀，形成自我实现",
              "yours": "因为预期高了大家会恐慌",
              "ok": false,
              "why": "没有说明预期怎样通过工资和定价行为传导；没有讲到自我实现",
              "answer": "预期通胀高时，工人要求更高的工资，企业提前提价，这些行为本身推高了实际通胀，所以预期会自我实现。央行要稳住预期，才能稳住未来的通胀。"
            }
          ]
        },
        {
          "type": "quote",
          "text": "通胀不只取决于现在发生了什么，也取决于人们相信会发生什么。"
        }
      ]
    },
    {
      "id": "monetary-policy",
      "title": "货币政策",
      "summary": "央行怎样通过利率影响经济，加息为什么会压低股价",
      "status": "current",
      "mastered": false,
      "readings": [
        {
          "resource": "sample-macro",
          "where": "第 15 章"
        },
        {
          "resource": "sample-cb-guide",
          "where": "章节未核对"
        }
      ],
      "cards": [
        {
          "type": "points",
          "items": [
            "**政策利率**是央行直接调控的短期利率；它先影响银行间利率，再传导到贷款利率和债券收益率",
            "加息抬高借款成本，抑制投资和消费，给过热的经济降温；降息的方向相反",
            "利率还通过资产价格起作用：加息使未来现金流的折现率上升，股票和房产的估值承压",
            "传导有时滞：利率变动往往要几个月甚至更久，才充分作用到总需求上"
          ],
          "refs": [
            "sample-macro",
            "sample-cb-guide"
          ]
        },
        {
          "type": "steps",
          "title": "加息的传导链",
          "items": [
            "央行上调政策利率",
            "银行间利率跟着上行，银行提高贷款利率",
            "企业和家庭借钱更贵，投资和耐用品消费减少",
            "总支出下降，产出增长放缓",
            "需求降温，物价上涨的压力减轻"
          ],
          "refs": [
            "sample-macro"
          ]
        },
        {
          "type": "qa",
          "items": [
            {
              "q": "降息一定能刺激经济吗？",
              "a": "不一定。企业对前景悲观时，利率再低也不愿借钱投资；利率已经降到接近零时，可调的空间也用尽了，这时央行才会考虑量化宽松之类的非常规工具。"
            }
          ]
        },
        {
          "type": "practice",
          "items": [
            {
              "q": "央行加息之后，一家打算借钱扩建工厂的企业会怎么想？这对总支出有什么影响？",
              "rubric": "答出以下两点：① 借款成本上升，部分投资项目变得不划算而推迟或取消；② 投资减少使总支出下降"
            }
          ]
        }
      ]
    },
    {
      "id": "fiscal-policy",
      "title": "财政政策",
      "summary": "政府支出和税收怎样影响总需求，乘数效应",
      "status": "todo",
      "mastered": false,
      "readings": [
        {
          "resource": "sample-macro",
          "where": "章节未核对"
        }
      ],
      "cards": []
    },
    {
      "id": "open-economy",
      "title": "开放经济",
      "summary": "汇率、贸易差额和资本流动",
      "optional": true,
      "status": "todo",
      "mastered": false,
      "readings": [],
      "cards": []
    }
  ]
};
