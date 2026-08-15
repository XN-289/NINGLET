<div align="center">

<img src="assets/logo.svg" width="112" height="112" alt="NINGLET Logo">

# NINGLET

**让 AI 写小说，但读者闻不出 AI 味。**

跑在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 上的小说创作插件 —— 专门写小说，也专门把「AI 味」挡在正文之外。

[是什么](#是什么) · [安装](#安装) · [特性](#特性) · [技能](#技能) · [架构](#架构) · [项目结构](#项目结构) · [借鉴与致谢](#借鉴与致谢)

<sub>DSH Plugin · 属于 [dsh-plugin](https://github.com/topics/dsh-plugin) 生态</sub>

**安装**：克隆本仓库，把 `skills/` 下 5 个技能复制到 `~/.dsh/skills/`，再以动态插件加载 `plugins/host-novel.js`（Host 工具）+ `plugins/client-novel-ui.js`（章节面板）——详见[安装](#安装)。

</div>

---

## 是什么

NINGLET 是 DeepSeek Harness 生态里的一个**小说创作插件**。它不是「输入大纲、吐正文」的黑盒，而是一条可控的生产线：

> 建书 → 写章（规划 → 编排 → 写作 → 反 AI 味审计 → 修订 → 结算）→ 落盘 → 章节面板回看。

它由四部分组成：**预设**（agent.cordis.yml）、**技能**（5 个 SKILL.md）、**插件**（Host 领域工具 + Client 章节面板）、**纯函数核心**（可独立测试的反 AI 味引擎 / 状态校验 / 字数 / bookId）。

## 特性

- **反 AI 味引擎**：确定性检测（80+ 禁用词、`的`字密度、句长方差）+ 生成时注入规则 + 落盘前最多一次自动重写。
- **苏格拉底规划（give me）**：写章前若没给意图，先追问你「核心推进 / 主角状态 / 结尾钩子」三问，把本章意图落成 `story/runtime/chapter-N.intent.md` 再动笔。
- **章回大纲**：建书时给创作简报，自动生成 8-12 章大纲。
- **结构化记忆**：每章写完后由「观察者」抽取角色、伏笔，并生成结构化摘要（事件/角色变化/伏笔/结尾），替代粗暴截断。
- **结构树 + 画布**：右下角「小说」面板——结构视图（大纲 / 章节 / 角色 / 伏笔）+ 画布视图（章节节点连线），一眼看懂整本书。
- **结构化状态**：每本书的状态是校验后的 JSON（`story/state/state.json`），正文是 Markdown（`chapters/NNN.md`）；坏数据拒绝写入，不滚雪球。
- **安静编辑部 UI**：写作优先的界面（见 `docs/design-system.md`），连 UI 都去 AI 味——无渐变、无 emoji 图标、无投影堆砌。

## 安装

克隆本仓库，两步装进你的 DeepSeek Harness：

```bash
git clone https://github.com/XN-289/dsh-NINGLET-novel-Agent.git
```

**1. 技能（5 个 SKILL.md）** —— 复制到用户技能根，或当前项目的 `.dsh/skills/`（DSH 会自动发现两者）：

```bash
# Unix
cp -r NINGLET/skills/* ~/.dsh/skills/
# Windows (PowerShell)
Copy-Item -Recurse NINGLET\skills\* $HOME\.dsh\skills\
```

**2. 工具 + 章节面板** —— 自包含动态插件，不依赖任何 workspace 包。在 DSH 会话里用 `cordis_define` 定义（`plugins/host-novel.js` 作为 `code.host`，`plugins/client-novel-ui.js` 作为 `code.client`），再 `cordis_run` 激活。

> `harness-packages/` 下的 `@deepseek-ai/dsh-tool-ninglet` / `dsh-prompt-ninglet` 是固化进 DSH 核心仓库源码树的形态，面向核心开发者；普通用户走上面的动态插件路径即可。

## 快速开始

```bash
node --test   # 纯函数核心单测：34 个，全绿
```

在装好技能与插件的 DSH 会话里说：

> 「创建一本都市修仙小说《吞天魔帝》」
> 「写下一章，重点写师徒矛盾」

状态落盘在**会话工作区**的 `novels/<bookId>/` 下：`story/state/state.json`（权威状态）+ `chapters/NNN.md`（正文）。

## 技能

NINGLET 把「写小说」拆成 5 个可被 DeepSeek Harness 直接调用的技能：

| 技能 | 作用 |
|---|---|
| `anti-ai-flavor` | 反 AI 味规则：80+ 禁用词、量化指标、Show-Don't-Tell |
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
│  纯函数 src/   （可独立测试）                  │  ← 反AI味引擎 / 状态 schema / 字数 / bookId
└──────────────────────────────────────────────┘
```

## 项目结构

```
NINGLET-dsh/
├── docs/               # PRD、实现计划、设计系统、research 资产库
├── src/                # 纯函数核心（可测试）
├── tests/              # node --test 单测（32 个）
├── skills/             # 5 个技能包
├── plugins/            # 动态插件源码
├── preset/             # 预设组合
├── harness-packages/   # 待构建的 DSH 包源码（固化收尾）
└── assets/             # logo 等静态资产
```

## 借鉴与致谢

- [inkos](https://github.com/Narcooo/inkos) —— 架构参考：三层记忆、状态结算、输入治理、流水线阶段
- [ConardLi/garden-skills](https://github.com/ConardLi/garden-skills) —— 前端设计方法论（`web-design-engineer`）
- kealin-AI-novels —— 反 AI 味引擎移植蓝本

## License

MIT
