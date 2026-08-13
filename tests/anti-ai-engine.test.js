import { test } from 'node:test';
import assert from 'node:assert';
import { scanForbidden, deDensity, detectAI, rewriteRules } from '../src/anti-ai-engine.js';

test('scanForbidden 命中禁用词', () => {
  const hits = scanForbidden('他心中一凛，不由自主地后退一步。');
  assert.ok(hits.some((h) => h.word === '心中一凛'));
  assert.ok(hits.some((h) => h.word === '不由自主'));
});

test('scanForbidden 无命中返回空', () => {
  assert.deepEqual(scanForbidden('他退了一步，没说话。'), []);
});

test('deDensity 计算"的"字密度', () => {
  const d = deDensity('他的眼神里透着冷的、硬的光。');
  assert.ok(d > 0.04);
});

test('detectAI 命中越多分越低', () => {
  const bad = detectAI('他心中一凛，不由自主地望了过去，眼中闪过一丝复杂。');
  const good = detectAI('他退了一步，没说话。');
  assert.ok(bad.score < good.score);
  assert.ok(bad.hits.length > good.hits.length);
});

test('detectAI 分数落在 [0,100]', () => {
  for (const t of ['', '一句话', '他心中一凛不由自主眼中闪过一丝复杂情绪难以言表']) {
    const { score } = detectAI(t);
    assert.ok(score >= 0 && score <= 100);
  }
});

test('rewriteRules 包含禁用词表', () => {
  const rules = rewriteRules();
  assert.ok(rules.includes('心中一凛'));
});

test('detectAI hits 含 severity 字段', () => {
  const { hits } = detectAI('他心中一凛。');
  assert.ok(hits.length > 0);
  assert.equal(hits[0].severity, 3);
});

test('detectAI rules 覆盖阈值', () => {
  const r = detectAI('他的眼神里透着冷的、硬的光。', { deThreshold: 1 });
  assert.ok(!r.hits.some((h) => h.rule === 'de-density'));
});

test('rewriteRules 含完整约束', () => {
  const rules = rewriteRules();
  assert.ok(rules.includes('一段不超过 3 个'));
  assert.ok(rules.includes('长短交替'));
});
