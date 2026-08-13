/**
 * NINGLET novel-writing tools: create a book, write the next chapter through a
 * plan→compose→write→anti-AI-audit→revise→settle pipeline, list and read chapters.
 * State lands as files under `<workspace>/novels/<bookId>/`.
 * @module @deepseek-ai/dsh-tool-ninglet
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-ninglet'
export const inject = ['tools', 'llm', 'fs']

// ============ 纯函数（与 NINGLET-dsh/src 保持同源） ============

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

function makeBookId(title: string): string {
  const slug = slugify(title)
  return slug.length > 0 ? slug : 'book-' + hash6(title)
}

function isValidBookId(id: unknown): boolean {
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

const DEFAULT_FORBIDDEN = ['心中一凛', '不由自主', '眼中闪过一丝', '嘴角勾起', '嘴角微微上扬', '淡淡道', '轻声道', '沉吟', '半晌', '不禁', '心头一颤', '意味深长', '复杂难明', '难以言表', '五味杂陈', '百感交集']

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

function rewriteRules(): string {
  return `禁用词（出现即视为 AI 味，直接改写）：${DEFAULT_FORBIDDEN.join('、')}。`
    + '避免"的"字密度过高（一段不超过 3 个）；避免句长均匀的流水句（长短交替）；'
    + '避免排比三连与段尾抒情总结；用动作代替"淡淡道/轻声道"式对话标签。'
}

function validateState(s: unknown): { ok: boolean; errors: string[] } {
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

  function baseFor(exec: any): string {
    const session = exec && exec.agent ? exec.agent.session : undefined
    const b = session ? session.header.cwd : fallbackRoot
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
    description: 'Create a new novel book. Generates a safe bookId and initializes story state files on disk.',
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
      const state = {
        book: { bookId, title, genre: args.genre || '', brief: args.brief || '', targetChapters: 50, chapterWords: 2000, nextChapterIndex: 1 },
        chapters: [], summaries: [], hooks: [],
      }
      await writeState(bookId, state, base)
      return '已创建书《' + title + '》bookId=' + bookId + '，状态写入 novels/' + bookId + '/story/state/state.json'
    },
  } as any))

  tools.register(defineTool({
    name: 'novel_write_chapter',
    description: 'Write the next chapter of a book: plan → compose → write → anti-AI audit → revise (max 1) → settle. Enforces anti-AI-flavor rules and persists chapter + state.',
    parameters: { bookId: { type: 'string', required: true }, words: { type: 'number' }, context: { type: 'string' } },
    output: { schema: { type: 'string' }, render: (_a: unknown, v: string) => [{ type: 'text', text: v }] },
    execute: async (args: any, exec: any) => {
      const base = baseFor(exec)
      if (!isValidBookId(args.bookId)) throw new Error('unsafe bookId')
      const state = await readState(args.bookId, base)
      if (!state) return '书 ' + args.bookId + ' 不存在，请先 novel_create_book'
      const index = state.book.nextChapterIndex
      const targetWords = args.words || state.book.chapterWords

      const recent = state.summaries.slice(-5).map((s: any) => s.text).join('\n')
      const writerPrompt = '你是小说写手。写第 ' + index + ' 章正文，目标约 ' + targetWords + ' 字。\n'
        + '本章指导：' + (args.context || '（无）') + '\n'
        + '前文摘要：\n' + (recent || '（无，此为第一章）') + '\n'
        + '写作规则：\n' + rewriteRules() + '\n只输出正文，不要标题、不要解释。'

      let body = await callModel(writerPrompt, '你是专业小说写手。')
      if (!body) throw new Error('模型返回空正文')

      let ai = detectAI(body)
      let revised = false
      if (ai.hits.length > 0) {
        const revisePrompt = '以下是正文，请按规则改写去除 AI 味，只输出改写后的正文：\n' + rewriteRules() + '\n\n' + body
        const rew = await callModel(revisePrompt, '你是小说修订者，按规则改写去除 AI 味。')
        if (rew) {
          body = rew
          ai = detectAI(body)
          revised = true
        }
      }

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
        summaries: [...state.summaries, { index, text: body.slice(0, 200) }],
        hooks: state.hooks,
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
