import { test } from 'node:test';
import assert from 'node:assert';
import { detectLanguage, countZhChars, countEnWords, countWords } from '../src/word-count.js';

test('detectLanguage 中文优先', () => {
  assert.equal(detectLanguage('他缓缓睁开眼，望向远方。'), 'zh');
  assert.equal(detectLanguage('He opened his eyes.'), 'en');
});

test('countZhChars 只数 CJK 字符，不数标点/空白', () => {
  assert.equal(countZhChars('他望向远方。'), 5);
  assert.equal(countZhChars('Hello 世界'), 2);
});

test('countEnWords 按空白分词', () => {
  assert.equal(countEnWords('He opened his eyes.'), 4);
});

test('countWords 按语言派发', () => {
  assert.equal(countWords('他望向远方。'), 5);
  assert.equal(countWords('He opened his eyes.'), 4);
});
