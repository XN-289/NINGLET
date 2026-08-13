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
  assert.ok(plugin.includes('一段不超过 3 个'), '插件 rewriteRules 缺的密度阈值');
  assert.ok(plugin.includes('长短交替'), '插件 rewriteRules 缺长短交替');
});

test('插件 readState 含 bookId 校验（防路径穿越）', () => {
  const matches = plugin.match(/unsafe bookId/g) || [];
  assert.ok(matches.length >= 3, `插件 bookId 校验入口不足（预期 ≥3，实际 ${matches.length}）`);
});
