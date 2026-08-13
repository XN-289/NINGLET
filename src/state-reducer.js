import { validateChapter, validateState } from './state-schema.js';

export function applyChapterDelta(state, chapter) {
  const ch = validateChapter(chapter);
  if (!ch.ok) throw new Error('非法章节：' + ch.errors.join('; '));
  const next = {
    book: { ...state.book, nextChapterIndex: Math.max(state.book.nextChapterIndex, chapter.index + 1) },
    chapters: [...state.chapters.filter((c) => c.index !== chapter.index), chapter].sort((a, b) => a.index - b.index),
    summaries: state.summaries,
    hooks: state.hooks,
  };
  const v = validateState(next);
  if (!v.ok) throw new Error('reducer 产物非法：' + v.errors.join('; '));
  return next;
}
