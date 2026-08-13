# NINGLET 设计系统

> 依据 ConardLi/garden-skills 的 `web-design-engineer` 方法论 + `muji-kenya-hara` 风格配方。
> 核心原则：**写作优先 —— 正文是主角，UI 克制、安静，让故事成为画面里最响的东西。**
> 反 AI 味不只针对文字，也针对界面：不出现「AI 默认审美」。

## Design Read

| 维度 | 值 |
|---|---|
| artifact | 写作工作台（对话 + 章节面板 + 未来画布） |
| audience | 小说作者（中文网文为主） |
| visual-language | 安静编辑部（Editorial / Quiet） |
| mode | greenfield |

## 设计系统（Design System）

**调色板（Palette）**
- 纸面 ground：`#F4F2EC`（暖纸白，永不用 `#FFFFFF`）
- 墨色 ink：`#2A2A28`（暖墨，永不用 `#000000`）
- 次要文本：`#7C7B76`
- 发丝线 hairline：`#D9D6CD`
- 强调色：**无主强调色**；交互态用一个安静的墨蓝 `#3E4C6B`，仅作极小标记（选中/悬停），不铺大面积
- 深色模式：ground `#1C1B19`，正文 `#EDEBE4`，发丝线 `#35332E`

**字体（Typography）**
- 正文/阅读：衬线（`Noto Serif SC` / `source-serif`），15–16px，行高 ~1.8
- UI 铬件（按钮/标签/标题）：人文无衬线（`system-ui`，**不用 Inter/Roboto**），字重 ≤ 500，字距略开 0.01–0.02em
- 小标签（节标题/评分）：10–11px、字距拉开，像「01 — 章节」这样安静地标注，不喊叫

**间距（Spacing）**
- 8pt 网格：8 / 16 / 32 / 48
- 大量留白 —— 内容住窄栏，远离边缘（MUJI 式「空」）

**圆角（Radius）**
- `0`（硬朗诚实），表单域最多 `2px`

**阴影（Shadow）**
- **无**。用 1px 发丝线（hairline）分隔，不靠投影堆深度

**动效（Motion）**
- 几不可察：600–900ms 淡入淡出，位移不超过几像素，绝不弹跳

## 反 AI 味 UI 禁令（来自 skill 的 failure-patterns）

- ❌ 紫→粉→蓝渐变
- ❌ 圆角卡片 + 左侧彩色竖条
- ❌ emoji 当图标
- ❌ Inter / Roboto / Arial 当展示字体
- ❌ 重投影 / 辉光 / 渐变
- ❌ 伪造数据（评分、字数必须来自真实工具结果，不能编）
- ✅ 缺图标 → 用占位（`[icon]` / 方框），缺头像 → 首字母圆点，缺图 → 带比例标注的占位卡

## 落地顺序

1. **章节面板**（当前）——按本系统重做：纸面背景、衬线正文、发丝线分隔、安静淡入、去 AI 默认味。
2. **画布**（后续）——同一套 token 延伸到章节/伏笔/角色关系画布。
3. **对话内结果卡**——工具结果卡也遵循同一套排版语言。

## 检查清单（交付前自检）

- [ ] 无 AI 陈词滥调（渐变/emoji/左竖条/Inter）
- [ ] 颜色全部来自本设计系统，无凭空新色相
- [ ] 交互组件有 hover/focus/active/disabled 状态；列表有空态
- [ ] 无文本溢出；`text-wrap: pretty`
- [ ] 视觉达到「能上台面」的水准（Dribbble/Behance 级），而非「能用就行」
