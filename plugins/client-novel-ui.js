return {
  apply(ctx) {
    const slots = ctx.get('slots');
    if (slots === undefined) return;

    function NovelPanel() {
      const [open, setOpen] = React.useState(false);
      const [books, setBooks] = React.useState([]);
      const [chapters, setChapters] = React.useState([]);
      const [bookId, setBookId] = React.useState(null);
      const [body, setBody] = React.useState('');

      function refreshBooks() {
        host.call('list_books', {}).then(function (rows) { setBooks(rows || []); });
      }
      function openBook(id) {
        setBookId(id);
        setBody('');
        host.call('list_chapters', { bookId: id }).then(function (rows) { setChapters(rows || []); });
      }
      function readChapter(idx) {
        host.call('read_chapter', { bookId: bookId, index: idx }).then(function (t) { setBody(t || ''); });
      }

      const btn = React.createElement('button', {
        onClick: function () { const next = !open; setOpen(next); if (next) refreshBooks(); },
        style: { position: 'fixed', right: 16, bottom: 16, zIndex: 9999, cursor: 'pointer', pointerEvents: 'auto' },
      }, '章节');

      const panel = open ? React.createElement('div', {
        style: {
          position: 'fixed', right: 16, bottom: 56, width: 380, maxHeight: '70vh',
          background: 'var(--background, #fff)', color: 'var(--foreground, #111)',
          border: '1px solid var(--border, #ccc)', borderRadius: 12, padding: 16,
          overflow: 'auto', zIndex: 9999, pointerEvents: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
        },
      }, [
        React.createElement('div', { key: 'head', style: { display: 'flex', justifyContent: 'space-between', marginBottom: 10 } }, [
          React.createElement('b', { key: 't' }, '章节'),
          React.createElement('button', { key: 'x', onClick: function () { setOpen(false); }, style: { cursor: 'pointer' } }, '×'),
        ]),
        books.length === 0
          ? React.createElement('div', { key: 'empty', style: { color: 'var(--muted-foreground, #888)' } }, '尚无书籍')
          : React.createElement('div', { key: 'books', style: { marginBottom: 8 } },
              books.map(function (b) {
                return React.createElement('div', {
                  key: b.bookId,
                  onClick: function () { openBook(b.bookId); },
                  style: { cursor: 'pointer', padding: '4px 0', fontWeight: bookId === b.bookId ? 'bold' : 'normal' },
                }, b.title);
              })),
        React.createElement('div', { key: 'chapters', style: { marginTop: 8 } },
          chapters.map(function (c) {
            return React.createElement('div', {
              key: c.index,
              onClick: function () { readChapter(c.index); },
              style: { cursor: 'pointer', padding: '5px 0', borderBottom: '1px solid var(--border, #eee)' },
            }, '第' + c.index + '章 · ' + c.wordCount + '字 · AI味' + c.score);
          })),
        body ? React.createElement('pre', { key: 'body', style: { whiteSpace: 'pre-wrap', marginTop: 12, fontFamily: 'serif', maxHeight: 300, overflow: 'auto', background: 'var(--muted, rgba(0,0,0,0.04))', padding: 8, borderRadius: 6 } }, body) : null,
      ]) : null;

      return React.createElement('div', { key: 'novel-panel-root' }, btn, panel);
    }

    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'novel-chapters-panel', label: '章节面板' },
      () => React.createElement(NovelPanel),
    ));
  },
};
