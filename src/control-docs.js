/**
 * NINGLET 控制面文档 + 题材规则体系 —— 确定性纯函数。
 *
 * 控制面文档（inkos 式）：
 *   - author_intent.md: 长期创作意图（从 book.brief + genre 派生）
 *   - current_focus.md: 近期关注点（从最近章摘要 + stale hooks + currentState 派生）
 *   - book_rules.md: 书级创作规则（通用 25 条 + 题材专属规则）
 *
 * 唯一数据源：本文件，插件内联副本由 parity 测试锁死。
 */

import { computeHookDiagnostics } from './hook-lifecycle.js';

// ============ 题材规则库 ============

export const GENERIC_RULES = [
  '每章有明确推进（事件/关系/信息/伏笔之一），不原地踏步',
  '主角有主动行为，不被剧情推着走',
  '对话承担信息量，不空转寒暄',
  '场景有感官细节（视觉/听觉/触觉至少一种），不纯叙述',
  '结尾留钩子（危机/悬念/反转/挑衅/留白），章章有"下一页"驱动力',
  '视角稳定（不频繁切换 POV），切换时有明显标记',
  '时间线清晰，不跳跃混乱',
  '因果关系可追溯（前因后果），不无理由突变',
  '角色行为符合已建立的人设，不崩坏',
  '伏笔有回收（open→resolved），不挖坑不填',
  '情绪有起伏（不要全章平淡），张力曲线',
  '信息量控制（一章不超过2个重大信息），不信息轰炸',
  '不道德说教，用事件展现而非角色口述',
  '不旁白解释角色心理，用行为/表情/对话暗示',
  '不剧透未来（上帝视角剧透降低悬念）',
  '节奏快慢交替（紧张章后给缓冲章），不全程高压',
  '世界观通过使用展开（不百科式设定堆砌）',
  '配角有辨识度（不是路人A/B/C）',
  '冲突有多层（外部冲突 + 内心冲突）',
  '章节标题/编号与内容匹配',
  '地名/人名/术语前后一致（不中途改名）',
  '不复制粘贴前文内容（不水字数）',
  '战斗/冲突有代价（不无伤通关）',
  '重要决策有铺垫（不突然觉醒）',
  '章末不总结升华（不"这就是成长的代价"式抒情）',
];

export const GENRE_RULES = {
  '玄幻': [
    '力量体系有规则（等级/突破条件明确），不随意变强',
    '金手指有限制（代价/冷却/条件），不无脑无敌',
    '战斗展示智谋（利用环境/弱点/策略），不纯拼数值',
    '宗门/势力有利益逻辑（不为反派而反派）',
    '修炼/升级有过程感（不一章跳十级）',
  ],
  '都市': [
    '职业细节真实（行业术语/流程准确），不悬浮',
    '社会关系有阶层逻辑（不全员富豪/全员底层）',
    '冲突来源接地气（职场/家庭/金钱/感情），不超自然',
    '城市地标/生活细节真实（地铁/外卖/房租），增强代入',
  ],
  '悬疑': [
    '线索提前埋设（公平解谜），不天降证据',
    '凶手/真相有铺垫（不最后一章才出现的新角色）',
    '误导有逻辑（红鲱鱼指向真实线索的反面），不纯巧合',
    '推理过程可复现（读者能跟得上），不跳步',
    '危机感持续（每章至少一个疑点），不断档',
  ],
  '言情': [
    '感情有渐进（不一夜相爱），有合理的吸引力建立过程',
    '误会不过夜（不靠强行误会拖延剧情）',
    '情敌/阻力有存在逻辑（不是工具人）',
    '亲密戏有情感铺垫（不突兀），服务角色发展',
    '甜蜜与虐心交替（不全程甜/全程虐）',
  ],
  '科幻': [
    '科技设定自洽（规则明确后不违反），有硬约束',
    '科技对社会有影响（不套皮古代），体现科幻内核',
    '问题用设定内逻辑解决（不万能科技），有限制',
    '想象基于现有科学延伸（不纯魔幻），有合理性',
  ],
  '历史': [
    '史实考据准确（服饰/制度/称谓），不穿越式现代用语',
    '历史大势与虚构交织（不脱离时代背景）',
    '人物动机符合时代价值观（不现代人穿古装）',
    '权谋有博弈逻辑（不降智反派），有来有回',
  ],
};

export const SUPPORTED_GENRES = Object.keys(GENRE_RULES);

// ============ 题材默认章字数（用户调研 2026-08-15：男频3000-4000，女频~3000，短篇/安级2000-2500） ============

export const GENRE_CHAPTER_WORDS = {
  '玄幻': 3200, '都市': 3200, '科幻': 3200, '历史': 3200,   // 男频
  '言情': 3000, '悬疑': 3000,                                 // 女频/中性
  '短篇': 2200,
};
export const DEFAULT_CHAPTER_WORDS = 3000;

export function chapterWordsForGenre(genre) {
  return GENRE_CHAPTER_WORDS[genre] || DEFAULT_CHAPTER_WORDS;
}

// 字数软硬区间（学 inkos length-metrics：按 300/2200、600/2200 比例缩放）
export function buildWordRange(target) {
  const soft = Math.max(1, Math.floor(target * 300 / 2200));
  const hard = Math.max(1, Math.floor(target * 600 / 2200));
  return { target, softMin: target - soft, softMax: target + soft, hardMin: target - hard, hardMax: target + hard };
}

/**
 * 获取某题材的完整规则集（通用 + 题材专属）。
 * 未知题材只返回通用规则。
 */
export function getRulesForGenre(genre) {
  const generic = GENERIC_RULES.slice();
  const specific = GENRE_RULES[genre] || [];
  return { generic, specific, all: generic.concat(specific) };
}

// ============ 控制面文档生成 ============

/**
 * 生成 author_intent.md（长期创作意图）。
 * 从 book 信息派生，人类可读。
 */
export function renderAuthorIntent(book) {
  if (!book) return '# 创作意图\n\n（未设定）\n';
  const lines = ['# 创作意图', ''];
  if (book.title) lines.push('## 书名', '', book.title, '');
  if (book.genre) lines.push('## 题材', '', book.genre, '');
  if (book.brief) lines.push('## 简报', '', book.brief, '');
  if (book.targetChapters) lines.push('## 目标篇幅', '', '约 ' + book.targetChapters + ' 章，每章约 ' + (book.chapterWords || chapterWordsForGenre(book.genre)) + ' 字', '');
  const rules = getRulesForGenre(book.genre);
  if (rules.specific.length > 0) {
    lines.push('## 题材专属规则', '');
    for (const r of rules.specific) lines.push('- ' + r);
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

/**
 * 生成 current_focus.md（近期关注点）。
 * 从当前状态派生：当前章号、stale 伏笔、阻塞伏笔、当前状态事实。
 */
export function renderCurrentFocus(state, currentChapter) {
  if (!state) return '# 近期关注\n\n（无状态）\n';
  const lines = ['# 近期关注', ''];
  lines.push('## 当前进度', '', '第 ' + currentChapter + ' 章 / 目标 ' + ((state.book && state.book.targetChapters) || '?') + ' 章', '');

  // 伏笔健康度
  const hooks = state.hooks || [];
  if (hooks.length > 0) {
    let openCount = 0, progressingCount = 0, resolvedCount = 0;
    const staleHooks = [];
    const blockedHooks = [];
    for (const h of hooks) {
      if (h.status === 'open') openCount++;
      else if (h.status === 'progressing') progressingCount++;
      else if (h.status === 'resolved') resolvedCount++;
    }
    lines.push('## 伏笔状态', '', '- 已埋下未推进：' + openCount, '- 推进中：' + progressingCount, '- 已回收：' + resolvedCount, '');

    // stale/blocked 检测
    try {
      const diags = computeHookDiagnostics(hooks, currentChapter);
      for (const h of hooks) {
        const d = diags.get(h.hookId);
        if (!d) continue;
        if (d.stale) staleHooks.push(h.name + '（第' + h.startChapter + '章埋下，距' + d.distance + '章/半衰' + d.halfLife + '）');
        if (d.blocked) blockedHooks.push(h.name + '（受阻于：' + d.missingUpstream.join(', ') + '）');
      }
      if (staleHooks.length > 0) {
        lines.push('## ⚠️ 过期伏笔（需尽快回收或推进）', '');
        for (const s of staleHooks) lines.push('- ' + s);
        lines.push('');
      }
      if (blockedHooks.length > 0) {
        lines.push('## ⚠️ 受阻伏笔（上游未回收）', '');
        for (const b of blockedHooks) lines.push('- ' + b);
        lines.push('');
      }
    } catch (e) { /* hook-lifecycle 不可用时跳过 */ }
  }

  // 当前状态事实
  const cs = state.currentState || {};
  const facts = [
    ['当前位置', cs.currentLocation],
    ['主角状态', cs.protagonistState],
    ['当前目标', cs.currentGoal],
    ['当前冲突', cs.currentConflict],
  ].filter((f) => f[1]);
  if (facts.length > 0) {
    lines.push('## 当前状态', '');
    for (const f of facts) lines.push('- **' + f[0] + '**：' + f[1]);
    lines.push('');
  }

  // 最近3章摘要
  const recent = (state.summaries || []).slice(-3);
  if (recent.length > 0) {
    lines.push('## 最近章节', '');
    for (const s of recent) {
      const ch = s.chapter || s.index || '?';
      const text = s.events || s.text || '';
      lines.push('- 第' + ch + '章：' + text);
    }
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

// ============ 书级规则文件 ============

/**
 * 生成 book_rules.md（书级创作规则）。
 * 通用规则 + 题材专属规则，可编辑、可审计。
 */
export function renderBookRules(genre) {
  const rules = getRulesForGenre(genre);
  const lines = ['# 书级创作规则', ''];
  lines.push('> 此文件可手动编辑。写章时作为写作约束注入。', '');
  lines.push('## 通用规则（' + rules.generic.length + ' 条）', '');
  for (let i = 0; i < rules.generic.length; i++) {
    lines.push((i + 1) + '. ' + rules.generic[i]);
  }
  lines.push('');
  if (rules.specific.length > 0) {
    lines.push('## ' + (genre || '') + '题材专属规则（' + rules.specific.length + ' 条）', '');
    for (let i = 0; i < rules.specific.length; i++) {
      lines.push((i + 1) + '. ' + rules.specific[i]);
    }
    lines.push('');
  }
  return lines.join('\n') + '\n';
}
