import { test } from 'node:test';
import assert from 'node:assert';
import { validateBook, validateChapter, validateState } from '../src/state-schema.js';

test('validateBook 通过合法书', () => {
  const r = validateBook({ bookId: 'the-dark-lord', title: 'The Dark Lord', genre: 'fantasy', targetChapters: 50, chapterWords: 2000, nextChapterIndex: 1 });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('validateBook 拒绝非法 bookId', () => {
  assert.equal(validateBook({ bookId: '../etc', title: 'x' }).ok, false);
});

test('validateBook 拒绝非整数章节号', () => {
  const r = validateBook({ bookId: 'a-book', title: 'x', nextChapterIndex: 1.5 });
  assert.equal(r.ok, false);
});

test('validateChapter 校验状态枚举', () => {
  assert.equal(validateChapter({ index: 1, title: '第一章', wordCount: 100, filePath: 'chapters/001.md', aiTasteScore: 80, status: 'draft' }).ok, true);
  assert.equal(validateChapter({ index: 1, status: 'bogus' }).ok, false);
});

test('validateState 要求 chapters 为数组、nextChapterIndex 为整数', () => {
  assert.equal(validateState({ book: { bookId: 'b', title: 'x', targetChapters: 5, chapterWords: 100, nextChapterIndex: 2 }, chapters: [], summaries: [], hooks: [] }).ok, true);
  assert.equal(validateState({ book: { bookId: 'b' }, chapters: 'nope' }).ok, false);
});

test('validateState null/undefined/{book:null} 不抛错', () => {
  assert.equal(validateState(null).ok, false);
  assert.equal(validateState(undefined).ok, false);
  assert.equal(validateState({ book: null, chapters: [], summaries: [], hooks: [] }).ok, false);
});

test('validateBook 拒绝 nextChapterIndex < 1', () => {
  assert.equal(validateBook({ bookId: 'a-book', title: 'x', targetChapters: 5, chapterWords: 100, nextChapterIndex: 0 }).ok, false);
  assert.equal(validateBook({ bookId: 'a-book', title: 'x', targetChapters: 5, chapterWords: 100, nextChapterIndex: 1.5 }).ok, false);
});
