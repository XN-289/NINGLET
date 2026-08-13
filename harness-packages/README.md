# harness-packages —— 待构建的 DSH 包源码

这里是 NINGLET 固化到 DeepSeek Harness 的**包源码**（已从 harness checkout 复制过来做版本沉淀）。

## 内容

| 目录 | 包名 | 状态 |
|---|---|---|
| `tool-ninglet/` | `@deepseek-ai/dsh-tool-ninglet` | ✅ 类型检查通过、已链接进 harness node_modules、import 冒烟通过；⚠️ 待补齐类型过 lint + tsdown 构建 |

`tool-ninglet/` 包含 `package.json` + `tsconfig.json` + `src/index.ts`（4 个 novel_* 工具：建书/写章(反AI味审计)/列章/读章）。

## 与 harness checkout 的关系

这套源码对应 `D:\deepseek-harness\deepseek-harness\packages\novel\tool-ninglet\`。两边应保持一致；改动任一边后同步另一边。

## 待办（固化收尾）

1. **补齐类型**：把 `src/index.ts` 里的 `any` 换成正经类型（`ToolExecution` / `FsTarget` / `GenerateOptions` / 状态 interface），通过 harness 的 `oxlint`（当前 40+ 条 `no-explicit-any`/`no-unsafe-*`）。
2. **构建**：在 harness 目录跑 `pnpm build:lib:host`（`tsc -b` + `tsdown`）产出 `lib/index.js`。
3. **提交**：`git commit` 进 harness 仓库（当前被 pre-commit lint 拦下）。
4. **预设 mount**：`agent.cordis.yml` 引用 `@deepseek-ai/dsh-tool-ninglet`，`agentPresets.copy` + `standingKeyFor` 校验。

> 注意：`lib/index.js` 是构建产物（harness `.gitignore` 忽略），当前手写版仅作运行时验证用，正式版应由 `tsdown` 从 `src/` 生成。
