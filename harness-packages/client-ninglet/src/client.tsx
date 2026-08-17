/**
 * NINGLET novel panel — browser half.
 *
 * Consolidated port of the dynamic plugin `plugins/client-novel-ui.js`. The
 * dynamic version calls the package-private `host.call('list_books', ...)` RPC;
 * this consolidated version consumes the typert-generated Host Remote
 * `ctx.remote.novel.*` (defined in dsh-tool-ninglet's NovelService).
 *
 * The panel offers two views over the current book, both fetched from the Host:
 *   - 结构 (tree): outline / chapters / characters / hooks
 *   - 画布 (canvas): chapter nodes laid out on an SVG grid, linked in order
 * Clicking a chapter calls back to the Host to read its full text inline.
 *
 * @module @deepseek-ai/dsh-client-ninglet/client
 */

import type { Context } from '@deepseek-ai/cordis'
import * as React from 'react'
import { useState } from 'react'

/** Client plugin inject: slots registry + the typert remote surface. */
export const inject = ['slots', 'remote']

// 安静编辑部设计系统（docs/design-system.md）：纸墨显式色，自包含、无渐变/无 emoji 图标。
const CSS = `
.ninglet-fab { position: fixed; right: 20px; bottom: 20px; z-index: 9999; pointer-events: auto; cursor: pointer; font-size: 13px; padding: 8px 16px; background: #F4F2EC; color: #2A2A28; border: 1px solid #D9D6CD; border-radius: 2px; transition: opacity 0.6s; }
.ninglet-fab:hover { opacity: 0.85; }
.ninglet-panel { position: fixed; right: 20px; bottom: 64px; z-index: 9999; pointer-events: auto; width: 460px; max-height: 76vh; overflow: auto; background: #F4F2EC; color: #2A2A28; border: 1px solid #D9D6CD; border-radius: 2px; box-shadow: 0 4px 24px rgba(0,0,0,0.12); animation: ninglet-fade 0.6s ease; }
@keyframes ninglet-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
.ninglet-panel-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #D9D6CD; font-size: 13px; }
.ninglet-tabs { display: flex; gap: 4px; padding: 8px 16px 0; }
.ninglet-tab { cursor: pointer; font-size: 12px; padding: 4px 10px; background: none; border: 1px solid #D9D6CD; color: #7C7B76; border-radius: 2px; }
.ninglet-tab.on { background: #2A2A28; color: #F4F2EC; border-color: #2A2A28; }
.ninglet-panel-body { padding: 8px 16px 16px; }
.ninglet-book { padding: 10px 0; cursor: pointer; font-size: 14px; border-bottom: 1px solid #D9D6CD; }
.ninglet-book:hover { opacity: 0.8; }
.ninglet-title { padding: 14px 0 6px; font-size: 16px; font-weight: 600; }
.ninglet-section { padding: 10px 0 4px; font-size: 11px; letter-spacing: 0.08em; color: #7C7B76; text-transform: uppercase; }
.ninglet-outline { padding: 6px 0 6px 12px; font-size: 13px; color: #7C7B76; border-left: 1px solid #D9D6CD; margin-left: 2px; }
.ninglet-chapter { padding: 9px 0; cursor: pointer; font-size: 13px; border-bottom: 1px solid #D9D6CD; color: #2A2A28; }
.ninglet-chapter:hover { opacity: 0.7; }
.ninglet-meta { color: #7C7B76; font-size: 12px; }
.ninglet-char { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #D9D6CD; }
.ninglet-hook { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #D9D6CD; }
.ninglet-hook-status { font-size: 11px; color: #C8161D; margin-left: 6px; }
.ninglet-hook-status.resolved { color: #7C7B76; }
.ninglet-canvas { margin-top: 12px; overflow: auto; border: 1px solid #D9D6CD; border-radius: 2px; }
.ninglet-empty { color: #7C7B76; font-size: 13px; padding: 16px 0; }
.ninglet-prose { margin-top: 16px; font-family: Georgia, 'Noto Serif SC', 'Songti SC', serif; font-size: 15px; line-height: 1.9; white-space: pre-wrap; }
.ninglet-close { cursor: pointer; background: none; border: none; color: #7C7B76; font-size: 15px; }
@media (prefers-color-scheme: dark) {
  .ninglet-fab, .ninglet-panel { background: #1C1B19; color: #EDEBE4; border-color: #35332E; }
  .ninglet-panel-head, .ninglet-book, .ninglet-chapter, .ninglet-char, .ninglet-hook { border-color: #35332E; }
  .ninglet-outline, .ninglet-canvas { border-color: #35332E; }
  .ninglet-section, .ninglet-outline, .ninglet-meta, .ninglet-empty, .ninglet-close { color: #8B8A85; }
  .ninglet-chapter { color: #EDEBE4; }
  .ninglet-tab { border-color: #35332E; color: #8B8A85; }
  .ninglet-tab.on { background: #EDEBE4; color: #1C1B19; border-color: #EDEBE4; }
}
`

interface ChapterRow { index: number; title: string; wordCount: number; score: number }
interface OutlineRow { index: number; title: string }
interface CharacterRow { name: string; role: string; desc: string }
interface HookRow { name: string; status: string; note: string }
interface Structure {
  outline: OutlineRow[]
  chapters: ChapterRow[]
  characters: CharacterRow[]
  hooks: HookRow[]
}

function NovelPanel({ ctx }: { ctx: Context & { remote: any } }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'tree' | 'canvas'>('tree')
  const [books, setBooks] = useState<{ bookId: string; title: string }[]>([])
  const [bookId, setBookId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [outline, setOutline] = useState<OutlineRow[]>([])
  const [chapters, setChapters] = useState<ChapterRow[]>([])
  const [characters, setCharacters] = useState<CharacterRow[]>([])
  const [hooks, setHooks] = useState<HookRow[]>([])
  const [body, setBody] = useState('')
  const [error, setError] = useState('')

  function refreshBooks() {
    setError('')
    ctx.remote.novel.listBooks().then((rows: any) => setBooks(rows || [])).catch(() => setError('连接失败'))
  }
  function openBook(b: { bookId: string; title: string }) {
    setBookId(b.bookId)
    setTitle(b.title || b.bookId)
    setBody('')
    setError('')
    ctx.remote.novel.getStructure({ bookId: b.bookId }).then((s: Structure) => {
      setOutline(s.outline || [])
      setChapters(s.chapters || [])
      setCharacters(s.characters || [])
      setHooks(s.hooks || [])
    }).catch(() => setError('连接失败'))
  }
  function readChapter(idx: number) {
    if (!bookId) return
    setError('')
    ctx.remote.novel.readChapter({ bookId, index: idx }).then((t: string) => setBody(t || '')).catch(() => setError('连接失败'))
  }

  function renderCanvas() {
    if (chapters.length === 0) return <div className="ninglet-empty">尚无章节可展示</div>
    const cols = 3, w = 132, h = 52, gapX = 28, gapY = 30
    const nodes = chapters.map((c, i) => {
      const col = i % cols, row = Math.floor(i / cols)
      return { c, x: col * (w + gapX), y: row * (h + gapY), w, h }
    })
    const width = cols * w + (cols - 1) * gapX
    const height = Math.ceil(chapters.length / cols) * (h + gapY) - gapY
    const lines: React.ReactNode[] = []
    for (let i = 0; i + 1 < nodes.length; i++) {
      const a = nodes[i], b = nodes[i + 1]
      lines.push(<line key={'l' + i} x1={a.x + a.w} y1={a.y + a.h / 2} x2={b.x} y2={b.y + b.h / 2} stroke="#D9D6CD" strokeWidth={1} />)
    }
    const boxes = nodes.map((n, i) => (
      <g key={'n' + i} onClick={() => readChapter(n.c.index)} style={{ cursor: 'pointer' }}>
        <rect x={n.x} y={n.y} width={n.w} height={n.h} fill="#F4F2EC" stroke="#D9D6CD" strokeWidth={1} />
        <text x={n.x + 8} y={n.y + 20} fontSize={12} fill="#2A2A28">第{n.c.index}章</text>
        <text x={n.x + 8} y={n.y + 38} fontSize={10} fill="#7C7B76">{n.c.wordCount}字 · AI味{n.c.score}</text>
      </g>
    ))
    return (
      <div className="ninglet-canvas">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>{lines}{boxes}</svg>
      </div>
    )
  }

  const tree = bookId ? (
    <div>
      <div className="ninglet-title">{title}</div>
      {outline.length > 0 && (
        <div>
          <div className="ninglet-section">大纲</div>
          {outline.map((o, i) => <div key={'o' + i} className="ninglet-outline">{(o.index ? '第' + o.index + '章 · ' : '') + o.title}</div>)}
        </div>
      )}
      <div>
        <div className="ninglet-section">章节</div>
        {chapters.length === 0
          ? <div className="ninglet-empty">尚未写任何章节</div>
          : chapters.map((c) => (
            <div key={c.index} className="ninglet-chapter" onClick={() => readChapter(c.index)}>
              <span>第{c.index}章</span>
              <span className="ninglet-meta"> · {c.wordCount}字 · AI味{c.score}</span>
            </div>
          ))}
      </div>
      {characters.length > 0 && (
        <div>
          <div className="ninglet-section">角色</div>
          {characters.map((ch, i) => (
            <div key={'r' + i} className="ninglet-char">
              <span>{ch.name}</span>
              {ch.role ? <span className="ninglet-meta"> · {ch.role}</span> : null}
              {ch.desc ? <span className="ninglet-meta"> · {ch.desc}</span> : null}
            </div>
          ))}
        </div>
      )}
      {hooks.length > 0 && (
        <div>
          <div className="ninglet-section">伏笔</div>
          {hooks.map((hk, i) => (
            <div key={'h' + i} className="ninglet-hook">
              <span>{hk.name}</span>
              <span className={'ninglet-hook-status' + (hk.status === 'resolved' ? ' resolved' : '')}>
                {hk.status === 'resolved' ? '已回收' : (hk.status === 'progressing' ? '推进中' : '已埋')}
              </span>
              {hk.note ? <span className="ninglet-meta"> · {hk.note}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  ) : null

  const fab = (
    <button className="ninglet-fab" onClick={() => { const next = !open; setOpen(next); if (next) refreshBooks() }}>小说</button>
  )
  const panel = open ? (
    <div className="ninglet-panel">
      <div className="ninglet-panel-head">
        <span>小说</span>
        <button className="ninglet-close" onClick={() => setOpen(false)}>×</button>
      </div>
      <div className="ninglet-panel-body">
        {error ? <div className="ninglet-empty">{error}</div> : null}
        {books.length === 0 && !error ? <div className="ninglet-empty">尚无书籍</div> : null}
        {books.map((b) => (
          <div key={b.bookId} className="ninglet-book" onClick={() => openBook(b)} style={{ fontWeight: bookId === b.bookId ? 'bold' : 'normal' }}>{b.title}</div>
        ))}
        {bookId ? (
          <div className="ninglet-tabs">
            <button className={'ninglet-tab' + (view === 'tree' ? ' on' : '')} onClick={() => setView('tree')}>结构</button>
            <button className={'ninglet-tab' + (view === 'canvas' ? ' on' : '')} onClick={() => setView('canvas')}>画布</button>
          </div>
        ) : null}
        {bookId && view === 'tree' ? tree : null}
        {bookId && view === 'canvas' ? renderCanvas() : null}
        {body ? <div className="ninglet-prose">{body}</div> : null}
      </div>
    </div>
  ) : null

  return <div>{fab}{panel}</div>
}

/** Browser plugin body: register the panel into the shell overlay slot. */
export function apply(ctx: Context & { remote: any; slots: any }) {
  const slots = ctx.slots
  if (slots === undefined) return
  // Inject the self-contained CSS for the panel's paper-and-ink palette.
  const styleEl = document.createElement('style')
  styleEl.textContent = CSS
  document.head.appendChild(styleEl)
  ctx.effect(() => () => styleEl.remove(), 'ninglet-style')
  slots.inject('shell.overlay', () => slots.register(
    { name: 'shell.overlay', id: 'novel-panel', label: '小说' },
    () => <NovelPanel ctx={ctx} />,
  ))
}
