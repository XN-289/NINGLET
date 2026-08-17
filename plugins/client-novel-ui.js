return {
  apply(ctx) {
    const slots = ctx.get('slots');
    if (slots === undefined) return;

    styles.insert(`
      .ninglet-fab { position: fixed; right: 20px; bottom: 20px; z-index: 9999; pointer-events: auto; cursor: pointer; font-size: 13px; padding: 8px 16px; background: #F4F2EC; color: #2A2A28; border: 1px solid #D9D6CD; border-radius: 2px; transition: opacity 0.6s; }
      .ninglet-fab:hover { opacity: 0.85; }
      .ninglet-panel { position: fixed; right: 20px; bottom: 64px; z-index: 9999; pointer-events: auto; width: 520px; max-height: 80vh; overflow: hidden; background: #F4F2EC; color: #2A2A28; border: 1px solid #D9D6CD; border-radius: 2px; box-shadow: 0 4px 24px rgba(0,0,0,0.12); animation: ninglet-fade 0.6s ease; display: flex; flex-direction: column; }
      @keyframes ninglet-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      .ninglet-panel-head { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-bottom: 1px solid #D9D6CD; font-size: 13px; flex-shrink: 0; }
      .ninglet-tabs { display: flex; gap: 4px; padding: 6px 16px 0; flex-shrink: 0; }
      .ninglet-tab { cursor: pointer; font-size: 12px; padding: 4px 10px; background: none; border: 1px solid #D9D6CD; color: #7C7B76; border-radius: 2px; }
      .ninglet-tab.on { background: #2A2A28; color: #F4F2EC; border-color: #2A2A28; }
      .ninglet-panel-body { padding: 8px 16px 16px; overflow-y: auto; flex-grow: 1; }
      .ninglet-book { padding: 10px 0; cursor: pointer; font-size: 14px; border-bottom: 1px solid #D9D6CD; }
      .ninglet-book:hover { opacity: 0.8; }
      .ninglet-title { padding: 14px 0 6px; font-size: 16px; font-weight: 600; }
      .ninglet-section { padding: 10px 0 4px; font-size: 11px; letter-spacing: 0.08em; color: #7C7B76; text-transform: uppercase; }
      .ninglet-outline { padding: 6px 0 6px 12px; font-size: 13px; color: #7C7B76; border-left: 1px solid #D9D6CD; margin-left: 2px; }
      .ninglet-chapter-row { padding: 9px 0; cursor: pointer; font-size: 13px; border-bottom: 1px solid #D9D6CD; color: #2A2A28; display: flex; justify-content: space-between; align-items: center; }
      .ninglet-chapter-row:hover { opacity: 0.7; }
      .ninglet-meta { color: #7C7B76; font-size: 12px; }
      .ninglet-char { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #D9D6CD; }
      .ninglet-hook { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #D9D6CD; }
      .ninglet-hook-status { font-size: 11px; color: #C8161D; margin-left: 6px; }
      .ninglet-hook-status.resolved { color: #7C7B76; }
      .ninglet-empty { color: #7C7B76; font-size: 13px; padding: 16px 0; }
      .ninglet-prose { margin-top: 12px; font-family: Georgia, 'Noto Serif SC', 'Songti SC', serif; font-size: 15px; line-height: 1.9; white-space: pre-wrap; }
      .ninglet-close { cursor: pointer; background: none; border: none; color: #7C7B76; font-size: 15px; }
      .ninglet-canvas-split { display: flex; flex-direction: column; gap: 8px; }
      .ninglet-node-bar { overflow-x: auto; overflow-y: hidden; padding: 8px 0; border-bottom: 1px solid #D9D6CD; flex-shrink: 0; }
      .ninglet-node-row { display: flex; gap: 0; align-items: center; min-width: max-content; padding: 0 4px; }
      .ninglet-node { cursor: pointer; padding: 8px 14px; border: 1px solid #D9D6CD; border-radius: 3px; background: #FAF9F5; font-size: 12px; white-space: nowrap; transition: all 0.2s; flex-shrink: 0; }
      .ninglet-node:hover { border-color: #7C7B76; }
      .ninglet-node.on { background: #2A2A28; color: #F4F2EC; border-color: #2A2A28; }
      .ninglet-node-meta { font-size: 10px; color: #7C7B76; margin-top: 2px; }
      .ninglet-node.on .ninglet-node-meta { color: #B8B6AE; }
      .ninglet-node-connector { width: 20px; height: 1px; background: #D9D6CD; flex-shrink: 0; }
      .ninglet-prose-area { max-height: 50vh; overflow-y: auto; }
      @media (prefers-color-scheme: dark) {
        .ninglet-fab, .ninglet-panel { background: #1C1B19; color: #EDEBE4; border-color: #35332E; }
        .ninglet-panel-head, .ninglet-book, .ninglet-chapter-row, .ninglet-char, .ninglet-hook { border-color: #35332E; }
        .ninglet-outline, .ninglet-node-bar { border-color: #35332E; }
        .ninglet-section, .ninglet-outline, .ninglet-meta, .ninglet-empty, .ninglet-close { color: #8B8A85; }
        .ninglet-chapter-row { color: #EDEBE4; }
        .ninglet-tab { border-color: #35332E; color: #8B8A85; }
        .ninglet-tab.on { background: #EDEBE4; color: #1C1B19; border-color: #EDEBE4; }
        .ninglet-node { background: #25241F; border-color: #35332E; }
        .ninglet-node.on { background: #EDEBE4; color: #1C1B19; border-color: #EDEBE4; }
        .ninglet-node-meta { color: #8B8A85; }
        .ninglet-node.on .ninglet-node-meta { color: #5C5B56; }
        .ninglet-node-connector { background: #35332E; }
      }
    `);

    function NovelPanel() {
      const [open, setOpen] = React.useState(false);
      const [view, setView] = React.useState('canvas');
      const [books, setBooks] = React.useState([]);
      const [bookId, setBookId] = React.useState(null);
      const [title, setTitle] = React.useState('');
      const [outline, setOutline] = React.useState([]);
      const [chapters, setChapters] = React.useState([]);
      const [characters, setCharacters] = React.useState([]);
      const [hooks, setHooks] = React.useState([]);
      const [body, setBody] = React.useState('');
      const [selectedChapter, setSelectedChapter] = React.useState(null);
      const [error, setError] = React.useState('');
      const [debug, setDebug] = React.useState(null);
      const [loading, setLoading] = React.useState(false);

      function refreshBooks() {
        setError(''); setDebug(null); setLoading(true);
        host.call('debug_info', {}).then(function (d) { setDebug(d); }).catch(function (e) { setDebug({ error: String(e) }); });
        host.call('list_books', {}).then(function (rows) {
          setBooks(rows || []); setLoading(false);
        }).catch(function (e) {
          setError('RPC: ' + String(e).slice(0, 200)); setLoading(false);
        });
      }
      function openBook(b) {
        setBookId(b.bookId); setTitle(b.title || b.bookId); setBody(''); setError(''); setSelectedChapter(null);
        host.call('get_structure', { bookId: b.bookId }).then(function (s) {
          setOutline(s.outline || []); setChapters(s.chapters || []); setCharacters(s.characters || []); setHooks(s.hooks || []);
          if (s.chapters && s.chapters.length > 0) { selectChapter(s.chapters[0].index); }
        }).catch(function (e) { setError('RPC: ' + String(e).slice(0, 200)); });
      }
      function selectChapter(idx) {
        setSelectedChapter(idx); setError('');
        host.call('read_chapter', { bookId: bookId, index: idx }).then(function (t) { setBody(t || '(empty)'); }).catch(function (e) { setError('RPC: ' + String(e).slice(0, 200)); });
      }

      // inkos 风格节点栏：横向滚动的章节节点 + 连接线
      function renderNodeBar() {
        if (chapters.length === 0) return React.createElement('div', { className: 'ninglet-empty' }, '尚未写任何章节');
        var items = [];
        chapters.forEach(function (c, i) {
          var isOn = selectedChapter === c.index;
          items.push(React.createElement('div', {
            key: 'n' + c.index,
            className: 'ninglet-node' + (isOn ? ' on' : ''),
            onClick: function () { selectChapter(c.index); },
          }, [
            React.createElement('div', { key: 't' }, '第' + c.index + '章'),
            React.createElement('div', { key: 'm', className: 'ninglet-node-meta' }, c.wordCount + '字 · 净' + c.score),
          ]));
          if (i < chapters.length - 1) {
            items.push(React.createElement('div', { key: 'c' + i, className: 'ninglet-node-connector' }));
          }
        });
        return React.createElement('div', { className: 'ninglet-node-bar' },
          React.createElement('div', { className: 'ninglet-node-row' }, items));
      }

      // inkos 风格画布：分栏 = 节点栏（上）+ 正文（下）
      function renderCanvasSplit() {
        return React.createElement('div', { className: 'ninglet-canvas-split' }, [
          renderNodeBar(),
          React.createElement('div', { key: 'prose-area', className: 'ninglet-prose-area' }, [
            selectedChapter ? React.createElement('div', { key: 'ch-title', className: 'ninglet-title' }, '第 ' + selectedChapter + ' 章') : null,
            body ? React.createElement('div', { key: 'prose', className: 'ninglet-prose' }, body) : React.createElement('div', { className: 'ninglet-empty' }, '选择上方章节节点查看正文'),
          ]),
        ]);
      }

      // 结构树视图
      function renderTree() {
        return React.createElement('div', { key: 'tree' }, [
          React.createElement('div', { key: 'title', className: 'ninglet-title' }, title),
          outline.length > 0 ? React.createElement('div', { key: 'sec-o' }, [
            React.createElement('div', { key: 'oh', className: 'ninglet-section' }, '大纲'),
            outline.map(function (o, i) { return React.createElement('div', { key: 'o' + i, className: 'ninglet-outline' }, (o.index ? '第' + o.index + '章 · ' : '') + o.title); }),
          ]) : null,
          React.createElement('div', { key: 'sec-c' }, [
            React.createElement('div', { key: 'ch', className: 'ninglet-section' }, '章节'),
            chapters.length === 0 ? React.createElement('div', { key: 'ce', className: 'ninglet-empty' }, '尚未写任何章节')
              : chapters.map(function (c) { return React.createElement('div', { key: c.index, className: 'ninglet-chapter-row', onClick: function () { setView('canvas'); selectChapter(c.index); } }, [
                React.createElement('span', { key: 't' }, '第' + c.index + '章'),
                React.createElement('span', { key: 'm', className: 'ninglet-meta' }, c.wordCount + '字 · 净' + c.score),
              ]); }),
          ]),
          characters.length > 0 ? React.createElement('div', { key: 'sec-r' }, [
            React.createElement('div', { key: 'rh', className: 'ninglet-section' }, '角色'),
            characters.map(function (ch, i) { return React.createElement('div', { key: 'r' + i, className: 'ninglet-char' }, [
              React.createElement('span', { key: 'n' }, ch.name),
              ch.role ? React.createElement('span', { key: 'role', className: 'ninglet-meta' }, ' · ' + ch.role) : null,
              ch.desc ? React.createElement('span', { key: 'd', className: 'ninglet-meta' }, ' · ' + ch.desc) : null,
            ]); }),
          ]) : null,
          hooks.length > 0 ? React.createElement('div', { key: 'sec-h' }, [
            React.createElement('div', { key: 'hh', className: 'ninglet-section' }, '伏笔'),
            hooks.map(function (hk, i) { return React.createElement('div', { key: 'h' + i, className: 'ninglet-hook' }, [
              React.createElement('span', { key: 'n' }, hk.name),
              React.createElement('span', { key: 's', className: 'ninglet-hook-status' + (hk.status === 'resolved' ? ' resolved' : '') }, hk.status === 'resolved' ? '已回收' : (hk.status === 'progressing' ? '推进中' : '已埋')),
              (hk.notes || hk.note) ? React.createElement('span', { key: 'd', className: 'ninglet-meta' }, ' · ' + (hk.notes || hk.note)) : null,
            ]); }),
          ]) : null,
        ]);
      }

      const fab = React.createElement('button', {
        className: 'ninglet-fab',
        onClick: function () { const next = !open; setOpen(next); if (next) refreshBooks(); },
      }, '小说');

      const panel = open ? React.createElement('div', { className: 'ninglet-panel' }, [
        React.createElement('div', { key: 'head', className: 'ninglet-panel-head' }, [
          React.createElement('span', { key: 't' }, '小说'),
          React.createElement('button', { key: 'x', className: 'ninglet-close', onClick: function () { setOpen(false); } }, '×'),
        ]),
        React.createElement('div', { key: 'b', className: 'ninglet-panel-body' }, [
          loading ? React.createElement('div', { key: 'ld', className: 'ninglet-empty' }, '加载中...') : null,
          error ? React.createElement('div', { key: 'err', className: 'ninglet-empty', style: { color: '#C8161D' } }, error) : null,
          books.length === 0 && !error && !loading ? React.createElement('div', { key: 'empty', className: 'ninglet-empty' }, '尚无书籍') : null,
          debug && books.length === 0 ? React.createElement('div', { key: 'dbg', style: { fontSize: '11px', color: '#7C7B76', padding: '8px 0', fontFamily: 'monospace', whiteSpace: 'pre-wrap' } }, '调试: ' + (debug.error ? debug.error : JSON.stringify(debug, null, 1).slice(0, 500))) : null,
          books.map(function (b) {
            return React.createElement('div', { key: b.bookId, className: 'ninglet-book', onClick: function () { openBook(b); }, style: { fontWeight: bookId === b.bookId ? 'bold' : 'normal' } }, b.title);
          }),
          bookId ? React.createElement('div', { key: 'tabs', className: 'ninglet-tabs' }, [
            React.createElement('button', { key: 'cv', className: 'ninglet-tab' + (view === 'canvas' ? ' on' : ''), onClick: function () { setView('canvas'); } }, '画布'),
            React.createElement('button', { key: 'tv', className: 'ninglet-tab' + (view === 'tree' ? ' on' : ''), onClick: function () { setView('tree'); } }, '结构'),
          ]) : null,
          bookId && view === 'canvas' ? renderCanvasSplit() : null,
          bookId && view === 'tree' ? renderTree() : null,
        ]),
      ]) : null;

      return React.createElement('div', null, fab, panel);
    }

    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'novel-chapters-panel', label: '小说' },
      () => React.createElement(NovelPanel),
    ));
  },
};
