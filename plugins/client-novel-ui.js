return {
  apply(ctx) {
    const slots = ctx.get('slots');
    if (slots === undefined) return;

    // 安静编辑部设计系统（docs/design-system.md）：纸墨显式色，不依赖 DSH 主题变量，自包含
    styles.insert(`
      .ninglet-fab { position: fixed; right: 20px; bottom: 20px; z-index: 9999; pointer-events: auto; cursor: pointer; font-size: 13px; padding: 8px 16px; background: #F4F2EC; color: #2A2A28; border: 1px solid #D9D6CD; border-radius: 2px; transition: opacity 0.6s; }
      .ninglet-fab:hover { opacity: 0.85; }
      .ninglet-panel { position: fixed; right: 20px; bottom: 64px; z-index: 9999; pointer-events: auto; width: 400px; max-height: 70vh; overflow: auto; background: #F4F2EC; color: #2A2A28; border: 1px solid #D9D6CD; border-radius: 2px; box-shadow: 0 4px 24px rgba(0,0,0,0.12); animation: ninglet-fade 0.6s ease; }
      @keyframes ninglet-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      .ninglet-panel-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #D9D6CD; font-size: 13px; }
      .ninglet-panel-body { padding: 8px 16px 16px; }
      .ninglet-book { padding: 10px 0; cursor: pointer; font-size: 14px; border-bottom: 1px solid #D9D6CD; }
      .ninglet-book:hover { opacity: 0.8; }
      .ninglet-chapter { padding: 9px 0; cursor: pointer; font-size: 13px; border-bottom: 1px solid #D9D6CD; color: #7C7B76; transition: color 0.3s; }
      .ninglet-chapter:hover { color: #2A2A28; }
      .ninglet-empty { color: #7C7B76; font-size: 13px; padding: 16px 0; }
      .ninglet-prose { margin-top: 16px; font-family: Georgia, 'Noto Serif SC', 'Songti SC', serif; font-size: 15px; line-height: 1.9; white-space: pre-wrap; }
      .ninglet-close { cursor: pointer; background: none; border: none; color: #7C7B76; font-size: 15px; }
      @media (prefers-color-scheme: dark) {
        .ninglet-fab, .ninglet-panel { background: #1C1B19; color: #EDEBE4; border-color: #35332E; }
        .ninglet-panel-head, .ninglet-book, .ninglet-chapter { border-color: #35332E; }
        .ninglet-chapter, .ninglet-empty, .ninglet-close { color: #8B8A85; }
        .ninglet-chapter:hover { color: #EDEBE4; }
      }
    `);

    function NovelPanel() {
      const [open, setOpen] = React.useState(false);
      const [books, setBooks] = React.useState([]);
      const [chapters, setChapters] = React.useState([]);
      const [bookId, setBookId] = React.useState(null);
      const [body, setBody] = React.useState('');
      const [error, setError] = React.useState('');

      function refreshBooks() {
        setError('');
        host.call('list_books', {}).then(function (rows) { setBooks(rows || []); }).catch(function () { setError('连接失败'); });
      }
      function openBook(id) {
        setBookId(id);
        setBody('');
        setError('');
        host.call('list_chapters', { bookId: id }).then(function (rows) { setChapters(rows || []); }).catch(function () { setError('连接失败'); });
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
          React.createElement('span', { key: 't' }, '章节'),
          React.createElement('button', { key: 'x', className: 'ninglet-close', onClick: function () { setOpen(false); } }, '×'),
        ]),
        React.createElement('div', { key: 'b', className: 'ninglet-panel-body' }, [
          error ? React.createElement('div', { key: 'err', className: 'ninglet-empty' }, error) : null,
          books.length === 0 && !error ? React.createElement('div', { key: 'empty', className: 'ninglet-empty' }, '尚无书籍') : null,
          books.map(function (b) {
            return React.createElement('div', {
              key: b.bookId,
              className: 'ninglet-book',
              onClick: function () { openBook(b.bookId); },
              style: { fontWeight: bookId === b.bookId ? 'bold' : 'normal' },
            }, b.title);
          }),
          chapters.map(function (c) {
            return React.createElement('div', {
              key: c.index,
              className: 'ninglet-chapter',
              onClick: function () { readChapter(c.index); },
            }, '第' + c.index + '章 · ' + c.wordCount + '字 · AI味' + c.score);
          }),
          body ? React.createElement('div', { key: 'prose', className: 'ninglet-prose' }, body) : null,
        ]),
      ]) : null;

      return React.createElement('div', null, fab, panel);
    }

    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'novel-chapters-panel', label: '章节面板' },
      () => React.createElement(NovelPanel),
    ));
  },
};
