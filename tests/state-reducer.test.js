import { test } from 'node:test';
import assert from 'node:assert';
import { applyChapterDelta } from '../src/state-reducer.js';

const base = { book: { bookId: 'b', title: 'B', targetChapters: 5, chapterWords: 100, nextChapterIndex: 1 }, chapters: [], summaries: [], hooks: [] };

test('applyChapterDelta 追加章节并推进 nextChapterIndex', () => {
  const next = applyChapterDelta(base, { index: 1, title: '第一章', wordCount: 90, filePath: 'chapters/001.md', aiTasteScore: 80, status: 'draft' });
  assert.equal(next.chapters.length, 1);
  assert.equal(next.book.nextChapterIndex, 2);
});

test('不可变：原对象未被修改', () => {
  const before = JSON.stringify(base);
  applyChapterDelta(base, { index: 1, title: '第一章', wordCount: 90, filePath: 'chapters/001.md', aiTasteScore: 80, status: 'draft' });
  assert.equal(JSON.stringify(base), before);
});

test('非法章节抛错', () => {
  assert.throws(() => applyChapterDelta(base, { index: 0, status: 'draft' }));
});
