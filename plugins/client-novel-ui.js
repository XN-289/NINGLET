return {
  apply(ctx) {
    const slots = ctx.get('slots');
    if (slots === undefined) return;

    // 安静编辑部设计系统（docs/design-system.md）：纸墨显式色，自包含
    styles.insert(`
      .ninglet-fab { position: fixed; right: 20px; bottom: 20px; z-index: 9999; pointer-events: auto; cursor: pointer; font-size: 13px; padding: 8px 16px; background: #F4F2EC; color: #2A2A28; border: 1px solid #D9D6CD; border-radius: 2px; transition: opacity 0.6s; }
      .ninglet-fab:hover { opacity: 0.85; }
      .ninglet-panel { position: fixed; right: 20px; bottom: 64px; z-index: 9999; pointer-events: auto; width: 420px; max-height: 74vh; overflow: auto; background: #F4F2EC; color: #2A2A28; border: 1px solid #D9D6CD; border-radius: 2px; box-shadow: 0 4px 24px rgba(0,0,0,0.12); animation: ninglet-fade 0.6s ease; }
      @keyframes ninglet-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      .ninglet-panel-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #D9D6CD; font-size: 13px; }
      .ninglet-panel-body { padding: 8px 16px 16px; }
      .ninglet-book { padding: 10px 0; cursor: pointer; font-size: 14px; border-bottom: 1px solid #D9D6CD; }
      .ninglet-book:hover { opacity: 0.8; }
      .ninglet-title { padding: 14px 0 6px; font-size: 16px; font-weight: 600; }
      .ninglet-section { padding: 10px 0 4px; font-size: 11px; letter-spacing: 0.08em; color: #7C7B76; text-transform: uppercase; }
      .ninglet-outline { padding: 6px 0 6px 12px; font-size: 13px; color: #7C7B76; border-left: 1px solid #D9D6CD; margin-left: 2px; }
      .ninglet-chapter { padding: 9px 0; cursor: pointer; font-size: 13px; border-bottom: 1px solid #D9D6CD; color: #2A2A28; transition: color 0.3s; }
      .ninglet-chapter:hover { opacity: 0.7; }
      .ninglet-chapter .ninglet-meta { color: #7C7B76; font-size: 12px; }
      .ninglet-empty { color: #7C7B76; font-size: 13px; padding: 16px 0; }
      .ninglet-prose { margin-top: 16px; font-family: Georgia, 'Noto Serif SC', 'Songti SC', serif; font-size: 15px; line-height: 1.9; white-space: pre-wrap; }
      .ninglet-close { cursor: pointer; background: none; border: none; color: #7C7B76; font-size: 15px; }
      @media (prefers-color-scheme: dark) {
        .ninglet-fab, .ninglet-panel { background: #1C1B19; color: #EDEBE4; border-color: #35332E; }
        .ninglet-panel-head, .ninglet-book, .ninglet-chapter { border-color: #35332E; }
        .ninglet-outline { border-color: #35332E; }
        .ninglet-section, .ninglet-outline, .ninglet-chapter .ninglet-meta, .ninglet-empty, .ninglet-close { color: #8B8A85; }
        .ninglet-chapter { color: #EDEBE4; }
      }
    `);

    function NovelPanel() {
      const [open, setOpen] = React.useState(false);
      const [books, setBooks] = React.useState([]);
      const [chapters, setChapters] = React.useState([]);
      const [outline, setOutline] = React.useState([]);
      const [bookId, setBookId] = React.useState(null);
      const [title, setTitle] = React.useState('');
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
        host.call('list_chapters', { bookId: b.bookId }).then(function (rows) { setChapters(rows || []); }).catch(function () { setError('连接失败'); });
        host.call('list_outline', { bookId: b.bookId }).then(function (rows) { setOutline(rows || []); }).catch(function () {});
      }
      function readChapter(idx) {
        setError('');
        host.call('read_chapter', { bookId: bookId, index: idx }).then(function (t) { setBody(t || ''); }).catch(function () { setError('连接失败'); });
      }

      const fab = React.createElement('button', {
        className: 'ninglet-fab',
        onClick: function () { const next = !open; setOpen(next); if (next) refreshBooks(); },
      }, '章节');

      const panel = open ? React.createElement('div', { className: 'ninglet-panel' }, [
        React.createElement('div', { key: 'head', className: 'ninglet-panel-head' }, [
          React.createElement('span', { key: 't' }, '小说结构'),
          React.createElement('button', { key: 'x', className: 'ninglet-close', onClick: function () { setOpen(false); } }, '×'),
        ]),
        React.createElement('div', { key: 'b', className: 'ninglet-panel-body' }, [
          error ? React.createElement('div', { key: 'err', className: 'ninglet-empty' }, error) : null,
          books.length === 0 && !error ? React.createElement('div', { key: 'empty', className: 'ninglet-empty' }, '尚无书籍') : null,
          books.map(function (b) {
            return React.createElement('div', {
              key: b.bookId,
              className: 'ninglet-book',
              onClick: function () { openBook(b); },
              style: { fontWeight: bookId === b.bookId ? 'bold' : 'normal' },
            }, b.title);
          }),
          // 选中书的结构树
          bookId ? React.createElement('div', { key: 'tree' }, [
            React.createElement('div', { key: 'title', className: 'ninglet-title' }, title),
            outline.length > 0 ? React.createElement('div', { key: 'sec-o' }, [
              React.createElement('div', { key: 'oh', className: 'ninglet-section' }, '大纲'),
              outline.map(function (o, i) {
                return React.createElement('div', { key: 'o' + i, className: 'ninglet-outline' },
                  (o.index ? '第' + o.index + '章 · ' : '') + o.title);
              }),
            ]) : null,
            React.createElement('div', { key: 'sec-c' }, [
              React.createElement('div', { key: 'ch', className: 'ninglet-section' }, '章节'),
              chapters.length === 0
                ? React.createElement('div', { key: 'ce', className: 'ninglet-empty' }, '尚未写任何章节')
                : chapters.map(function (c) {
                    return React.createElement('div', {
                      key: c.index,
                      className: 'ninglet-chapter',
                      onClick: function () { readChapter(c.index); },
                    }, [
                      React.createElement('span', { key: 't' }, '第' + c.index + '章'),
                      React.createElement('span', { key: 'm', className: 'ninglet-meta' }, ' · ' + c.wordCount + '字 · AI味' + c.score),
                    ]);
                  }),
            ]),
          ]) : null,
          body ? React.createElement('div', { key: 'prose', className: 'ninglet-prose' }, body) : null,
        ]),
      ]) : null;

      return React.createElement('div', null, fab, panel);
    }

    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'novel-chapters-panel', label: '小说结构' },
      () => React.createElement(NovelPanel),
    ));
  },
};
