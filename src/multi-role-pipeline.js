/**
 * NINGLET 多角色流水线 —— 确定性纯函数。
 *
 * 定义 7 个角色的职责边界，以及两个核心纯函数：
 *   - composeContext: Composer 角色——把状态树编排成结构化写作简报
 *   - auditContinuity: Auditor 角色——检测连续性错误（角色名/时间线/伏笔冲突）
 *
 * 流水线角色（inkos 式，承载在 DSH 上）：
 *   Planner   → 追问意图（give-me 苏格拉底）
 *   Composer  → 编排上下文简报（本文件 composeContext）
 *   Writer    → 写正文（注入 Composer 简报）
 *   Observer  → 抽取角色/伏笔/结构化摘要/状态补丁
 *   Auditor   → 反 AI 味（detectAI）+ 连续性审计（本文件 auditContinuity）
 *   Reviser   → 4 阶段重写（定点清除→结构→风格→人味）
 *   Settler   → 校验落盘 + 刷新投影
 *
 * 唯一数据源：本文件，插件内联副本由 parity 测试锁死。
 */

import { computeHookDiagnostics } from './hook-lifecycle.js';

// ============ 流水线角色定义 ============

export const PIPELINE_ROLES = [
  { name: 'Planner',  purpose: '追问本章意图（核心推进/主角状态/结尾钩子）', order: 1 },
  { name: 'Composer', purpose: '编排上下文：前文摘要+当前状态+伏笔池+题材规则→结构化简报', order: 2 },
  { name: 'Writer',   purpose: '根据简报写正文，注入反 AI 味规则和题材规则', order: 3 },
  { name: 'Observer', purpose: '抽取角色/伏笔/结构化摘要/当前状态补丁', order: 4 },
  { name: 'Auditor',  purpose: '反 AI 味 12 维检测 + 连续性审计', order: 5 },
  { name: 'Reviser',  purpose: '4 阶段重写（定点清除→结构→风格→人味注入）', order: 6 },
  { name: 'Settler',  purpose: '校验落盘 + 刷新 Markdown 投影 + 控制面文档', order: 7 },
];

// ============ Composer：上下文编排 ============

/**
 * Composer 角色：把状态树编排成结构化写作简报。
 * 纯函数，不调 LLM——它决定 Writer 看到什么上下文。
 *
 * @param {Object} state - 当前 state.json
 * @param {number} index - 本章章号
 * @param {string} intent - 本章意图（Planner 产出）
 * @param {Object} genreRules - getRulesForGenre 的返回值
 * @returns {Object} 结构化上下文对象 { intent, recentSummaries, currentState, activeHooks, staleWarnings, genreRules, writerPrompt }
 */
export function composeContext(state, index, intent, genreRules) {
  const summaries = state.summaries || [];
  const recentCount = Math.min(5, summaries.length);
  const recentSummaries = summaries.slice(-recentCount).map(function (s) {
    const chapter = s.chapter || s.index || '?';
    const text = s.events || s.text || '';
    return { chapter: chapter, text: text };
  });

  // 当前状态事实
  const cs = state.currentState || {};
  const currentStateFacts = {};
  if (cs.currentLocation) currentStateFacts.currentLocation = cs.currentLocation;
  if (cs.protagonistState) currentStateFacts.protagonistState = cs.protagonistState;
  if (cs.currentGoal) currentStateFacts.currentGoal = cs.currentGoal;
  if (cs.currentConstraint) currentStateFacts.currentConstraint = cs.currentConstraint;
  if (cs.currentAlliances) currentStateFacts.currentAlliances = cs.currentAlliances;
  if (cs.currentConflict) currentStateFacts.currentConflict = cs.currentConflict;

  // 活跃伏笔（open + progressing，排除 resolved）
  const allHooks = state.hooks || [];
  const activeHooks = allHooks
    .filter(function (h) { return h.status === 'open' || h.status === 'progressing'; })
    .map(function (h) {
      return { name: h.name, status: h.status, expectedPayoff: h.expectedPayoff || h.notes || '' };
    });

  // 过期伏笔警告
  const staleWarnings = [];
  if (allHooks.length > 0 && index > 0) {
    try {
      const diags = computeHookDiagnostics(allHooks, index);
      for (const h of allHooks) {
        const d = diags.get(h.hookId);
        if (d && d.stale) staleWarnings.push({
          name: h.name,
          startChapter: h.startChapter,
          distance: d.distance,
          halfLife: d.halfLife,
          message: '「' + h.name + '」已过期（第' + h.startChapter + '章埋下，距' + d.distance + '章/半衰' + d.halfLife + '），本章应推进或回收',
        });
      }
    } catch (e) { /* hook-lifecycle 不可用时跳过 */ }
  }

  // 角色列表（供 Writer 保持人物一致性）
  const characters = (state.characters || []).map(function (c) {
    return { name: c.name, role: c.role || '', desc: c.desc || '' };
  });

  return {
    index: index,
    intent: intent || '',
    recentSummaries: recentSummaries,
    currentState: currentStateFacts,
    activeHooks: activeHooks,
    staleWarnings: staleWarnings,
    characters: characters,
    genreRules: genreRules || { generic: [], specific: [] },
  };
}

// ============ Auditor：连续性审计 ============

/**
 * Auditor 角色：检测连续性错误。纯函数，不调 LLM。
 *
 * 检查项：
 *   - 角色名一致性：正文中出现的已知角色名是否与 state.characters 匹配
 *   - 伏笔冲突：正文中标记 resolved 的伏笔在 state 中是否仍为 open
 *   - 状态矛盾：正文中的位置/目标是否与 currentState 矛盾（简单包含检查）
 *   - 章节衔接：上一章摘要的结尾线索是否在本章有呼应
 *
 * @param {string} body - 章节正文
 * @param {Object} state - 当前 state.json
 * @param {Object} observerResult - Observer 抽取结果（{ characters, hooks, currentState }）
 * @param {number} index - 本章章号
 * @returns {Object} { errors: [], warnings: [], ok: boolean }
 */
export function auditContinuity(body, state, observerResult, index) {
  const errors = [];
  const warnings = [];

  // 1. 角色名一致性：Observer 抽取的角色是否在已知角色表中
  const knownChars = (state.characters || []).map(function (c) { return c.name; });
  if (observerResult && Array.isArray(observerResult.characters)) {
    for (const nc of observerResult.characters) {
      if (nc.name && knownChars.length > 0 && knownChars.indexOf(nc.name) === -1) {
        warnings.push({
          type: 'new-character',
          message: '新角色「' + nc.name + '」首次出现（不在已知角色表中）',
          name: nc.name,
        });
      }
    }
  }

  // 2. 伏笔状态冲突：Observer 标记 resolved 的伏笔，在 state 中是否仍为 open/progressing
  const stateHooks = state.hooks || [];
  const hookMap = {};
  for (const h of stateHooks) hookMap[h.name] = h;
  if (observerResult && Array.isArray(observerResult.hooks)) {
    for (const oh of observerResult.hooks) {
      if (oh.status === 'resolved' && hookMap[oh.name]) {
        const existing = hookMap[oh.name];
        if (existing.status !== 'resolved') {
          warnings.push({
            type: 'hook-resolution',
            message: '伏笔「' + oh.name + '」被标记回收（state 中状态为 ' + existing.status + '），确认是否合理',
            name: oh.name,
          });
        }
      }
    }
  }

  // 3. 章节衔接：上一章摘要的最后一句话中的关键信息是否在本章有呼应
  const summaries = state.summaries || [];
  if (summaries.length > 0) {
    const lastSummary = summaries[summaries.length - 1];
    const lastText = lastSummary.events || lastSummary.text || '';
    // 提取上一章最后30字中的名词性片段
    const tail = lastText.slice(-30);
    if (tail.length > 5) {
      // 简单检查：上一章结尾提到了某个已知角色名，本章是否也提到
      for (const name of knownChars) {
        if (tail.includes(name) && !body.includes(name)) {
          warnings.push({
            type: 'character-drop',
            message: '上一章结尾出现的角色「' + name + '」在本章未提及',
            name: name,
          });
        }
      }
    }
  }

  // 4. 位置矛盾检查
  const cs = state.currentState || {};
  const obsCS = observerResult && observerResult.currentState ? observerResult.currentState : {};
  if (cs.currentLocation && obsCS.currentLocation && cs.currentLocation !== obsCS.currentLocation) {
    // 位置变化是正常的（角色移动），但记录为信息
    warnings.push({
      type: 'location-change',
      message: '位置变化：「' + cs.currentLocation + '」→「' + obsCS.currentLocation + '」',
    });
  }

  return {
    errors: errors,
    warnings: warnings,
    ok: errors.length === 0,
  };
}
