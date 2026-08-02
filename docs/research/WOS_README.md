# Web Novel OS v2

**自适应长篇小说生产系统** — 从 3 万字短篇到 200 万字超长篇，从言情到玄幻，全自动适配。

> 用户只需输入 idea、类型、字数、平台，系统自动识别项目画像，生成生产策略，路由所需 Agent，按批次写作并校验。

---

## 核心特性

### 🧠 自适应策略引擎（v2 新增）

系统**不套固定模板**。每个项目先生成专属的「项目画像」和「生产策略」：

```
用户 idea + 目标字数 + 类型 + 平台
        ↓
ProjectProfilerAgent    → Project_Profile.yaml
        ↓
ProductionStrategyAgent → Production_Strategy.yaml
（合并长度模板 + 题材模板 + 平台模板）
        ↓
系统知道：每批写几章 / 几章复盘 / 需要哪些账本 / 激活哪些 Agent
```

| 输入 | 自动判断结果 |
|------|------------|
| 3万字悬疑 | short_30k · full_preplan章卡 · 激活 CaseLogicAgent |
| 10万字言情 | novella_100k · full_preplan · 激活 RomanceArcAgent |
| 30万字仙侠 | volume_200k · full_preplan · 激活 PowerSystemAgent + FactionAgent |
| 100万字玄幻 | long_1m · rolling_window章卡 · 每100章认知反转检查 |

---

### 📏 长度自适应（6个长度级别）

```
short_30k     0–5万字    单弧·全预规划·无世界观账本
novella_100k  5–15万字   三幕·全预规划·基础账本
volume_200k   15–30万字  五幕·全预规划·完整账本
medium_500k   30–80万字  多卷·hybrid章卡·每50章复盘
long_1m       80–150万字 连载·rolling_window·每100章认知反转
epic_2m       150万+      史诗·rolling_window·需人工复审
```

---

### 🎭 题材自适应（12种类型）

每种题材有专属**质量门**和**必需账本**：

| 题材 | 专属账本 | 专属质量门 |
|------|---------|-----------|
| 玄幻升级 | Power_System_Ledger · Upgrade_Ledger | check_power_scaling |
| 悬疑推理 | Case_Ledger · Clue_Ledger · Reveal_Map | check_clue_fairness |
| 古代种田 | Resource_Ledger | check_resource_logic |
| 宫斗权谋 | Faction_Ledger · Alliance_Map | check_faction_motivation |
| 言情 | Relationship_Arc_Ledger · Emotional_Beat_Map | check_emotional_progression |
| 无限流 | Instance_Ledger · Rule_Ledger | check_instance_rule_consistency |

---

### 🏭 通用生产引擎（`produce` 命令）

替代原来固定的 volume_001 + chapters 阶段：

```bash
python runner.py produce        # 写一批（按策略配置）
python runner.py produce --loop # 持续循环到目标章节
```

**硬约束（不可绕过）：**
- 缺章卡 → 直接阻断，不用空卡继续
- 质量门 hard_fail → 生成 Rewrite_Request.md，流程停止
- Canon 矛盾 → 生成修复计划，流程停止

**每批自动执行：**
- 章节写作
- Canon Delta 提取（新人物/地点自动入账）
- Promise-Payoff Patch 更新（增量，不覆盖）
- 四层质量门（通用 + 长度 + 题材 + 平台）
- 结构复盘（达到间隔时）
- 快照

---

### 🔒 Promise-Payoff Schema（承诺-回报防破坏机制）

LLM **只能输出 patch**，不能整表覆盖：

```yaml
add_promises:    [...]   # 新增
update_promises: [...]   # 修改状态
close_promises:  [...]   # 关闭回收
```

每次写入前 schema 校验 → ID 唯一性检查 → merge → 生成 diff 报告。

---

### 🗂️ 账本注册表（按题材自动初始化）

```bash
python runner.py strategy  # 自动初始化项目所需账本
```

不存在则创建，已存在不覆盖，不需要的账本不创建。

---

### 🎬 Novel Studio（可视化工作台）

```bash
python start_studio.py
# → http://localhost:8765
```

**7个页面：**
1. 首页 — 任务入口
2. 对话引导 — 6轮问答收集创意（选择卡片而非填表）
3. 方案候选 — 生成3个不同风向方案供选择
4. 写作页 — 章节卡片 + 正文 + 重写工具
5. 项目管理 — 进度追踪
6. 健康度面板 — 水章/承诺/钩子实时状态
7. 沙盒历史 — 所有生成结果存沙盒，点采纳才进项目

**沙盒机制（生成不污染正式项目）：**
```
生成结果 → session/generated/ → 用户点采纳 → project_repo/
```

---

### 🤖 14个专业 Agent + 3个新 v2 Agent

| Agent | 职责 |
|-------|------|
| **ProjectProfilerAgent** | 项目画像识别 |
| **ProductionStrategyAgent** | 三模板合成生产策略 |
| **AgentRouter** | 按策略路由 Agent 实例 |
| ShowrunnerAgent | 总编剧，全局方向 |
| PlotArchitectAgent | 总纲/分卷纲/章纲 |
| CharacterKeeperAgent | 人设维护+弧线追踪 |
| WorldbuildingKeeperAgent | 世界观+正典维护 |
| PowerSystemDesignerAgent | 战力体系（玄幻/仙侠专用） |
| ChapterWriterAgent | 正文生成（按 ChapterCard） |
| DialogueAgent | 对白优化 |
| PacingDoctorAgent | 节奏诊断+水章检测 |
| PromisePayoffValidatorAgent | 承诺-回报追踪（patch机制） |
| ContinuityCheckerAgent | 时间线/道具/关系连续性 |
| StyleKeeperAgent | 文风统一性 |
| CommercialHookAgent | 书名/简介/标签 |
| RedTeamReviewerAgent | 毒舌读者视角 |
| InteractiveDirectorAgent | 创意对话引导 |

---

## 快速开始

### 命令行模式（v2 工作流）

```bash
# 1. 安装
pip install -r requirements.txt
cp .env.example .env   # 填入 ANTHROPIC_API_KEY

# 2. 填写创意
vim project_repo/outlines/00_core_idea.md

# 3. 配置
vim novel_config.yaml  # 设置 title / target_word_count / genre / platform

# 4. 执行 v2 流程
python runner.py init        # 初始化
python runner.py profile     # 生成项目画像
python runner.py strategy    # 生成生产策略 + 初始化账本
python runner.py run --stage bible    # 故事圣经
python runner.py run --stage outline  # 总纲
python runner.py cards       # 生成章节卡片（按策略模式）
python runner.py produce --loop      # 持续写作到完成
python runner.py export      # 导出

# 随时校验
python runner.py check
python runner.py status
python runner.py cost        # 查看 API 费用
```

### Studio 模式（推荐新手）

```bash
pip install fastapi uvicorn[standard] python-multipart
python start_studio.py
# 浏览器打开 http://localhost:8765
```

---

## 目录结构

```
Web_Novel_OS/
├── runner.py                    # CLI 主入口（11条命令）
├── start_studio.py              # Studio 启动脚本
├── novel_config.yaml            # 项目配置
├── system_prompt.md             # 系统主提示词
├── HOW_IT_WORKS.md              # 执行演示文档
│
├── agents/                      # 17个专业 Agent
│   ├── project_profiler.py      # ★ v2 新增
│   ├── production_strategy_agent.py  # ★ v2 新增
│   ├── agent_router.py          # ★ v2 新增
│   └── ...（14个原有 Agent）
│
├── schemas/                     # 数据模型层
│   ├── project_profile.py       # ★ v2 新增
│   ├── production_strategy.py   # ★ v2 新增
│   ├── chapter_card_schema.py
│   ├── promise_schema.py        # patch + merge 机制
│   └── state_schema.py
│
├── tools/                       # 工具层（15个工具）
│   ├── adaptive_quality_gate.py # ★ v2 新增（四层质量门）
│   ├── ledger_registry.py       # ★ v2 新增（账本注册表）
│   ├── produce_engine.py        # ★ v2 新增（通用生产引擎）
│   └── ...（12个原有工具）
│
├── llm/                         # LLM 抽象层
│   ├── anthropic_client.py      # 重试 + 成本统计
│   └── base.py                  # 可扩展其他 provider
│
├── novel_studio/                # Web 工作台
│   ├── app.py                   # FastAPI（26条路由）
│   ├── sandbox.py               # 沙盒管理
│   ├── generation.py            # 后台任务执行
│   └── static/                  # HTML + CSS + JS
│
├── templates/
│   ├── length_profiles/         # ★ v2 新增（6种）
│   ├── platform_profiles/       # ★ v2 新增（5种）
│   ├── genre_profiles/          # 扩展到12种
│   ├── beat_sheets/             # 5种节奏模板
│   └── micro_templates/         # 9种场景小范本
│
└── project_repo/                # 小说唯一真源
    ├── manifests/               # ★ v2 新增
    │   ├── Project_Profile.yaml
    │   └── Production_Strategy.yaml
    ├── canon/                   # 正典账本
    ├── continuity/              # 连续性追踪
    ├── outlines/                # 大纲层级
    ├── manuscript/              # 正文
    └── style/                   # 风格指南
```

---

## 模型与费用

默认使用 `claude-opus-4-5`。可在 `novel_config.yaml` 修改：

```yaml
model:
  name: "claude-opus-4-5"    # 质量最高
  # name: "claude-sonnet-4-5"  # 费用约 1/5，速度更快
```

| 规模 | 约调用次数 | claude-opus-4-5 | claude-sonnet-4-5 |
|------|-----------|-----------------|-------------------|
| 3万字短篇 | ~40 | ~$0.80 | ~$0.15 |
| 30万字网文 | ~180 | ~$4.50 | ~$0.90 |
| 100万字长篇 | ~550 | ~$14 | ~$2.80 |

---

## 要求

- Python 3.10+
- Anthropic API Key（[获取](https://console.anthropic.com/)）
- 磁盘空间：正文 + 运行记录，100万字项目约 500MB

---

## License

MIT
