# 贯通线（Tracer Bullet）实现计划

> **For agentic workers:** 本计划按任务顺序执行；每个任务以 checkbox（`- [ ]`）跟踪。纯函数任务走 TDD（先写失败测试→实现→通过→提交）；DSH 胶水任务走「完整代码 + mount 校验 / GUI 冒烟」。
>
> **执行方式**：建议每任务一提交；执行者可用 subagent 逐任务派发（每任务一个干净上下文），或在本会话内逐任务执行。

**Goal:** 在 DSH 里用自然语言完成一次「建书 → 写一章（反 AI 味生效）→ 落盘 → 结果卡 + 章节面板可回看」的最小闭环。

**Architecture:** 纯领域逻辑（反 AI 味引擎 / 状态 schema / reducer / 字数 / bookId）放 `src/`，用 `node --test` 做 TDD；DSH 侧用**动态插件**承载工具与 UI（纯函数内联进插件体，因动态插件不能 `import`）；预设骨架先写好草案。验证通过后再「固化进 DSH checkout 的 package」作为收官任务。

**Tech Stack:** 纯 JS（ESM for `src/`）、Node 24 `node --test`、DSH 动态插件（Host 工具 + Client Slot）、DSH 预设（`agent.cordis.yml`）、`SKILL.md` 技能。

## Global Constraints

- 纯函数一律 **ESM**（`export`），测试用 `node --test`；`package.json` 设 `"type": "module"`。
- 动态插件 Host/Client 体是**纯 JS 函数体**：禁 `import`/`require`/TS/JSX；Client 用 `React.createElement`。
- 状态落盘只经 `ctx.get('fs')` 的 `resolve/readText/writeText/listDir/stat`，**禁用裸 Node fs / shell**。
- 模型调用只经 `ctx.get('llm')` 的 `stream(options)`（`AsyncIterable<StreamChunk>`），文本聚合走 `collectText` 助手。
- `bookId` 必须过 `isValidBookId` 白名单，拒绝 `..`/`/`/绝对路径（防路径穿越）。
- 状态写入前必须 `validateState`，失败拒绝写入（不滚雪球）。
- 每章 `chapters/NNN.md`（NNN = 3 位补零）+ `story/state/state.json` 一并落盘。
- 每次「写一章」最多自动修订 1 次；反 AI 味规则唯一数据源在 `src/anti-ai-engine.js` + 技能内，不散落第二份。

---

## 文件结构（锁定）

```
NINGLET-dsh/
├── package.json                  # type:module + "test": "node --test"
├── .gitignore                    # 追加 node_modules/
├── src/
│   ├── word-count.js             # zh_chars / en_words
│   ├── book-id.js                # slugify / isValidBookId / makeBookId
│   ├── anti-ai-engine.js         # detectAI / scanForbidden / 句式统计 / rewriteRules
│   ├── state-schema.js           # validateBook / validateChapter / validateState
│   └── state-reducer.js          # applyChapterDelta（校验后不可变更新）
├── tests/
│   ├── word-count.test.js
│   ├── book-id.test.js
│   ├── anti-ai-engine.test.js
│   ├── state-schema.test.js
│   └── state-reducer.test.js
├── skills/
│   ├── anti-ai-flavor/SKILL.md
│   └── longform-writing/SKILL.md
├── plugins/
│   ├── host-novel.js             # 动态插件 Host 体（novel_* 工具，内联纯函数）
│   └── client-novel-ui.js        # 动态插件 Client 体（章节面板）
└── preset/
    ├── preset.yml
    └── agent.cordis.yml          # 目标组合（草案）
```

> 说明：`plugins/*.js` 是「开发探针」——`src/` 里的纯函数经测试后，**逐字内联**进 `plugins/host-novel.js` 的 `apply()` 作用域。两者用注释块标出「内联自 src/<file>，保持同步」。

---

## Task 1: 项目脚手架 + 测试运行器

**Files:**
- Create: `NINGLET-dsh/package.json`
- Modify: `NINGLET-dsh/.gitignore`

**Interfaces:**
- Produces: `npm test` 可运行 `node --test`；`src/` 内 ESM 模块可被 `tests/` 导入。

- [ ] **Step 1: 写 `package.json`**

```json
{
  "name": "ninglet",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: 追加 `.gitignore`**

在现有 `.gitignore` 末尾追加一行（若已存在则跳过）：

```
node_modules/
```

- [ ] **Step 3: 建目录**

```bash
New-Item -ItemType Directory -Force -Path src, tests, skills\anti-ai-flavor, skills\longform-writing, plugins, preset
```

- [ ] **Step 4: 验证空测试可跑**

```bash
node --test
```

预期：`0 tests` 或等价退出码 0。

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: 脚手架 + node --test 运行器"
```

---

## Task 2: 字数治理（word-count）

**Files:**
- Create: `src/word-count.js`
- Test: `tests/word-count.test.js`

**Interfaces:**
- Produces: `detectLanguage(text) → 'zh'|'en'`、`countZhChars(text) → number`、`countEnWords(text) → number`、`countWords(text) → number`

- [ ] **Step 1: 写失败测试**

```js
// tests/word-count.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { detectLanguage, countZhChars, countEnWords, countWords } from '../src/word-count.js';

test('detectLanguage 中文优先', () => {
  assert.equal(detectLanguage('他缓缓睁开眼，望向远方。'), 'zh');
  assert.equal(detectLanguage('He opened his eyes.'), 'en');
});

test('countZhChars 只数 CJK 字符，不数标点/空白', () => {
  assert.equal(countZhChars('他望向远方。'), 5); // 他望 向 远 方
  assert.equal(countZhChars('Hello 世界'), 2);
});

test('countEnWords 按空白分词', () => {
  assert.equal(countEnWords('He opened his eyes.'), 4);
});

test('countWords 按语言派发', () => {
  assert.equal(countWords('他望向远方。'), 5);
  assert.equal(countWords('He opened his eyes.'), 4);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test tests/word-count.test.js
```

预期：FAIL（`Cannot find module '../src/word-count.js'`）

- [ ] **Step 3: 实现**

```js
// src/word-count.js
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;

export function detectLanguage(text) {
  const cjk = (text.match(new RegExp(CJK.source, 'g')) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  return cjk >= latin ? 'zh' : 'en';
}

export function countZhChars(text) {
  return (text.match(new RegExp(CJK.source, 'g')) || []).length;
}

export function countEnWords(text) {
  const t = text.trim();
  return t.length === 0 ? 0 : t.split(/\s+/).length;
}

export function countWords(text) {
  return detectLanguage(text) === 'zh' ? countZhChars(text) : countEnWords(text);
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test tests/word-count.test.js
```

预期：4 个 test 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/word-count.js tests/word-count.test.js
git commit -m "feat: 字数治理（zh_chars / en_words）"
```

---

## Task 3: bookId 安全与生成

**Files:**
- Create: `src/book-id.js`
- Test: `tests/book-id.test.js`

**Interfaces:**
- Produces: `slugify(title) → string`、`hash6(s) → string`、`makeBookId(title) → string`、`isValidBookId(id) → boolean`

- [ ] **Step 1: 写失败测试**

```js
// tests/book-id.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { slugify, makeBookId, isValidBookId, hash6 } from '../src/book-id.js';

test('slugify 保留 ASCII、小写、去非法字符', () => {
  assert.equal(slugify('吞天魔帝'), '');           // 纯中文 → 空
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
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test tests/book-id.test.js
```

预期：FAIL（模块不存在）

- [ ] **Step 3: 实现**

```js
// src/book-id.js
export function slugify(title) {
  return String(title).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function hash6(s) {
  // FNV-1a 32-bit，取低 24 位转 6 位 hex
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return (h & 0xffffff).toString(16).padStart(6, '0');
}

export function makeBookId(title) {
  const slug = slugify(title);
  return slug.length > 0 ? slug : 'book-' + hash6(title);
}

export function isValidBookId(id) {
  return typeof id === 'string'
    && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)
    && !id.includes('..');
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test tests/book-id.test.js
```

预期：5 个 test 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/book-id.js tests/book-id.test.js
git commit -m "feat: bookId 安全校验与生成"
```

---

## Task 4: 反 AI 味引擎（确定性检测）

**Files:**
- Create: `src/anti-ai-engine.js`
- Test: `tests/anti-ai-engine.test.js`

**Interfaces:**
- Produces: `scanForbidden(text, forbidden?) → Array<{word,index,count}>`、`deDensity(text) → number`、`sentenceLengths(text) → number[]`、`detectAI(text, rules?) → {score, hits}`、`rewriteRules() → string`

- [ ] **Step 1: 写失败测试**

```js
// tests/anti-ai-engine.test.js
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
  assert.ok(d > 0.04); // 3 个"的" / 短句 → 高密度
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
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test tests/anti-ai-engine.test.js
```

预期：FAIL（模块不存在）

- [ ] **Step 3: 实现**

```js
// src/anti-ai-engine.js
export const DEFAULT_FORBIDDEN = [
  '心中一凛', '不由自主', '眼中闪过一丝', '嘴角勾起', '嘴角微微上扬',
  '淡淡道', '轻声道', '沉吟', '半晌', '不禁', '心头一颤', '意味深长',
  '复杂难明', '难以言表', '五味杂陈', '百感交集',
];

export function scanForbidden(text, forbidden = DEFAULT_FORBIDDEN) {
  const hits = [];
  for (const word of forbidden) {
    let count = 0, idx = text.indexOf(word);
    while (idx !== -1) { count++; idx = text.indexOf(word, idx + word.length); }
    if (count > 0) hits.push({ word, index: text.indexOf(word), count });
  }
  return hits;
}

export function deDensity(text) {
  const chars = text.replace(/\s/g, '').length;
  const de = (text.match(/的/g) || []).length;
  return chars === 0 ? 0 : de / chars;
}

export function sentenceLengths(text) {
  return text.split(/[。！？!?…\n]+/).filter((s) => s.trim().length > 0).map((s) => s.length);
}

function variance(xs) {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
}

export function detectAI(text, rules = {}) {
  const opts = { deThreshold: 0.05, varThreshold: 20, forbidden: DEFAULT_FORBIDDEN, ...rules };
  let score = 100;
  const hits = [];
  const forb = scanForbidden(text, opts.forbidden);
  for (const h of forb) {
    score -= 3 * h.count;
    hits.push({ rule: 'forbidden', detail: `${h.word} x${h.count}`, severity: 3 });
  }
  const dd = deDensity(text);
  if (dd > opts.deThreshold) {
    score -= 10;
    hits.push({ rule: 'de-density', detail: `的密度 ${dd.toFixed(3)} > ${opts.deThreshold}`, severity: 10 });
  }
  const lens = sentenceLengths(text);
  const v = variance(lens);
  if (lens.length >= 3 && v < opts.varThreshold) {
    score -= 10;
    hits.push({ rule: 'sentence-uniformity', detail: `句长方差 ${v.toFixed(1)} < ${opts.varThreshold}`, severity: 10 });
  }
  return { score: Math.max(0, Math.min(100, score)), hits };
}

export function rewriteRules() {
  return `禁用词（出现即视为 AI 味，直接改写）：${DEFAULT_FORBIDDEN.join('、')}。`
    + '避免"的"字密度过高（一段不超过 3 个）；避免句长均匀的流水句（长短交替）；'
    + '避免排比三连与段尾抒情总结；用动作代替"淡淡道/轻声道"式对话标签。';
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test tests/anti-ai-engine.test.js
```

预期：6 个 test 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/anti-ai-engine.js tests/anti-ai-engine.test.js
git commit -m "feat: 反 AI 味确定性检测引擎"
```

---

## Task 5: 状态 schema 校验

**Files:**
- Create: `src/state-schema.js`
- Test: `tests/state-schema.test.js`

**Interfaces:**
- Produces: `validateBook(b) → {ok, errors[]}`、`validateChapter(c) → {ok, errors[]}`、`validateState(s) → {ok, errors[]}`

- [ ] **Step 1: 写失败测试**

```js
// tests/state-schema.test.js
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
  assert.equal(validateState({ book: { bookId: 'b', title: 'x', nextChapterIndex: 2 }, chapters: [], summaries: [], hooks: [] }).ok, true);
  assert.equal(validateState({ book: { bookId: 'b' }, chapters: 'nope' }).ok, false);
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test tests/state-schema.test.js
```

预期：FAIL（模块不存在）

- [ ] **Step 3: 实现**

```js
// src/state-schema.js
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
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test tests/state-schema.test.js
```

预期：5 个 test 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/state-schema.js tests/state-schema.test.js
git commit -m "feat: 状态 schema 校验"
```

---

## Task 6: 状态 reducer（校验后不可变更新）

**Files:**
- Create: `src/state-reducer.js`
- Test: `tests/state-reducer.test.js`

**Interfaces:**
- Consumes: `validateState`、`validateChapter`（Task 5）
- Produces: `applyChapterDelta(state, chapter) → newState`（校验失败抛错，成功返回新对象，不改原对象）

- [ ] **Step 1: 写失败测试**

```js
// tests/state-reducer.test.js
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
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test tests/state-reducer.test.js
```

预期：FAIL（模块不存在）

- [ ] **Step 3: 实现**

```js
// src/state-reducer.js
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
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test tests/state-reducer.test.js
```

预期：3 个 test 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/state-reducer.js tests/state-reducer.test.js
git commit -m "feat: 状态 reducer（校验后不可变更新）"
```

---

## Task 7: 技能包（SKILL.md × 2）

**Files:**
- Create: `skills/anti-ai-flavor/SKILL.md`
- Create: `skills/longform-writing/SKILL.md`

**Interfaces:**
- Produces: 两个可被 `skills` 服务加载的技能；正文是纯指导 + 静态参考，不含执行脚本。

- [ ] **Step 1: 写 `skills/anti-ai-flavor/SKILL.md`**

```markdown
---
name: anti-ai-flavor
description: 反 AI 味写作规则——禁用词表、句式约束、对话标签、情绪描写，用于生成与修订小说正文时去除"AI 味"。
---

# 反 AI 味规则

目标：写出来的正文，读者看不出是 AI 写的。

## 禁用词（出现即改写）
心中一凛、不由自主、眼中闪过一丝、嘴角勾起、嘴角微微上扬、
淡淡道、轻声道、沉吟、半晌、不禁、心头一颤、意味深长、
复杂难明、难以言表、五味杂陈、百感交集。

## 硬约束
- 一段内"的"字不超过 3 个。
- 句长长短交替；禁止连续 3 句等长的流水句。
- 禁止排比三连（"他感到…他感到…他感到…"）。
- 禁止段尾抒情总结（"这就是…的意义啊"）。
- 对话标签用动作代替（不要"他淡淡道/她轻声道"）。
- 心理活动用行为暗示，不要大段内心独白。
- 口语与书面语混用，保留个人偏好与"毛刺"，不要通篇工整。

## 用法
- 生成前：把这些约束原样注入写手提示词（从源头不让 AI 犯）。
- 落盘前：对正文跑确定性检测（禁用词/的密度/句长方差），不通过则自动重写一次。
```

- [ ] **Step 2: 写 `skills/longform-writing/SKILL.md`**

```markdown
---
name: longform-writing
description: 长篇小说的章节生产工作流与写作规则：规划→编排→写作→审计→修订→结算，及章节密度、钩子、段落节奏等网文写作准则。
---

# 长篇写作规则

## 章节生产工作流
每章按序执行：
1. plan —— 生成本章意图（must-keep / must-avoid）。
2. compose —— 组装上下文（作者意图 + 近期焦点 + 前文摘要 + 角色骨架）。
3. write —— 生成草稿（注入反 AI 味规则 + 字数目标）。
4. audit —— 连续性轻校验 + 反 AI 味确定性检测。
5. revise —— 检测不通过时自动去 AI 味重写一次。
6. settle —— 落盘正文 + 更新状态 + 生成章节摘要。

## 写作规则（通用 ~25 条的精简子集）
- 开头第一屏要有钩子，章尾留悬念（钩子 ledger 回收）。
- 章节要有"密度"：靠意义与场景推进，不是靠切碎段落。
- 段落节奏：长短交替；连续短段要有意义，不为切而切。
- 人物行动要有动机，避免无目的的 idle 描写与报告式流水账。
- 信息只给当前视角角色该知道的，避免上帝视角信息泄漏。
- 对话要有目的（推进 / 揭示 / 冲突），不要为凑字数闲聊。

## 摘要要求
每章结算时生成结构化摘要：事件、角色状态变化、伏笔埋设/回收、结尾状态。
```

- [ ] **Step 3: 人工检查 frontmatter 与正文**

用 `read` 复查两个文件：frontmatter 有 `name` + `description`，正文无脚本、无 DSH 私有字段。

- [ ] **Step 4: Commit**

```bash
git add skills/anti-ai-flavor/SKILL.md skills/longform-writing/SKILL.md
git commit -m "feat: 反AI味 + 长篇写作技能包"
```

---

## Task 8: Host 领域工具（动态插件）

**Files:**
- Create: `plugins/host-novel.js`

**Interfaces:**
- Consumes: `llm`（`stream`）、`fs`（`resolve/readText/writeText/listDir/stat`）、`harness`（`defineTool/registerTool`）
- Produces: 工具 `novel_create_book`、`novel_write_chapter`、`novel_list_chapters`、`novel_read_chapter`；Client 可经 `host.call` 调用的方法 `list_chapters`、`read_chapter`

> 说明：本文件是「动态插件 Host 函数体」，纯 JS、禁 `import`。`src/` 里经测试的纯函数（word-count / book-id / anti-ai-engine / state-schema / state-reducer）**逐字内联**到 `apply()` 作用域内（下方标注「内联自 src/…」）。因 DSH 动态插件不能 `import`，这是开发探针阶段的既定做法。

- [ ] **Step 1: 写 `plugins/host-novel.js`**

```js
return {
  inject: ['llm', 'fs'],
  apply(ctx) {
    // ============ 内联自 src/book-id.js ============
    function slugify(title) {
      return String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
    function hash6(s) {
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
      return (h & 0xffffff).toString(16).padStart(6, '0');
    }
    function makeBookId(title) {
      const slug = slugify(title);
      return slug.length > 0 ? slug : 'book-' + hash6(title);
    }
    function isValidBookId(id) {
      return typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) && !id.includes('..');
    }
    // ============ 内联自 src/word-count.js ============
    const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;
    function detectLanguage(text) {
      const cjk = (text.match(new RegExp(CJK.source, 'g')) || []).length;
      const latin = (text.match(/[a-zA-Z]/g) || []).length;
      return cjk >= latin ? 'zh' : 'en';
    }
    function countWords(text) {
      if (detectLanguage(text) === 'zh') return (text.match(new RegExp(CJK.source, 'g')) || []).length;
      const t = text.trim();
      return t.length === 0 ? 0 : t.split(/\s+/).length;
    }
    // ============ 内联自 src/anti-ai-engine.js ============
    const DEFAULT_FORBIDDEN = ['心中一凛','不由自主','眼中闪过一丝','嘴角勾起','嘴角微微上扬','淡淡道','轻声道','沉吟','半晌','不禁','心头一颤','意味深长','复杂难明','难以言表','五味杂陈','百感交集'];
    function scanForbidden(text, forbidden) {
      const words = forbidden || DEFAULT_FORBIDDEN;
      const hits = [];
      for (const word of words) {
        let count = 0, idx = text.indexOf(word);
        while (idx !== -1) { count++; idx = text.indexOf(word, idx + word.length); }
        if (count > 0) hits.push({ word, index: text.indexOf(word), count });
      }
      return hits;
    }
    function deDensity(text) {
      const chars = text.replace(/\s/g, '').length;
      const de = (text.match(/的/g) || []).length;
      return chars === 0 ? 0 : de / chars;
    }
    function sentenceLengths(text) {
      return text.split(/[。！？!?…\n]+/).filter((s) => s.trim().length > 0).map((s) => s.length);
    }
    function variance(xs) {
      if (xs.length < 2) return 0;
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
    }
    function detectAI(text) {
      let score = 100;
      const hits = [];
      for (const h of scanForbidden(text)) { score -= 3 * h.count; hits.push({ rule: 'forbidden', detail: h.word + ' x' + h.count }); }
      const dd = deDensity(text);
      if (dd > 0.05) { score -= 10; hits.push({ rule: 'de-density', detail: '的密度 ' + dd.toFixed(3) }); }
      const lens = sentenceLengths(text);
      const v = variance(lens);
      if (lens.length >= 3 && v < 20) { score -= 10; hits.push({ rule: 'sentence-uniformity', detail: '句长方差 ' + v.toFixed(1) }); }
      return { score: Math.max(0, Math.min(100, score)), hits };
    }
    function rewriteRulesText() {
      return '禁用词（出现即改写）：' + DEFAULT_FORBIDDEN.join('、') + '。避免"的"字密度过高；避免句长均匀；避免排比三连与段尾抒情；用动作代替"淡淡道/轻声道"。';
    }
    // ============ 内联自 src/state-schema.js（精简 validateState） ============
    const CHAPTER_STATUSES = ['draft', 'revised', 'approved'];
    function validateState(s) {
      const errors = [];
      const b = s && s.book;
      if (!b || !isValidBookId(b.bookId)) errors.push('bookId 非法');
      if (typeof b.nextChapterIndex !== 'number' || !Number.isInteger(b.nextChapterIndex)) errors.push('nextChapterIndex 非整数');
      if (!Array.isArray(s.chapters)) errors.push('chapters 非数组');
      if (!Array.isArray(s.summaries)) errors.push('summaries 非数组');
      if (!Array.isArray(s.hooks)) errors.push('hooks 非数组');
      return { ok: errors.length === 0, errors };
    }

    const llm = ctx.llm, fs = ctx.fs;
    const cwd = process.cwd(); // 见下方「实现注意」——以工作区根为小说目录

    // 文本聚合：AsyncIterable<StreamChunk> → string
    async function collectText(stream) {
      let out = '';
      for await (const chunk of stream) {
        if (chunk && chunk.text) out += chunk.text;   // StreamChunk.text 为增量文本
      }
      return out;
    }

    async function readState(bookId) {
      const t = await fs.resolve(`novels/${bookId}/story/state/state.json`, { cwd });
      const info = await fs.stat(t);
      if (info === undefined) return null;
      const raw = await fs.readText(t);
      return JSON.parse(raw);
    }

    async function writeState(bookId, state) {
      const v = validateState(state);
      if (!v.ok) throw new Error('状态非法，拒绝写入：' + v.errors.join('; '));
      const t = await fs.resolve(`novels/${bookId}/story/state/state.json`, { cwd });
      await fs.writeText(t, JSON.stringify(state, null, 2));
    }

    async function writeChapter(bookId, index, body) {
      const n = String(index).padStart(3, '0');
      const t = await fs.resolve(`novels/${bookId}/chapters/${n}.md`, { cwd });
      await fs.writeText(t, body);
      return `novels/${bookId}/chapters/${n}.md`;
    }

    harness.registerTool(ctx, harness.defineTool({
      name: 'novel_create_book',
      description: 'Create a new novel book. Generates a safe bookId and initializes story state files on disk.',
      parameters: { title: { type: 'string', required: true }, genre: { type: 'string', required: false }, brief: { type: 'string', required: false } },
      output: { schema: { type: 'string' }, render(_a, v) { return [{ type: 'text', text: v }] } },
      async execute(args) {
        const bookId = makeBookId(args.title);
        const existing = await readState(bookId);
        if (existing) return `书已存在：${bookId}（不覆盖）`;
        const state = {
          book: { bookId, title: args.title, genre: args.genre || '', targetChapters: 50, chapterWords: 2000, nextChapterIndex: 1 },
          chapters: [], summaries: [], hooks: [],
        };
        await writeState(bookId, state);
        return `已创建书《${args.title}》bookId=${bookId}，状态写入 novels/${bookId}/story/state/state.json`;
      },
    }));

    harness.registerTool(ctx, harness.defineTool({
      name: 'novel_write_chapter',
      description: 'Write the next chapter of a book: plan → compose → write → anti-AI audit → revise (max 1) → settle. Enforces anti-AI-flavor rules and persists chapter + state.',
      parameters: { bookId: { type: 'string', required: true }, words: { type: 'number', required: false }, context: { type: 'string', required: false } },
      output: { schema: { type: 'string' }, render(_a, v) { return [{ type: 'text', text: v }] } },
      async execute(args) {
        if (!isValidBookId(args.bookId)) throw new Error('unsafe bookId');
        const state = await readState(args.bookId);
        if (!state) return `书 ${args.bookId} 不存在，请先 novel_create_book`;
        const index = state.book.nextChapterIndex;
        const targetWords = args.words || state.book.chapterWords;

        // compose：前文摘要（最近 5 章）+ 本章指导
        const recent = state.summaries.slice(-5).map((s) => s.text).join('\n');
        const writerPrompt = `你是小说写手。写第 ${index} 章正文，目标约 ${targetWords} 字。\n`
          + `本章指导：${args.context || '（无）'}\n`
          + `前文摘要：\n${recent || '（无，此为第一章）'}\n`
          + `写作规则：\n${rewriteRulesText()}\n只输出正文，不要标题、不要解释。`;

        let body = await collectText(llm.stream({ messages: [{ role: 'user', content: writerPrompt }] }));
        body = (body || '').trim();
        if (!body) throw new Error('模型返回空正文');

        let ai = detectAI(body);
        let revised = false;
        if (ai.hits.length > 0) {
          const revisePrompt = `以下是正文，请按规则改写去除 AI 味，只输出改写后的正文：\n${rewriteRulesText()}\n\n${body}`;
          body = (await collectText(llm.stream({ messages: [{ role: 'user', content: revisePrompt }] })) || '').trim();
          ai = detectAI(body);
          revised = true;
        }

        const path = await writeChapter(args.bookId, index, body);
        const chapter = {
          index, title: `第${index}章`, wordCount: countWords(body), filePath: path,
          aiTasteScore: ai.score, status: ai.hits.length === 0 ? 'approved' : 'revised',
        };
        const summary = { index, text: body.slice(0, 200) };
        const next = {
          book: { ...state.book, nextChapterIndex: index + 1 },
          chapters: [...state.chapters, chapter].sort((a, b) => a.index - b.index),
          summaries: [...state.summaries, summary],
          hooks: state.hooks,
        };
        await writeState(args.bookId, next);
        return `第 ${index} 章完成：字数 ${chapter.wordCount}，AI味评分 ${ai.score}${revised ? '（已自动修订）' : ''}，落盘 ${path}`;
      },
    }));

    harness.registerTool(ctx, harness.defineTool({
      name: 'novel_list_chapters',
      description: 'List all chapters of a book with index/title/wordCount/aiTasteScore.',
      parameters: { bookId: { type: 'string', required: true } },
      output: { schema: { type: 'string' }, render(_a, v) { return [{ type: 'text', text: v }] } },
      async execute(args) {
        const state = await readState(args.bookId);
        if (!state) return '书不存在';
        return JSON.stringify(state.chapters.map((c) => ({ index: c.index, title: c.title, wordCount: c.wordCount, score: c.aiTasteScore })));
      },
    }));

    harness.registerTool(ctx, harness.defineTool({
      name: 'novel_read_chapter',
      description: 'Read the full text of one chapter.',
      parameters: { bookId: { type: 'string', required: true }, index: { type: 'number', required: true } },
      output: { schema: { type: 'string' }, render(_a, v) { return [{ type: 'text', text: v }] } },
      async execute(args) {
        const n = String(args.index).padStart(3, '0');
        const t = await fs.resolve(`novels/${args.bookId}/chapters/${n}.md`, { cwd });
        const info = await fs.stat(t);
        if (info === undefined) return '章节不存在';
        return await fs.readText(t);
      },
    }));

    // Client 面板经 host.call 调用
    harness.handle('list_chapters', async (args) => {
      const state = await readState(args.bookId);
      return state ? state.chapters.map((c) => ({ index: c.index, title: c.title, wordCount: c.wordCount, score: c.aiTasteScore })) : [];
    });
    harness.handle('read_chapter', async (args) => {
      const n = String(args.index).padStart(3, '0');
      const t = await fs.resolve(`novels/${args.bookId}/chapters/${n}.md`, { cwd });
      const info = await fs.stat(t);
      return info === undefined ? '' : await fs.readText(t);
    });
  },
};
```

**实现注意（执行本任务时必查，见 Step 2）：**
- `process.cwd()` 是否为 DSH Host 里的合法 Builtin 需在执行时用 `Builtin.listBuiltins` 确认；若不存在，改用 `ctx.get('sandboxPolicy').workspaceRoot` 作为 `cwd`（该服务在 Service 目录里已列出 `workspaceRoot`）。
- `llm.stream(options)` 的 `GenerateOptions` 字段名（`messages` 结构）与 `StreamChunk` 增量文本字段（上面假设 `chunk.text`）需在执行时用 `grep -rn "GenerateOptions\|StreamChunk" D:\deepseek-harness\deepseek-harness\packages` 确认确切字段名，再据此微调 `collectText` 与 `llm.stream({...})` 入参。**这是唯一需要在实现时再核实的契约点。**

- [ ] **Step 2: 核实 LLM 契约 + Builtin**

```bash
grep -rn "type GenerateOptions\|interface GenerateOptions\|type StreamChunk\|interface StreamChunk" D:\deepseek-harness\deepseek-harness\packages --include=*.ts -l
```

预期：找到定义文件，确认 `messages` 与增量文本字段名；若 `process` 不在 Builtin，改用 `sandboxPolicy.workspaceRoot`。

- [ ] **Step 3: 用 `cordis_define` 定义插件（kind=new，idPrefix=`ning`）**

将 `plugins/host-novel.js` 内容作为 `code.host` 提交（Step 2 确认后的最终版）。**本计划不在此步实际执行 define/run**——正式执行时按 `cordis-plugin-development` 技能流程 `define → run`，并处理 `awaiting-approval`/`starting`。

- [ ] **Step 4: 冒烟验证**

在 GUI 里依次调用：`novel_create_book(title="测试书")` → `novel_write_chapter(bookId=...)` → `novel_list_chapters` → `novel_read_chapter`，核对磁盘上出现 `novels/<id>/story/state/state.json` 与 `novels/<id>/chapters/001.md`。

- [ ] **Step 5: Commit**

```bash
git add plugins/host-novel.js
git commit -m "feat: novel_* 领域工具（动态插件 Host）"
```

---

## Task 9: Client 章节面板（动态插件）

**Files:**
- Create: `plugins/client-novel-ui.js`

**Interfaces:**
- Consumes: Host 的 `list_chapters` / `read_chapter`（经 `host.call`）
- Produces: 会话头部「章节」按钮 + `shell.overlay` 章节面板

- [ ] **Step 1: 写 `plugins/client-novel-ui.js`**

```js
return {
  apply(ctx) {
    const slots = ctx.get('slots');
    if (slots === undefined) return;

    function ChapterPanel() {
      const [open, setOpen] = React.useState(false);
      const [list, setList] = React.useState([]);
      const [body, setBody] = React.useState('');
      const [bookId, setBookId] = React.useState('');

      function refresh() {
        host.call('list_chapters', { bookId }).then((rows) => setList(rows || []));
      }

      function openPanel(id) {
        setBookId(id);
        setOpen(true);
        refresh();
      }

      const button = React.createElement('button', {
        key: 'novel-chapters-btn',
        onClick: () => openPanel(bookId || ''),
        style: { cursor: 'pointer' },
      }, '章节');

      const panel = open ? React.createElement('div', {
        key: 'novel-panel',
        style: {
          position: 'fixed', right: 16, top: 16, width: 360, maxHeight: '80vh',
          background: 'var(--background)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 16, overflow: 'auto', zIndex: 1000,
        },
      }, [
        React.createElement('div', { key: 'h', style: { display: 'flex', justifyContent: 'space-between' } }, [
          React.createElement('b', { key: 't' }, '章节'),
          React.createElement('button', { key: 'x', onClick: () => setOpen(false), style: { cursor: 'pointer' } }, '×'),
        ]),
        React.createElement('div', { key: 'l', style: { marginTop: 8 } }, list.map((c) =>
          React.createElement('div', {
            key: c.index, onClick: () => host.call('read_chapter', { bookId, index: c.index }).then(setBody),
            style: { cursor: 'pointer', padding: '6px 0', borderBottom: '1px solid var(--border)' },
          }, `第${c.index}章 · ${c.wordCount}字 · AI味${c.score}`),
        )),
        React.createElement('pre', { key: 'b', style: { whiteSpace: 'pre-wrap', marginTop: 12, fontFamily: 'serif' } }, body),
      ]) : null;

      return React.createElement(React.Fragment, null, button, panel);
    }

    slots.inject('conversation.session.header.actions', () => slots.register(
      { name: 'conversation.session.header.actions', id: 'novel-chapters', label: '章节' },
      () => React.createElement(ChapterPanel),
    ));
  },
};
```

**实现注意（执行本任务时必查）：**
- `conversation.session.header.actions` 的注册字段（`id`/`order`/`label`）与渲染协议，执行时用 `Slots.listSubTree` 以 root=`conversation.session.header.actions` 复查；`shell.overlay` 同理。若 `header.actions` 的协议与上面假设不符（如 props 形态），按查询结果微调。
- 面板用了内联 `position:fixed` 浮层，是因为 `shell.overlay` 的精确 props/拖拽规则需执行时查询；若用 `shell.overlay` 更符合预期，改为 `slots.inject('shell.overlay', ...)` 注册。**二选一，最终以查询结果为准。**

- [ ] **Step 2: 用 `cordis_define` 定义（kind=existing，同一 pluginId 追加 Client 半）并 `cordis_run`**

处理审批 / Client 加载；失败则 `cordis_inspect_self(pluginId, packageId)` 读诊断修复。

- [ ] **Step 3: 冒烟验证**

GUI 会话头部出现「章节」按钮；点开出现面板；建书写章后面板列出章节、点开显示正文；「无书」时显示空态不报错。

- [ ] **Step 4: Commit**

```bash
git add plugins/client-novel-ui.js
git commit -m "feat: 章节面板（动态插件 Client）"
```

---

## Task 10: 预设骨架 + mount 校验

**Files:**
- Create: `preset/preset.yml`
- Create: `preset/agent.cordis.yml`

**Interfaces:**
- Consumes: `agentPresets.copy('standard', ...)`（执行时）；`agentPresets.standingKeyFor(id)`（校验）
- Produces: 目标组合草案；贯通线阶段**不要求能直接 mount**（工具/UI 仍在动态插件里），只锁定结构。

- [ ] **Step 1: 写 `preset/preset.yml`**

```yaml
name: NINGLET
description: 聚焦反 AI 味的小说创作 Agent（长篇 + 短篇）。基于 DeepSeek Harness。
```

- [ ] **Step 2: 写 `preset/agent.cordis.yml`（草案）**

```yaml
# NINGLET 小说 Agent —— 目标组合草案（贯通线阶段工具/UI 仍走动态插件）
# 正式固化时：把 novel-tools / novel-ui 指向 DSH checkout 里的真实 package。
- id: novel-tools
  name: '@deepseek-ai/dsh-tool-ninglet'
- id: novel-ui
  name: '@deepseek-ai/dsh-client-ninglet'
- id: novel-prompt
  name: '@deepseek-ai/dsh-prompt-ninglet'
```

- [ ] **Step 3: 记录固化映射（写入计划而非代码）**

确认：`novel-tools` ↔ `plugins/host-novel.js`、`novel-ui` ↔ `plugins/client-novel-ui.js`、`novel-prompt` ↔ 技能包 + 预设人设段。此映射是下一增量「固化进 package」的输入。

- [ ] **Step 4: Commit**

```bash
git add preset/preset.yml preset/agent.cordis.yml
git commit -m "chore: NINGLET 预设骨架草案"
```

---

## Task 11: 端到端冒烟（验收对照 PRD §2/§5）

**Files:** 无新文件（验证 + 可能的 bugfix）

- [ ] **Step 1: 冷启动闭环**

全新工作区：说「创建一本都市修仙小说《吞天魔帝》」→ 出现书 + `state.json`。

- [ ] **Step 2: 写一章闭环**

说「写第一章，重点写师徒矛盾」→ 一次调用内完成写作 + 反AI味检测 + 落盘 → 结果卡含字数/AI味评分/路径。

- [ ] **Step 3: 边界抽查（PRD §8 至少覆盖 E1/E2/E4/E7/E9/E12）**

- E1 无书直接写 → 明确提示先建书；
- E2 多书未指明 → 提示/询问；
- E4 非法 bookId → 拒绝；
- E7 空正文 → 报错不落空文件；
- E9 检测不通过 → 自动修订一次，仍不通过则标注残留；
- E12 state.json 损坏 → 拒绝写入不滚雪球。

- [ ] **Step 4: 面板三态**

无书 / 1 书 / 多书下，章节面板均不白屏。

- [ ] **Step 5: 全量测试 + 提交**

```bash
node --test
git add -A
git commit -m "test: 端到端冒烟通过（贯通线闭环）"
```

---

## 自审清单（写完后已核对）

- **Spec 覆盖**：PRD 的 FR-1~9 → Task 8/9；US-001~003 → Task 11 冒烟；E1~E18 → Task 11 抽查 E1/E2/E4/E7/E9/E12（其余在纯函数测试与实现里覆盖）；D-3（多角色=工具内多次 LLM 调用）→ Task 8 的 writer/revise 两次 `llm.stream`。
- **占位符扫描**：无 TBD/TODO；唯一「执行时再核实」的是 DSH 两个契约点（`GenerateOptions`/`StreamChunk` 字段、`process`/`sandboxPolicy.workspaceRoot`、Slot 精确 props），均给出了具体的 grep/查询命令与替换方案，不是空占位。
- **类型一致性**：`countWords/detectAI/validateState/applyChapterDelta/makeBookId/isValidBookId` 在 src 与 plugin 内联中同名同义；`state.json` 字段（`book.*`、`chapters[].{index,title,wordCount,filePath,aiTasteScore,status}`、`summaries[].{index,text}`、`hooks`）在 Task 5/6/8 一致。
