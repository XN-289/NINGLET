import { test } from 'node:test';
import assert from 'node:assert';
import {
  PIPELINE_ROLES, composeContext, auditContinuity,
} from '../src/multi-role-pipeline.js';
import { normalizeHook } from '../src/hook-lifecycle.js';
import { normalizeChapterSummary } from '../src/state-projection.js';

test('PIPELINE_ROLES 含7个角色按顺序排列', () => {
  assert.equal(PIPELINE_ROLES.length, 7);
  assert.equal(PIPELINE_ROLES[0].name, 'Planner');
  assert.equal(PIPELINE_ROLES[1].name, 'Composer');
  assert.equal(PIPELINE_ROLES[2].name, 'Writer');
  assert.equal(PIPELINE_ROLES[3].name, 'Observer');
  assert.equal(PIPELINE_ROLES[4].name, 'Auditor');
  assert.equal(PIPELINE_ROLES[5].name, 'Reviser');
  assert.equal(PIPELINE_ROLES[6].name, 'Settler');
  // order 连续递增
  for (let i = 0; i < PIPELINE_ROLES.length; i++) {
    assert.equal(PIPELINE_ROLES[i].order, i + 1);
  }
});

test('composeContext 返回结构化简报', () => {
  const state = {
    summaries: [normalizeChapterSummary({ chapter: 1, events: '开篇' }, 1)],
    currentState: { currentLocation: '山顶', currentGoal: '复仇' },
    hooks: [normalizeHook({ name: '魔刀', status: 'open' }, 1)],
    characters: [{ name: '林凡', role: '主角', desc: '少年' }],
  };
  const ctx = composeContext(state, 2, '推进主线冲突', { generic: ['规则1'], specific: ['玄幻规则'] });
  assert.equal(ctx.index, 2);
  assert.equal(ctx.intent, '推进主线冲突');
  assert.ok(ctx.recentSummaries.length > 0);
  assert.equal(ctx.currentState.currentLocation, '山顶');
  assert.ok(ctx.activeHooks.some((h) => h.name === '魔刀'));
  assert.ok(ctx.characters.some((c) => c.name === '林凡'));
  assert.deepEqual(ctx.genreRules.specific, ['玄幻规则']);
});

test('composeContext 活跃伏笔排除 resolved', () => {
  const state = {
    hooks: [
      normalizeHook({ name: '活跃伏笔', status: 'open' }, 1),
      normalizeHook({ name: '已回收伏笔', status: 'resolved' }, 1),
    ],
  };
  const ctx = composeContext(state, 2, '', { generic: [], specific: [] });
  assert.ok(ctx.activeHooks.some((h) => h.name === '活跃伏笔'));
  assert.ok(!ctx.activeHooks.some((h) => h.name === '已回收伏笔'));
});

test('composeContext 过期伏笔生成警告', () => {
  const state = {
    hooks: [normalizeHook({ name: '过期伏笔', status: 'open', payoffTiming: 'immediate' }, 1)],
  };
  const ctx = composeContext(state, 20, '', { generic: [], specific: [] }); // 半衰期10，距离19>10
  assert.ok(ctx.staleWarnings.length > 0, '应该有过期警告');
  assert.ok(ctx.staleWarnings[0].message.includes('过期伏笔'));
});

test('composeContext 空状态不崩溃', () => {
  const ctx = composeContext({}, 1, '', { generic: [], specific: [] });
  assert.equal(ctx.recentSummaries.length, 0);
  assert.equal(ctx.activeHooks.length, 0);
  assert.equal(ctx.characters.length, 0);
  assert.equal(ctx.staleWarnings.length, 0);
});

test('auditContinuity 新角色出现生成警告', () => {
  const state = { characters: [{ name: '林凡' }] };
  const obs = { characters: [{ name: '新角色' }] };
  const result = auditContinuity('正文', state, obs, 2);
  assert.ok(result.warnings.some((w) => w.type === 'new-character'));
  assert.ok(result.ok); // 警告不是错误
});

test('auditContinuity 伏笔回收冲突生成警告', () => {
  const state = { hooks: [normalizeHook({ name: '魔刀', status: 'open' }, 1)] };
  const obs = { hooks: [{ name: '魔刀', status: 'resolved' }] };
  const result = auditContinuity('正文', state, obs, 5);
  assert.ok(result.warnings.some((w) => w.type === 'hook-resolution'));
});

test('auditContinuity 角色断裂生成警告', () => {
  const state = {
    summaries: [{ chapter: 1, events: '林凡在山顶战斗' }],
    characters: [{ name: '林凡' }],
  };
  // 本章正文完全没提到林凡
  const result = auditContinuity('赵明走了进来，四下环顾。', state, { characters: [], hooks: [] }, 2);
  assert.ok(result.warnings.some((w) => w.type === 'character-drop'));
});

test('auditContinuity 无问题时 ok=true', () => {
  const state = { characters: [{ name: '林凡' }] };
  const obs = { characters: [{ name: '林凡' }] };
  const result = auditContinuity('林凡走了。', state, obs, 2);
  assert.ok(result.ok);
  assert.equal(result.errors.length, 0);
});

test('auditContinuity 位置变化记录为信息', () => {
  const state = { currentState: { currentLocation: '山顶' } };
  const obs = { currentState: { currentLocation: '山脚' } };
  const result = auditContinuity('正文', state, obs, 2);
  assert.ok(result.warnings.some((w) => w.type === 'location-change'));
});
