<div align="center">

<img src="assets/logo.svg" width="112" height="112" alt="NINGLET Logo">

# NINGLET

**让 AI 写小说，但读者闻不出 AI 味。**

跑在 DeepSeek Harness 上的小说创作插件 —— 专门写小说，也专门把「AI 味」挡在正文之外。

[是什么](#是什么) · [特性](#特性) · [快速开始](#快速开始) · [技能](#技能) · [架构](#架构) · [项目结构](#项目结构) · [借鉴与致谢](#借鉴与致谢)

</div>

---

## 是什么

NINGLET 是 DeepSeek Harness 生态里的一个**小说创作插件**。它不是「输入大纲、吐正文」的黑盒，而是一条可控的生产线：

> 建书 → 写章（规划 → 编排 → 写作 → 反 AI 味审计 → 修订 → 结算）→ 落盘 → 章节面板回看。

它由四部分组成：**预设**（agent.cordis.yml）、**技能**（5 个 SKILL.md）、**插件**（Host 领域工具 + Client 章节面板）、**纯函数核心**（可独立测试的反 AI 味引擎 / 状态校验 / 字数 / bookId）。

## 特性

- **反 AI 味引擎**：12 维确定性检测（50+ 禁用词、模板禁用词、AI 过渡词、的字密度、句长方差、段落等长、排比三连、段尾抒情、对话标签重复、套话密度、公式化转折、列表式结构）+ 4 阶段重写（定点清除→结构修复→风格改写→人味注入）。检测发现任何问题全自动走全 4 阶段。
- **伏笔生命周期**：完整 HookRecord（open→progressing→deferred→resolved），半衰期自动推导（immediate=10章 / mid-arc=30 / endgame=80），stale 过期检测 + blocked 因果链受阻检测，观察者自动抽取并合并（状态不可回退）。
- **结构化状态树**：currentState 事实表（位置/主角状态/目标/冲突）、结构化章节摘要（events/stateChanges/hookActivity/mood/chapterType）、Markdown 人类可读投影（current_state.md / pending_hooks.md / chapter_summaries.md）。
- **控制面文档**：author_intent.md（长期意图）+ current_focus.md（近期关注，含过期/受阻伏笔警告）+ book_rules.md（通用 25 条 + 题材专属规则，可编辑）。建书时自动生成，写章后自动刷新。
- **题材规则体系**：通用 25 条创作规则 + 6 大题材专属规则（玄幻/都市/悬疑/言情/科幻/历史），写章时注入 writer prompt。
- **苏格拉底规划**：写章前若没给意图，先追问「核心推进 / 主角状态 / 结尾钩子」三问。
- **章回大纲**：建书时给创作简报，自动生成 8-12 章大纲。
- **结构树 + 画布**：右下角「小说」面板——结构视图（大纲/章节/角色/伏笔）+ 画布视图（章节节点连线）。
- **结构化状态**：每本书的状态是校验后的 JSON（`story/state/state.json`），坏数据拒绝写入。

## 快速开始

```bash
# 1. 纯函数核心单测
node --test          # 99 个测试，全绿

# 2. 在 DeepSeek Harness 里加载（当前用动态插件 ning-1/pkg-4 运行中）
#    - Host 工具：plugins/host-novel.js 作为 code.host
#    - Client 面板：plugins/client-novel-ui.js 作为 code.client
#    通过 cordis_define / cordis_run 定义并激活

# 3. 在对话里说
#    「创建一本都市修仙小说《吞天魔帝》」
#    「写下一章，重点写师徒矛盾」
```

状态落盘在**会话工作区**的 `novels/<bookId>/` 下：
- `story/state/state.json`（权威状态，含 book/chapters/summaries/hooks/characters/currentState/outline）
- `chapters/NNN.md`（正文）
- `story/current_state.md` / `pending_hooks.md` / `chapter_summaries.md`（Markdown 投影，人类可读）
- `story/author_intent.md` / `current_focus.md` / `book_rules.md`（控制面文档）
- `story/runtime/chapter-NNN.intent.md`（每章意图存档）

## 技能

NINGLET 把「写小说」拆成 5 个可被 DeepSeek Harness 直接调用的技能：

| 技能 | 作用 |
|---|---|
| `anti-ai-flavor` | 反 AI 味规则：16 个禁用词、量化指标、Show-Don't-Tell |
| `longform-writing` | 长篇章节生产 + 钩子 / 节奏 / 水章诊断 |
| `novel-qa` | 10 维一致性审查 + AI 味评分（0-100）|
| `novel-outline-researcher` | 大纲调研：先读、先问、再给 |
| `novel-style-reference` | 叙事风格库：学习 / 引用 |

## 架构

```
┌──────────────────────────────────────────────┐
│  预设 preset/agent.cordis.yml                 │  ← 工具行 + （待固化）UI 行 / 提示词行
├──────────────────────────────────────────────┤
│  技能 skills/  （5 个 SKILL.md）              │  ← 反AI味 + 写作 + 审查 + 调研 + 风格
│  插件 plugins/ （host-novel.js / client）     │  ← Host 领域工具 + Client 章节面板
│  纯函数 src/   （可独立测试）                  │  ← 反AI味引擎(12维) / 伏笔生命周期 / 状态投影 / 控制文档 / 状态 schema / 字数 / bookId
└──────────────────────────────────────────────┘
```

## 项目结构

```
NINGLET-dsh/
├── docs/               # PRD、实现计划、设计系统、research 资产库
├── src/                # 纯函数核心（可测试）
│   ├── anti-ai-engine.js     # 12 维反 AI 味检测 + 4 阶段重写规则
│   ├── hook-lifecycle.js      # 伏笔生命周期（stale/blocked/合并/健康度）
│   ├── state-projection.js    # 结构化状态 + Markdown 投影生成器
│   └── control-docs.js        # 控制面文档 + 题材规则体系
├── tests/              # node --test 单测（99 个）
├── skills/             # 5 个技能包
├── plugins/            # 动态插件源码
├── preset/             # 预设组合
├── harness-packages/   # 待构建的 DSH 包源码
└── assets/             # logo 等静态资产
```

## 借鉴与致谢

- [inkos](https://github.com/Narcooo/inkos) —— 架构参考：三层记忆、状态结算、输入治理、流水线阶段
- [ConardLi/garden-skills](https://github.com/ConardLi/garden-skills) —— 前端设计方法论（`web-design-engineer`）
- kealin-AI-novels —— 反 AI 味引擎移植蓝本

## License

MIT
