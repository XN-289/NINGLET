# harness-packages —— DSH 包源码（固化状态）

NINGLET 固化到 DeepSeek Harness 的包源码。本目录是 monorepo 包的**源码镜像**，改动后需同步回 harness checkout。

> ⚠️ **本目录是源码镜像，不是构建产物**。这里的 `.ts` 需要在 harness checkout（`D:\dsh\deepseek-harness`）内经 monorepo 工具链（tsdown + typert）构建后才能被预设引用。本地 `node --test` 只验证纯函数 + 一致性（parity 测试锁死 src↔TS），**不构建 TS 包**。

## 包清单

| 包 | 状态 | 说明 |
|---|---|---|
| `tool-ninglet` | **源码就绪**（待提交进 monorepo 构建） | Host 工具（4 个 `novel_*`，含苏格拉底规划+大纲生成+观察者抽取+反AI味审计）+ `service.ts`（NovelService @Remote，5 个客户端 RPC） |
| `client-ninglet` | **源码骨架**（待提交进 monorepo 构建） | Client 章节面板（结构树 + SVG 画布），消费 `ctx.remote.novel.*` |
| `prompt-ninglet` | **待建** | persona 提示词段（`systemPrompt.section`） |

### 关于「已提交」状态

之前版本曾宣称 `@deepseek-ai/dsh-tool-ninglet` / `@deepseek-ai/dsh-prompt-ninglet` 「已提交进 harness 仓库（commit `8019567ece`）」。但在**当前 harness checkout**（`D:\dsh\deepseek-harness\packages\`）下查无 `novel/` 目录——该提交可能在其他机器/分支，**无法在本环境验证**。以当前 checkout 为准，固化包**尚未真正挂载**。请以「源码就绪、待挂载」对待。

### 关于「全量 TS 无 any」

之前版本曾宣称 tool-ninglet「全量 TS 无 `any`」。这不准确：`index.ts` 因对接动态契约（`fs`/`llm`/`sandboxPolicy` 等无精确公开类型的 Host 服务）使用了 `any`/`as any`。这与 harness 内多数工具包一致（Host 服务的运行时契约优先于类型严格性），但不应宣称「无 any」。

## 固化收尾清单

### 1. 把包真正提交进 harness checkout
- 在 `D:\dsh\deepseek-harness\packages\` 下新建 `novel/`，放入 `tool-ninglet/`、`client-ninglet/`、`prompt-ninglet/`
- 在 `pnpm-workspace.yaml` 注册 `packages/novel/*`
- `pnpm install` 链接，`pnpm --filter ... bundle` 构建（typert 生成 `ctx.remote.novel.*` 客户端绑定）

### 2. Client 面板的 RPC 对接
- 动态插件用 package-private `host.call('get_structure', ...)`；client 包改用 typert 生成的 `ctx.remote.novel.getStructure(...)`（已在 `tool-ninglet/src/service.ts` 用 `@Remote` 声明）
- 构建后由 typert 自动生成客户端绑定，无需手写

### 3. 预设 mount 校验
- 把 `preset/agent.cordis.yml` 的三行指向已构建的真实包
- 起一个 NINGLET 会话，确认工具列表（`novel_create_book` / `novel_write_chapter` / `novel_list_chapters` / `novel_read_chapter`）出现且面板三态（无书/1书/多书）不白屏

## 与 harness checkout 的对应关系

固化后：`<checkout>/packages/novel/tool-ninglet/`、`client-ninglet/`、`prompt-ninglet/`。
本目录（`harness-packages/`）是它们的源码镜像；改动双向同步。
