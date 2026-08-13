export const DEFAULT_FORBIDDEN = [
  '心中一凛', '不由自主', '眼中闪过一丝', '嘴角勾起', '嘴角微微上扬',
  '淡淡道', '轻声道', '沉吟', '半晌', '不禁', '心头一颤', '意味深长',
  '复杂难明', '难以言表', '五味杂陈', '百感交集',
];

export function scanForbidden(text, forbidden = DEFAULT_FORBIDDEN) {
  const hits = [];
  for (const word of forbidden) {
    let count = 0, idx = text.indexOf(word);
    while (idx !== -1) { count++; idx = text.indexOf(word, idx + word.length); }
    if (count > 0) hits.push({ word, index: text.indexOf(word), count });
  }
  return hits;
}

export function deDensity(text) {
  const chars = text.replace(/\s/g, '').length;
  const de = (text.match(/的/g) || []).length;
  return chars === 0 ? 0 : de / chars;
}

export function sentenceLengths(text) {
  return text.split(/[。！？!?…\n]+/).filter((s) => s.trim().length > 0).map((s) => s.length);
}

function variance(xs) {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
}

export function detectAI(text, rules = {}) {
  const opts = { deThreshold: 0.05, varThreshold: 20, forbidden: DEFAULT_FORBIDDEN, ...rules };
  let score = 100;
  const hits = [];
  const forb = scanForbidden(text, opts.forbidden);
  for (const h of forb) {
    score -= 3 * h.count;
    hits.push({ rule: 'forbidden', detail: `${h.word} x${h.count}`, severity: 3 });
  }
  const dd = deDensity(text);
  if (dd > opts.deThreshold) {
    score -= 10;
    hits.push({ rule: 'de-density', detail: `的密度 ${dd.toFixed(3)} > ${opts.deThreshold}`, severity: 10 });
  }
  const lens = sentenceLengths(text);
  const v = variance(lens);
  if (lens.length >= 3 && v < opts.varThreshold) {
    score -= 10;
    hits.push({ rule: 'sentence-uniformity', detail: `句长方差 ${v.toFixed(1)} < ${opts.varThreshold}`, severity: 10 });
  }
  return { score: Math.max(0, Math.min(100, score)), hits };
}

export function rewriteRules() {
  return `禁用词（出现即视为 AI 味，直接改写）：${DEFAULT_FORBIDDEN.join('、')}。`
    + '避免"的"字密度过高（一段不超过 3 个）；避免句长均匀的流水句（长短交替）；'
    + '避免排比三连与段尾抒情总结；用动作代替"淡淡道/轻声道"式对话标签。';
}
