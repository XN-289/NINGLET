/**
 * NovelService — the consolidated Client→Host RPC layer.
 *
 * The dynamic plugin (`plugins/host-novel.js`) exposes its read RPCs through
 * the package-private `harness.handle(...)` mechanism. A consolidated package
 * must instead expose them as `@Remote` methods on a `TypertRemoteService`,
 * which the typert generator turns into the `ctx.remote.novel.*` client binding
 * that `client-ninglet` consumes (mirroring how `goals`/`pluginInventory` work).
 *
 * The 5 methods below are 1:1 ports of the dynamic plugin's `harness.handle`
 * handlers (list_books / list_chapters / list_outline / get_structure /
 * read_chapter). Pure helpers (`isValidBookId`) are imported from `./index.ts`
 * to keep a single source of truth.
 *
 * @module @deepseek-ai/dsh-tool-ninglet/service
 */

import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { isValidBookId } from './index.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    novel: NovelService
  }
}

/**
 * Read-only RPC surface for the NINGLET client panel. Every call resolves
 * against the workspace filesystem under `<base>/novels/<bookId>/`, the same
 * location the tools write to. Read failures degrade to empty results so the
 * panel never white-screens (PRD edge cases E17/E18).
 */
export class NovelService extends TypertRemoteService {
  static inject = ['fs', 'sandboxPolicy']

  private readonly fs: any
  private readonly sandbox: any
  private readonly fallbackRoot: string
  private lastBase: string | null = null
  private lastPolicy: any = null

  constructor(ctx: Context) {
    super(ctx, 'novel')
    this.fs = ctx.get('fs')
    this.sandbox = ctx.get('sandboxPolicy')
    this.fallbackRoot = this.sandbox ? this.sandbox.workspaceRoot : '.'
  }

  private base(): string {
    // RPC calls have no exec/session handle; fall back to the workspace root.
    // (Tools resolve base from exec.agent.session.header.cwd; the panel only
    // needs the workspace-scoped novels/ tree, which workspaceRoot covers.)
    this.lastBase = this.fallbackRoot
    if (this.sandbox) this.lastPolicy = this.sandbox.resolve({})
    return this.fallbackRoot
  }

  private async readState(bookId: string): Promise<any | null> {
    if (!isValidBookId(bookId)) throw new Error('unsafe bookId')
    const base = this.base()
    const t = await this.fs.resolve('novels/' + bookId + '/story/state/state.json', { cwd: base })
    const info = await this.fs.stat(t)
    if (info === undefined) return null
    const raw = await this.fs.readText(t)
    return JSON.parse(raw)
  }

  /** List all books in the workspace novels/ tree. */
  @Remote('list_books')
  async listBooks(): Promise<{ bookId: string; title: string }[]> {
    const base = this.base()
    const dir = await this.fs.resolve('novels', { cwd: base })
    const info = await this.fs.stat(dir)
    if (info === undefined) return []
    const entries = await this.fs.listDir(dir)
    const books: { bookId: string; title: string }[] = []
    for (const e of entries) {
      if (e.type !== 'directory') continue
      const state = await this.readState(e.name)
      if (state && state.book) books.push({ bookId: state.book.bookId, title: state.book.title })
    }
    return books
  }

  /** List chapters of one book (index/title/wordCount/score). */
  @Remote('list_chapters')
  async listChapters(args: { bookId: string }): Promise<{ index: number; title: string; wordCount: number; score: number }[]> {
    const state = await this.readState(args.bookId)
    return state ? state.chapters.map((c: any) => ({ index: c.index, title: c.title, wordCount: c.wordCount, score: c.aiTasteScore })) : []
  }

  /** List the generated outline of one book. */
  @Remote('list_outline')
  async listOutline(args: { bookId: string }): Promise<{ index: number; title: string }[]> {
    const state = await this.readState(args.bookId)
    return (state && state.outline) ? state.outline : []
  }

  /** Aggregated structure tree: outline + chapters + characters + hooks. */
  @Remote('get_structure')
  async getStructure(args: { bookId: string }): Promise<{ outline: any[]; chapters: any[]; characters: any[]; hooks: any[] }> {
    const state = await this.readState(args.bookId)
    if (!state) return { outline: [], chapters: [], characters: [], hooks: [] }
    return {
      outline: state.outline || [],
      chapters: state.chapters.map((c: any) => ({ index: c.index, title: c.title, wordCount: c.wordCount, score: c.aiTasteScore })),
      characters: state.characters || [],
      hooks: state.hooks || [],
    }
  }

  /** Read the full text of one chapter. */
  @Remote('read_chapter')
  async readChapter(args: { bookId: string; index: number }): Promise<string> {
    if (!Number.isInteger(args.index) || args.index < 1) return ''
    const base = this.base()
    const n = String(args.index).padStart(3, '0')
    const t = await this.fs.resolve('novels/' + args.bookId + '/chapters/' + n + '.md', { cwd: base })
    const info = await this.fs.stat(t)
    return info === undefined ? '' : await this.fs.readText(t)
  }
}

export default NovelService
