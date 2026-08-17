/**
 * NINGLET 结构化状态 + Markdown 投影 —— 确定性纯函数。
 *
 * 把 state.json 从扁平结构升级成 inkos 式的可投影结构化状态：
 *   - chapterSummaries: 每章结构化摘要（events/stateChanges/hookActivity/mood/chapterType）
 *   - currentState: 当前事实表（location/protagonistState/goal/constraint/alliances/conflict）
 *
 * Markdown 投影生成器把结构化状态渲染成人类可读的 .md：
 *   - renderHooksProjection → pending_hooks.md（伏笔池，含 stale/blocked 标记）
 *   - renderCurrentStateProjection → current_state.md（当前状态事实表）
 *   - renderChapterSummariesProjection → chapter_summaries.md（章节摘要表）
 *
 * 唯一数据源：本文件，插件内联副本由 parity 测试锁死。
 */

import { computeHookDiagnostics, renderHookDiagnosticMarker } from './hook-lifecycle.js';

// ============ 结构化章节摘要 ============

/**
 * 将松散的摘要对象规范化为结构化 ChapterSummaryRow。
 * 兼容旧格式（纯字符串）和新格式（结构化字段）。
 */
export function normalizeChapterSummary(raw, index) {
  if (typeof raw === 'string') {
    return { chapter: index, title: '第' + index + '章', characters: '', events: raw, stateChanges: '', hookActivity: '', mood: '', chapterType: '' };
  }
  if (!raw || typeof raw !== 'object') return null;
  return {
    chapter: Number.isInteger(raw.chapter) ? raw.chapter : index,
    title: String(raw.title || ('第' + index + '章')),
    characters: String(raw.characters || ''),
    events: String(raw.events || raw.text || ''),
    stateChanges: String(raw.stateChanges || ''),
    hookActivity: String(raw.hookActivity || ''),
    mood: String(raw.mood || ''),
    chapterType: String(raw.chapterType || ''),
  };
}

// ============ 当前状态事实表 ============

export const CURRENT_STATE_FIELDS = ['currentLocation', 'protagonistState', 'currentGoal', 'currentConstraint', 'currentAlliances', 'currentConflict'];

/**
 * 将松散的 currentState patch 规范化，只保留已知字段。
 */
export function normalizeCurrentStatePatch(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const result = {};
  for (const f of CURRENT_STATE_FIELDS) {
    if (typeof raw[f] === 'string' && raw[f].trim()) result[f] = raw[f].trim();
  }
  return result;
}

/**
 * 将 patch 合并进已有 currentState。新值覆盖旧值，空值保留旧值。
 */
export function applyCurrentStatePatch(currentState, patch) {
  const norm = normalizeCurrentStatePatch(patch);
  return Object.assign({}, currentState || {}, norm);
}

// ============ Markdown 投影：伏笔池 ============

function escapeTableCell(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}

/**
 * 渲染伏笔池 Markdown 表格（pending_hooks.md）。
 * 含 stale/blocked 诊断标记（需传入 currentChapter）。
 */
export function renderHooksProjection(hooks, currentChapter) {
  if (!Array.isArray(hooks) || hooks.length === 0) return '# 伏笔池\n\n（暂无伏笔）\n';
  const lines = [
    '# 伏笔池',
    '',
    '| hook_id | 起始章 | 名称 | 状态 | 最近推进 | 预期回收 | 回收节奏 | 上游依赖 | 核心 | 备注 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  // stale/blocked 诊断标记
  let diags = null;
  if (currentChapter !== undefined) {
    try { diags = computeHookDiagnostics(hooks, currentChapter); } catch (e) { /* skip */ }
  }

  const sorted = hooks.slice().sort((a, b) => (a.startChapter || 0) - (b.startChapter || 0));
  for (const hook of sorted) {
    let statusCell = hook.status || 'open';
    if (diags) {
      const d = diags.get(hook.hookId);
      if (d) {
        const marker = renderHookDiagnosticMarker(d);
        if (marker) statusCell = statusCell + ' (' + marker + ')';
      }
    }
    lines.push('| ' + [
      hook.hookId || '',
      hook.startChapter || 0,
      hook.name || '',
      statusCell,
      hook.lastAdvancedChapter || 0,
      hook.expectedPayoff || '',
      hook.payoffTiming || '',
      (hook.dependsOn && hook.dependsOn.length > 0) ? '[' + hook.dependsOn.join(', ') + ']' : '无',
      hook.coreHook ? '是' : '否',
      hook.notes || '',
    ].map(escapeTableCell).join(' | ') + ' |');
  }
  return lines.join('\n') + '\n';
}

// ============ Markdown 投影：当前状态 ============

/**
 * 渲染当前状态 Markdown 表格（current_state.md）。
 */
export function renderCurrentStateProjection(currentState) {
  const labels = {
    chapter: '当前章节',
    currentLocation: '当前位置',
    protagonistState: '主角状态',
    currentGoal: '当前目标',
    currentConstraint: '当前限制',
    currentAlliances: '当前敌我',
    currentConflict: '当前冲突',
  };
  const lines = [
    '# 当前状态',
    '',
    '| 字段 | 值 |',
    '| --- | --- |',
  ];
  const slots = ['currentLocation', 'protagonistState', 'currentGoal', 'currentConstraint', 'currentAlliances', 'currentConflict'];
  for (const f of slots) {
    const val = currentState && currentState[f] ? currentState[f] : '（未设定）';
    lines.push('| ' + escapeTableCell(labels[f]) + ' | ' + escapeTableCell(val) + ' |');
  }
  // 其他事实（subject/predicate/object 格式）
  if (currentState && Array.isArray(currentState.facts)) {
    lines.push('', '## 其他事实', '');
    for (const fact of currentState.facts) {
      lines.push('- ' + escapeTableCell(fact.subject) + ' ' + escapeTableCell(fact.predicate) + ' ' + escapeTableCell(fact.object) + '（第' + fact.validFromChapter + '章起）');
    }
  }
  return lines.join('\n') + '\n';
}

// ============ Markdown 投影：章节摘要 ============

/**
 * 渲染章节摘要 Markdown 表格（chapter_summaries.md）。
 */
export function renderChapterSummariesProjection(summaries) {
  if (!Array.isArray(summaries) || summaries.length === 0) return '# 章节摘要\n\n（暂无章节）\n';
  const lines = [
    '# 章节摘要',
    '',
    '| 章节 | 标题 | 出场人物 | 关键事件 | 状态变化 | 伏笔动态 | 情绪基调 | 章节类型 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  const sorted = summaries.slice().sort((a, b) => (a.chapter || a.index || 0) - (b.chapter || b.index || 0));
  for (const raw of sorted) {
    const s = normalizeChapterSummary(raw, raw.chapter || raw.index || 0);
    if (!s) continue;
    lines.push('| ' + [
      s.chapter, s.title, s.characters, s.events, s.stateChanges, s.hookActivity, s.mood, s.chapterType,
    ].map(escapeTableCell).join(' | ') + ' |');
  }
  return lines.join('\n') + '\n';
}

// ============ 全量投影：从 state.json 生成所有 .md ============

/**
 * 从完整 state.json 生成所有 Markdown 投影文件。
 * @returns {Object} { 'current_state.md': '...', 'pending_hooks.md': '...', 'chapter_summaries.md': '...' }
 */
export function renderAllProjections(state, currentChapter) {
  const result = {};
  result['current_state.md'] = renderCurrentStateProjection(state.currentState || {});
  result['pending_hooks.md'] = renderHooksProjection(state.hooks || [], currentChapter);
  result['chapter_summaries.md'] = renderChapterSummariesProjection(state.summaries || []);
  return result;
}
