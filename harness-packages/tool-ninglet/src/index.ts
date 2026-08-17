/**
 * NINGLET novel-writing tools: create a book (with outline generation), write
 * the next chapter through a plan→compose→write→anti-AI-audit→revise→settle
 * pipeline (with Socratic intent-gathering + observer extraction), list and
 * read chapters. State lands as files under `<workspace>/novels/<bookId>/`.
 *
 * This consolidated source is kept in sync with the dynamic plugin
 * `plugins/host-novel.js` (parity locked by `tests/ts-parity.test.js`).
 * Client-facing RPC lives in `./service.ts` (NovelService @Remote).
 * @module @deepseek-ai/dsh-tool-ninglet
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-ninglet'
export const inject = ['tools', 'llm', 'fs']

// ============ 纯函数（与 NINGLET-dsh/src 保持同源，parity 测试锁死） ============

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function hash6(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return (h & 0xffffff).toString(16).padStart(6, '0')
}

export function makeBookId(title: string): string {
  const slug = slugify(title)
  return slug.length > 0 ? slug : 'book-' + hash6(title)
}

export function isValidBookId(id: unknown): boolean {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) && !id.includes('..')
}

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/

function detectLanguage(text: string): 'zh' | 'en' {
  const cjk = (text.match(new RegExp(CJK.source, 'g')) || []).length
  const latin = (text.match(/[a-zA-Z]/g) || []).length
  return cjk >= latin ? 'zh' : 'en'
}

function countWords(text: string): number {
  if (detectLanguage(text) === 'zh') return (text.match(new RegExp(CJK.source, 'g')) || []).length
  const t = text.trim()
  return t.length === 0 ? 0 : t.split(/\s+/).length
}

export const DEFAULT_FORBIDDEN = ['心中一凛', '不由自主', '眼中闪过一丝', '嘴角勾起', '嘴角微微上扬', '淡淡道', '轻声道', '沉吟', '半晌', '不禁', '心头一颤', '意味深长', '复杂难明', '难以言表', '五味杂陈', '百感交集', '眼中闪过一抹', '嘴角勾起一抹', '不由得', '情不自禁', '目光深邃', '若有所思', '恍然大悟', '眉头微蹙', '嘴角上扬', '心中暗道', '不觉间', '霎时间', '此刻的他', '他深知', '无疑', '显然', '毫无疑问', '不言而喻', '与此同时', '就在这时', '突然间', '猛然间', '刹那间', '恍惚间', '不知不觉', '本能地', '下意识地', '条件反射般', '这一刻他明白', '指节发白', '指节泛白', '指关节发白', '手心出汗', '手心冒汗', '心跳漏了一拍', '愣了一下', '怔了怔', '这就是', '或许这就是', '也许这就是', '这大概就是', '忽然觉得', '突然觉得', '猛地想到']

export const TEMPLATE_FORBIDDEN = ['一股XX涌上心头', '仿佛XX一般', '宛如XX', '好似XX', '恰似XX', '如同XX一般', '宛如XX似的', '不是XX而是XX', '不是XX是XX', '尽管XX但是XX', '一方面XX另一方面', '一来XX二来', '有时候XX有时候XX有时候XX', '有人XX有人XX有人XX', '不再XX不再XX不再XX']

export const AI_TRANSITION_WORDS = ['首先', '其次', '再次', '最后', '总之', '综上所述', '值得注意的是', '需要指出的是', '不难发现', '显而易见', '毋庸置疑', '不可否认', '事实上', '实际上', '从某种意义上说', '综合来看', '归根结底', '换言之', '由此可见']

export const HEDGE_WORDS = ['似乎', '可能', '或许', '大概', '某种程度上', '一定程度上', '在某种意义上']

export const TRANSITION_WORDS = ['然而', '不过', '另一方面', '尽管如此', '话虽如此', '但值得注意的是']

export const SUMMARY_ENDINGS = ['的意义', '或许这就是', '也许这就是', '这大概就是']

interface ForbiddenHit { word: string; index: number; count: number }
interface AIHit { rule: string; detail: string; severity: number }
interface AIResult { score: number; hits: AIHit[] }

function scanForbidden(text: string, forbidden: string[] = DEFAULT_FORBIDDEN): ForbiddenHit[] {
  const hits: ForbiddenHit[] = []
  for (const word of forbidden) {
    let count = 0
    let idx = text.indexOf(word)
    while (idx !== -1) {
      count++
      idx = text.indexOf(word, idx + word.length)
    }
    if (count > 0) hits.push({ word, index: text.indexOf(word), count })
  }
  return hits
}

function deDensity(text: string): number {
  const chars = text.replace(/\s/g, '').length
  const de = (text.match(/的/g) || []).length
  return chars === 0 ? 0 : de / chars
}

function sentenceLengths(text: string): number[] {
  return text.split(/[。！？!?…\n]+/).filter(s => s.trim().length > 0).map(s => s.length)
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length
}

function detectAI(text: string, rules: Record<string, unknown> = {}): AIResult {
  const opts = Object.assign({ deThreshold: 0.05, varThreshold: 20, forbidden: DEFAULT_FORBIDDEN }, rules)
  let score = 100
  const hits: AIHit[] = []
  for (const h of scanForbidden(text, opts.forbidden as string[])) {
    score -= 3 * h.count
    hits.push({ rule: 'forbidden', detail: `${h.word} x${h.count}`, severity: 3 })
  }
  const dd = deDensity(text)
  if (dd > (opts.deThreshold as number)) {
    score -= 10
    hits.push({ rule: 'de-density', detail: `的密度 ${dd.toFixed(3)} > ${opts.deThreshold}`, severity: 10 })
  }
  const lens = sentenceLengths(text)
  const v = variance(lens)
  if (lens.length >= 3 && v < (opts.varThreshold as number)) {
    score -= 10
    hits.push({ rule: 'sentence-uniformity', detail: `句长方差 ${v.toFixed(1)} < ${opts.varThreshold}`, severity: 10 })
  }
  return { score: Math.max(0, Math.min(100, score)), hits }
}

export function rewriteRules(): string {
  return `【反AI味规则——4阶段重写】\n\n`
    + `【阶段1·定点清除】禁用词（出现即改写）：${DEFAULT_FORBIDDEN.join('、')}。`
    + `模板句（正则匹配）：仿佛XX一般/宛如XX/不是XX而是XX 等。\n`
    + `【阶段2·结构修复】"的"字密度<0.05（一段不超过3个）；句长长短交替（方差>20）；`
    + `段落长度要有差异（短段用于冲击，长段用于沉浸）；打破排比三连。\n`
    + `【阶段3·风格改写】用动作代替"淡淡道/轻声道"式对话标签；段尾不要抒情总结；`
    + `减少套话（似乎/可能/或许）；避免公式化转折（然而/不过）；打破列表式句首。\n`
    + `【阶段4·人味注入】加入不完美的细节：打断、跑题、答非所问、口语化、个人偏好与"毛刺"。`
    + `不要通篇工整，保留人写的随意感和缺陷。`
}

export function validateState(s: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  if (!s || typeof s !== 'object') return { ok: false, errors: ['state is not an object'] }
  const state = s as Record<string, any>
  const b = state.book
  if (!b || typeof b !== 'object') {
    errors.push('book is not an object')
  } else {
    if (typeof b.bookId !== 'string' || !isValidBookId(b.bookId)) errors.push('bookId 非法')
    if (typeof b.title !== 'string' || b.title.length === 0) errors.push('title 缺失')
    if (!Number.isInteger(b.targetChapters) || b.targetChapters < 1) errors.push('targetChapters 必须为正整数')
    if (!Number.isInteger(b.chapterWords) || b.chapterWords < 1) errors.push('chapterWords 必须为正整数')
    if (!Number.isInteger(b.nextChapterIndex) || b.nextChapterIndex < 1) errors.push('nextChapterIndex 必须为正整数')
  }
  if (!Array.isArray(state.chapters)) errors.push('chapters 必须为数组')
  if (!Array.isArray(state.summaries)) errors.push('summaries 必须为数组')
  if (!Array.isArray(state.hooks)) errors.push('hooks 必须为数组')
  if (state.outline !== undefined && !Array.isArray(state.outline)) errors.push('outline 必须为数组')
  if (state.characters !== undefined && !Array.isArray(state.characters)) errors.push('characters 必须为数组')
  return { ok: errors.length === 0, errors }
}

// ============ apply ============

export function apply(ctx: Context): void {
  const tools = ctx.get('tools') as { register: (d: unknown) => () => void }
  const llm = ctx.get('llm') as any
  const fs = ctx.get('fs') as any
  const sandbox = ctx.get('sandboxPolicy') as { workspaceRoot: string; resolve: (r: Record<string, unknown>) => any } | undefined
  const fallbackRoot = sandbox ? sandbox.workspaceRoot : '.'
  let lastPolicy: any = null
  let lastBase: string | null = null

  function baseFor(exec: any): string {
    const session = exec && exec.agent ? exec.agent.session : undefined
    const b = session ? session.header.cwd : fallbackRoot
    lastBase = b
    if (sandbox) lastPolicy = sandbox.resolve(session ? { session } : {})
    return b
  }

  async function callModel(prompt: string, systemText: string): Promise<string> {
    const modelSvc = ctx.get('agentDefaultModel') as { currentSelection: () => { provider: string; model: string } | undefined } | undefined
    const sel = modelSvc ? modelSvc.currentSelection() : undefined
    if (!sel || !sel.provider || !sel.model) throw new Error('未配置默认模型（agentDefaultModel 为空）')
    const messages = [{
      id: 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
      role: 'user',
      content: [{ type: 'text', text: prompt }],
      source: { kind: 'user' },
    }]
    const stream = llm.stream({ provider: sel.provider, model: sel.model, messages, system: systemText })
    let out = ''
    for await (const chunk of stream) {
      if (chunk && chunk.type === 'text-delta') out += chunk.text
    }
    return out.trim()
  }

  async function readState(bookId: string, base: string): Promise<any | null> {
    if (!isValidBookId(bookId)) throw new Error('unsafe bookId')
    const t = await fs.resolve('novels/' + bookId + '/story/state/state.json', { cwd: base })
    const info = await fs.stat(t)
    if (info === undefined) return null
    let raw: string
    try {
      raw = await fs.readText(t)
    } catch (e: any) {
      throw new Error('读取状态失败：' + e.message)
    }
    try {
      return JSON.parse(raw)
    } catch {
      throw new Error('状态文件损坏（非合法 JSON），请修复 novels/' + bookId + '/story/state/state.json')
    }
  }

  async function writeState(bookId: string, state: any, base: string): Promise<void> {
    if (!isValidBookId(bookId)) throw new Error('unsafe bookId')
    const v = validateState(state)
    if (!v.ok) throw new Error('状态非法，拒绝写入：' + v.errors.join('; '))
    const t = await fs.resolve('novels/' + bookId + '/story/state/state.json', { cwd: base })
    await fs.writeText(t, JSON.stringify(state, null, 2), undefined, undefined, lastPolicy)
  }

  async function writeChapter(bookId: string, index: number, body: string, base: string): Promise<string> {
    if (!isValidBookId(bookId)) throw new Error('unsafe bookId')
    const n = String(index).padStart(3, '0')
    const t = await fs.resolve('novels/' + bookId + '/chapters/' + n + '.md', { cwd: base })
    await fs.writeText(t, body, undefined, undefined, lastPolicy)
    return 'novels/' + bookId + '/chapters/' + n + '.md'
  }

  tools.register(defineTool({
    name: 'novel_create_book',
    description: 'Create a new novel book. Generates a safe bookId, optionally an 8-12 chapter outline from a brief, and initializes story state files on disk.',
    parameters: { title: { type: 'string', required: true }, genre: { type: 'string' }, brief: { type: 'string' } },
    output: { schema: { type: 'string' }, render: (_a: unknown, v: string) => [{ type: 'text', text: v }] },
    execute: async (args: any, exec: any) => {
      const base = baseFor(exec)
      const title = String(args.title || '').trim()
      if (!title) throw new Error('title 不能为空')
      if (title.length > 50) throw new Error('title 过长（≤50 字）')
      const bookId = makeBookId(title)
      const existing = await readState(bookId, base)
      if (existing) return '书已存在：' + bookId + '（不覆盖）'
      // 有创作简报时生成章回大纲
      let outline: any[] = []
      if (args.brief) {
        try {
          const op = '你是小说架构师。根据创作简报生成章回大纲：每行「第N章：标题 —— 一句话摘要」，共 8-12 章。只输出大纲，不要解释。\n\n创作简报：\n' + args.brief
          const ot = await callModel(op, '你是小说架构师。')
          if (ot) {
            outline = ot.split('\n').map((line: string) => {
              const m = line.match(/第\s*(\d+)\s*章\s*[：:]\s*(.+)/)
              if (m) return { index: parseInt(m[1], 10) || 0, title: (m[2] || '').trim() }
              const t = line.trim()
              return t ? { index: 0, title: t } : null
            }).filter((o: any) => o && o.title)
          }
        } catch (_e) {
          outline = []
        }
      }
      const state = {
        book: { bookId, title, genre: args.genre || '', brief: args.brief || '', targetChapters: 50, chapterWords: 2000, nextChapterIndex: 1 },
        chapters: [], summaries: [], hooks: [], characters: [], outline,
      }
      await writeState(bookId, state, base)
      return '已创建书《' + title + '》bookId=' + bookId + '，状态写入 novels/' + bookId + '/story/state/state.json' + (outline.length ? '（已生成 ' + outline.length + ' 章大纲）' : '')
    },
  } as any))

  tools.register(defineTool({
    name: 'novel_write_chapter',
    description: 'Write the next chapter of a book: plan → compose → write → anti-AI audit → revise (max 1) → settle. Gathers intent via Socratic questions when no context is given, extracts characters/hooks via an observer pass, and persists chapter + state.',
    parameters: { bookId: { type: 'string', required: true }, words: { type: 'number' }, context: { type: 'string' } },
    output: { schema: { type: 'string' }, render: (_a: unknown, v: string) => [{ type: 'text', text: v }] },
    execute: async (args: any, exec: any) => {
      const base = baseFor(exec)
      if (!isValidBookId(args.bookId)) throw new Error('unsafe bookId')
      const state = await readState(args.bookId, base)
      if (!state) return '书 ' + args.bookId + ' 不存在，请先 novel_create_book'
      const index = state.book.nextChapterIndex
      const targetWords = args.words || state.book.chapterWords

      // === 苏格拉底规划（give me）：未给 context 时先追问本章意图 ===
      let intent = args.context || ''
      if (!intent) {
        const uq = ctx.get('userQuestions') as any
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
            })
            const pick = (id: string) => {
              const a = ((ans && ans.answers) || []).filter((x: any) => x.id === id)[0]
              return a ? ((a.selected && a.selected[0]) || a.custom || '') : ''
            }
            intent = '核心推进：' + (pick('core') || '未指定') + '；主角状态：' + (pick('protagonist') || '未指定') + '；结尾钩子：' + (pick('ending') || '未指定')
          } catch (_e) {
            intent = ''
          }
        }
      }

      // 保存本章意图（输入治理）
      if (intent) {
        const it = await fs.resolve('novels/' + args.bookId + '/story/runtime/chapter-' + String(index).padStart(3, '0') + '.intent.md', { cwd: base })
        await fs.writeText(it, '# 第 ' + index + ' 章意图\n\n' + intent, undefined, undefined, lastPolicy)
      }

      const recent = state.summaries.slice(-5).map((s: any) => s.text).join('\n')
      const writerPrompt = '你是小说写手。写第 ' + index + ' 章正文，目标约 ' + targetWords + ' 字。\n'
        + '本章意图：' + (intent || '（无，自由发挥）') + '\n'
        + '前文摘要：\n' + (recent || '（无，此为第一章）') + '\n'
        + '写作规则：\n' + rewriteRules() + '\n只输出正文，不要标题、不要解释。'

      let body = await callModel(writerPrompt, '你是专业小说写手。')
      if (!body) throw new Error('模型返回空正文')

      let ai = detectAI(body)
      let revised = false
      if (ai.hits.length > 0) {
        const revisePrompt = '以下是正文，请按规则改写去除 AI 味，只输出改写后的正文：\n' + rewriteRules() + '\n\n' + body
        const rew = await callModel(revisePrompt, '你是小说修订者，按规则改写去除 AI 味。')
        if (rew) { body = rew; ai = detectAI(body); revised = true }
      }

      // 观察者：抽取角色/伏笔 + 生成结构化摘要（记忆治理）
      let summary = body.slice(0, 200)
      const newChars: any[] = []
      const newHooks: any[] = []
      try {
        const observerPrompt = '你是小说观察者。读完下面这章，只输出一个 JSON 对象（不要任何其他文字）：\n'
          + '{"summary":"本章摘要（80字内，事件+结果）","characters":[{"name":"角色名","role":"主角/配角/反派","desc":"一句话定位"}],"hooks":[{"name":"伏笔/悬念","status":"open","note":"一句话"}]}\n'
          + 'status 取值：open=刚埋下 / progressing=推进中 / resolved=已回收。\n\n章节正文：\n' + body
        const obsText = await callModel(observerPrompt, '你是小说观察者，只输出 JSON。')
        if (obsText) {
          const m = obsText.match(/\{[\s\S]*\}/)
          const obs = m ? JSON.parse(m[0]) : null
          if (obs) {
            if (typeof obs.summary === 'string' && obs.summary.trim()) summary = obs.summary.trim()
            if (Array.isArray(obs.characters)) for (const c of obs.characters) if (c && c.name) newChars.push({ name: String(c.name), role: String(c.role || ''), desc: String(c.desc || '') })
            if (Array.isArray(obs.hooks)) for (const h of obs.hooks) if (h && h.name) newHooks.push({ name: String(h.name), status: (h.status === 'progressing' || h.status === 'resolved') ? h.status : 'open', note: String(h.note || '') })
          }
        }
      } catch (_e) { /* 观察者失败则回退截断摘要 */ }

      const chars = (state.characters || []).slice()
      for (const nc of newChars) { if (!chars.some((c: any) => c.name === nc.name)) chars.push(nc) }
      const hooks = (state.hooks || []).slice()
      for (const nh of newHooks) { const ex = hooks.filter((h: any) => h.name === nh.name)[0]; if (ex) ex.status = nh.status; else hooks.push(nh) }

      const path = await writeChapter(args.bookId, index, body, base)
      const chapter = {
        index,
        title: '第' + index + '章',
        wordCount: countWords(body),
        filePath: path,
        aiTasteScore: ai.score,
        status: ai.hits.length === 0 ? 'approved' : 'revised',
      }
      const next = {
        book: { ...state.book, nextChapterIndex: Math.max(state.book.nextChapterIndex, index + 1) },
        chapters: [...state.chapters, chapter].sort((a: any, b: any) => a.index - b.index),
        summaries: [...state.summaries, { index, text: summary }],
        hooks,
        characters: chars,
        outline: state.outline || [],
      }
      await writeState(args.bookId, next, base)
      return '第 ' + index + ' 章完成：字数 ' + chapter.wordCount + '，AI味评分 ' + ai.score + (revised ? '（已自动修订）' : '') + '，落盘 ' + path
    },
  } as any))

  tools.register(defineTool({
    name: 'novel_list_chapters',
    description: 'List all chapters of a book with index/title/wordCount/aiTasteScore.',
    parameters: { bookId: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_a: unknown, v: string) => [{ type: 'text', text: v }] },
    execute: async (args: any, exec: any) => {
      const base = baseFor(exec)
      const state = await readState(args.bookId, base)
      if (!state) return '书不存在'
      return JSON.stringify(state.chapters.map((c: any) => ({ index: c.index, title: c.title, wordCount: c.wordCount, score: c.aiTasteScore })))
    },
  } as any))

  tools.register(defineTool({
    name: 'novel_read_chapter',
    description: 'Read the full text of one chapter.',
    parameters: { bookId: { type: 'string', required: true }, index: { type: 'number', required: true } },
    output: { schema: { type: 'string' }, render: (_a: unknown, v: string) => [{ type: 'text', text: v }] },
    execute: async (args: any, exec: any) => {
      const base = baseFor(exec)
      if (!Number.isInteger(args.index) || args.index < 1) return '章节号非法'
      const n = String(args.index).padStart(3, '0')
      const t = await fs.resolve('novels/' + args.bookId + '/chapters/' + n + '.md', { cwd: base })
      const info = await fs.stat(t)
      if (info === undefined) return '章节不存在'
      return await fs.readText(t)
    },
  } as any))
}
