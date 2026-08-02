# AI写作最佳实践参考

> 基于对Novelcrafter、Sudowrite、SillyTavern、MemGPT等项目的研究整理

---

## 一、AI记忆问题的解决方案

> **研究状态**：已完成全部核心方案研究，均已实现

### 1. 分层记忆架构（MemGPT/Letta方案）

**核心思想**：模拟操作系统分页机制，将记忆分为三层

```
┌─────────────────────────────────────────────────────────┐
│                    上下文窗口（有限）                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  短期记忆    │  │  工作记忆    │  │  长期记忆    │     │
│  │ 当前场景内容 │  │ 角色状态/大纲│  │ 按需检索注入 │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    外部存储（无限）                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  章节摘要库  │  │  角色档案库  │  │  世界观设定库│     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────┘
```

**可借鉴点**：
- 每写完一章，自动生成该章摘要存入长期记忆
- 生成新章节时，自动检索相关摘要注入上下文
- 使用向量数据库（如FAISS/ChromaDB）实现语义检索

**实现状态**：已实现（v2.1.0+），见 `modules/memory.py` - HierarchicalMemory 类。暂未使用向量数据库，采用字符 bigram + Jaccard 相似度的轻量方案。

### 2. 关键词触发式记忆注入（SillyTavern方案）

**核心思想**：当上下文中出现特定关键词时，自动注入对应的世界设定

```javascript
// 示例：World Info配置
const worldInfo = {
  "魔法系统": {
    keywords: ["魔法", "法术", "咒语", "魔力"],
    content: "本世界魔法分为五系：火、水、风、土、暗。每系魔法有三个等级..."
  },
  "帝国历史": {
    keywords: ["帝国", "皇帝", "皇宫", "朝廷"],
    content: "大炎帝国建国300年，现任皇帝萧承乾，年号永昌..."
  }
};
```

**可借鉴点**：
- 比全量注入更高效，节省token
- 适合世界观设定、角色背景等按需触发的内容

**实现状态**：已实现（v2.2.0），深度借鉴 SillyTavern World Info，支持保底条目、次级关键词逻辑、正则匹配、互斥组、触发概率等完整特性。

### 3. 角色卡系统（SillyTavern方案）

**核心思想**：为每个角色建立结构化档案

```json
{
  "name": "林逸",
  "personality": "外表冷漠，内心善良，极度理性，不善表达感情",
  "description": "25岁，黑发黑眸，身高183cm，常年穿黑色风衣",
  "speech_style": "说话简洁，很少用形容词，偶尔冷幽默",
  "example_dialogue": [
    "「随便。」他连头都没抬。",
    "「...你开心就好。」语气里听不出任何情绪。"
  ],
  "relationships": {
    "苏瑶": "青梅竹马，暗恋对象，表面疏远",
    "陈老": "师父，亦父亦友"
  },
  "current_state": "正在调查连环失踪案",
  "background": "孤儿，被陈老收养，从小习武..."
}
```

**可借鉴点**：
- `speech_style` 和 `example_dialogue` 比抽象描述更有效
- `current_state` 追踪角色当前状态，防止前后矛盾

**实现状态**：已实现（v2.3.0），完整结构化角色卡系统，见 `modules/character.py` - CharacterCard 类。扩展了 VoiceProfile、CharacterRelationship、CharacterArc、dialogue_rules、behavioral_rules 等高级字段。

---

## 二、AI写作风格控制

> **研究状态**：已完成全部核心方案研究，均已实现

### 4. 风格锚定技术（Few-shot Style Anchoring）

**核心思想**：提供3-5段目标风格的真实文本作为"风格锚点"

**实践方法**：
1. 收集目标风格的代表性文本片段（每段200-500字）
2. 在生成时作为固定上下文注入
3. 在System Prompt中定义详细的"声音指南"

**声音指南模板**：
```
【声音指南】
- 用词：偏口语化，少用书面语，偶尔用方言词汇
- 句式：短句为主（10字以内），长短交替，禁止通篇20字标准句
- 节奏：紧张时用短句堆叠，舒缓时用长句铺陈
- 语气：冷峻克制，不煽情，用动作表达情绪
- 禁忌：禁止排比、禁止"心中一凛"类套话
```

### 5. 多阶段去AI味流水线

**核心思想**：将风格控制拆分为多个独立阶段

```
生成初稿 → 风格改写 → 去模板化 → 人味注入 → 最终润色
```

**各阶段职责**：
1. **初稿生成**：关注内容和结构，不考虑风格
2. **风格改写**：注入风格锚点，改写为目标文风
3. **去模板化**：消除AI高频词和套话
4. **人味注入**：增加口语化、不规则感、个人化表达
5. **最终润色**：统一文风一致性

**可借鉴点**：
- 单次生成难以同时兼顾所有要求，分阶段效果更好
- 每个阶段可以用不同的温度参数

**实现状态**：已实现（v2.2.0），四阶段流水线：风格改写 → 去模板化 → 人味注入 → 最终润色，每个阶段可独立开关。

### 6. 反AI味词汇库

**AI高频词映射表**：

| AI惯用词 | 人类化替代 |
|---------|-----------|
| 旨在 | 想要、打算 |
| 极大地 | 特别、很、非常 |
| 日益 | 越来越 |
| 值得注意的是 | （删除） |
| 与此同时 | 这时候、就在这时 |
| 不言而喻 | （删除，直接说） |
| 无疑 | 肯定、当然 |
| 仿佛...一般 | 像、好像 |
| 宛如 | 像、好像 |
| 不由得 | 忍不住、不自觉 |
| 情不自禁 | 忍不住 |
| 恍然大悟 | 突然明白了 |
| 若有所思 | 想了想 |
| 意味深长 | （用动作表达） |

---

## 三、AI内容输出的微观控制

> **研究状态**：已完成核心方案研究，均已实现

### 7. 段落级重新生成策略

**核心思想**：将长篇生成拆分为可独立操作的最小单元

**实现方案**：
```javascript
// 选区重写功能
function regenerateSelection(selectedText, context, style) {
    const prompt = `
【上下文】
${context.before}

【需要重写的内容】
${selectedText}

【后续内容】
${context.after}

【重写要求】
${style}

请重写【需要重写的内容】部分，保持与上下文的连贯性。
`;

    return callAI(prompt);
}
```

**可借鉴点**：
- 重写时需要提供前后文上下文，确保连贯
- 可以指定不同的重写风格（更简洁/更详细/更口语化等）

**实现状态**：已实现（v2.1.0），右键菜单支持选中文本的重写、扩写、缩写、改对话、加描写等操作。

### 8. 场景级控制（Novelcrafter方案）

**核心思想**：场景是AI小说写作的最佳控制粒度

**每个场景可单独配置**：
- 场景大纲（这个场景要发生什么）
- 参与角色（哪些角色出场）
- 上下文范围（AI能看到哪些前文）
- 写作风格指令
- 是否参考前文

**可借鉴点**：
- 比章节更细、比段落更有语义完整性
- 可以为不同场景设置不同的生成参数

**实现状态**：已实现（v2.3.0），见 `modules/scene.py` - SceneInfo、ChapterScenePlan 类，以及前端 sceneConfig 配置面板。

---

## 四、结构化方法

> **研究状态**：大纲驱动已实现，多Agent流水线为待研究方向

### 9. 多层级大纲驱动

**核心思想**：大纲先行，逐层展开

```
全书梗概（500字）
    ├── 第一卷大纲（每章一句话）
    │   ├── 第1章大纲（场景列表）
    │   │   ├── 场景1：详细描述
    │   │   ├── 场景2：详细描述
    │   │   └── 场景3：详细描述
    │   ├── 第2章大纲
    │   └── ...
    ├── 第二卷大纲
    └── ...
```

**可借鉴点**：
- 每层生成时都参考上层大纲作为约束
- 大纲本身就是一种强约束，能有效防止AI"跑偏"

### 10. 多Agent协作流水线

**核心思想**：写作者和审查者分离

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ 写作Agent │───▶│ 审查Agent │───▶│ 改写Agent │───▶│ 润色Agent │
│ 生成初稿   │    │ 检查一致性 │    │ 去AI味    │    │ 最终定稿   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

**各Agent职责**：
1. **写作Agent**：根据大纲生成初稿
2. **审查Agent**：检查角色一致性、剧情逻辑、世界观冲突
3. **改写Agent**：风格改写、去模板化
4. **润色Agent**：统一文风、修正细节

---

## 五、开源项目参考

| 项目 | 地址 | 核心能力 | 推荐度 |
|------|------|----------|--------|
| **MemGPT/Letta** | github.com/cpacker/MemGPT | 分层记忆管理 | ⭐⭐⭐⭐⭐ |
| **SillyTavern** | github.com/SillyTavern/SillyTavern | 角色卡+World Info | ⭐⭐⭐⭐⭐ |
| **LangChain** | github.com/langchain-ai/langchain | Memory模块、RAG | ⭐⭐⭐⭐ |
| **mem0** | github.com/mem0ai/mem0 | 通用AI记忆层 | ⭐⭐⭐⭐ |
| **Novelcrafter** | novelcrafter.com | 场景级控制（商业） | ⭐⭐⭐⭐⭐ |
| **Sudowrite** | sudowrite.com | Story Engine（商业） | ⭐⭐⭐⭐ |

---

## 六、本项目改进方向

基于以上最佳实践，本项目可优先改进：

1. **分层记忆系统** ✅ 已实现（永久记忆 + 滑动窗口）
2. **章节摘要自动生成** ✅ 已实现（生成正文后自动创建摘要）
3. **段落级重新生成** ✅ 已实现（选中文本微观控制）
4. **关键词触发式记忆注入** ✅ 已实现（深度借鉴 SillyTavern World Info 设计）
   - **保底条目（Constant）**：无需关键词，每次生成都注入，适合世界观基调
   - **主关键词 + 次级关键词**：支持精确控制触发条件
   - **次级关键词逻辑（Selective Logic）**：AND_ANY / NOT_ALL / NOT_ANY / AND_ALL 四种模式
   - **正则匹配**：关键词支持正则表达式（以 `/` 为定界符）
   - **互斥组（Inclusion Group）**：同组条目只激活一个，避免信息过载
   - **触发概率（Probability）**：按概率触发，增加变化性
   - **多匹配源**：扫描大纲、剧情、背景、角色、前文章节摘要
   - **优先级排序**：数值越大越靠后，影响越大
5. **反AI味词汇自动替换** ✅ 已实现
   - 内置完整的AI高频词映射表（60+词汇）
   - 支持检测AI味分数（0-100分）
   - 右键菜单一键检测和替换
6. **多阶段去AI味流水线** ✅ 已实现
   - 风格改写 → 去模板化 → 人味注入 → 最终润色 四阶段
   - 每个阶段可独立开关
   - 自动计算AI味分数变化
   - 右键菜单一键执行
7. **记忆自动整合（借鉴 mem0）** ✅ 已实现（v2.3.0）
   - **MemoryConsolidator**：当记忆条目超过阈值时自动整合
   - **衰减机制**：每次整合对所有条目应用衰减因子（0.95），老记忆逐渐淡化
   - **低价值修剪**：自动移除 importance × decay < 2.0 且很少被访问的条目
   - **相似条目合并**：内容相似度 > 50% 的同类型条目自动合并，保留重要度更高的
   - **整合统计**：返回整合前后的条目数、修剪数、合并数
8. **上下文窗口监控（借鉴 MemGPT）** ✅ 已实现（v2.3.0）
   - **TokenEstimator**：估算中英文文本的 token 数
   - **上下文大小估算**：计算当前记忆系统的总 token 占用
   - **自动压缩判断**：当上下文超过阈值时提示需要压缩
   - **compress_context()**：将文本压缩到指定 token 数内
9. **多因子语义检索（借鉴 LangChain）** ✅ 已实现（v2.3.0）
   - **综合评分**：relevance × 关键词匹配 + recency × 衰减因子 + importance × 重要度
   - **可调权重**：relevance_weight=0.5, recency_weight=0.2, importance_weight=0.3
   - **按类型和重要度过滤**：支持 entry_types 和 min_importance 参数
10. **结构化角色卡系统（借鉴 SillyTavern）** ✅ 已实现（v2.3.0）
    - **speech_style**：角色说话风格描述（如"说话简洁，偶尔冷幽默"）
    - **example_dialogue**：角色示例对话列表，动态添加/删除
    - **current_state**：角色当前状态（如"正在调查连环失踪案"）
    - **relationships**：结构化关系数据 {角色名: "关系描述"}
    - **first_appearance**：首次出场章节
    - **arc**：角色弧线/成长轨迹
    - **角色信息注入增强**：生成正文时自动注入完整的结构化角色档案
11. **场景级控制（借鉴 Novelcrafter）** ✅ 已实现（v2.3.0）
    - **sceneConfig 每章独立配置**：
      - `characters[]`：本场景出场角色（从角色列表多选）
      - `contextRange`：上下文范围（minimal=2章 / summary=5章 / full=10章）
      - `sceneType`：场景类型（narrative/action/dialogue/transition）
      - `pacing`：节奏（slow/normal/fast）
      - `emotionalTone`：情绪基调
      - `sceneGoal`：场景目标
      - `styleOverride`：风格覆盖
    - **场景配置 UI**：每章可折叠的场景配置面板
    - **智能上下文注入**：根据 sceneConfig 自动调整注入的角色信息和前文范围
12. **写作质量一致性检查（借鉴 Novelcrafter/Sudowrite）** ✅ 已实现（v2.3.0）
    - **五维度检查**：角色性格一致性、设定冲突、时间线矛盾、细节一致性、伏笔追踪
    - **右键菜单一键检查**：在正文中右键即可触发
    - **每章检查按钮**：章节操作栏新增「一致性检查」按钮
    - **结构化问题清单**：输出分类问题列表和修改建议
13. **自动事实提取（借鉴 mem0）** ✅ 已实现（v2.3.0）
    - **build_fact_extraction_prompt()**：从章节内容中提取关键事实的专用 prompt
    - **四类事实**：人物事实、设定事实、剧情事实、伏笔事实
    - **自动存入语义索引**：提取的事实自动存入长期记忆库
14. **写作质量分析引擎（借鉴 Sudowrite）** ✅ 已实现（v2.3.0）
    - **QualityReport 四维度评分**：AI味分数、可读性、风格一致性、吸引力
    - **本地 AI 味检测**：40+ 禁用词、AI过渡词、排比句、段尾抒情、"的"字密度、句长均匀度
    - **跨章风格一致性分析**：比较多章的句长、"的"字密度、对话密度差异
    - **批量质量检查**：一键分析全部章节并汇总统计
    - **结构化问题清单**：按严重程度分级，附修改建议
    - **实现位置**：`modules/quality.py` - QualityReport, generate_quality_report()
15. **场景级节奏分析** ✅ 已实现（v2.3.0）
    - **analyze_pacing()**：分析文本节奏（1-5级），检测句子长度均匀度
    - **detect_scene_breaks()**：自动检测场景切换点（显式标记 + 时间/地点跳跃）
    - **SceneInfo 结构化元数据**：场景类型（9种）、情绪节拍（10种）、节奏等级（5级）
    - **ChapterScenePlan**：完整场景方案，含场景转换描述和情绪曲线
    - **实现位置**：`modules/scene.py`
16. **深度结构化角色卡（扩展 SillyTavern）** ✅ 已实现（v2.3.0）
    - **VoiceProfile**：speech_style、vocabulary_level、catchphrases、verbal_tics、emotional_speech、forbidden_words
    - **CharacterRelationship**：target_name、relationship_type、intensity、history、current_tension、future_trajectory
    - **CharacterArc**：starting_state → current_state → target_state，含 key_moments 和成长阶段
    - **CharacterTrait**：name、intensity、is_flaw、growth_potential，带 evidence 追踪
    - **角色一致性检查**：check_name_consistency()、check_voice_consistency()
    - **实现位置**：`modules/character.py` - CharacterCard, CharacterCardManager
17. **多模型支持与运行时切换** ✅ 已实现（v2.0.0+）
    - **主模型 + 辅助模型**双通道：高质量生成用主模型，辅助操作用低成本模型
    - **运行时热切换**：通过 /api/config 接口随时更新模型配置
    - **健康检查**：/api/health 端点返回服务状态、模型配置、运行时间
    - **实现位置**：`app.py` - CONFIG, /api/config, /api/health

---

## 七、待研究改进方向

> 基于现有最佳实践和项目现状，以下是值得深入研究的改进方向

### 高优先级

| # | 改进方向 | 参考来源 | 预期收益 | 状态 |
|---|---------|---------|---------|------|
| 1 | **向量嵌入语义检索** | LangChain、mem0 | 替换当前 bigram Jaccard 方案，提升语义匹配精度 | 待研究 |
| 2 | **多Agent协作写作流水线** | AutoGen、CrewAI | 写作Agent + 审查Agent + 改写Agent 分工协作 | 待研究 |
| 3 | **知识图谱式世界观管理** | LangChain KG | 将角色关系、势力关系、事件因果构建为知识图谱 | 待研究 |
| 4 | **长篇小说全局一致性追踪** | Novelcrafter | 跨卷级的伏笔追踪、角色弧线监控、时间线管理 | 待研究 |

### 中优先级

| # | 改进方向 | 参考来源 | 预期收益 | 状态 |
|---|---------|---------|---------|------|
| 5 | **RAG增强的世界设定检索** | LangChain RAG | 将世界观设定文档切片索引，按上下文精准检索 | 待研究 |
| 6 | **写作风格指纹学习** | Sudowrite | 从用户提供的参考文本中学习独特的句式、用词、节奏模式 | 待研究 |
| 7 | **章节间因果链验证** | Novelcrafter | 自动检测前后章节事件的因果逻辑是否成立 | 待研究 |
| 8 | **读者情绪曲线预测** | Sudowrite | 模拟读者视角，预测每段文字引发的情绪反应 | 待研究 |
| 9 | **对话方言/口音系统** | SillyTavern | 为不同角色设置方言或口音标记，自动生成差异化对话 | 待研究 |

### 低优先级（探索性）

| # | 改进方向 | 参考来源 | 预期收益 | 状态 |
|---|---------|---------|---------|------|
| 10 | **FAISS/ChromaDB 本地向量库集成** | MemGPT | 替换内存索引，支持百万级记忆条目 | 待研究 |
| 11 | **多语言写作支持** | Sudowrite | 支持英文、日文等多语言小说创作 | 待研究 |
| 12 | **自动插图提示词生成** | 自研 | 根据场景描述自动生成配图提示词 | 待研究 |
| 13 | **WebDAV/云端同步** | 自研 | 跨设备项目同步，避免数据丢失 | 待研究 |

---

## 八、研究完成记录

> 已完成研究并实现的最佳实践项目清单

| # | 研究项 | 研究来源 | 实现版本 | 实现位置 |
|---|-------|---------|---------|---------|
| 1 | 分层记忆架构 | MemGPT/Letta | v2.1.0 | `modules/memory.py` - HierarchicalMemory |
| 2 | 关键词触发式记忆注入 | SillyTavern World Info | v2.2.0 | `static/app.js` - World Info |
| 3 | 结构化角色卡系统 | SillyTavern Character Card | v2.3.0 | `modules/character.py` - CharacterCard |
| 4 | 风格锚定技术 | Few-shot Style Anchoring | v2.0.0+ | `static/app.js` - 风格模仿 |
| 5 | 多阶段去AI味流水线 | Sudowrite | v2.2.0 | `static/app.js` - 去AI味流水线 |
| 6 | 反AI味词汇库 | 自研 | v2.0.0+ | `modules/quality.py` - BANNED_WORDS |
| 7 | 段落级重新生成策略 | Novelcrafter | v2.1.0 | `static/app.js` - 微观控制 |
| 8 | 场景级控制 | Novelcrafter | v2.3.0 | `modules/scene.py` - SceneInfo |
| 9 | 多层级大纲驱动 | Novelcrafter | v2.0.0+ | `static/app.js` - 大纲系统 |
| 10 | 记忆自动整合 | mem0 | v2.3.0 | `modules/memory.py` - MemoryConsolidator |
| 11 | 上下文窗口监控 | MemGPT | v2.3.0 | `modules/memory.py` - TokenEstimator |
| 12 | 多因子语义检索 | LangChain | v2.3.0 | `modules/memory.py` - SemanticIndex.search() |
| 13 | 写作质量一致性检查 | Novelcrafter/Sudowrite | v2.3.0 | `modules/quality.py` - QualityReport |
| 14 | 自动事实提取 | mem0 | v2.3.0 | `modules/memory.py` - build_fact_extraction_prompt() |
| 15 | 场景节奏分析 | Novelcrafter | v2.3.0 | `modules/scene.py` - analyze_pacing() |
| 16 | 深度结构化角色卡 | SillyTavern | v2.3.0 | `modules/character.py` - VoiceProfile, CharacterArc |
| 17 | 写作质量分析引擎 | Sudowrite | v2.3.0 | `modules/quality.py` - generate_quality_report() |
| 18 | 多模型运行时切换 | 自研 | v2.0.0+ | `app.py` - CONFIG, /api/config |
