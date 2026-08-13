# harness-packages —— DSH 包源码（固化状态）

NINGLET 固化到 DeepSeek Harness 的包源码。已提交的包在此，未提交的待办在此记录。

## 已固化（提交进 harness 仓库，过 lint + typecheck）

| 包 | 状态 |
|---|---|
| `@deepseek-ai/dsh-tool-ninglet` | ✅ 提交 `8019567ece`：4 个 novel_* 工具（建书含大纲 / 写章含苏格拉底规划+反AI味审计+观察者抽取 / 列章 / 读章），全量 TS 无 `any` |
| `@deepseek-ai/dsh-prompt-ninglet` | ✅ 提交：persona 提示词段（`systemPrompt.section`）|

## 预设

- DSH 侧：`~/.dsh/.agent-presets/ninglet/`（`agent.cordis.yml` 引用上面两个包）
- NINGLET-dsh 侧：`preset/agent.cordis.yml`

## 待固化（最后一里路）

### 1. Client 章节面板包（`@deepseek-ai/dsh-client-ninglet`）
章节面板目前是动态插件（`plugins/client-novel-ui.js`）。固化成 client 包需要：
- `src/client/index.ts`：把 Slot UI（结构树 + 画布）从动态插件移植过来，用 `ctx.slots.inject('shell.overlay', ...)`（参考 `packages/client/ui-*` 的写法）。
- `tsdown.config.ts`：web bundle 配置（参考 `packages/client/ui-slots/tsdown.config.ts`）。
- **RPC 改造**：动态插件的 `host.call('get_structure')` 是 package-private 机制；client 包要改用 `@Remote` 服务方法（在 host 侧 `@deepseek-ai/dsh-tool-ninglet` 暴露 `@Remote` 方法，client 侧消费）。
- 加入 `tsconfig.client.json` 引用 + `pnpm install` 链接。

### 2. 预设 mount 校验
- 包已链接、预设已建，理论上可 mount。
- 校验 `standingKeyFor` 需要 `agentPresets` 探针，或**起一个 NINGLET 会话确认工具列表**（`novel_create_book` / `novel_write_chapter` / `novel_list_chapters` / `novel_read_chapter` 应出现）。

## 与 harness checkout 的对应关系

`D:\deepseek-harness\deepseek-harness\packages\novel\tool-ninglet\` 和 `prompt-ninglet\` 是已提交的包源码。改动后需同步回本目录（`harness-packages/`）。
