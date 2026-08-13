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
    const DEFAULT_FORBIDDEN = ['心中一凛', '不由自主', '眼中闪过一丝', '嘴角勾起', '嘴角微微上扬', '淡淡道', '轻声道', '沉吟', '半晌', '不禁', '心头一颤', '意味深长', '复杂难明', '难以言表', '五味杂陈', '百感交集'];
    function scanForbidden(text, forbidden) {
      const words = forbidden || DEFAULT_FORBIDDEN;
      const hits = [];
      for (const word of words) {
        let count = 0, idx = text.indexOf(word);
        while (idx !== -1) { count++; idx = text.indexOf(word, idx + word.length); }
        if (count > 0) hits.push({ word: word, index: text.indexOf(word), count: count });
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
    function detectAI(text, rules) {
      const opts = Object.assign({ deThreshold: 0.05, varThreshold: 20, forbidden: DEFAULT_FORBIDDEN }, rules || {});
      let score = 100;
      const hits = [];
      const forb = scanForbidden(text, opts.forbidden);
      for (const h of forb) {
        score -= 3 * h.count;
        hits.push({ rule: 'forbidden', detail: h.word + ' x' + h.count, severity: 3 });
      }
      const dd = deDensity(text);
      if (dd > opts.deThreshold) {
        score -= 10;
        hits.push({ rule: 'de-density', detail: '的密度 ' + dd.toFixed(3) + ' > ' + opts.deThreshold, severity: 10 });
      }
      const lens = sentenceLengths(text);
      const v = variance(lens);
      if (lens.length >= 3 && v < opts.varThreshold) {
        score -= 10;
        hits.push({ rule: 'sentence-uniformity', detail: '句长方差 ' + v.toFixed(1) + ' < ' + opts.varThreshold, severity: 10 });
      }
      return { score: Math.max(0, Math.min(100, score)), hits: hits };
    }
    function rewriteRules() {
      return '禁用词（出现即视为 AI 味，直接改写）：' + DEFAULT_FORBIDDEN.join('、') + '。'
        + '避免"的"字密度过高（一段不超过 3 个）；避免句长均匀的流水句（长短交替）；'
        + '避免排比三连与段尾抒情总结；用动作代替"淡淡道/轻声道"式对话标签。';
    }
    // ============ 内联自 src/state-schema.js ============
    const CHAPTER_STATUSES = ['draft', 'revised', 'approved'];
    function isInt(n) { return Number.isInteger(n); }
    function isStr(s) { return typeof s === 'string'; }
    function validateBook(b) {
      const errors = [];
      if (!b || typeof b !== 'object') return { ok: false, errors: ['book is not an object'] };
      if (!isStr(b.bookId) || !isValidBookId(b.bookId)) errors.push('bookId 非法');
      if (!isStr(b.title) || b.title.length === 0) errors.push('title 缺失');
      if (!isInt(b.targetChapters) || b.targetChapters < 1) errors.push('targetChapters 必须为正整数');
      if (!isInt(b.chapterWords) || b.chapterWords < 1) errors.push('chapterWords 必须为正整数');
      if (!isInt(b.nextChapterIndex) || b.nextChapterIndex < 1) errors.push('nextChapterIndex 必须为正整数');
      return { ok: errors.length === 0, errors: errors };
    }
    function validateChapter(c) {
      const errors = [];
      if (!c || typeof c !== 'object') return { ok: false, errors: ['chapter is not an object'] };
      if (!isInt(c.index) || c.index < 1) errors.push('index 必须为正整数');
      if (!isStr(c.filePath) || c.filePath.length === 0) errors.push('filePath 缺失');
      if (!isInt(c.wordCount) || c.wordCount < 0) errors.push('wordCount 必须为非负整数');
      if (typeof c.aiTasteScore !== 'number' || c.aiTasteScore < 0 || c.aiTasteScore > 100) errors.push('aiTasteScore 必须在 [0,100]');
      if (CHAPTER_STATUSES.indexOf(c.status) === -1) errors.push('status 必须是 ' + CHAPTER_STATUSES.join('/'));
      return { ok: errors.length === 0, errors: errors };
    }
    function validateState(s) {
      const errors = [];
      if (!s || typeof s !== 'object') return { ok: false, errors: ['state is not an object'] };
      const book = validateBook(s.book);
      if (!book.ok) for (const e of book.errors) errors.push('book.' + e);
      if (!Array.isArray(s.chapters)) errors.push('chapters 必须为数组');
      else for (const c of s.chapters) { const r = validateChapter(c); if (!r.ok) for (const e of r.errors) errors.push('chapters[' + c.index + '].' + e); }
      if (!Array.isArray(s.summaries)) errors.push('summaries 必须为数组');
      if (!Array.isArray(s.hooks)) errors.push('hooks 必须为数组');
      return { ok: errors.length === 0, errors: errors };
    }

    const llm = ctx.llm;
    const fs = ctx.fs;
    const sandbox = ctx.get('sandboxPolicy');
    const fallbackRoot = sandbox ? sandbox.workspaceRoot : '.';
    let lastBase = null;
    let lastPolicy = null;

    function baseFor(exec) {
      const session = (exec && exec.agent) ? exec.agent.session : undefined;
      const b = session ? session.header.cwd : fallbackRoot;
      lastBase = b;
      if (sandbox) lastPolicy = sandbox.resolve(session ? { session: session } : {});
      return b;
    }

    async function callModel(prompt, systemText) {
      const modelSvc = ctx.get('agentDefaultModel');
      const sel = modelSvc ? modelSvc.currentSelection() : undefined;
      if (!sel || !sel.provider || !sel.model) throw new Error('未配置默认模型（agentDefaultModel 为空）');
      const messages = [{
        id: 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
        role: 'user',
        content: [{ type: 'text', text: prompt }],
        source: { kind: 'user' },
      }];
      const stream = llm.stream({ provider: sel.provider, model: sel.model, messages: messages, system: systemText });
      let out = '';
      for await (const chunk of stream) {
        if (chunk && chunk.type === 'text-delta') out += chunk.text;
      }
      return out.trim();
    }

    async function readState(bookId, base) {
      if (!isValidBookId(bookId)) throw new Error('unsafe bookId');
      const t = await fs.resolve('novels/' + bookId + '/story/state/state.json', { cwd: base });
      const info = await fs.stat(t);
      if (info === undefined) return null;
      let raw;
      try { raw = await fs.readText(t); } catch (e) { throw new Error('读取状态失败：' + e.message); }
      try { return JSON.parse(raw); } catch (e) { throw new Error('状态文件损坏（非合法 JSON），请修复 novels/' + bookId + '/story/state/state.json'); }
    }

    async function writeState(bookId, state, base) {
      if (!isValidBookId(bookId)) throw new Error('unsafe bookId');
      const v = validateState(state);
      if (!v.ok) throw new Error('状态非法，拒绝写入：' + v.errors.join('; '));
      const t = await fs.resolve('novels/' + bookId + '/story/state/state.json', { cwd: base });
      await fs.writeText(t, JSON.stringify(state, null, 2), undefined, undefined, lastPolicy);
    }

    async function writeChapter(bookId, index, body, base) {
      if (!isValidBookId(bookId)) throw new Error('unsafe bookId');
      const n = String(index).padStart(3, '0');
      const t = await fs.resolve('novels/' + bookId + '/chapters/' + n + '.md', { cwd: base });
      await fs.writeText(t, body, undefined, undefined, lastPolicy);
      return 'novels/' + bookId + '/chapters/' + n + '.md';
    }

    harness.registerTool(ctx, harness.defineTool({
      name: 'novel_create_book',
      description: 'Create a new novel book. Generates a safe bookId and initializes story state files on disk.',
      parameters: { title: { type: 'string', required: true }, genre: { type: 'string' }, brief: { type: 'string' } },
      output: { schema: { type: 'string' }, render: function (_a, v) { return [{ type: 'text', text: v }]; } },
      execute: async function (args, exec) {
        const base = baseFor(exec);
        const title = String(args.title || '').trim();
        if (!title) throw new Error('title 不能为空');
        if (title.length > 50) throw new Error('title 过长（≤50 字）');
        const bookId = makeBookId(title);
        const existing = await readState(bookId, base);
        if (existing) return '书已存在：' + bookId + '（不覆盖）';
        const state = {
          book: { bookId: bookId, title: title, genre: args.genre || '', brief: args.brief || '', targetChapters: 50, chapterWords: 2000, nextChapterIndex: 1 },
          chapters: [], summaries: [], hooks: [],
        };
        await writeState(bookId, state, base);
        return '已创建书《' + title + '》bookId=' + bookId + '，状态写入 novels/' + bookId + '/story/state/state.json';
      },
    }));

    harness.registerTool(ctx, harness.defineTool({
      name: 'novel_write_chapter',
      description: 'Write the next chapter of a book: plan → compose → write → anti-AI audit → revise (max 1) → settle. Enforces anti-AI-flavor rules and persists chapter + state.',
      parameters: { bookId: { type: 'string', required: true }, words: { type: 'number' }, context: { type: 'string' } },
      output: { schema: { type: 'string' }, render: function (_a, v) { return [{ type: 'text', text: v }]; } },
      execute: async function (args, exec) {
        const base = baseFor(exec);
        if (!isValidBookId(args.bookId)) throw new Error('unsafe bookId');
        const state = await readState(args.bookId, base);
        if (!state) return '书 ' + args.bookId + ' 不存在，请先 novel_create_book';
        const index = state.book.nextChapterIndex;
        const targetWords = args.words || state.book.chapterWords;

        // === 苏格拉底规划（give me）：未给 context 时先追问本章意图 ===
        let intent = args.context || '';
        if (!intent) {
          const uq = ctx.get('userQuestions');
          if (uq) {
            try {
              const ans = await uq.ask({
                questions: [
                  { id: 'core', question: '这一章最想推进什么？', header: '先定本章意图', options: [
                    { label: '冲突/战斗升级' }, { label: '情感/关系推进' }, { label: '揭示真相/反转' }, { label: '铺垫伏笔/世界观' },
                  ] },
                  { id: 'protagonist', question: '主角这一章的状态？', options: [
                    { label: '主动出击' }, { label: '被动应对' }, { label: '内心挣扎/成长' },
                  ] },
                  { id: 'ending', question: '结尾想留什么钩子？', options: [
                    { label: '危机突降' }, { label: '悬念反转' }, { label: '挑衅叫板' }, { label: '留白' },
                  ] },
                ],
                agent: exec.agent,
                signal: exec.signal,
              });
              const pick = function (id) {
                const a = (ans && ans.answers || []).filter(function (x) { return x.id === id; })[0];
                return a ? ((a.selected && a.selected[0]) || a.custom || '') : '';
              };
              intent = '核心推进：' + (pick('core') || '未指定') + '；主角状态：' + (pick('protagonist') || '未指定') + '；结尾钩子：' + (pick('ending') || '未指定');
            } catch (e) {
              intent = '';
            }
          }
        }

        // 保存本章意图（输入治理）
        if (intent) {
          const it = await fs.resolve('novels/' + args.bookId + '/story/runtime/chapter-' + String(index).padStart(3, '0') + '.intent.md', { cwd: base });
          await fs.writeText(it, '# 第 ' + index + ' 章意图\n\n' + intent, undefined, undefined, lastPolicy);
        }

        const recent = state.summaries.slice(-5).map(function (s) { return s.text; }).join('\n');
        const writerPrompt = '你是小说写手。写第 ' + index + ' 章正文，目标约 ' + targetWords + ' 字。\n'
          + '本章意图：' + (intent || '（无，自由发挥）') + '\n'
          + '前文摘要：\n' + (recent || '（无，此为第一章）') + '\n'
          + '写作规则：\n' + rewriteRules() + '\n只输出正文，不要标题、不要解释。';

        let body = await callModel(writerPrompt, '你是专业小说写手。');
        if (!body) throw new Error('模型返回空正文');

        let ai = detectAI(body);
        let revised = false;
        if (ai.hits.length > 0) {
          const revisePrompt = '以下是正文，请按规则改写去除 AI 味，只输出改写后的正文：\n' + rewriteRules() + '\n\n' + body;
          const rew = await callModel(revisePrompt, '你是小说修订者，按规则改写去除 AI 味。');
          if (rew) { body = rew; ai = detectAI(body); revised = true; }
        }

        const path = await writeChapter(args.bookId, index, body, base);
        const chapter = {
          index: index, title: '第' + index + '章', wordCount: countWords(body), filePath: path,
          aiTasteScore: ai.score, status: ai.hits.length === 0 ? 'approved' : 'revised',
        };
        const next = {
          book: Object.assign({}, state.book, { nextChapterIndex: Math.max(state.book.nextChapterIndex, index + 1) }),
          chapters: state.chapters.concat([chapter]).sort(function (a, b) { return a.index - b.index; }),
          summaries: state.summaries.concat([{ index: index, text: body.slice(0, 200) }]),
          hooks: state.hooks,
        };
        await writeState(args.bookId, next, base);
        return '第 ' + index + ' 章完成：字数 ' + chapter.wordCount + '，AI味评分 ' + ai.score + (revised ? '（已自动修订）' : '') + '，落盘 ' + path;
      },
    }));

    harness.registerTool(ctx, harness.defineTool({
      name: 'novel_list_chapters',
      description: 'List all chapters of a book with index/title/wordCount/aiTasteScore.',
      parameters: { bookId: { type: 'string', required: true } },
      output: { schema: { type: 'string' }, render: function (_a, v) { return [{ type: 'text', text: v }]; } },
      execute: async function (args, exec) {
        const base = baseFor(exec);
        const state = await readState(args.bookId, base);
        if (!state) return '书不存在';
        return JSON.stringify(state.chapters.map(function (c) { return { index: c.index, title: c.title, wordCount: c.wordCount, score: c.aiTasteScore }; }));
      },
    }));

    harness.registerTool(ctx, harness.defineTool({
      name: 'novel_read_chapter',
      description: 'Read the full text of one chapter.',
      parameters: { bookId: { type: 'string', required: true }, index: { type: 'number', required: true } },
      output: { schema: { type: 'string' }, render: function (_a, v) { return [{ type: 'text', text: v }]; } },
      execute: async function (args, exec) {
        const base = baseFor(exec);
        if (!Number.isInteger(args.index) || args.index < 1) return '章节号非法';
        const n = String(args.index).padStart(3, '0');
        const t = await fs.resolve('novels/' + args.bookId + '/chapters/' + n + '.md', { cwd: base });
        const info = await fs.stat(t);
        if (info === undefined) return '章节不存在';
        return await fs.readText(t);
      },
    }));

    harness.handle('list_books', async function () {
      const base = lastBase || fallbackRoot;
      const dir = await fs.resolve('novels', { cwd: base });
      const info = await fs.stat(dir);
      if (info === undefined) return [];
      const entries = await fs.listDir(dir);
      const books = [];
      for (const e of entries) {
        if (e.type !== 'directory') continue;
        const state = await readState(e.name, base);
        if (state && state.book) books.push({ bookId: state.book.bookId, title: state.book.title });
      }
      return books;
    });
    harness.handle('list_chapters', async function (args) {
      const base = lastBase || fallbackRoot;
      const state = await readState(args.bookId, base);
      return state ? state.chapters.map(function (c) { return { index: c.index, title: c.title, wordCount: c.wordCount, score: c.aiTasteScore }; }) : [];
    });
    harness.handle('read_chapter', async function (args) {
      const base = lastBase || fallbackRoot;
      if (!Number.isInteger(args.index) || args.index < 1) return '';
      const n = String(args.index).padStart(3, '0');
      const t = await fs.resolve('novels/' + args.bookId + '/chapters/' + n + '.md', { cwd: base });
      const info = await fs.stat(t);
      return info === undefined ? '' : await fs.readText(t);
    });
  },
};
