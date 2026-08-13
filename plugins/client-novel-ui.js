return {
  apply(ctx) {
    const slots = ctx.get('slots');
    if (slots === undefined) return;

    // 安静编辑部设计系统（docs/design-system.md）：纸墨显式色，自包含
    styles.insert(`
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
      .ninglet-char .ninglet-meta { font-size: 12px; }
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
    `);

    function NovelPanel() {
      const [open, setOpen] = React.useState(false);
      const [view, setView] = React.useState('tree');
      const [books, setBooks] = React.useState([]);
      const [bookId, setBookId] = React.useState(null);
      const [title, setTitle] = React.useState('');
      const [outline, setOutline] = React.useState([]);
      const [chapters, setChapters] = React.useState([]);
      const [characters, setCharacters] = React.useState([]);
      const [hooks, setHooks] = React.useState([]);
      const [body, setBody] = React.useState('');
      const [error, setError] = React.useState('');

      function refreshBooks() {
        setError('');
        host.call('list_books', {}).then(function (rows) { setBooks(rows || []); }).catch(function () { setError('连接失败'); });
      }
      function openBook(b) {
        setBookId(b.bookId);
        setTitle(b.title || b.bookId);
        setBody('');
        setError('');
        host.call('get_structure', { bookId: b.bookId }).then(function (s) {
          setOutline(s.outline || []);
          setChapters(s.chapters || []);
          setCharacters(s.characters || []);
          setHooks(s.hooks || []);
        }).catch(function () { setError('连接失败'); });
      }
      function readChapter(idx) {
        setError('');
        host.call('read_chapter', { bookId: bookId, index: idx }).then(function (t) { setBody(t || ''); }).catch(function () { setError('连接失败'); });
      }

      // 画布：章节节点按 3 列网格排布，连线表示顺序
      function canvasNodes() {
        const cols = 3, w = 132, h = 52, gapX = 28, gapY = 30;
        return chapters.map(function (c, i) {
          const col = i % cols, row = Math.floor(i / cols);
          return { c: c, x: col * (w + gapX), y: row * (h + gapY), w: w, h: h };
        });
      }
      function renderCanvas() {
        if (chapters.length === 0) return React.createElement('div', { className: 'ninglet-empty' }, '尚无章节可展示');
        const nodes = canvasNodes();
        const cols = 3;
        const w = 132, gapX = 28, gapY = 30, h = 52;
        const width = cols * w + (cols - 1) * gapX;
        const height = Math.ceil(chapters.length / cols) * (h + gapY) - gapY;
        const lines = [];
        for (let i = 0; i + 1 < nodes.length; i++) {
          const a = nodes[i], b = nodes[i + 1];
          lines.push(React.createElement('line', {
            key: 'l' + i,
            x1: a.x + a.w, y1: a.y + a.h / 2,
            x2: b.x, y2: b.y + b.h / 2,
            stroke: '#D9D6CD', strokeWidth: 1,
          }));
        }
        const boxes = nodes.map(function (n, i) {
          return React.createElement('g', { key: 'n' + i, onClick: function () { readChapter(n.c.index); }, style: { cursor: 'pointer' } }, [
            React.createElement('rect', { key: 'r', x: n.x, y: n.y, width: n.w, height: n.h, fill: '#F4F2EC', stroke: '#D9D6CD', strokeWidth: 1 }),
            React.createElement('text', { key: 't', x: n.x + 8, y: n.y + 20, fontSize: 12, fill: '#2A2A28' }, '第' + n.c.index + '章'),
            React.createElement('text', { key: 'm', x: n.x + 8, y: n.y + 38, fontSize: 10, fill: '#7C7B76' }, n.c.wordCount + '字 · AI味' + n.c.score),
          ]);
        });
        return React.createElement('div', { className: 'ninglet-canvas' },
          React.createElement('svg', { width: width, height: height, viewBox: '0 0 ' + width + ' ' + height }, lines.concat(boxes)));
      }

      const fab = React.createElement('button', {
        className: 'ninglet-fab',
        onClick: function () { const next = !open; setOpen(next); if (next) refreshBooks(); },
      }, '小说');

      const tree = bookId ? React.createElement('div', { key: 'tree' }, [
        React.createElement('div', { key: 'title', className: 'ninglet-title' }, title),
        outline.length > 0 ? React.createElement('div', { key: 'sec-o' }, [
          React.createElement('div', { key: 'oh', className: 'ninglet-section' }, '大纲'),
          outline.map(function (o, i) { return React.createElement('div', { key: 'o' + i, className: 'ninglet-outline' }, (o.index ? '第' + o.index + '章 · ' : '') + o.title); }),
        ]) : null,
        React.createElement('div', { key: 'sec-c' }, [
          React.createElement('div', { key: 'ch', className: 'ninglet-section' }, '章节'),
          chapters.length === 0 ? React.createElement('div', { key: 'ce', className: 'ninglet-empty' }, '尚未写任何章节')
            : chapters.map(function (c) { return React.createElement('div', { key: c.index, className: 'ninglet-chapter', onClick: function () { readChapter(c.index); } }, [
              React.createElement('span', { key: 't' }, '第' + c.index + '章'),
              React.createElement('span', { key: 'm', className: 'ninglet-meta' }, ' · ' + c.wordCount + '字 · AI味' + c.score),
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
            hk.note ? React.createElement('span', { key: 'd', className: 'ninglet-meta' }, ' · ' + hk.note) : null,
          ]); }),
        ]) : null,
      ]) : null;

      const panel = open ? React.createElement('div', { className: 'ninglet-panel' }, [
        React.createElement('div', { key: 'head', className: 'ninglet-panel-head' }, [
          React.createElement('span', { key: 't' }, '小说'),
          React.createElement('button', { key: 'x', className: 'ninglet-close', onClick: function () { setOpen(false); } }, '×'),
        ]),
        React.createElement('div', { key: 'b', className: 'ninglet-panel-body' }, [
          error ? React.createElement('div', { key: 'err', className: 'ninglet-empty' }, error) : null,
          books.length === 0 && !error ? React.createElement('div', { key: 'empty', className: 'ninglet-empty' }, '尚无书籍') : null,
          books.map(function (b) {
            return React.createElement('div', { key: b.bookId, className: 'ninglet-book', onClick: function () { openBook(b); }, style: { fontWeight: bookId === b.bookId ? 'bold' : 'normal' } }, b.title);
          }),
          bookId ? React.createElement('div', { key: 'tabs', className: 'ninglet-tabs' }, [
            React.createElement('button', { key: 'tv', className: 'ninglet-tab' + (view === 'tree' ? ' on' : ''), onClick: function () { setView('tree'); } }, '结构'),
            React.createElement('button', { key: 'cv', className: 'ninglet-tab' + (view === 'canvas' ? ' on' : ''), onClick: function () { setView('canvas'); } }, '画布'),
          ]) : null,
          bookId && view === 'tree' ? tree : null,
          bookId && view === 'canvas' ? renderCanvas() : null,
          body ? React.createElement('div', { key: 'prose', className: 'ninglet-prose' }, body) : null,
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
