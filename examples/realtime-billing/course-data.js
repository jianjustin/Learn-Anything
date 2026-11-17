window.LEARN_COURSE = {
  "version": 1,
  "topic": "设计一个实时计费系统",
  "slug": "realtime-billing",
  "template": "interview",
  "templateData": {
    "type": "system-design"
  },
  "mission": {
    "why": "",
    "target": "",
    "background": ""
  },
  "approach": "",
  "researched": "skipped",
  "resources": [],
  "updatedAt": "2026-11-03T16:40:00+08:00",
  "resume": {
    "lesson": "pitch",
    "note": "讲完 10 分钟路线和开场白，下一步：常见追问与应对"
  },
  "review": [
    {
      "lesson": null,
      "text": "预扣和实扣的区别"
    },
    {
      "lesson": null,
      "text": "Kafka 分区数怎么定"
    }
  ],
  "growth": [
    {
      "kind": "diagram",
      "title": "系统架构",
      "nodes": [
        {
          "id": "biz",
          "label": "业务服务",
          "col": 1,
          "row": 2,
          "style": "outline",
          "since": "concepts"
        },
        {
          "id": "box",
          "label": "计费系统（黑盒）",
          "col": 3,
          "row": 2,
          "span": 3,
          "style": "ghost",
          "since": "concepts",
          "until": "architecture"
        },
        {
          "id": "mq",
          "label": "Kafka",
          "col": 3,
          "row": 2,
          "style": "pill",
          "since": "architecture"
        },
        {
          "id": "rate",
          "label": "计价引擎",
          "col": 4,
          "row": 2,
          "style": "box",
          "since": "architecture"
        },
        {
          "id": "bal",
          "label": "余额服务",
          "col": 5,
          "row": 2,
          "style": "box",
          "since": "architecture"
        },
        {
          "id": "bill",
          "label": "账单服务",
          "col": 6,
          "row": 2,
          "style": "box",
          "since": "architecture"
        },
        {
          "id": "gw",
          "label": "上报网关",
          "col": 2,
          "row": 2,
          "style": "box",
          "since": "metering"
        },
        {
          "id": "price",
          "label": "价格中心",
          "col": 4,
          "row": 1,
          "style": "box",
          "since": "rating"
        },
        {
          "id": "owe",
          "label": "欠费控制",
          "col": 5,
          "row": 1,
          "style": "box",
          "since": "balance"
        },
        {
          "id": "redis",
          "label": "Redis 余额",
          "col": 5,
          "row": 3,
          "style": "pill",
          "since": "balance"
        },
        {
          "id": "db",
          "label": "MySQL 流水",
          "col": 6,
          "row": 3,
          "style": "pill",
          "since": "ledger"
        },
        {
          "id": "dlq",
          "label": "死信队列",
          "col": 3,
          "row": 3,
          "style": "pill",
          "since": "degradation"
        },
        {
          "id": "buf",
          "label": "本地缓冲",
          "col": 1,
          "row": 3,
          "style": "pill",
          "since": "traffic"
        },
        {
          "id": "recon",
          "label": "对账任务",
          "col": 7,
          "row": 2.5,
          "style": "box",
          "since": "consistency"
        }
      ],
      "edges": [
        {
          "from": "biz",
          "to": "box",
          "label": "用量事件",
          "since": "concepts",
          "until": "architecture"
        },
        {
          "from": "biz",
          "to": "mq",
          "label": "用量事件",
          "since": "architecture",
          "until": "metering"
        },
        {
          "from": "mq",
          "to": "rate",
          "since": "architecture"
        },
        {
          "from": "rate",
          "to": "bal",
          "label": "扣费请求",
          "since": "architecture"
        },
        {
          "from": "bal",
          "to": "bill",
          "since": "architecture",
          "until": "ledger"
        },
        {
          "from": "biz",
          "to": "gw",
          "label": "用量事件",
          "since": "metering"
        },
        {
          "from": "gw",
          "to": "mq",
          "since": "metering"
        },
        {
          "from": "price",
          "to": "rate",
          "label": "规则",
          "style": "dashed",
          "since": "rating"
        },
        {
          "from": "bal",
          "to": "owe",
          "label": "余额不足",
          "since": "balance"
        },
        {
          "from": "bal",
          "to": "redis",
          "since": "balance"
        },
        {
          "from": "bal",
          "to": "db",
          "since": "ledger"
        },
        {
          "from": "db",
          "to": "bill",
          "label": "汇总",
          "since": "ledger"
        },
        {
          "from": "mq",
          "to": "dlq",
          "label": "失败",
          "style": "dashed",
          "since": "degradation"
        },
        {
          "from": "biz",
          "to": "buf",
          "label": "超限",
          "style": "dashed",
          "since": "traffic"
        },
        {
          "from": "buf",
          "to": "gw",
          "label": "重试",
          "style": "dashed",
          "since": "traffic"
        },
        {
          "from": "recon",
          "to": "db",
          "label": "核对",
          "style": "dashed",
          "since": "consistency"
        },
        {
          "from": "recon",
          "to": "bill",
          "style": "dashed",
          "since": "consistency"
        }
      ],
      "groups": [
        {
          "id": "metering",
          "label": "计量域",
          "members": [
            "gw",
            "mq",
            "dlq"
          ],
          "since": "metering"
        },
        {
          "id": "rating",
          "label": "计价域",
          "members": [
            "rate",
            "price"
          ],
          "since": "rating"
        },
        {
          "id": "account",
          "label": "账户域",
          "members": [
            "bal",
            "owe",
            "redis"
          ],
          "since": "balance"
        },
        {
          "id": "billing",
          "label": "账单域",
          "members": [
            "bill",
            "db",
            "recon"
          ],
          "since": "ledger"
        }
      ],
      "annotations": [
        {
          "node": "biz",
          "text": "峰值 2w 事件/s",
          "since": "requirements"
        },
        {
          "node": "mq",
          "text": "按账户 ID 分区",
          "since": "metering"
        },
        {
          "node": "redis",
          "text": "Lua 原子扣减",
          "since": "balance"
        },
        {
          "node": "db",
          "text": "event_id 唯一键",
          "since": "ledger"
        },
        {
          "node": "bal",
          "text": "Redis 挂 → DB 扣",
          "since": "degradation"
        },
        {
          "node": "gw",
          "text": "令牌桶 2w/s",
          "since": "traffic"
        },
        {
          "node": "mq",
          "text": "分区 ×64",
          "since": "traffic"
        },
        {
          "node": "recon",
          "text": "差异自动冲正",
          "since": "consistency"
        }
      ],
      "routes": [
        {
          "lesson": "core-flow",
          "steps": [
            "biz",
            "gw",
            "mq",
            "rate",
            "bal",
            "redis",
            "db",
            "bill"
          ]
        },
        {
          "lesson": "pitch",
          "steps": [
            "biz",
            "gw",
            "mq",
            "rate",
            "bal",
            "redis",
            "db",
            "recon"
          ]
        }
      ]
    }
  ],
  "lessons": [
    {
      "id": "concepts",
      "title": "核心概念",
      "summary": "计量、计价、扣费、出账四个词，以及余额和流水的关系",
      "status": "done",
      "mastered": false,
      "readings": [],
      "cards": [
        {
          "type": "table",
          "title": "四个动作",
          "headers": [
            "术语",
            "一句话",
            "容易混的地方"
          ],
          "rows": [
            [
              "计量（metering）",
              "记录用了多少：谁、什么资源、多少量、什么时候",
              "只记用量，不关心价格"
            ],
            [
              "计价（rating）",
              "用量 × 价格规则 = 费用",
              "规则会变，要记下用的是哪一版"
            ],
            [
              "扣费（charging）",
              "从余额里把费用扣掉",
              "预付费实时扣；后付费只记账不扣"
            ],
            [
              "出账（billing）",
              "把一段时间的流水汇总成账单",
              "面向展示和结算，可以晚几分钟"
            ]
          ]
        },
        {
          "type": "points",
          "items": [
            "**流水**是每一笔钱的变动记录，只追加不修改，是唯一的账本；**余额**是流水累加出来的当前值，可以重建",
            "**预付费**先充值后使用，余额不足要停服，所以必须实时扣费；**后付费**先用后结，按周期出账即可",
            "这类系统难在三件事：钱不能错（不重、不漏、不超扣）、上报量大且有峰值、价格规则会变"
          ]
        },
        {
          "type": "problem",
          "title": "面试题",
          "question": "预付费和后付费在架构上差别大吗？",
          "approach": "先给结论（差别很大），再从实时性、拦截、出账周期三点对比，最后说你会怎么确认",
          "answer": "差别很大。预付费要求实时扣费，余额不足时要**实时拦截**，所以系统必须在线维护余额；后付费可以先记录用量，按周期批量计价出账，对实时性的要求低得多。所以我会先确认计费模式，它决定整套架构要不要走实时链路。"
        },
        {
          "type": "quote",
          "title": "面试怎么讲",
          "text": "实时计费可以拆成四个动作：计量、计价、扣费、出账。难点不在画出这四个框，而在保证每一笔钱不重、不漏、不超扣，同时扛住上报的峰值。"
        }
      ]
    },
    {
      "id": "requirements",
      "title": "需求澄清",
      "summary": "计什么费、多实时、量多大；三组数字推出要削峰、余额进缓存、流水分库分表",
      "status": "done",
      "mastered": false,
      "readings": [],
      "cards": [
        {
          "type": "chips",
          "title": "需求清单",
          "items": [
            "预付费：余额不足要停服",
            "上报峰值 2 万事件/s",
            "平时扣费延迟 < 1 秒",
            "金额零误差、可追溯",
            "账单按小时 / 天出",
            "计费规则可配置、可回溯"
          ]
        },
        {
          "type": "table",
          "title": "三组数字",
          "headers": [
            "指标",
            "估算",
            "推出的设计结论"
          ],
          "rows": [
            [
              "上报量",
              "日均 2000 事件/s，峰值 2 万/s",
              "峰谷差 10 倍 → 用 MQ 削峰，上报和扣费解耦"
            ],
            [
              "账户数",
              "1000 万，日活 100 万",
              "热余额约 100 万条、百 MB 级 → 全部放得进 Redis"
            ],
            [
              "流水量",
              "约 1.7 亿条/天，每条约 200B，35GB/天",
              "单表撑不住 → 按账户分库、按天分表"
            ]
          ]
        },
        {
          "type": "points",
          "items": [
            "**计费模式**决定实时性：预付费要实时扣、实时拦截；后付费可以周期出账",
            "**量级和峰值**决定要不要削峰：峰谷差 10 倍，同步扣费就得一直按峰值配资源",
            "**准确性**决定账本设计：零误差、可追溯 → 流水是唯一账本，只追加不修改",
            "估算只为推出设计结论，数字取整；每组数字后面都跟一句「所以……」",
            "把不做的也说清楚：支付渠道、发票不在这次范围"
          ]
        },
        {
          "type": "problem",
          "title": "面试题",
          "question": "容量估算时你会估哪几个数？估出来用来做什么？",
          "approach": "不要罗列公式：每个数字对应一个设计决定",
          "answer": "我只估会改变设计的数。上报的均值和峰值，决定要不要用消息队列削峰；活跃账户数，决定余额能不能全放进缓存；每天的流水条数和大小，决定存储要不要分库分表。数字取整就行，重要的是每个数字后面跟一个结论。"
        },
        {
          "type": "quote",
          "title": "面试怎么讲",
          "text": "我先确认几个问题：预付费还是后付费？上报量级和峰值多少？对扣费实时性和金额准确性的要求是什么？然后估三组数字：峰值 2 万事件每秒，所以要削峰；日活百万账户，所以余额放得进缓存；流水每天上亿条，所以要分库分表。"
        },
        {
          "type": "questions",
          "items": [
            {
              "q": "需求澄清一般花多长时间？",
              "a": "控制在 1–2 分钟，问 3–5 个关键问题；其余用合理假设补齐，并把假设说出来。"
            }
          ]
        }
      ]
    },
    {
      "id": "architecture",
      "title": "系统架构",
      "summary": "拆成采集 → 计价 → 扣费 → 出账四段，用 MQ 把上报和计费解耦，列出组件表",
      "status": "done",
      "mastered": false,
      "readings": [],
      "cards": [
        {
          "type": "table",
          "title": "组件表（后面每个组件一课）",
          "headers": [
            "组件",
            "负责什么",
            "拥有的数据"
          ],
          "rows": [
            [
              "用量采集（上报网关 + Kafka）",
              "收事件、校验、削峰",
              "原始用量事件"
            ],
            [
              "计价引擎",
              "用量 × 规则 → 费用",
              "价格规则（带版本）"
            ],
            [
              "余额服务",
              "扣费、欠费判断",
              "余额、透支额度"
            ],
            [
              "流水与账单",
              "记账、汇总出账",
              "扣费流水、账单"
            ]
          ]
        },
        {
          "type": "points",
          "items": [
            "上报量远大于扣费能力，而且有峰值 → 上报和扣费之间放 Kafka",
            "计价不保存状态，只读规则 → 可以横向扩容",
            "余额**只有余额服务能改**，其他组件要动钱只能发扣费请求",
            "账单面向展示，从流水汇总，允许分钟级延迟"
          ]
        },
        {
          "type": "problem",
          "title": "面试题",
          "question": "为什么不让业务服务同步调用计费扣费？",
          "approach": "从故障隔离、峰值、业务延迟三个角度回答",
          "answer": "同步调用会把计费的延迟和故障直接传导给业务：计费一慢，业务接口跟着慢；计费一挂，业务就停了。上报量还有明显峰值，同步链路要按峰值配资源。用 Kafka 异步化后，业务只负责可靠上报，计费按自己的节奏消费。"
        },
        {
          "type": "qa",
          "items": [
            {
              "q": "Kafka 会不会丢消息？",
              "a": "`acks=all`、3 副本、消费端处理完再提交 offset，做到至少一次投递；重复靠幂等去重（「用量采集」课细讲）。"
            },
            {
              "q": "异步了还怎么做到余额不足就停服？",
              "a": "平时扣费延迟在 1 秒以内，配合单账户透支额度；欠费控制会主动通知业务停服。"
            }
          ]
        },
        {
          "type": "quote",
          "title": "面试怎么讲",
          "text": "整体我拆成四段：业务上报用量事件进 Kafka，计价引擎消费并算出费用，余额服务扣费，账单服务出账。我先把数据流画出来，每段一句话，然后逐个组件讲接口和关键设计。"
        },
        {
          "type": "questions",
          "items": [
            {
              "q": "这四个组件就是四个服务吗？",
              "a": "不一定。这里按职责和数据归属拆的是逻辑组件；团队小的时候计价和余额可以先放在一个服务里，边界靠表和接口守住。"
            }
          ]
        }
      ]
    },
    {
      "id": "metering",
      "title": "组件：用量采集",
      "summary": "上报接口和事件格式、不丢不重；为什么用 Kafka",
      "status": "done",
      "mastered": false,
      "readings": [],
      "cards": [
        {
          "type": "points",
          "title": "职责",
          "items": [
            "收事件、校验格式、可靠写入 Kafka；**不计价、不碰余额**",
            "拥有原始用量事件：事件一旦接收就不能丢，后面所有的钱都从它算出来",
            "对业务侧只有一条承诺：返回 `202` 就代表这条用量已经持久化"
          ]
        },
        {
          "type": "problem",
          "title": "面试题",
          "question": "削峰和解耦分别指什么？计费系统为什么两个都需要？",
          "approach": "先分别给定义，再各举计费里的一个例子",
          "answer": "削峰是把瞬时高峰先存起来，按下游的处理能力慢慢消化——上报峰值是均值的 10 倍，扣费链路不用一直按峰值配资源。解耦是让上下游的故障和节奏互不影响——计费慢了或挂了，业务照常上报，事件在队列里等着。计费系统两个都需要：峰值靠削峰，可用性靠解耦。"
        },
        {
          "type": "code",
          "title": "上报接口与 Kafka 消息",
          "language": "http",
          "code": "POST /v1/usage/events\nContent-Type: application/json\n\n{\n  \"event_id\": \"evt-1001-20261103101502-7f3a\",\n  \"account_id\": 1001,\n  \"meter\": \"llm.output_tokens\",\n  \"quantity\": 1500,\n  \"occurred_at\": \"2026-11-03T10:15:02+08:00\"\n}\n\n202 Accepted                       已写入 Kafka（多副本确认后才返回）\n400 { \"code\": \"INVALID_EVENT\" }    字段缺失或 quantity <= 0，不要重试\n503 { \"code\": \"UNAVAILABLE\" }      Kafka 写入失败，SDK 退避重试\n\n写入 Kafka 的消息：\n  topic  usage-events（3 副本，acks=all，min.insync.replicas=2）\n  key    1001          account_id：同一账户进同一分区\n  value  上面的 JSON 原样，加上 \"received_at\""
        },
        {
          "type": "problem",
          "title": "面试题",
          "question": "上报接口要带哪些字段？`event_id` 为什么让业务方生成，而不是网关生成？",
          "approach": "先列字段和各自的用途，再讲 event_id 在哪里生成决定了能不能去重",
          "answer": "五个字段：`event_id` 用来去重，`account_id` 决定扣谁的钱，`meter` 和 `quantity` 是用量，`occurred_at` 决定用哪一版价格。`event_id` 必须在用量产生的那一刻由业务侧 SDK 生成：如果由网关生成，SDK 每重试一次就会拿到一个新 ID，重复事件就认不出来了。"
        },
        {
          "type": "points",
          "title": "关键设计",
          "items": [
            "**不丢**：网关等 Kafka `acks=all` 写成功才回 `202`，否则回 `503` 让 SDK 重试——语义是至少一次",
            "**不重**：网关不去重（保持无状态），`event_id` 一路带到流水表，由唯一键挡住重复",
            "**有序**：消息 key 用 `account_id`，同一账户的事件进同一分区、被串行消费，这是后面防超扣的基础"
          ]
        },
        {
          "type": "compare",
          "title": "选型：消息队列",
          "options": [
            {
              "name": "Kafka",
              "pros": [
                "吞吐高，分区内有序",
                "消息可回放：价格配错时能重新消费、重算"
              ],
              "cons": [
                "没有内置的重试和死信队列，要自己加 topic"
              ]
            },
            {
              "name": "RocketMQ",
              "pros": [
                "自带重试、死信队列和延迟消息"
              ],
              "cons": [
                "按时间回放和周边生态（流处理、对账工具）不如 Kafka"
              ]
            }
          ],
          "conclusion": "选 Kafka：计费最看重分区有序和可回放，重试和死信自己加一个 topic 就够。团队只有 RocketMQ 的运维经验、又不需要回放时，可以换。"
        },
        {
          "type": "qa",
          "title": "追问链：用量不丢不重",
          "items": [
            {
              "q": "① 网关返回 `202` 之前要做什么，才能说这条用量不会丢？",
              "a": "等 Kafka 确认写入：`acks=all`、3 副本、`min.insync.replicas=2`，至少两个副本落盘后才返回 `202`；写入失败返回 `503`，由 SDK 重试。"
            },
            {
              "q": "② SDK 重试会带来重复事件，在哪一层去重？",
              "a": "不在网关——网关要保持无状态。`event_id` 一路带到流水表，`(account_id, event_id)` 唯一键只允许落一条；中间每一跳都按「可能重复」来设计。"
            },
            {
              "q": "③ 那能不能直接用 Kafka 的恰好一次语义，省掉这些幂等设计？",
              "a": "不能。Kafka 的恰好一次只管 Kafka 内部：生产者重试去重、消费再生产的事务。扣 Redis、写 MySQL 是外部副作用，它管不到。端到端的恰好一次 = 至少一次投递 + 每一跳按 `event_id` 幂等。"
            }
          ]
        },
        {
          "type": "quote",
          "title": "面试怎么讲",
          "text": "用量采集只做一件事：把事件可靠地放进 Kafka。接口上我让业务方带一个自己生成的 event_id，网关等 Kafka 多副本确认后才返回成功，所以是至少一次；重复的事件不在这里处理，靠 event_id 在流水表的唯一键挡住。消息 key 用账户 ID，保证同一账户的事件有序。"
        },
        {
          "type": "questions",
          "items": [
            {
              "q": "业务服务自己宕机了，没来得及上报的用量怎么办？",
              "a": "SDK 先把事件写进本地缓冲再异步上报，重启后续传；连本地盘都丢了的极端情况，用业务自己的调用日志做 T+1 补报。"
            }
          ]
        }
      ]
    },
    {
      "id": "rating",
      "title": "组件：计价引擎",
      "summary": "规则表、按事件时间取版本；规则放配置中心还是数据库",
      "status": "done",
      "mastered": false,
      "readings": [],
      "cards": [
        {
          "type": "points",
          "title": "职责",
          "items": [
            "消费用量事件，按规则算出费用，向余额服务发扣费请求；**不保存状态、不碰余额**",
            "拥有价格规则：每条规则带版本号和生效时间",
            "同一条事件重算多少次，结果都相同——这样上游重复投递才安全"
          ]
        },
        {
          "type": "problem",
          "title": "面试题",
          "question": "计价和扣费为什么要拆成两个组件？",
          "approach": "从状态、扩容方式、谁能动钱三点对比",
          "answer": "计价不保存状态，只读规则，可以随便加实例；扣费有状态，同一账户必须串行，还直接动钱。拆开以后，计价可以按上报量扩容，扣费的并发控制不受影响；权限上也只有余额服务能改余额，计价算错了最多是发出一笔错的请求，可以追溯和纠正。"
        },
        {
          "type": "code",
          "title": "价格规则表",
          "language": "sql",
          "code": "CREATE TABLE price_rule (\n  id            BIGINT PRIMARY KEY AUTO_INCREMENT,\n  meter         VARCHAR(64) NOT NULL,   -- 计量项，如 llm.output_tokens\n  version       INT         NOT NULL,   -- 同一计量项内递增\n  unit          INT         NOT NULL,   -- 计价单位：每多少个\n  unit_price    BIGINT      NOT NULL,   -- 每单位价格，微元（1 元 = 1,000,000 微元）\n  effective_at  DATETIME    NOT NULL,   -- 生效时间，必须比发布时间晚 5 分钟以上\n  UNIQUE KEY uk_meter_version (meter, version),\n  KEY idx_meter_effective (meter, effective_at)\n);\n\n-- 按事件发生时间取规则：得到 v12，每 1000 个 12000 微元\nSELECT version, unit, unit_price FROM price_rule\nWHERE meter = 'llm.output_tokens' AND effective_at <= '2026-11-03 10:15:02'\nORDER BY effective_at DESC LIMIT 1;"
        },
        {
          "type": "problem",
          "title": "面试题",
          "question": "价格规则变了，已经算过的费用怎么办？规则表要怎么设计才支持？",
          "approach": "先说原则（按事件时间取版本），再说表上需要哪两个字段，最后说追溯调价怎么做",
          "answer": "规则表每行带版本号和生效时间，改价是插入新版本，不改旧行。计价时按**事件发生时间**取当时生效的版本，并把版本号写进流水，所以改价不影响已经算过的费用，延迟到达的事件也能算对。确实要追溯调价时，跑重算任务生成差额流水，不改历史记录。"
        },
        {
          "type": "points",
          "title": "关键设计",
          "items": [
            "按 `occurred_at` 取规则版本，版本号随扣费请求写进流水——每一笔钱都能回答「当时按哪一版算的」",
            "规则缓存在实例内存里，每 30 秒拉一次；规则必须提前 5 分钟发布，实例按 `effective_at` 判断是否生效，不依赖刷新时刻",
            "金额全程用整数微元：`1500 × 12000 ÷ 1000 = 18000` 微元；除不尽向上取整，不用浮点",
            "找不到规则的事件重试 3 次后转入死信队列，不能卡住整个分区（见「故障降级」）"
          ]
        },
        {
          "type": "compare",
          "title": "选型：规则放哪",
          "options": [
            {
              "name": "配置中心（Nacos / Apollo）",
              "pros": [
                "变更实时推送",
                "不用自己做缓存刷新"
              ],
              "cons": [
                "按时间取历史版本要自己拼",
                "审计和回溯能力弱"
              ]
            },
            {
              "name": "MySQL 规则表 + 本地缓存",
              "pros": [
                "版本和生效时间是一等字段，可审计、可回溯",
                "规则多了也能按条件查询"
              ],
              "cons": [
                "要自己做缓存刷新"
              ]
            }
          ],
          "conclusion": "选 MySQL 规则表 + 本地缓存：计价必须能回答每笔钱按哪一版算的。规则只有几条、也不需要回溯时，用配置中心更省事。"
        },
        {
          "type": "qa",
          "title": "追问链：规则版本",
          "items": [
            {
              "q": "① 计价时按哪个时间取规则？为什么？",
              "a": "按事件发生时间 `occurred_at`，不按处理时间。队列有堆积时，10:00 产生的用量可能 10:20 才被处理，按处理时间就会用错价格。"
            },
            {
              "q": "② 规则缓存在实例内存里，新规则 10:00 生效，某个实例 10:00:20 才刷到，这 20 秒会不会算错？",
              "a": "不会。规则要求提前至少 5 分钟发布，实例早就拿到了新版本，只是按 `effective_at` 判断它还没生效；到 10:00 各实例同时切换，不依赖刷新时刻。"
            },
            {
              "q": "③ 运营把价格配错了，已经按错的规则扣了一小时，怎么纠正？",
              "a": "不改历史流水。发布修正版本，用重算任务回放 Kafka 里那一小时的事件，对每笔算出差额，生成补扣或退款流水——这也是消息队列要选可回放的原因。"
            }
          ]
        },
        {
          "type": "quote",
          "title": "面试怎么讲",
          "text": "计价引擎不保存状态：消费事件，按事件发生时间取当时生效的规则版本，算出金额后发扣费请求。规则放在带版本号和生效时间的表里，改价只插入新版本；每笔流水都记着规则版本，所以改价不影响已经算过的钱。"
        }
      ]
    },
    {
      "id": "balance",
      "title": "组件：余额服务",
      "summary": "扣费接口、原子扣减防超扣；余额放 Redis 还是 MySQL",
      "status": "done",
      "mastered": false,
      "readings": [],
      "cards": [
        {
          "type": "points",
          "title": "职责",
          "items": [
            "**唯一能改余额的组件**：扣费、充值、欠费判断都在这里",
            "不算价格（只认计价引擎给的金额）、不出账单",
            "拥有余额、透支额度和账户状态；Redis 里是热副本，MySQL 的 `account` 表是持久化的那一份"
          ]
        },
        {
          "type": "problem",
          "title": "面试题",
          "question": "什么是超扣？根因是什么？",
          "approach": "先定义现象，再指出根因是「先读后写不原子」",
          "answer": "超扣是指余额只够扣一笔，却被并发的两笔都扣成功，余额变成负数。根因是「查余额」和「扣减」是两步：两个请求都读到余额 100，都判断够扣，然后各扣 80。解决方向只有两个：让同一账户的扣费排队，或者把检查和扣减做成一步原子操作。"
        },
        {
          "type": "code",
          "title": "扣费接口",
          "language": "http",
          "code": "POST /internal/v1/accounts/1001/charges\n{\n  \"event_id\": \"evt-1001-20261103101502-7f3a\",\n  \"amount\": 18000,\n  \"rule_version\": 12,\n  \"occurred_at\": \"2026-11-03T10:15:02+08:00\"\n}\n\n200 { \"ledger_id\": 880001, \"balance_after\": 49982000 }\n200 { \"ledger_id\": 880001, \"balance_after\": 49982000, \"duplicate\": true }   重复请求：返回第一次的结果\n402 { \"code\": \"INSUFFICIENT_BALANCE\", \"balance\": 5000 }                     余额 + 透支额度不够"
        },
        {
          "type": "problem",
          "title": "面试题",
          "question": "扣费接口要带哪些字段？同一个请求发了两次，第二次应该返回什么？",
          "approach": "字段按用途说；重复请求的关键是「返回第一次的结果」而不是报错",
          "answer": "要带 `event_id`（幂等键）、`amount`、`rule_version`（追溯用）和 `occurred_at`。同一个 `event_id` 第二次到达时不能再扣，也不能报错——调用方分不清「重复」和「失败」，就会一直重试。正确做法是返回第一次的结果：同样的流水号和扣完后的余额，带一个 `duplicate` 标记。"
        },
        {
          "type": "code",
          "title": "原子扣减（Redis Lua）",
          "language": "lua",
          "code": "-- KEYS[1] = bal:{1001}              余额（微元）\n-- KEYS[2] = chg:{1001}:<event_id>   这笔扣费的结果，保留 24 小时\n-- 两个 key 都用 {1001} 做 hash tag，保证落在同一个槽\n-- ARGV[1] = 扣费金额   ARGV[2] = 透支额度\nlocal done = redis.call('GET', KEYS[2])\nif done then return {1, tonumber(done)} end      -- 重复请求：返回上次扣完的余额\n\nlocal raw = redis.call('GET', KEYS[1])\nif not raw then return {3, 0} end                -- 余额不在缓存：从 MySQL 加载后重试\n\nif tonumber(raw) + tonumber(ARGV[2]) < tonumber(ARGV[1]) then\n  return {2, tonumber(raw)}                      -- 余额不足\nend\n\nlocal after = redis.call('DECRBY', KEYS[1], ARGV[1])\nredis.call('SET', KEYS[2], after, 'EX', 86400)\nreturn {0, after}"
        },
        {
          "type": "points",
          "title": "关键设计",
          "items": [
            "**防超扣**：检查余额和扣减写在一个 Lua 脚本里，Redis 单线程执行，中间插不进别的命令",
            "**幂等**：脚本先查 `chg:{账户}:<event_id>`，命中就直接返回上次的结果",
            "**两步写**：先在 Redis 扣减，再在 MySQL 一个事务里写流水、更新 `account.balance`；两步都成功才向计价引擎返回成功",
            "**欠费**：脚本返回余额不足时，欠费控制把账户置为停服并通知业务；充值到账后恢复"
          ]
        },
        {
          "type": "compare",
          "title": "选型：余额放哪",
          "options": [
            {
              "name": "只用 MySQL（行锁扣减）",
              "pros": [
                "余额和流水在一个事务里，天然一致",
                "少一套存储"
              ],
              "cons": [
                "每笔扣费都要抢行锁，热点账户排队",
                "余额不足的判断延迟随数据库负载波动"
              ]
            },
            {
              "name": "Redis 扣减 + MySQL 落账",
              "pros": [
                "检查和扣减在内存里完成，亚毫秒",
                "单线程执行脚本，原子性不用额外加锁"
              ],
              "cons": [
                "两处写入会短暂不一致，要靠幂等重试和对账兜底",
                "Redis 故障要有降级路径"
              ]
            }
          ],
          "conclusion": "选 Redis 扣减 + MySQL 落账：预付费要秒级发现余额不足，判断必须在内存里完成；MySQL 仍是账本。每秒只有几百笔时，只用 MySQL 行锁就够了，不必引入双写。"
        },
        {
          "type": "qa",
          "title": "追问链：防超扣",
          "items": [
            {
              "q": "① 两个扣费请求同时到达同一个账户，怎么保证不超扣？",
              "a": "检查余额和扣减放进一个 Lua 脚本，Redis 单线程执行，中间插不进别的命令。同一账户的事件还在同一个 Kafka 分区里串行消费，这是第一层。"
            },
            {
              "q": "② Redis 扣成功了，写流水之前服务崩了，怎么办？",
              "a": "计价引擎没收到成功就不提交 offset，Kafka 重投；Lua 里按 `event_id` 认出重复请求，不再扣，只把流水补上。"
            },
            {
              "q": "③ Redis 主从切换丢了最近一秒的扣减，余额比实际多了，怎么发现、怎么修？",
              "a": "MySQL 里的流水和余额是账本：对账任务比对两边，以 MySQL 为准覆盖 Redis；这期间多放行的金额由透支额度兜住。"
            }
          ]
        },
        {
          "type": "quote",
          "title": "面试怎么讲",
          "text": "余额服务是唯一能改余额的地方。防超扣我用两层：同一账户的事件在同一个 Kafka 分区里串行消费；Redis 里用一个 Lua 脚本把检查余额和扣减做成一步，并且按 event_id 做幂等。扣减成功后，在 MySQL 一个事务里写流水、更新余额，两步都成功才算扣完。"
        },
        {
          "type": "questions",
          "items": [
            {
              "q": "热点账户（比如一个大客户）会不会把一个分区打满？",
              "a": "会。可以把大客户拆成多个子账户分别扣费，汇总时再合并。"
            }
          ]
        }
      ]
    },
    {
      "id": "ledger",
      "title": "组件：流水与账单",
      "summary": "流水表、幂等键、汇总出账；单库分表还是分布式数据库",
      "status": "done",
      "mastered": false,
      "readings": [],
      "cards": [
        {
          "type": "points",
          "title": "职责",
          "items": [
            "流水表是账本：每一笔钱的变动一行，**只追加、不修改**",
            "流水由余额服务在扣费事务里写入；账单服务只读流水，按小时汇总出账",
            "余额表 `account` 和流水表按账户分在同一个库，才能用本地事务一起写"
          ]
        },
        {
          "type": "problem",
          "title": "面试题",
          "question": "流水和余额是什么关系？两边对不上的时候信哪个？",
          "approach": "一句话说清「谁是事实、谁是汇总」，再说对不上时怎么处理",
          "answer": "流水是事实，余额是流水累加出来的结果。对不上时信流水：按流水重算余额去覆盖，而不是反过来改流水。所以流水只追加不修改，纠错也是再追加一笔冲正流水。"
        },
        {
          "type": "code",
          "title": "流水表与扣费事务",
          "language": "sql",
          "code": "-- 按 account_id 哈希分 32 库；库内按事件日期分表（ledger_YYYYMMDD）\nCREATE TABLE ledger_20261103 (\n  id             BIGINT       PRIMARY KEY,   -- 全局唯一 ID\n  account_id     BIGINT       NOT NULL,\n  event_id       VARCHAR(64)  NOT NULL,      -- 幂等键\n  type           TINYINT      NOT NULL,      -- 1 扣费  2 充值  3 冲正\n  amount         BIGINT       NOT NULL,      -- 微元，扣费为负\n  balance_after  BIGINT       NOT NULL,\n  rule_version   INT          NULL,\n  occurred_at    DATETIME(3)  NOT NULL,      -- 事件发生时间，也是分表依据\n  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),\n  UNIQUE KEY uk_account_event (account_id, event_id),\n  KEY idx_account_time (account_id, occurred_at)\n);\n\nBEGIN;\nINSERT INTO ledger_20261103\n  (id, account_id, event_id, type, amount, balance_after, rule_version, occurred_at)\nVALUES\n  (880001, 1001, 'evt-1001-20261103101502-7f3a', 1, -18000, 49982000, 12, '2026-11-03 10:15:02.000');\nUPDATE account SET balance = balance - 18000 WHERE account_id = 1001;\nCOMMIT;   -- INSERT 报唯一键冲突：回滚，查出已有流水，按重复请求返回"
        },
        {
          "type": "problem",
          "title": "面试题",
          "question": "流水表的幂等键怎么选？为什么不能用自增 id？",
          "approach": "先说幂等键必须来自请求本身，再说唯一键怎么建",
          "answer": "幂等键必须是请求自带、重试时不变的值，这里就是 `event_id`。自增 id 是每次插入时新生成的，重复请求会得到两个不同的 id，挡不住重复。唯一键建在 `(account_id, event_id)` 上：带上 `account_id` 是因为它是分库键，唯一性只能在单个分片内保证。"
        },
        {
          "type": "points",
          "title": "关键设计",
          "items": [
            "**不重**：`(account_id, event_id)` 唯一键；重复插入失败后查出已有流水返回",
            "**分表不破坏幂等**：按 `occurred_at` 的日期分表——它是事件自带的，重试不会变，同一事件永远落在同一张表",
            "**只追加**：纠错写一笔 `type = 3` 的冲正流水，不 `UPDATE`、不 `DELETE`",
            "**出账可重跑**：账单按「账户 + 小时」汇总，重复执行是覆盖而不是累加；迟到的事件靠重跑前几个小时补上"
          ]
        },
        {
          "type": "code",
          "title": "按小时出账",
          "language": "sql",
          "code": "-- 每小时整点后执行；bill_hourly 以 (account_id, hour) 为唯一键，重跑即覆盖\nINSERT INTO bill_hourly (account_id, hour, total_amount, entry_count)\nSELECT account_id, '2026-11-03 10:00:00', -SUM(amount), COUNT(*)\nFROM ledger_20261103\nWHERE type = 1\n  AND occurred_at >= '2026-11-03 10:00:00' AND occurred_at < '2026-11-03 11:00:00'\nGROUP BY account_id\nON DUPLICATE KEY UPDATE total_amount = VALUES(total_amount), entry_count = VALUES(entry_count);"
        },
        {
          "type": "compare",
          "title": "选型：流水存哪",
          "options": [
            {
              "name": "MySQL 分库分表",
              "pros": [
                "团队熟悉，成本低",
                "流水只按账户读写，天然适合按账户分片",
                "余额和流水同库，本地事务就够"
              ],
              "cons": [
                "扩容要迁移数据",
                "跨账户的统计要走离线数仓"
              ]
            },
            {
              "name": "分布式数据库（如 TiDB）",
              "pros": [
                "扩容不用自己迁移数据",
                "跨账户查询方便"
              ],
              "cons": [
                "成本和运维门槛更高",
                "单笔写入延迟比单机 MySQL 高"
              ]
            }
          ],
          "conclusion": "选 MySQL 按账户分 32 库、按天分表：访问模式只有「按账户写入和查询」，用不到跨分片事务。需要频繁扩容，或要在线做跨账户分析时，再换分布式数据库。"
        },
        {
          "type": "qa",
          "title": "追问链：流水不重不漏",
          "items": [
            {
              "q": "① Kafka 重复投递同一条事件，怎么保证只记一笔？",
              "a": "`(account_id, event_id)` 唯一键。第二次插入报冲突，事务回滚，查出第一次的流水按重复请求返回。"
            },
            {
              "q": "② 按天分表以后，同一事件的重试跨了零点，会不会在两张表里各落一条？",
              "a": "不会。分表用的是事件自带的 `occurred_at`，不是写入时间；重试时它不变，所以同一事件永远路由到同一张表，唯一键仍然有效。"
            },
            {
              "q": "③ 不重有唯一键保证，那不漏呢？你怎么证明一条都没漏？",
              "a": "对账。每小时比较三个数：网关写入 Kafka 的事件数、流水条数、死信队列里的条数，前者应等于后两者之和；不相等就按 `event_id` 找出差的那几条重放。"
            }
          ]
        },
        {
          "type": "quote",
          "title": "面试怎么讲",
          "text": "流水是账本，只追加不修改。每笔扣费在一个事务里插入流水、更新余额，幂等靠 account_id 加 event_id 的唯一键。数据按账户分库、按事件日期分表，所以重试不会落到别的表。账单从流水按小时汇总，可以重跑。"
        }
      ]
    },
    {
      "id": "core-flow",
      "title": "核心链路：一次扣费",
      "summary": "一条用量事件从上报到出账，每一跳的报文和落库数据",
      "status": "done",
      "mastered": false,
      "readings": [],
      "cards": [
        {
          "type": "steps",
          "title": "一次扣费的 8 跳（编号与架构图一致）",
          "items": [
            "**业务服务**：账户 1001 的一次调用输出了 1500 个 token，SDK 生成 `event_id` 并上报",
            "**上报网关**：校验通过，写入 Kafka，等多副本确认后返回 `202`",
            "**Kafka**：key 是 1001，落在分区 17、offset 5820311",
            "**计价引擎**：按 10:15:02 取到规则 v12，算出 18000 微元，发扣费请求",
            "**余额服务**：先执行 Lua 脚本，成功后开事务落账",
            "**Redis**：余额从 50000000 扣到 49982000，并记下这个 `event_id` 的结果",
            "**MySQL**：流水表多一行，`account.balance` 同步减少；余额服务返回 `200`，计价引擎提交 offset",
            "**账单服务**：11:00 汇总 10 点这一小时，账户 1001 的账单加上 18000 微元"
          ]
        },
        {
          "type": "code",
          "title": "这条事件在每一跳的数据",
          "language": "text",
          "code": "1 业务服务 → 网关   POST /v1/usage/events\n                    {\"event_id\":\"evt-1001-20261103101502-7f3a\",\"account_id\":1001,\n                     \"meter\":\"llm.output_tokens\",\"quantity\":1500,\n                     \"occurred_at\":\"2026-11-03T10:15:02+08:00\"}\n2 网关 → Kafka      topic=usage-events  key=1001   多副本确认后回 202\n3 Kafka             分区 17  offset 5820311\n4 计价引擎          规则 llm.output_tokens v12：每 1000 个 12000 微元\n                    1500 × 12000 ÷ 1000 = 18000 微元（0.018 元）\n5 → 余额服务        POST /internal/v1/accounts/1001/charges\n                    {\"event_id\":\"evt-1001-20261103101502-7f3a\",\"amount\":18000,\n                     \"rule_version\":12,\"occurred_at\":\"2026-11-03T10:15:02+08:00\"}\n6 Redis             bal:{1001}   50000000 → 49982000\n                    chg:{1001}:evt-1001-20261103101502-7f3a = 49982000（24 小时后过期）\n7 MySQL             ledger_20261103 新增一行：\n                    id=880001 account_id=1001 type=1 amount=-18000\n                    balance_after=49982000 rule_version=12\n                    account.balance  50000000 → 49982000\n                    → 200 {\"ledger_id\":880001,\"balance_after\":49982000} → 提交 offset 5820311\n8 账单服务          bill_hourly(account_id=1001, hour=10:00)  total_amount += 18000"
        },
        {
          "type": "problem",
          "title": "面试题",
          "question": "从上报到出账，哪一步完成后这条用量就「不会丢」了？哪一步完成后才算「扣完了」？",
          "approach": "分别指出两个持久化点，再说两点之间失败了靠什么恢复",
          "answer": "第 2 跳 Kafka 多副本确认之后就不会丢了——事件已经持久化，后面任何一步失败都可以重新消费。第 7 跳 MySQL 事务提交之后才算扣完——流水是账本。这两点之间，Redis 可能已经扣了、流水还没写，靠的是计价引擎不提交 offset、Kafka 重投，以及 Lua 脚本和流水表各自按 `event_id` 幂等。"
        },
        {
          "type": "steps",
          "title": "故障重走：第 6 跳之后余额服务崩溃",
          "items": [
            "计价引擎没收到 `200`，不提交 offset；Kafka 从 5820311 重新投递",
            "计价引擎重算：同一事件、同一规则版本，仍是 18000 微元",
            "Lua 脚本命中 `chg:{1001}:evt-…`，返回上次的 49982000，**不再扣减**",
            "MySQL 事务这次成功，流水落库，提交 offset——Redis 和 MySQL 重新一致"
          ]
        },
        {
          "type": "points",
          "items": [
            "整条链路是**至少一次投递 + 每一跳幂等**：网关可重试、计价可重算、Lua 脚本和流水表各自去重",
            "两个持久化点：Kafka 确认之后不丢，MySQL 提交之后才算扣完",
            "每个组件只做一件事，前一跳的输出就是后一跳的输入——讲的时候带着同一条事件走到底"
          ]
        },
        {
          "type": "qa",
          "items": [
            {
              "q": "这条链路正常情况下要多久？",
              "a": "几十毫秒：时间主要花在 Kafka 攒批和 MySQL 事务上；计价读本地缓存、Lua 脚本都在 1 毫秒以内。目标是平时 1 秒内扣完。"
            }
          ]
        },
        {
          "type": "quote",
          "title": "面试怎么讲",
          "text": "我用一条具体的事件走一遍：账户 1001 用了 1500 个 token，SDK 带着 event_id 上报，网关写进 Kafka 后返回成功；计价引擎按事件时间取到规则版本，算出金额，调余额服务；余额服务先在 Redis 里原子扣减，再在 MySQL 一个事务里写流水、更新余额，成功后才提交 offset；账单每小时从流水汇总。中间任何一步失败，都靠重投加幂等恢复。"
        }
      ]
    },
    {
      "id": "degradation",
      "title": "故障降级",
      "summary": "每个依赖都问一句「它挂了怎么办」，给出降级路径",
      "status": "done",
      "mastered": false,
      "readings": [],
      "cards": [
        {
          "type": "steps",
          "title": "逐个依赖过一遍",
          "items": [
            "Kafka 不可用：网关返回 `503`，SDK 写本地缓冲、退避重试，恢复后补报",
            "计价失败（找不到规则、数据非法）：重试 3 次后转入死信队列，不卡住分区；修好规则后从死信重放",
            "Redis 不可用：改走 MySQL 行锁扣减，并限流到数据库扛得住的速度，其余事件在 Kafka 里排队",
            "MySQL 主库故障：主从切换期间扣费请求失败，计价引擎不提交 offset，事件留在 Kafka，恢复后追平"
          ]
        },
        {
          "type": "code",
          "title": "Redis 降级时的扣费事务",
          "language": "sql",
          "code": "BEGIN;\nUPDATE account SET balance = balance - 18000\nWHERE account_id = 1001 AND balance + overdraft_limit >= 18000;   -- 影响 0 行：余额不足，回滚\nSELECT balance FROM account WHERE account_id = 1001;               -- 得到 balance_after\nINSERT INTO ledger_20261103\n  (id, account_id, event_id, type, amount, balance_after, rule_version, occurred_at)\nVALUES\n  (880001, 1001, 'evt-1001-20261103101502-7f3a', 1, -18000, 49982000, 12, '2026-11-03 10:15:02.000');\nCOMMIT;                                                            -- 唯一键冲突：回滚，按重复请求返回"
        },
        {
          "type": "problem",
          "title": "面试题",
          "question": "Redis 整个不可用了，扣费链路怎么办？",
          "approach": "先说原则，再说降级动作和代价，最后说怎么切回来",
          "answer": "原则是钱不能错，实时性可以让步。余额服务熔断 Redis，改用 MySQL 行锁扣减：一条 `UPDATE` 带上余额条件，和写流水放在同一个事务里，所以仍然不会超扣、不会重复。代价是吞吐下降，所以同时限流，多出来的事件留在 Kafka 里排队。Redis 恢复后，用 MySQL 里的余额重建缓存，再切回去。"
        },
        {
          "type": "points",
          "items": [
            "原则：**用量不能丢、钱不能算错，实时性可以让步**",
            "死信队列要有重放工具和堆积告警，不能只进不出",
            "Redis 恢复后，用 `account.balance` 重建缓存里的余额，再切回 Lua 路径"
          ]
        },
        {
          "type": "qa",
          "items": [
            {
              "q": "降级期间扣费变慢，余额不足的账户会不会多用很久？",
              "a": "会多用一段时间，敞口由单账户透支额度封顶；这比整体停服的损失小得多。"
            }
          ]
        },
        {
          "type": "quote",
          "title": "面试怎么讲",
          "text": "我按依赖逐个过：Kafka 挂、Redis 挂、数据库挂，分别说影响面和降级方式。核心原则是用量不能丢、钱不能算错，实时性可以暂时让步。"
        }
      ]
    },
    {
      "id": "traffic",
      "title": "突发流量",
      "summary": "入口限流、队列预留分区、消费端批量处理，三层吸收峰值",
      "optional": true,
      "status": "done",
      "mastered": false,
      "readings": [],
      "cards": [
        {
          "type": "points",
          "items": [
            "入口：网关令牌桶限流 2 万/s，超限返回 `429`，SDK 写入本地缓冲后退避重试——**只延迟不丢弃**",
            "队列：分区数是消费并行度的上限。单分区串行约 500 笔/s，峰值 2 万/s 至少要 40 个分区，取 64",
            "消费端：一次拉一批，流水用一条多行 `INSERT` 批量落库，单分区吞吐还能再提高几倍"
          ]
        },
        {
          "type": "problem",
          "title": "面试题",
          "question": "大促时上报量涨到平时峰值的 10 倍，你怎么扛？",
          "approach": "按入口 → 队列 → 消费三层说，每层一个手段和一个数字",
          "answer": "入口用令牌桶限流，超出的部分返回 429，SDK 写进本地缓冲后退避重试，只延迟不丢。Kafka 的分区按峰值提前预留到 64 个，消费者跟着扩。消费端一次拉一批，流水用多行 INSERT 批量落库。这样峰值主要被队列吸收，扣费只是延迟变大，这段延迟里的风险由透支额度兜住。"
        },
        {
          "type": "qa",
          "items": [
            {
              "q": "被限流的用量还计费吗？",
              "a": "要计，不能丢只能延迟：SDK 本地缓冲后重试上报，事件带着同一个 `event_id`，重复了也会被去重。"
            },
            {
              "q": "高峰期能不能临时扩分区？",
              "a": "不建议。扩分区后同一个 key 可能落到新分区，而旧分区里还有它没消费完的事件，同一账户的顺序就乱了。分区按峰值提前预留，扩容放在低峰做。"
            }
          ]
        },
        {
          "type": "quote",
          "title": "面试怎么讲",
          "text": "峰值从哪来？大促、批任务补报、客户端重试风暴。我在入口、队列、消费端三个位置吸收它：入口限流但不丢，队列按峰值预留分区，消费端批量处理。"
        }
      ]
    },
    {
      "id": "consistency",
      "title": "一致性与对账",
      "summary": "扣费链路选最终一致，流水是账本，用对账和自动冲正兜底",
      "status": "done",
      "mastered": false,
      "readings": [],
      "cards": [
        {
          "type": "points",
          "items": [
            "MySQL 里的**流水是账本**；`account.balance` 和 Redis 余额都是它的汇总，可以重建",
            "准实时对账：每分钟取有变动的账户，比较 Redis 余额和 `account.balance`；差异持续超过 1 分钟，以 MySQL 为准覆盖 Redis",
            "T+1 全量对账：流水合计、余额变动、账单合计三方核对",
            "差异生成冲正流水自动修复；超过阈值告警、人工介入"
          ]
        },
        {
          "type": "code",
          "title": "T+1 对账：流水合计 vs 账单合计",
          "language": "sql",
          "code": "SELECT l.account_id, l.ledger_total, b.bill_total\nFROM (SELECT account_id, -SUM(amount) AS ledger_total\n      FROM ledger_20261103 WHERE type = 1 GROUP BY account_id) l\nJOIN (SELECT account_id, SUM(total_amount) AS bill_total\n      FROM bill_hourly\n      WHERE hour >= '2026-11-03 00:00:00' AND hour < '2026-11-04 00:00:00'\n      GROUP BY account_id) b USING (account_id)\nWHERE l.ledger_total <> b.bill_total;   -- 查出结果 = 有差异"
        },
        {
          "type": "problem",
          "title": "面试题",
          "question": "CAP 里你选了什么？",
          "approach": "不要只答字母，说清楚哪条链路选什么、靠什么兜底",
          "answer": "扣费链路选可用性加最终一致：Redis 先扣减，MySQL 随后落账，两边短暂不一致靠幂等重试和对账收敛。余额查询和充值走 MySQL 主库，保证用户看到的是准确值。"
        },
        {
          "type": "qa",
          "title": "追问链：对账",
          "items": [
            {
              "q": "① 对账发现 Redis 的余额比 MySQL 少，怎么处理？",
              "a": "多半是 Redis 扣了、MySQL 还没落账。先等 1 分钟让重试补齐；仍不一致就以 MySQL 为准覆盖 Redis，并记下 `event_id` 排查原因。"
            },
            {
              "q": "② 反过来，Redis 比 MySQL 多呢？",
              "a": "典型原因是 Redis 主从切换丢了最近的写入。同样以 MySQL 为准覆盖；这期间可能多放行了一些用量，由透支额度封顶。"
            },
            {
              "q": "③ 对账任务自己出错，把对的余额改错了怎么办？",
              "a": "对账只做两件事：覆盖 Redis（可以再覆盖回来）和追加冲正流水（不改历史）。每次修复都带对账批次号，出错时按批次号再冲正一次就能回滚；单批修复金额超过阈值就停下来，等人工确认。"
            }
          ]
        },
        {
          "type": "quote",
          "title": "面试怎么讲",
          "text": "可用性和准确性冲突时，我先保证不停服，再用对账保证最终准确：流水是唯一事实来源，Redis 余额随时可以按 MySQL 重建。"
        }
      ]
    },
    {
      "id": "observability",
      "title": "可观测性",
      "summary": "扣费延迟、对账差异率、死信堆积三类核心指标",
      "optional": true,
      "status": "skipped",
      "mastered": false,
      "readings": [],
      "cards": []
    },
    {
      "id": "pitch",
      "title": "面试串讲",
      "summary": "把前面的课串成一条 10 分钟的讲述路线",
      "status": "current",
      "mastered": false,
      "readings": [],
      "cards": [
        {
          "type": "steps",
          "title": "10 分钟路线",
          "items": [
            "概念与需求（1 分钟）：四个动作、预付费、三组数字",
            "整体架构（1 分钟）：采集 → 计价 → 扣费 → 出账，为什么用 Kafka 解耦",
            "逐个组件（4 分钟）：每个组件一句职责、一个接口或一张表、一个关键设计",
            "一次扣费（2 分钟）：带着一条事件走完 8 跳，点出两个持久化点",
            "故障与一致性（1 分钟）：逐个依赖降级，流水是账本、对账兜底",
            "留钩子等追问（1 分钟）"
          ]
        },
        {
          "type": "quote",
          "title": "开场白",
          "text": "我先花一分钟确认需求和量级，然后画出整体架构，接着逐个讲四个组件的接口和关键设计，再用一次扣费把它们串起来，最后讲故障和一致性怎么兜底。"
        },
        {
          "type": "note",
          "title": "正在讲",
          "text": "下一步：常见追问与应对。讲完后可以让我扮演面试官，按这条路线追问一轮。"
        }
      ]
    }
  ]
};
