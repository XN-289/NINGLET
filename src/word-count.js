const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;

export function detectLanguage(text) {
  const cjk = (text.match(new RegExp(CJK.source, 'g')) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  return cjk >= latin ? 'zh' : 'en';
}

export function countZhChars(text) {
  return (text.match(new RegExp(CJK.source, 'g')) || []).length;
}

export function countEnWords(text) {
  const t = text.trim();
  return t.length === 0 ? 0 : t.split(/\s+/).length;
}

export function countWords(text) {
  return detectLanguage(text) === 'zh' ? countZhChars(text) : countEnWords(text);
}
