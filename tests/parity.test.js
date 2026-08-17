import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { DEFAULT_FORBIDDEN } from '../src/anti-ai-engine.js';

// 读取插件 Host 体，锁死 src 与插件内联的一致性（防漂移）。
const plugin = readFileSync(new URL('../plugins/host-novel.js', import.meta.url), 'utf8');

test('插件内联 DEFAULT_FORBIDDEN 与 src 逐词一致', () => {
  for (const w of DEFAULT_FORBIDDEN) {
    assert.ok(plugin.includes("'" + w + "'"), `插件缺禁用词: ${w}`);
  }
});

test('插件内联 validateState 含 null 守卫（不崩）', () => {
  assert.ok(plugin.includes('state is not an object'), '插件 validateState 缺 null/非对象守卫');
  assert.ok(plugin.includes('nextChapterIndex 必须为正整数'), '插件 validateState 缺 nextChapterIndex>=1 校验');
});

test('插件内联 detectAI 含 severity 字段与 rules 覆盖', () => {
  assert.ok(plugin.includes('severity'), '插件 detectAI 缺 severity 字段');
  assert.ok(plugin.includes('deThreshold'), '插件 detectAI 缺 rules 覆盖参数');
});

test('插件内联 rewriteRules 含完整约束文本', () => {
  assert.ok(plugin.includes('不超过3个') || plugin.includes('不超过 3 个'), '插件 rewriteRules 缺的密度阈值');
  assert.ok(plugin.includes('长短交替'), '插件 rewriteRules 缺长短交替');
});

test('插件 readState 含 bookId 校验（防路径穿越）', () => {
  const matches = plugin.match(/unsafe bookId/g) || [];
  assert.ok(matches.length >= 3, `插件 bookId 校验入口不足（预期 ≥3，实际 ${matches.length}）`);
});

test('插件 validateState 校验 outline/characters 为数组', () => {
  assert.ok(plugin.includes('outline 必须为数组'), '插件缺 outline 校验');
  assert.ok(plugin.includes('characters 必须为数组'), '插件缺 characters 校验');
});

test('插件含 get_structure 聚合 RPC 与观察者抽取', () => {
  assert.ok(plugin.includes('get_structure'), '插件缺 get_structure RPC');
  assert.ok(plugin.includes('小说观察者'), '插件缺观察者抽取');
});

test('插件含 normalizeHook / mergeHooks 伏笔生命周期', () => {
  assert.ok(plugin.includes('normalizeHook'), '插件缺 normalizeHook');
  assert.ok(plugin.includes('mergeHooks'), '插件缺 mergeHooks');
});

test('插件含 normalizeChapterSummary / renderAllProjections 结构化状态', () => {
  assert.ok(plugin.includes('normalizeChapterSummary'), '插件缺 normalizeChapterSummary');
  assert.ok(plugin.includes('renderAllProjections') || plugin.includes('renderHooksProjection'), '插件缺 Markdown 投影');
});

test('插件含题材规则体系 + 控制面文档', () => {
  assert.ok(plugin.includes('GENERIC_RULES') || plugin.includes('getRulesForGenre'), '插件缺题材规则');
  assert.ok(plugin.includes('renderAuthorIntent') || plugin.includes('renderCurrentFocus'), '插件缺控制面文档');
});

test('插件含 composeContext / auditContinuity 多角色流水线', () => {
  assert.ok(plugin.includes('composeContext'), '插件缺 composeContext');
  assert.ok(plugin.includes('auditContinuity'), '插件缺 auditContinuity');
});
