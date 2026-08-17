// 同步 state.json 中第2章的字数与评分（外科修订后）
import { readFileSync, writeFileSync } from 'node:fs';
import { detectAI } from '../src/anti-ai-engine.js';
import { countWords } from '../src/word-count.js';
import { validateState } from '../src/state-schema.js';

const bookId = 'book-99b16c';
const body = readFileSync(`novels/${bookId}/chapters/002.md`, 'utf8');
const ai = detectAI(body);
const p = `novels/${bookId}/story/state/state.json`;
const s = JSON.parse(readFileSync(p, 'utf8'));
const ch = s.chapters.find((c) => c.index === 2);
if (!ch) throw new Error('chapter 2 entry missing');
ch.wordCount = countWords(body);
ch.aiTasteScore = ai.score;
ch.status = ai.hits.length === 0 ? 'approved' : 'revised';
const errs = validateState(s);
if (errs.length) { console.error('INVALID:', errs); process.exit(1); }
writeFileSync(p, JSON.stringify(s, null, 2));
console.log('ch2 synced:', ch.wordCount, 'words, AI', ch.aiTasteScore, ',', ai.hits.length, 'hits');
