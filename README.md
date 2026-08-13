# NINGLET

> 让 AI 写小说，但读者闻不出 AI 味。
> **Write with AI. Zero AI trace.**

NINGLET 是一个**聚焦「反 AI 味」的小说创作 Agent**，跑在 DeepSeek Harness 之上。它把「长篇/短篇小说创作」拆成一条可控的生产线：建书 → 写章（规划→编排→写作→反AI味审计→修订→结算）→ 状态落盘 → 章节面板回看，并把「去 AI 味」从文字贯彻到界面。

---

## 特性

- **反 AI 味引擎**：确定性检测（禁用词表、`的`字密度、句长方差）+ 生成时注入规则 + 落盘前最多一次自动重写。
- **结构化状态**：每本书的状态是校验后的 JSON（`story/state/state.json`），正文是 Markdown（`chapters/NNN.md`），坏数据拒绝写入、不滚雪球。
- **会话内工作台**：对话即工作台，右下角「章节」浮层面板可列出/阅读所有章节。
- **安静编辑部 UI**：写作优先的界面（见 [`docs/design-system.md`](docs/design-system.md)），连 UI 都去 AI 味——无渐变、无 emoji 图标、无投影堆砌。

## 架构

NINGLET 是 DeepSeek Harness 上的**预设 + 技能 + 插件**三件套：

```
┌─────────────────────────────────────────────┐
│  NINGLET 预设 (preset/agent.cordis.yml)      │  ← 人设 + 工具行 + UI 行
├─────────────────────────────────────────────┤
│  技能 skills/                                │  ← 反AI味规则 + 长篇写作规则
│  插件 plugins/                               │  ← Host 领域工具 + Client 章节面板
└─────────────────────────────────────────────┘
```

- **Host 插件**（`plugins/host-novel.js`）：领域工具 `novel_create_book` / `novel_write_chapter` / `novel_list_chapters` / `novel_read_chapter`，内部调用 `llm` 生成正文、`fs` 落盘状态。
- **Client 插件**（`plugins/client-novel-ui.js`）：`shell.overlay` 里的章节面板，经包内 RPC（`list_books` / `list_chapters` / `read_chapter`）读 Host。
- **技能**（`skills/`）：`anti-ai-flavor`（反AI味规则）、`longform-writing`（长篇写作工作流）。
- **纯函数核心**（`src/`）：反AI味引擎、状态 schema/reducer、字数、bookId——可独立测试，测试通过后内联进 Host 插件。

## 工具

| 工具 | 作用 |
|---|---|
| `novel_create_book` | 建书，生成安全 bookId + 初始化状态 |
| `novel_write_chapter` | 写下一章：规划→编排→写作→反AI味审计→修订(最多1次)→结算 |
| `novel_list_chapters` | 列出某书全部章节（章节号/字数/AI味评分） |
| `novel_read_chapter` | 读某章正文 |

## 快速开始

```bash
# 1. 跑单测（纯函数核心）
node --test          # 22 个测试，全绿

# 2. 在 DSH 里加载插件（动态插件，开发探针阶段）
#    - Host 工具：plugins/host-novel.js 作为 code.host
#    - Client 面板：plugins/client-novel-ui.js 作为 code.client
#    通过 cordis_define / cordis_run 定义并激活

# 3. 在对话里说
#    「创建一本都市修仙小说《吞天魔帝》」
#    「写下一章，重点写师徒矛盾」
```

状态落盘在**会话工作区**的 `novels/<bookId>/` 下：`story/state/state.json`（权威状态）+ `chapters/NNN.md`（正文）。

## 项目结构

```
NINGLET-dsh/
├── docs/
│   ├── prd/prd-tracer-bullet.md          # 贯通线 PRD
│   ├── superpowers/plans/                # 实现计划
│   └── design-system.md                  # 设计系统
├── src/                                  # 纯函数核心（可测试）
├── tests/                                # node --test 单测
├── skills/                               # 技能包
├── plugins/                              # 动态插件源码
├── preset/                               # 预设骨架
└── package.json                          # type:module + test 脚本
```

## 当前状态与路线图

**已完成（贯通线）**：建书 → 写一章 → 反AI味生效 → 落盘 → 结果卡 + 章节面板的端到端闭环。

**下一步**：
- [ ] 把动态插件**固化**成 DSH checkout 里的真实 package，让预设能 mount
- [ ] 复用 `novel/` 与 `docs/research/` 里的优质 skill，强化反AI味 + 写作规则
- [ ] 章节/伏笔/角色关系的无限画布
- [ ] 发布到 DeepSeek Harness 生态

## 借鉴与致谢

- [inkos](https://github.com/Narcooo/inkos) —— 架构参考：三层记忆、状态结算、输入治理、流水线阶段
- kealin-AI-novels —— 反 AI 味引擎移植蓝本
- [ConardLi/garden-skills](https://github.com/ConardLi/garden-skills) —— 前端设计方法论（`web-design-engineer`）

## License

MIT
