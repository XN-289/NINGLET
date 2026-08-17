import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { DEFAULT_FORBIDDEN } from '../src/anti-ai-engine.js';

// 锁死 src/ 纯函数与「固化版 TS 包」(harness-packages/tool-ninglet/src/index.ts) 的一致性。
// 防止 TS 包静默漂移（kealin 的教训：双份阈值/词表漂移）。
const ts = readFileSync(new URL('../harness-packages/tool-ninglet/src/index.ts', import.meta.url), 'utf8');

test('TS 包 DEFAULT_FORBIDDEN 与 src 逐词一致', () => {
  for (const w of DEFAULT_FORBIDDEN) {
    assert.ok(ts.includes("'" + w + "'"), `TS 包缺禁用词: ${w}`);
  }
});

test('TS 包 validateState 含 null 守卫与 outline/characters 校验', () => {
  assert.ok(ts.includes('state is not an object'), 'TS 包 validateState 缺 null/非对象守卫');
  assert.ok(ts.includes('nextChapterIndex 必须为正整数'), 'TS 包 validateState 缺 nextChapterIndex>=1 校验');
  assert.ok(ts.includes('outline 必须为数组'), 'TS 包缺 outline 校验');
  assert.ok(ts.includes('characters 必须为数组'), 'TS 包缺 characters 校验');
});

test('TS 包 detectAI 含 severity 字段与 rules 覆盖', () => {
  assert.ok(ts.includes('severity'), 'TS 包 detectAI 缺 severity 字段');
  assert.ok(ts.includes('deThreshold'), 'TS 包 detectAI 缺 rules 覆盖参数');
});

test('TS 包 create_book 含大纲生成', () => {
  assert.ok(ts.includes('章回大纲') || ts.includes('8-12 章'), 'TS 包 create_book 缺大纲生成');
  assert.ok(ts.includes('outline'), 'TS 包 create_book 缺 outline 字段');
});

test('TS 包 write_chapter 含苏格拉底规划与观察者抽取', () => {
  assert.ok(ts.includes('苏格拉底'), 'TS 包 write_chapter 缺苏格拉底规划');
  assert.ok(ts.includes('userQuestions'), 'TS 包 write_chapter 缺 userQuestions 调用');
  assert.ok(ts.includes('小说观察者'), 'TS 包 write_chapter 缺观察者抽取');
});

test('TS 包 bookId 校验入口充足（防路径穿越）', () => {
  const matches = ts.match(/unsafe bookId/g) || [];
  assert.ok(matches.length >= 3, `TS 包 bookId 校验入口不足（预期 ≥3，实际 ${matches.length}）`);
});

test('service.ts 含 5 个 @Remote 客户端 RPC', () => {
  const svc = readFileSync(new URL('../harness-packages/tool-ninglet/src/service.ts', import.meta.url), 'utf8');
  for (const m of ["'list_books'", "'list_chapters'", "'list_outline'", "'get_structure'", "'read_chapter'"]) {
    assert.ok(svc.includes('@Remote(' + m + ')'), `service.ts 缺 @Remote(${m})`);
  }
});
