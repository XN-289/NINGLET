import { test } from 'node:test';
import assert from 'node:assert';
import {
  GENERIC_RULES, GENRE_RULES, SUPPORTED_GENRES,
  getRulesForGenre, renderAuthorIntent, renderCurrentFocus, renderBookRules,
} from '../src/control-docs.js';
import { normalizeHook } from '../src/hook-lifecycle.js';

test('GENERIC_RULES 至少20条', () => {
  assert.ok(GENERIC_RULES.length >= 20, '通用规则应有20+条，实际 ' + GENERIC_RULES.length);
});

test('SUPPORTED_GENRES 含玄幻/都市/悬疑/言情/科幻/历史', () => {
  assert.ok(SUPPORTED_GENRES.includes('玄幻'));
  assert.ok(SUPPORTED_GENRES.includes('都市'));
  assert.ok(SUPPORTED_GENRES.includes('悬疑'));
  assert.ok(SUPPORTED_GENRES.includes('言情'));
  assert.ok(SUPPORTED_GENRES.includes('科幻'));
  assert.ok(SUPPORTED_GENRES.includes('历史'));
});

test('getRulesForGenre 已知题材返回通用+专属', () => {
  const r = getRulesForGenre('玄幻');
  assert.ok(r.generic.length > 0);
  assert.ok(r.specific.length > 0);
  assert.ok(r.specific.some((s) => s.includes('力量体系')));
  assert.equal(r.all.length, r.generic.length + r.specific.length);
});

test('getRulesForGenre 未知题材只返回通用', () => {
  const r = getRulesForGenre('不存在');
  assert.ok(r.generic.length > 0);
  assert.equal(r.specific.length, 0);
});

test('renderAuthorIntent 渲染创作意图', () => {
  const md = renderAuthorIntent({ title: '魔刀', genre: '玄幻', brief: '少年与魔刀的故事', targetChapters: 50, chapterWords: 2000 });
  assert.ok(md.includes('# 创作意图'));
  assert.ok(md.includes('魔刀'));
  assert.ok(md.includes('玄幻'));
  assert.ok(md.includes('力量体系')); // 题材规则
});

test('renderAuthorIntent 空书返回占位', () => {
  const md = renderAuthorIntent(null);
  assert.ok(md.includes('未设定'));
});

test('renderCurrentFocus 渲染进度+伏笔', () => {
  const state = {
    book: { targetChapters: 50 },
    hooks: [normalizeHook({ name: '伏笔A', status: 'open', payoffTiming: 'immediate' }, 1)],
    currentState: { currentLocation: '山顶', currentGoal: '复仇' },
    summaries: [{ index: 1, text: '开篇' }],
  };
  const md = renderCurrentFocus(state, 20);
  assert.ok(md.includes('# 近期关注'));
  assert.ok(md.includes('第 20 章'));
  assert.ok(md.includes('山顶'));
  assert.ok(md.includes('复仇'));
});

test('renderCurrentFocus 过期伏笔显示警告', () => {
  const state = {
    book: { targetChapters: 50 },
    hooks: [normalizeHook({ name: '过期伏笔', status: 'open', payoffTiming: 'immediate' }, 1)],
  };
  const md = renderCurrentFocus(state, 20); // 半衰期10，距离19>10
  assert.ok(md.includes('过期'), '应该有过期警告: ' + md);
  assert.ok(md.includes('过期伏笔'));
});

test('renderBookRules 渲染规则列表', () => {
  const md = renderBookRules('玄幻');
  assert.ok(md.includes('# 书级创作规则'));
  assert.ok(md.includes('通用规则'));
  assert.ok(md.includes('玄幻题材专属规则'));
  assert.ok(md.includes('力量体系'));
  assert.ok(md.includes('可手动编辑'));
});

test('renderBookRules 未知题材只渲染通用', () => {
  const md = renderBookRules('不存在');
  assert.ok(md.includes('通用规则'));
  assert.ok(!md.includes('专属规则'));
});
