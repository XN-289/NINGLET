import { test } from 'node:test';
import assert from 'node:assert';
import { slugify, makeBookId, isValidBookId, hash6 } from '../src/book-id.js';

test('slugify 保留 ASCII、小写、去非法字符', () => {
  assert.equal(slugify('吞天魔帝'), '');
  assert.equal(slugify('The Dark Lord!'), 'the-dark-lord');
});

test('hash6 确定性', () => {
  assert.equal(hash6('吞天魔帝'), hash6('吞天魔帝'));
  assert.match(hash6('吞天魔帝'), /^[0-9a-f]{6}$/);
});

test('makeBookId 纯中文回退 hash', () => {
  assert.equal(makeBookId('吞天魔帝'), 'book-' + hash6('吞天魔帝'));
  assert.equal(makeBookId('The Dark Lord'), 'the-dark-lord');
});

test('isValidBookId 白名单', () => {
  assert.equal(isValidBookId('the-dark-lord'), true);
  assert.equal(isValidBookId('book-abc123'), true);
  assert.equal(isValidBookId('../etc'), false);
  assert.equal(isValidBookId('a/b'), false);
  assert.equal(isValidBookId('C:\\x'), false);
  assert.equal(isValidBookId(''), false);
});
