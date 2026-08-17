import { test } from 'node:test';
import assert from 'node:assert';
import {
  normalizeChapterSummary, normalizeCurrentStatePatch, applyCurrentStatePatch,
  renderHooksProjection, renderCurrentStateProjection, renderChapterSummariesProjection,
  renderAllProjections,
} from '../src/state-projection.js';
import { normalizeHook } from '../src/hook-lifecycle.js';

test('normalizeChapterSummary 兼容旧格式（纯字符串）', () => {
  const s = normalizeChapterSummary('一句话摘要', 3);
  assert.equal(s.chapter, 3);
  assert.equal(s.events, '一句话摘要');
  assert.equal(s.title, '第3章');
});

test('normalizeChapterSummary 结构化字段', () => {
  const s = normalizeChapterSummary({ chapter: 5, title: '危机', characters: '主角,反派', events: '战斗', mood: '紧张' }, 5);
  assert.equal(s.characters, '主角,反派');
  assert.equal(s.mood, '紧张');
  assert.equal(s.chapterType, '');
});

test('normalizeChapterSummary 空对象返回 null', () => {
  assert.equal(normalizeChapterSummary(null, 1), null);
});

test('normalizeCurrentStatePatch 只保留已知字段', () => {
  const p = normalizeCurrentStatePatch({ currentLocation: '山顶', unknownField: 'x', currentGoal: '' });
  assert.equal(p.currentLocation, '山顶');
  assert.ok(!('unknownField' in p));
  assert.ok(!('currentGoal' in p)); // 空字符串不保留
});

test('applyCurrentStatePatch 新值覆盖旧值', () => {
  const current = { currentLocation: '山谷', currentGoal: '活下去' };
  const next = applyCurrentStatePatch(current, { currentLocation: '山顶' });
  assert.equal(next.currentLocation, '山顶');
  assert.equal(next.currentGoal, '活下去'); // 旧值保留
});

test('renderHooksProjection 空列表', () => {
  const md = renderHooksProjection([], 1);
  assert.ok(md.includes('暂无伏笔'));
});

test('renderHooksProjection 渲染表格', () => {
  const hooks = [normalizeHook({ name: '魔刀', status: 'open', payoffTiming: 'immediate' }, 1)];
  const md = renderHooksProjection(hooks, 1);
  assert.ok(md.includes('# 伏笔池'));
  assert.ok(md.includes('魔刀'));
  assert.ok(md.includes('open'));
});

test('renderHooksProjection 过期伏笔含标记', () => {
  const hooks = [normalizeHook({ name: '过期伏笔', status: 'open', payoffTiming: 'immediate' }, 1)];
  const md = renderHooksProjection(hooks, 20); // 半衰期10，距离19>10
  assert.ok(md.includes('过期'), '应该含过期标记: ' + md);
});

test('renderCurrentStateProjection 渲染状态表', () => {
  const md = renderCurrentStateProjection({ currentLocation: '山顶', currentGoal: '复仇' });
  assert.ok(md.includes('# 当前状态'));
  assert.ok(md.includes('山顶'));
  assert.ok(md.includes('复仇'));
  assert.ok(md.includes('未设定')); // 未设的字段显示占位
});

test('renderCurrentStateProjection 含其他事实', () => {
  const md = renderCurrentStateProjection({
    facts: [{ subject: '主角', predicate: '持有', object: '魔刀', validFromChapter: 3 }],
  });
  assert.ok(md.includes('其他事实'));
  assert.ok(md.includes('主角'));
  assert.ok(md.includes('魔刀'));
});

test('renderChapterSummariesProjection 空列表', () => {
  const md = renderChapterSummariesProjection([]);
  assert.ok(md.includes('暂无章节'));
});

test('renderChapterSummariesProjection 渲染表格', () => {
  const summaries = [
    normalizeChapterSummary({ chapter: 1, title: '开篇', events: '主角登场' }, 1),
    normalizeChapterSummary({ chapter: 2, title: '冲突', events: '敌人出现', mood: '紧张' }, 2),
  ];
  const md = renderChapterSummariesProjection(summaries);
  assert.ok(md.includes('# 章节摘要'));
  assert.ok(md.includes('开篇'));
  assert.ok(md.includes('冲突'));
  assert.ok(md.includes('紧张'));
});

test('renderChapterSummariesProjection 兼容旧格式摘要', () => {
  const summaries = [{ index: 1, text: '旧的截断摘要' }];
  const md = renderChapterSummariesProjection(summaries);
  assert.ok(md.includes('旧的截断摘要'));
});

test('renderAllProjections 生成3个文件', () => {
  const state = {
    hooks: [normalizeHook({ name: '伏笔A' }, 1)],
    summaries: [normalizeChapterSummary({ chapter: 1, events: '开篇' }, 1)],
    currentState: { currentLocation: '山顶' },
  };
  const projections = renderAllProjections(state, 1);
  assert.ok(projections['current_state.md']);
  assert.ok(projections['pending_hooks.md']);
  assert.ok(projections['chapter_summaries.md']);
  assert.ok(projections['pending_hooks.md'].includes('伏笔A'));
});
