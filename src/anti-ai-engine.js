/**
 * NINGLET 深度反 AI 味引擎 —— 确定性纯函数，不依赖 LLM。
 *
 * 12 维度检测（融合 kealin quality.py 10维 + inkos ai-tells 4维 + distill 可测量框架）：
 *   1. 禁用词扫描（50+ 词，含模板词 "XX"）
 *   2. AI 过渡词（议论文式逻辑词）
 *   3. "的"字密度
 *   4. 句长方差（过小=句式单调）
 *   5. 段落等长（变异系数 CV）
 *   6. 排比三连（连续3句相同开头）
 *   7. 段尾抒情总结
 *   8. 形容词堆砌（连续"的"字形容词）
 *   9. 对话标签重复
 *  10. 套话密度（似乎/可能/或许/大概）
 *  11. 公式化转折（然而/不过 ≥3次）
 *  12. 列表式结构（连续相同句首）
 *
 * 4 阶段重写规则文本（扫描→结构→风格→人味注入），供 LLM 重写用。
 *
 * 唯一数据源：本文件是权威词表/阈值，插件内联副本由 parity 测试锁死。
 */

// ============ 禁用词表（50+，融合 kealin BANNED_WORDS） ============

export const DEFAULT_FORBIDDEN = [
  // ── 经典AI味模板句 ──
  '心中一凛', '不由自主', '眼中闪过一丝', '嘴角勾起', '嘴角微微上扬',
  '淡淡道', '轻声道', '沉吟', '半晌', '不禁', '心头一颤', '意味深长',
  '复杂难明', '难以言表', '五味杂陈', '百感交集',
  // ── kealin 扩充 ──
  '眼中闪过一抹', '嘴角勾起一抹', '不由得', '情不自禁', '目光深邃',
  '若有所思', '恍然大悟', '眉头微蹙', '嘴角上扬', '心中暗道', '不觉间',
  '霎时间', '此刻的他', '他深知', '无疑', '显然', '毫无疑问', '不言而喻',
  '与此同时', '就在这时', '突然间', '猛然间', '刹那间', '恍惚间', '不知不觉',
  '本能地', '下意识地', '条件反射般', '这一刻他明白',
  // ── 高频肢体反应（跨章重复即扣分）──
  '指节发白', '指节泛白', '指关节发白', '手心出汗', '手心冒汗',
  '心跳漏了一拍', '愣了一下', '怔了怔',
  // ── 段尾总结式抒情 ──
  '这就是', '或许这就是', '也许这就是', '这大概就是',
  // ── 心理描写触发词过度使用 ──
  '忽然觉得', '突然觉得', '猛地想到',
];

// 含 "XX" 的模板词（正则匹配）
export const TEMPLATE_FORBIDDEN = [
  '一股XX涌上心头', '仿佛XX一般', '宛如XX', '好似XX', '恰似XX',
  '如同XX一般', '宛如XX似的',
  '尽管XX但是XX', '一方面XX另一方面', '一来XX二来',
  '有时候XX有时候XX有时候XX', '有人XX有人XX有人XX', '不再XX不再XX不再XX',
  // 注：不是XX是XX 移出模板扫描，由 countBushiXY 专管（skill：≤2次/章免费）
];

// ============ AI 过渡词（议论文式逻辑词） ============

export const AI_TRANSITION_WORDS = [
  '首先', '其次', '再次', '最后', '总之', '综上所述',
  '值得注意的是', '需要指出的是', '不难发现', '显而易见',
  '毋庸置疑', '不可否认', '事实上', '实际上',
  '从某种意义上说', '综合来看', '归根结底', '换言之', '由此可见',
];

// ============ 套话词（学术腔/演讲腔——注意：普通模糊词是"人味"不是AI味） ============
// anti-ai-flavor skill §八 + novel-qa「不得误判」：大概/也许/我隐约记得/我说不清 = 诚实，不罚。
// 只罚议论文腔/学术腔的限定语。

export const HEDGE_WORDS = ['某种程度上', '一定程度上', '在某种意义上', '不可否认', '毋庸置疑', '众所周知', '换言之', '从某种角度'];

// ============ 正文元话语（0 容忍，skill §一） ============

export const META_DISCOURSE = ['前文所述', '后文再表', '上回说到', '书接上回', '且听下回', '欲知后事'];

// ============ 结尾禁句（skill §六：禁止总结式/预告式收尾） ============

export const BANNED_ENDING_PHRASES = [
  '他不知道的是', '她不知道的是', '他终于明白', '她终于明白', '他终于意识到',
  '一切都变了', '这只是开始', '命运的齿轮', '故事由此展开', '新的开始',
  '从这一刻起', '这标志着',
];

// ============ 开场物理事件动词（skill §六：前300字必须有物理事件） ============

export const PHYSICAL_EVENT_VERBS = ['炸', '断', '打', '冲', '倒', '烧', '砸', '撞', '裂', '摔', '扑', '撕', '砍', '劈', '夺', '追', '逃', '杀', '死', '血', '叫', '喊', '哭', '骂', '跑', '滚', '崩', '塌', '沉', '爆'];

// ============ 公式化转折词 ============

export const TRANSITION_WORDS = ['然而', '不过', '另一方面', '尽管如此', '话虽如此', '但值得注意的是'];

// ============ 段尾抒情总结标记 ============

export const SUMMARY_ENDINGS = ['的意义', '或许这就是', '也许这就是', '这大概就是'];

// ============ 基础统计函数 ============

export function scanForbidden(text, forbidden) {
  const words = forbidden || DEFAULT_FORBIDDEN;
  const hits = [];
  for (const word of words) {
    let count = 0, idx = text.indexOf(word);
    while (idx !== -1) { count++; idx = text.indexOf(word, idx + word.length); }
    if (count > 0) hits.push({ word, index: text.indexOf(word), count });
  }
  return hits;
}

export function scanTemplateForbidden(text) {
  const templates = TEMPLATE_FORBIDDEN;
  const hits = [];
  for (const tmpl of templates) {
    const pattern = tmpl.replace(/XX/g, '(.+?)');
    let regex;
    try { regex = new RegExp(pattern, 'g'); } catch (e) { continue; }
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      hits.push({ word: tmpl, index: text.search(regex), count: matches.length });
    }
  }
  return hits;
}

export function scanTransitions(text) {
  const hits = [];
  for (const word of AI_TRANSITION_WORDS) {
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

export function paragraphLengths(text) {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0).map((p) => p.length);
}

function variance(xs) {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
}

// 变异系数 CV = stdDev / mean
function coefficientOfVariation(xs) {
  if (xs.length < 2) return 1;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (m === 0) return 1;
  const v = variance(xs);
  return Math.sqrt(v) / m;
}

// 排比三连：连续 3 句相同开头（前 3 字）
export function detectParallelStructure(text) {
  const sentences = text.split(/[。！？!?…\n]+/).map((s) => s.trim()).filter((s) => s.length > 3);
  let count = 0;
  const locations = [];
  for (let i = 0; i + 2 < sentences.length; i++) {
    const s1 = sentences[i], s2 = sentences[i + 1], s3 = sentences[i + 2];
    if (s1.slice(0, 3) === s2.slice(0, 3) && s2.slice(0, 3) === s3.slice(0, 3)) {
      count++;
      locations.push({ start: i + 1, prefix: s1.slice(0, 6) });
    }
  }
  return { count, locations };
}

// 段尾抒情总结：段末 20 字内含总结标记
export function detectSummaryEndings(text) {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
  const hits = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const last = paragraphs[i].slice(-20);
    for (const ending of SUMMARY_ENDINGS) {
      if (last.includes(ending)) { hits.push({ paragraph: i + 1, ending }); break; }
    }
  }
  return hits;
}

// 对话标签重复检测（允许标签与引号之间有冒号/逗号等标点）
export function detectDialogueTags(text) {
  const pattern = /[一-鿿]{1,4}(?:说|道|喊|叫|问|答|笑|吼|嘟囔|嘀咕|冷哼|轻声|淡淡|沉声|厉声|大声)道?[\s：:，,]*["""''']/g;
  const tags = text.match(pattern) || [];
  const counts = {};
  for (const t of tags) { counts[t] = (counts[t] || 0) + 1; }
  const repeated = [];
  for (const [tag, count] of Object.entries(counts)) {
    if (count > 1) repeated.push({ tag, count });
  }
  return { total: tags.length, repeated };
}

// 套话密度（每千字）
export function hedgeDensity(text) {
  const total = text.length;
  if (total === 0) return 0;
  let count = 0;
  for (const w of HEDGE_WORDS) {
    const regex = new RegExp(w, 'g');
    count += (text.match(regex) || []).length;
  }
  return count / (total / 1000);
}

// 公式化转折词重复
export function detectFormulaicTransitions(text) {
  const counts = {};
  for (const w of TRANSITION_WORDS) {
    const regex = new RegExp(w, 'g');
    const c = (text.match(regex) || []).length;
    if (c > 0) counts[w] = c;
  }
  const repeated = [];
  for (const [word, count] of Object.entries(counts)) {
    if (count >= 3) repeated.push({ word, count });
  }
  return repeated;
}

// 列表式结构：连续 3+ 句相同开头（前 2 字）
export function detectListStructure(text) {
  const sentences = text.split(/[。！？!?…\n]+/).map((s) => s.trim()).filter((s) => s.length > 2);
  let maxConsecutive = 1, consecutive = 1;
  for (let i = 1; i < sentences.length; i++) {
    const prev = sentences[i - 1].slice(0, 2);
    const curr = sentences[i].slice(0, 2);
    if (prev === curr) { consecutive++; maxConsecutive = Math.max(maxConsecutive, consecutive); }
    else { consecutive = 1; }
  }
  return maxConsecutive >= 3 ? maxConsecutive : 0;
}

// ============ skill 精华检测器（anti-ai-flavor §一/§三/§六） ============

// "不是X是Y"句式计数——skill：全书最大AI指纹，≤2次/章免费，超出才罚
export function countBushiXY(text) {
  const re = /不是[^，。！？\n——,!?]{1,15}(?:——是|，而是|,而是|，?是)/g;
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

// 全角破折号计数——skill：≤20/章
export function countEmDash(text) {
  return (text.match(/——/g) || []).length;
}

// 正文元话语——0容忍（卷X/前文所述/后文再表…）
export function detectMetaDiscourse(text) {
  const hits = [];
  for (const w of META_DISCOURSE) {
    let count = 0, idx = text.indexOf(w);
    while (idx !== -1) { count++; idx = text.indexOf(w, idx + w.length); }
    if (count > 0) hits.push({ word: w, count });
  }
  const vol = text.match(/卷[一二三四五六七八九十][：:]/g);
  if (vol && vol.length > 0) hits.push({ word: '卷X：', count: vol.length });
  return hits;
}

// 结尾禁句——只查结尾 120 字
export function detectBannedEndings(text) {
  const tail = text.slice(-120);
  const hits = [];
  for (const w of BANNED_ENDING_PHRASES) {
    if (tail.includes(w)) hits.push({ word: w });
  }
  return hits;
}

// 开场检查——前300字物理事件 / 前500字对话（短文本不罚，防误报）
export function checkOpening(text) {
  const cjk = text.replace(/\s/g, '');
  const first300 = cjk.slice(0, 300);
  const first500 = cjk.slice(0, 500);
  const longEnough = cjk.length >= 600;
  const physicalEvent = PHYSICAL_EVENT_VERBS.some((v) => first300.includes(v));
  const hasDialogue = /[「"“”]/.test(first500);
  return { physicalEvent, hasDialogue, longEnough };
}

// 对话占比——skill 目标 ≥30%（此处计量并软性惩罚，风格留白由 Planner 引导）
export function dialogueRatio(text) {
  const cjk = text.replace(/\s/g, '');
  if (cjk.length === 0) return 0;
  const quoted = (text.match(/[「][^」]*[」]|"[^"]*"|“[^”]*”/g) || []).join('');
  return quoted.replace(/\s/g, '').length / cjk.length;
}

// 四字格堆砌——整句（允许≤2字主语前缀）由 ≥3 个恰好四字的单元串成。
// 精确匹配“从容不迫，游刃有余，胸有成竹”，不误伤“二十几根，手心发热，虎口震麻”（首单元6字）。
export function detectIdiomStack(text) {
  const sentences = text.split(/[。！？!?；\n]+/);
  let count = 0;
  for (const raw of sentences) {
    let s = raw.trim();
    if (s.length < 14) continue; // 3×4+2分隔 = 至少14字
    s = s.replace(/^[他她它我爹娘你]{1,2}/, ''); // 允许短主语
    const parts = s.split(/[、，]/);
    if (parts.length >= 3 && parts.every((p) => p.length === 4)) count++;
  }
  return count;
}

// 章内重复 n-gram——同一表达本章出现 ≥minCount 次（skill：前文≥2次本章禁用的章内版）
const REPEAT_STOP = /^(的|了|是|他|她|它|我|你|们|那|这|一个|什么|没有|自己|起来|过来|出来)$/;
export function repeatedNgrams(text, minLen, minCount) {
  const n = minLen || 5, need = minCount || 3;
  const clean = text.replace(/[\s「」""‘’——…·*#>_\-\[\]()（）]/g, '');
  const freq = new Map();
  for (let i = 0; i + n <= clean.length; i++) {
    const g = clean.slice(i, i + n);
    freq.set(g, (freq.get(g) || 0) + 1);
  }
  const hits = [];
  const seen = new Set();
  for (const [g, c] of freq) {
    if (c >= need && !seen.has(g)) {
      // 合并被包含的子串：只报最长命中簇的代表
      let covered = false;
      for (const h of seen) { if (h.includes(g)) { covered = true; break; } }
      if (!covered) { hits.push({ phrase: g, count: c }); seen.add(g); }
    }
  }
  return hits.slice(0, 10);
}

// 跨章重复——前文出现 ≥3 次的 n-gram，本章再出现即报（skill：同一表达全文重复禁用）
export function crossChapterRepeats(currentText, prevTexts, minLen) {
  const n = minLen || 6;
  const prevAll = (prevTexts || []).join('');
  if (prevAll.length < n) return [];
  const cleanPrev = prevAll.replace(/[\s「」""‘’——…·*#>_\-\[\]()（）]/g, '');
  const freq = new Map();
  for (let i = 0; i + n <= cleanPrev.length; i++) {
    const g = cleanPrev.slice(i, i + n);
    freq.set(g, (freq.get(g) || 0) + 1);
  }
  const cleanCur = currentText.replace(/[\s「」""‘’——…·*#>_\-\[\]()（）]/g, '');
  const hits = [];
  const seen = new Set();
  for (let i = 0; i + n <= cleanCur.length; i++) {
    const g = cleanCur.slice(i, i + n);
    if ((freq.get(g) || 0) >= 3 && !seen.has(g)) {
      let covered = false;
      for (const h of seen) { if (h.includes(g)) { covered = true; break; } }
      if (!covered) { hits.push({ phrase: g, prevCount: freq.get(g) }); seen.add(g); }
    }
  }
  return hits.slice(0, 10);
}

// 句构节奏画像——短句占比/长句占比/单句成段率/均句长（用户实测反馈：电报体是AI味新指纹）
export function sentenceRhythm(text) {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0 && !/^---+$/.test(p));
  const sents = [];
  for (const p of paras) {
    for (const s of p.split(/(?<=[。！？…])/)) {
      const x = s.trim();
      if (x) sents.push(x);
    }
  }
  if (sents.length === 0) return { avgLen: 0, shortRatio: 0, longRatio: 0, singleParaRatio: 0, count: 0 };
  const lens = sents.map((s) => s.replace(/[。！？…「」\s]/g, '').length);
  const short = lens.filter((l) => l <= 10).length;
  const long = lens.filter((l) => l > 25).length;
  const single = paras.filter((p) => p.split(/(?<=[。！？…])/).filter((s) => s.trim()).length === 1).length;
  return {
    avgLen: Number((lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(1)),
    shortRatio: Number((short / sents.length).toFixed(2)),
    longRatio: Number((long / sents.length).toFixed(2)),
    singleParaRatio: Number((single / paras.length).toFixed(2)),
    count: sents.length,
  };
}

// 明喻标记密度（像/仿佛/如同/宛如/似的/一样）——用户反馈：意象性文字过多是AI味
export function simileDensity(text) {
  const cjk = text.replace(/\s/g, '').length;
  if (cjk === 0) return 0;
  const marks = (text.match(/像|仿佛|如同|宛如|似的|一样|般/g) || []).length;
  return Number((marks / (cjk / 1000)).toFixed(1));
}

// ============ 主检测函数（12 维度 + skill 6 维） ============

export function detectAI(text, rules) {
  const opts = Object.assign({
    deThreshold: 0.05, varThreshold: 20, cvThreshold: 0.15,
    hedgeThreshold: 3, parallelPenalty: 5, forbidden: DEFAULT_FORBIDDEN,
  }, rules || {});
  let score = 100;
  const hits = [];

  // dim 1: 禁用词
  const forb = scanForbidden(text, opts.forbidden);
  for (const h of forb) {
    score -= 3 * h.count;
    hits.push({ rule: 'forbidden', detail: h.word + ' x' + h.count, severity: 3 });
  }
  // dim 1b: 模板禁用词（仿佛XX一般）
  const tmpl = scanTemplateForbidden(text);
  for (const h of tmpl) {
    score -= 4 * h.count;
    hits.push({ rule: 'template-forbidden', detail: h.word + ' x' + h.count, severity: 4 });
  }
  // dim 2: AI 过渡词
  const trans = scanTransitions(text);
  for (const h of trans) {
    score -= 2 * h.count;
    hits.push({ rule: 'ai-transition', detail: h.word + ' x' + h.count, severity: 2 });
  }
  // dim 3: "的"字密度
  const dd = deDensity(text);
  if (dd > opts.deThreshold) {
    score -= 10;
    hits.push({ rule: 'de-density', detail: '的密度 ' + dd.toFixed(3) + ' > ' + opts.deThreshold, severity: 10 });
  }
  // dim 4: 句长方差
  const lens = sentenceLengths(text);
  const sv = variance(lens);
  if (lens.length >= 3 && sv < opts.varThreshold) {
    score -= 10;
    hits.push({ rule: 'sentence-uniformity', detail: '句长方差 ' + sv.toFixed(1) + ' < ' + opts.varThreshold, severity: 10 });
  }
  // dim 5: 段落等长（CV < 0.15）
  const paras = paragraphLengths(text);
  if (paras.length >= 3) {
    const cv = coefficientOfVariation(paras);
    if (cv < opts.cvThreshold) {
      score -= 8;
      hits.push({ rule: 'paragraph-uniformity', detail: '段落CV ' + cv.toFixed(3) + ' < ' + opts.cvThreshold, severity: 8 });
    }
  }
  // dim 6: 排比三连
  const parallel = detectParallelStructure(text);
  if (parallel.count > 0) {
    score -= parallel.count * opts.parallelPenalty;
    hits.push({ rule: 'parallel-structure', detail: '排比三连 x' + parallel.count + ' (如: ' + (parallel.locations[0] ? parallel.locations[0].prefix : '') + '...)', severity: opts.parallelPenalty });
  }
  // dim 7: 段尾抒情总结
  const endings = detectSummaryEndings(text);
  if (endings.length > 0) {
    score -= endings.length * 3;
    hits.push({ rule: 'summary-ending', detail: '段尾抒情 x' + endings.length + ' (如: ' + endings[0].ending + ')', severity: 3 });
  }
  // dim 8: 对话标签重复
  const tags = detectDialogueTags(text);
  if (tags.repeated.length > 0) {
    const repCount = tags.repeated.reduce((a, t) => a + (t.count - 1), 0);
    score -= repCount * 2;
    hits.push({ rule: 'dialogue-tag', detail: '标签重复 x' + repCount + ' (如: ' + (tags.repeated[0] ? tags.repeated[0].tag : '') + ')', severity: 2 });
  }
  // dim 9: 套话密度
  const hd = hedgeDensity(text);
  if (hd > opts.hedgeThreshold) {
    score -= 8;
    hits.push({ rule: 'hedge-density', detail: '套话密度 ' + hd.toFixed(1) + '/千字 > ' + opts.hedgeThreshold, severity: 8 });
  }
  // dim 10: 公式化转折
  const formulaic = detectFormulaicTransitions(text);
  if (formulaic.length > 0) {
    const detail = formulaic.map((f) => f.word + 'x' + f.count).join(', ');
    score -= 8;
    hits.push({ rule: 'formulaic-transition', detail: '公式化转折: ' + detail, severity: 8 });
  }
  // dim 11: 列表式结构
  const listish = detectListStructure(text);
  if (listish >= 3) {
    score -= 6;
    hits.push({ rule: 'list-structure', detail: '连续' + listish + '句相同开头', severity: 6 });
  }

  // dim 13: "不是X是Y"超量（skill：≤2免费，实战最大AI指纹）
  const bushi = countBushiXY(text);
  if (bushi > 2) {
    score -= 5 * (bushi - 2);
    hits.push({ rule: 'bushi-xy', detail: '「不是X是Y」x' + bushi + '（免费2次，超' + (bushi - 2) + '次）', severity: 5 });
  }
  // dim 14: 全角破折号超量（skill：≤20/章）
  const dashes = countEmDash(text);
  if (dashes > 20) {
    score -= 6;
    hits.push({ rule: 'em-dash', detail: '破折号 x' + dashes + ' > 20', severity: 6 });
  }
  // dim 15: 正文元话语（0容忍）
  const meta = detectMetaDiscourse(text);
  if (meta.length > 0) {
    const mc = meta.reduce((a, m) => a + m.count, 0);
    score -= 4 * mc;
    hits.push({ rule: 'meta-discourse', detail: '元话语: ' + meta.map((m) => m.word + 'x' + m.count).join(', '), severity: 4 });
  }
  // dim 16: 结尾禁句
  const badEnd = detectBannedEndings(text);
  if (badEnd.length > 0) {
    score -= 5 * badEnd.length;
    hits.push({ rule: 'banned-ending', detail: '结尾禁句: ' + badEnd.map((e) => e.word).join(', '), severity: 5 });
  }
  // dim 17: 开场物理事件/对话（≥600字才罚）
  const opening = checkOpening(text);
  if (opening.longEnough) {
    if (!opening.physicalEvent) {
      score -= 6;
      hits.push({ rule: 'opening-no-event', detail: '前300字无物理事件动词', severity: 6 });
    }
    if (!opening.hasDialogue) {
      score -= 3;
      hits.push({ rule: 'opening-no-dialogue', detail: '前500字无对话', severity: 3 });
    }
  }
  // dim 18: 四字格堆砌
  const idiom = detectIdiomStack(text);
  if (idiom > 0) {
    score -= 3 * idiom;
    hits.push({ rule: 'idiom-stack', detail: '四字格连排 x' + idiom, severity: 3 });
  }
  // dim 19: 章内重复表达（≥5字 n-gram 出现≥3次）
  const reps = repeatedNgrams(text, 5, 3);
  if (reps.length > 0) {
    score -= 2 * reps.length;
    hits.push({ rule: 'repeated-phrase', detail: '章内重复: ' + reps.map((r) => r.phrase + 'x' + r.count).slice(0, 3).join(', '), severity: 2 });
  }
  // dim 20: 电报体（短句占比>42% 且均句长<14——用户实测：AI腔新指纹）
  const rhythm = sentenceRhythm(text);
  if (rhythm.count >= 20) {
    if (rhythm.shortRatio > 0.42 && rhythm.avgLen < 14) {
      score -= 8;
      hits.push({ rule: 'telegram-style', detail: `短句占${Math.round(rhythm.shortRatio * 100)}% 均${rhythm.avgLen}字——电报体，叙述句要拉长到15-30字`, severity: 8 });
    }
    // dim 21: 长句不足（<12% 且均句长<15——缺乏沉浸性描写）
    if (rhythm.longRatio < 0.12 && rhythm.avgLen < 15) {
      score -= 6;
      hits.push({ rule: 'few-long-sentences', detail: `长句(>25字)仅占${Math.round(rhythm.longRatio * 100)}%——描写性长句不足`, severity: 6 });
    }
    // dim 22: 单句成段过密（>30%）
    if (rhythm.singleParaRatio > 0.3) {
      score -= 6;
      hits.push({ rule: 'single-sentence-paragraphs', detail: `单句成段率${Math.round(rhythm.singleParaRatio * 100)}%>30%——段落要2-5句为主`, severity: 6 });
    }
  }
  // dim 23: 明喻堆叠（>3/千字——意象性文字过多）
  const sd = simileDensity(text);
  if (sd > 3) {
    score -= 5;
    hits.push({ rule: 'simile-density', detail: `明喻标记${sd}/千字>3——意象过密，换白描长句`, severity: 5 });
  }

  return { score: Math.max(0, Math.min(100, score)), hits };
}

// ============ 4 阶段重写规则文本 ============

export function rewriteRules() {
  return '【反AI味规则——4阶段重写】\n\n'
    + '【阶段1·定点清除】禁用词（出现即改写）：' + DEFAULT_FORBIDDEN.slice(0, 30).join('、') + '等。'
    + '「不是X，是Y/而是Y」句式全章保留不超过2处。破折号不超过20个。'
    + '元话语（前文所述/后文再表/卷X）出现即删。\n'
    + '【阶段2·结构修复】"的"字密度<0.05（一段不超过3个）；句长长短交替（方差>20）；'
    + '段落长度要有差异（短段用于冲击，长段用于沉浸）；打破排比三连；拆掉四字格连排。\n'
    + '【阶段3·风格改写】用动作代替"淡淡道/轻声道"式对话标签；段尾不要抒情总结；'
    + '避免议论文腔限定语（某种程度上/众所周知/毋庸置疑）；避免公式化转折（然而/不过）；打破列表式句首。'
    + '注意：模糊词（大概/也许/我隐约记得/说不清）是人味，保留甚至加分，不要删。\n'
    + '【阶段4·人味注入】加入不完美的细节：打断、跑题、答非所问、口语化、个人偏好与"毛刺"。'
    + '结尾禁止"他不知道的是/这只是开始/一切都变了"式预告腔。'
    + '不要通篇工整，保留人写的随意感和缺陷。';
}

// ============ AI 味维度摘要（给面板/结果卡用） ============

export function flavorBreakdown(text) {
  return {
    forbidden: scanForbidden(text).length,
    templates: scanTemplateForbidden(text).length,
    transitions: scanTransitions(text).length,
    deDensity: Number(deDensity(text).toFixed(3)),
    sentenceVariance: Number(variance(sentenceLengths(text)).toFixed(1)),
    paragraphCV: paras2cv(text),
    parallel: detectParallelStructure(text).count,
    summaryEndings: detectSummaryEndings(text).length,
    dialogueTagRepeats: detectDialogueTags(text).repeated.length,
    hedgeDensity: Number(hedgeDensity(text).toFixed(1)),
    formulaicTransitions: detectFormulaicTransitions(text).length,
    listStructure: detectListStructure(text),
    bushiXY: countBushiXY(text),
    emDash: countEmDash(text),
    metaDiscourse: detectMetaDiscourse(text).length,
    bannedEndings: detectBannedEndings(text).length,
    dialogueRatio: Number(dialogueRatio(text).toFixed(2)),
    idiomStack: detectIdiomStack(text),
    repeatedPhrases: repeatedNgrams(text, 5, 3).length,
    rhythm: sentenceRhythm(text),
    simileDensity: simileDensity(text),
  };
}

function paras2cv(text) {
  const p = paragraphLengths(text);
  return p.length >= 2 ? Number(coefficientOfVariation(p).toFixed(3)) : null;
}
