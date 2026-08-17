// 第1章手动结算脚本：检测 → 状态结算 → 投影 → 校验
import { readFileSync, writeFileSync } from 'node:fs';
import { detectAI, flavorBreakdown } from '../src/anti-ai-engine.js';
import { countWords } from '../src/word-count.js';
import { mergeHooks } from '../src/hook-lifecycle.js';
import { renderHooksProjection, renderCurrentStateProjection, renderChapterSummariesProjection } from '../src/state-projection.js';
import { renderCurrentFocus } from '../src/control-docs.js';
import { validateState } from '../src/state-schema.js';

const bookId = 'book-99b16c';
const body = readFileSync(`novels/${bookId}/chapters/001.md`, 'utf8');
const ai = detectAI(body);
console.log('=== AI味检测 ===');
console.log('score:', ai.score, '| hits:', ai.hits.length);
for (const h of ai.hits) console.log(' -', h.dim || h.type || '', h.word || h.message || '');
console.log('breakdown:', JSON.stringify(flavorBreakdown(body)));

const summary = '林凡傍晚砍柴归家，家中贫困（爹干咳空衔烟杆、娘捡碎米）。深夜独自赴土梁子废河道，取出三个月前拾得的锈剑与烙字布片（"气沉、入骨、循脉"），三个月摸索无果后割指血饲。血渗锈层初无反应，欲裹剑离去时掌心被吸住灼烫起泡，锈层剥落露出灰白金属，残魂断续传下三句口诀："剑者，骨中锋""气行筋脉，非力催""想杀人，先把命搁上去"，随即彻底沉寂，剑身重新生锈，唯剑格旁一小片金属永久裸露。林凡将剑埋回，天将亮时回家，掌心烫伤。';

const observedHooks = [
  { name: '锈剑的秘密', status: 'progressing', notes: '血饲唤醒残魂，得三句口诀；残魂身份、血饲代价未明', expectedPayoff: '残魂身份与来历揭晓', plantedChapter: 1, payoffTiming: 'mid-arc' },
  { name: '碎布片与口诀', status: 'progressing', notes: '布片烙字（气沉/入骨/循脉）与口诀对不上，两套功法之谜', expectedPayoff: '布片与口诀的关联解开', plantedChapter: 1, payoffTiming: 'near-term' },
  { name: '爹的隐疾', status: 'open', notes: '干咳不止、旱烟断了仍空衔烟杆——埋而不点', expectedPayoff: '隐疾真相与家道变故', plantedChapter: 1, payoffTiming: 'slow-burn' },
];
const hooks = mergeHooks([], observedHooks, 1);

const characters = [
  { name: '林凡', role: 'protagonist', desc: '樵户少年，沉默固执，三个月暗中摸索锈剑无果仍不弃' },
  { name: '娘', role: 'family', desc: '持家谨慎，捡碎米、命担水，不多问' },
  { name: '爹', role: 'family', desc: '隐疾干咳，旱烟断绝仍空衔烟杆' },
];

const currentState = {
  currentLocation: '青石村林家',
  protagonistState: '掌心烫伤起泡，一夜未眠，藏秘不宣',
  currentGoal: '弄懂三句口诀与布片烙字的关联',
  currentConflict: '口诀无人可解，血饲代价不明；家贫与爹的隐疾压身',
  currentConstraint: '不能让家人察觉剑与伤口之事',
  currentAlliances: '无（独自行动）',
};

const statePath = `novels/${bookId}/story/state/state.json`;
const prev = JSON.parse(readFileSync(statePath, 'utf8'));
const chapter = {
  index: 1, title: '第1章', wordCount: countWords(body), filePath: 'chapters/001.md',
  aiTasteScore: ai.score, status: ai.hits.length === 0 ? 'approved' : 'revised',
};
const next = {
  book: { ...prev.book, nextChapterIndex: 2 },
  chapters: [chapter],
  summaries: [{ index: 1, text: summary }],
  hooks, characters, currentState,
  outline: prev.outline || [],
};

const errs = validateState(next);
if (errs.length) { console.error('STATE INVALID:', errs); process.exit(1); }
writeFileSync(statePath, JSON.stringify(next, null, 2));

const storyDir = `novels/${bookId}/story/`;
writeFileSync(storyDir + 'current_state.md', renderCurrentStateProjection(currentState));
writeFileSync(storyDir + 'pending_hooks.md', renderHooksProjection(hooks, 1));
writeFileSync(storyDir + 'chapter_summaries.md', renderChapterSummariesProjection(next.summaries));
writeFileSync(storyDir + 'current_focus.md', renderCurrentFocus(next, 1));

console.log('=== 结算完成 ===');
console.log('wordCount:', chapter.wordCount, '| aiTasteScore:', chapter.aiTasteScore, '| status:', chapter.status);
console.log('hooks:', hooks.map(h => h.name + '(' + h.status + ')').join('、'));
console.log('state.json + 4 projections written, validateState: OK');
