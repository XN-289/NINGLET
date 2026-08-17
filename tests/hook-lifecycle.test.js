import { test } from 'node:test';
import assert from 'node:assert';
import {
  HOOK_STATUSES, PAYOFF_TIMINGS,
  defaultHalfLifeChapters, resolveHalfLifeChapters,
  normalizeHook, validateHook,
  computeHookDiagnostics, renderHookDiagnosticMarker,
  mergeHooks, hookHealthSummary,
} from '../src/hook-lifecycle.js';

test('HOOK_STATUSES 含4种状态', () => {
  assert.ok(HOOK_STATUSES.includes('open'));
  assert.ok(HOOK_STATUSES.includes('progressing'));
  assert.ok(HOOK_STATUSES.includes('resolved'));
  assert.ok(HOOK_STATUSES.includes('deferred'));
  assert.equal(HOOK_STATUSES.length, 4);
});

test('PAYOFF_TIMINGS 含5种回收节奏', () => {
  assert.ok(PAYOFF_TIMINGS.includes('immediate'));
  assert.ok(PAYOFF_TIMINGS.includes('endgame'));
  assert.equal(PAYOFF_TIMINGS.length, 5);
});

test('defaultHalfLifeChapters 按节奏推导', () => {
  assert.equal(defaultHalfLifeChapters('immediate'), 10);
  assert.equal(defaultHalfLifeChapters('near-term'), 10);
  assert.equal(defaultHalfLifeChapters('mid-arc'), 30);
  assert.equal(defaultHalfLifeChapters('slow-burn'), 80);
  assert.equal(defaultHalfLifeChapters('endgame'), 80);
  assert.equal(defaultHalfLifeChapters(undefined), 30);
});

test('resolveHalfLifeChapters 优先用显式值', () => {
  assert.equal(resolveHalfLifeChapters({ halfLifeChapters: 50, payoffTiming: 'immediate' }), 50);
  assert.equal(resolveHalfLifeChapters({ payoffTiming: 'endgame' }), 80);
});

test('normalizeHook 补全缺失字段', () => {
  const h = normalizeHook({ name: '魔刀之谜', note: '第一章出现' }, 1);
  assert.ok(h.hookId);
  assert.equal(h.status, 'open');
  assert.equal(h.startChapter, 1);
  assert.equal(h.expectedPayoff, '第一章出现');
  assert.deepEqual(h.dependsOn, []);
});

test('normalizeHook 空名返回 null', () => {
  assert.equal(normalizeHook({ name: '' }, 1), null);
  assert.equal(normalizeHook({}, 1), null);
});

test('validateHook 合法伏笔', () => {
  const h = normalizeHook({ name: '测试', status: 'open' }, 1);
  const r = validateHook(h);
  assert.ok(r.ok);
});

test('validateHook 拒绝非法状态', () => {
  const r = validateHook({ hookId: 'h1', name: 'x', status: 'invalid', startChapter: 1 });
  assert.ok(!r.ok);
});

test('computeHookDiagnostics 检测过期伏笔', () => {
  const hooks = [
    normalizeHook({ name: '短命伏笔', status: 'open', payoffTiming: 'immediate' }, 1),
  ];
  const diags = computeHookDiagnostics(hooks, 15); // 第15章，半衰期10，距离14>10
  const d = diags.get(hooks[0].hookId);
  assert.ok(d.stale, '应该过期');
  assert.equal(d.distance, 14);
  assert.equal(d.halfLife, 10);
});

test('computeHookDapters 未过期不标记 stale', () => {
  const hooks = [normalizeHook({ name: '新鲜伏笔', status: 'open', payoffTiming: 'mid-arc' }, 5)];
  const diags = computeHookDiagnostics(hooks, 10);
  const d = diags.get(hooks[0].hookId);
  assert.ok(!d.stale);
});

test('computeHookDiagnostics 检测受阻伏笔', () => {
  const hooks = [
    normalizeHook({ name: '上游', status: 'open' }, 1),
    normalizeHook({ name: '下游', status: 'open', dependsOn: ['hook-上游'] }, 3),
  ];
  const diags = computeHookDiagnostics(hooks, 5);
  const d = diags.get(hooks[1].hookId);
  assert.ok(d.blocked, '下游应该受阻');
  assert.ok(d.missingUpstream.includes('hook-上游'));
});

test('computeHookDiagnostics resolved 伏笔不标记 stale/blocked', () => {
  const hooks = [
    normalizeHook({ name: '已回收', status: 'resolved', payoffTiming: 'immediate' }, 1),
  ];
  const diags = computeHookDiagnostics(hooks, 100);
  const d = diags.get(hooks[0].hookId);
  assert.ok(!d.stale);
  assert.ok(!d.blocked);
});

test('renderHookDiagnosticMarker 输出标记文本', () => {
  assert.equal(renderHookDiagnosticMarker({ stale: false, blocked: false, missingUpstream: [] }), '');
  const marker = renderHookDiagnosticMarker({ stale: true, blocked: true, missingUpstream: ['hook-a'], distance: 20, halfLife: 10 });
  assert.ok(marker.includes('过期'));
  assert.ok(marker.includes('受阻'));
});

test('mergeHooks 新伏笔追加', () => {
  const existing = [normalizeHook({ name: '旧伏笔' }, 1)];
  const merged = mergeHooks(existing, [{ name: '新伏笔', status: 'open', note: '新' }], 5);
  assert.equal(merged.length, 2);
  assert.ok(merged.some((h) => h.name === '新伏笔'));
});

test('mergeHooks 已存在伏笔状态推进', () => {
  const existing = [normalizeHook({ name: '伏笔A', status: 'open' }, 1)];
  const merged = mergeHooks(existing, [{ name: '伏笔A', status: 'progressing', note: '推进了' }], 5);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'progressing');
  assert.equal(merged[0].lastAdvancedChapter, 5);
});

test('mergeHooks resolved 不会被重新 open', () => {
  const existing = [normalizeHook({ name: '伏笔B', status: 'resolved' }, 1)];
  const merged = mergeHooks(existing, [{ name: '伏笔B', status: 'open' }], 5);
  assert.equal(merged[0].status, 'resolved');
});

test('hookHealthSummary 统计伏笔健康度', () => {
  const hooks = [
    normalizeHook({ name: 'A', status: 'open', payoffTiming: 'immediate' }, 1),
    normalizeHook({ name: 'B', status: 'progressing' }, 3),
    normalizeHook({ name: 'C', status: 'resolved' }, 5),
  ];
  const summary = hookHealthSummary(hooks, 20);
  assert.equal(summary.total, 3);
  assert.equal(summary.open, 1);
  assert.equal(summary.progressing, 1);
  assert.equal(summary.resolved, 1);
  assert.ok(summary.stale >= 1); // A 应该过期了
});
