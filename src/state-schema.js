import { isValidBookId } from './book-id.js';

export const CHAPTER_STATUSES = ['draft', 'revised', 'approved'];

function isInt(n) { return Number.isInteger(n); }
function isStr(s) { return typeof s === 'string'; }
function fail(errors, msg) { errors.push(msg); }

export function validateBook(b) {
  const errors = [];
  if (!b || typeof b !== 'object') return { ok: false, errors: ['book is not an object'] };
  if (!isStr(b.bookId) || !isValidBookId(b.bookId)) fail(errors, 'bookId 非法');
  if (!isStr(b.title) || b.title.length === 0) fail(errors, 'title 缺失');
  if (!isInt(b.targetChapters) || b.targetChapters < 1) fail(errors, 'targetChapters 必须为正整数');
  if (!isInt(b.chapterWords) || b.chapterWords < 1) fail(errors, 'chapterWords 必须为正整数');
  if (!isInt(b.nextChapterIndex) || b.nextChapterIndex < 1) fail(errors, 'nextChapterIndex 必须为正整数');
  return { ok: errors.length === 0, errors };
}

export function validateChapter(c) {
  const errors = [];
  if (!c || typeof c !== 'object') return { ok: false, errors: ['chapter is not an object'] };
  if (!isInt(c.index) || c.index < 1) fail(errors, 'index 必须为正整数');
  if (!isStr(c.filePath) || c.filePath.length === 0) fail(errors, 'filePath 缺失');
  if (!isInt(c.wordCount) || c.wordCount < 0) fail(errors, 'wordCount 必须为非负整数');
  if (typeof c.aiTasteScore !== 'number' || c.aiTasteScore < 0 || c.aiTasteScore > 100) fail(errors, 'aiTasteScore 必须在 [0,100]');
  if (!CHAPTER_STATUSES.includes(c.status)) fail(errors, `status 必须是 ${CHAPTER_STATUSES.join('/')}`);
  return { ok: errors.length === 0, errors };
}

export function validateState(s) {
  const errors = [];
  if (!s || typeof s !== 'object') return { ok: false, errors: ['state is not an object'] };
  const book = validateBook(s.book);
  if (!book.ok) errors.push(...book.errors.map((e) => 'book.' + e));
  if (!Array.isArray(s.chapters)) fail(errors, 'chapters 必须为数组');
  else for (const c of s.chapters) { const r = validateChapter(c); if (!r.ok) errors.push(...r.errors.map((e) => `chapters[${c.index}].` + e)); }
  if (!Array.isArray(s.summaries)) fail(errors, 'summaries 必须为数组');
  if (!Array.isArray(s.hooks)) fail(errors, 'hooks 必须为数组');
  return { ok: errors.length === 0, errors };
}
