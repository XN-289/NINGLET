return {
  inject: ['llm', 'fs'],
  apply(ctx) {
    // ============ 内联自 src/book-id.js ============
    function slugify(title) {
      return String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
    function hash6(s) {
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
      return (h & 0xffffff).toString(16).padStart(6, '0');
    }
    function makeBookId(title) {
      const slug = slugify(title);
      return slug.length > 0 ? slug : 'book-' + hash6(title);
    }
    function isValidBookId(id) {
      return typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) && !id.includes('..');
    }
    // ============ 内联自 src/word-count.js ============
    const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;
    function detectLanguage(text) {
      const cjk = (text.match(new RegExp(CJK.source, 'g')) || []).length;
      const latin = (text.match(/[a-zA-Z]/g) || []).length;
      return cjk >= latin ? 'zh' : 'en';
    }
    function countWords(text) {
      if (detectLanguage(text) === 'zh') return (text.match(new RegExp(CJK.source, 'g')) || []).length;
      const t = text.trim();
      return t.length === 0 ? 0 : t.split(/\s+/).length;
    }
    // ============ 内联自 src/anti-ai-engine.js ============
    const DEFAULT_FORBIDDEN = ['心中一凛', '不由自主', '眼中闪过一丝', '嘴角勾起', '嘴角微微上扬', '淡淡道', '轻声道', '沉吟', '半晌', '不禁', '心头一颤', '意味深长', '复杂难明', '难以言表', '五味杂陈', '百感交集', '眼中闪过一抹', '嘴角勾起一抹', '不由得', '情不自禁', '目光深邃', '若有所思', '恍然大悟', '眉头微蹙', '嘴角上扬', '心中暗道', '不觉间', '霎时间', '此刻的他', '他深知', '无疑', '显然', '毫无疑问', '不言而喻', '与此同时', '就在这时', '突然间', '猛然间', '刹那间', '恍惚间', '不知不觉', '本能地', '下意识地', '条件反射般', '这一刻他明白', '指节发白', '指节泛白', '指关节发白', '手心出汗', '手心冒汗', '心跳漏了一拍', '愣了一下', '怔了怔', '这就是', '或许这就是', '也许这就是', '这大概就是', '忽然觉得', '突然觉得', '猛地想到'];
    const TEMPLATE_FORBIDDEN = ['一股XX涌上心头', '仿佛XX一般', '宛如XX', '好似XX', '恰似XX', '如同XX一般', '宛如XX似的', '尽管XX但是XX', '一方面XX另一方面', '一来XX二来', '有时候XX有时候XX有时候XX', '有人XX有人XX有人XX', '不再XX不再XX不再XX'];
    const AI_TRANSITION_WORDS = ['首先', '其次', '再次', '最后', '总之', '综上所述', '值得注意的是', '需要指出的是', '不难发现', '显而易见', '毋庸置疑', '不可否认', '事实上', '实际上', '从某种意义上说', '综合来看', '归根结底', '换言之', '由此可见'];
    // skill 精华：模糊词（似乎/可能/或许/大概）是人味不是AI味，只罚学术腔
    const HEDGE_WORDS = ['某种程度上', '一定程度上', '在某种意义上', '不可否认', '毋庸置疑', '众所周知', '换言之', '从某种角度'];
    const TRANSITION_WORDS = ['然而', '不过', '另一方面', '尽管如此', '话虽如此', '但值得注意的是'];
    const SUMMARY_ENDINGS = ['的意义', '或许这就是', '也许这就是', '这大概就是'];
    const META_DISCOURSE = ['前文所述', '后文再表', '上回说到', '书接上回', '且听下回', '欲知后事'];
    const BANNED_ENDING_PHRASES = ['他不知道的是', '她不知道的是', '他终于明白', '她终于明白', '他终于意识到', '一切都变了', '这只是开始', '命运的齿轮', '故事由此展开', '新的开始', '从这一刻起', '这标志着'];
    const PHYSICAL_EVENT_VERBS = ['炸', '断', '打', '冲', '倒', '烧', '砸', '撞', '裂', '摔', '扑', '撕', '砍', '劈', '夺', '追', '逃', '杀', '死', '血', '叫', '喊', '哭', '骂', '跑', '滚', '崩', '塌', '沉', '爆'];
    function scanForbidden(text, forbidden) {
      const words = forbidden || DEFAULT_FORBIDDEN;
      const hits = [];
      for (const word of words) {
        let count = 0, idx = text.indexOf(word);
        while (idx !== -1) { count++; idx = text.indexOf(word, idx + word.length); }
        if (count > 0) hits.push({ word: word, index: text.indexOf(word), count: count });
      }
      return hits;
    }
    function scanTemplateForbidden(text) {
      const hits = [];
      for (const tmpl of TEMPLATE_FORBIDDEN) {
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
    function scanTransitions(text) {
      const hits = [];
      for (const word of AI_TRANSITION_WORDS) {
        let count = 0, idx = text.indexOf(word);
        while (idx !== -1) { count++; idx = text.indexOf(word, idx + word.length); }
        if (count > 0) hits.push({ word: word, index: text.indexOf(word), count: count });
      }
      return hits;
    }
    function deDensity(text) {
      const chars = text.replace(/\s/g, '').length;
      const de = (text.match(/的/g) || []).length;
      return chars === 0 ? 0 : de / chars;
    }
    function sentenceLengths(text) {
      return text.split(/[。！？!?…\n]+/).filter((s) => s.trim().length > 0).map((s) => s.length);
    }
    function paragraphLengths(text) {
      return text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0).map((p) => p.length);
    }
    function variance(xs) {
      if (xs.length < 2) return 0;
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
    }
    function coefficientOfVariation(xs) {
      if (xs.length < 2) return 1;
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      if (m === 0) return 1;
      return Math.sqrt(variance(xs)) / m;
    }
    function detectParallelStructure(text) {
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
      return { count: count, locations: locations };
    }
    function detectSummaryEndings(text) {
      const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
      const hits = [];
      for (let i = 0; i < paragraphs.length; i++) {
        const last = paragraphs[i].slice(-20);
        for (const ending of SUMMARY_ENDINGS) {
          if (last.includes(ending)) { hits.push({ paragraph: i + 1, ending: ending }); break; }
        }
      }
      return hits;
    }
    function detectDialogueTags(text) {
      const pattern = /[一-鿿]{1,4}(?:说|道|喊|叫|问|答|笑|吼|嘟囔|嘀咕|冷哼|轻声|淡淡|沉声|厉声|大声)道?[\s：:，,]*["""''']/g;
      const tags = text.match(pattern) || [];
      const counts = {};
      for (const t of tags) { counts[t] = (counts[t] || 0) + 1; }
      const repeated = [];
      for (const tag in counts) { if (counts[tag] > 1) repeated.push({ tag: tag, count: counts[tag] }); }
      return { total: tags.length, repeated: repeated };
    }
    function hedgeDensity(text) {
      const total = text.length;
      if (total === 0) return 0;
      let count = 0;
      for (const w of HEDGE_WORDS) {
        const regex = new RegExp(w, 'g');
        count += (text.match(regex) || []).length;
      }
      return count / (total / 1000);
    }
    function detectFormulaicTransitions(text) {
      const counts = {};
      for (const w of TRANSITION_WORDS) {
        const regex = new RegExp(w, 'g');
        const c = (text.match(regex) || []).length;
        if (c > 0) counts[w] = c;
      }
      const repeated = [];
      for (const word in counts) { if (counts[word] >= 3) repeated.push({ word: word, count: counts[word] }); }
      return repeated;
    }
    function detectListStructure(text) {
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
    // ============ skill 精华检测器（anti-ai-flavor 移植） ============
    function countBushiXY(text) {
      const re = /不是[^，。！？\n——,!?]{1,15}(?:——是|，而是|,而是|，?是)/g;
      const m = text.match(re);
      return m ? m.length : 0;
    }
    function countEmDash(text) { return (text.match(/——/g) || []).length; }
    function detectMetaDiscourse(text) {
      const hits = [];
      for (const w of META_DISCOURSE) {
        let count = 0, idx = text.indexOf(w);
        while (idx !== -1) { count++; idx = text.indexOf(w, idx + w.length); }
        if (count > 0) hits.push({ word: w, count: count });
      }
      const vol = text.match(/卷[一二三四五六七八九十][：:]/g);
      if (vol && vol.length > 0) hits.push({ word: '卷X：', count: vol.length });
      return hits;
    }
    function detectBannedEndings(text) {
      const tail = text.slice(-120);
      const hits = [];
      for (const w of BANNED_ENDING_PHRASES) { if (tail.includes(w)) hits.push({ word: w }); }
      return hits;
    }
    function checkOpening(text) {
      const cjk = text.replace(/\s/g, '');
      const first300 = cjk.slice(0, 300);
      const first500 = cjk.slice(0, 500);
      const longEnough = cjk.length >= 600;
      const physicalEvent = PHYSICAL_EVENT_VERBS.some(function (v) { return first300.includes(v); });
      const hasDialogue = /[「"“”]/.test(first500);
      return { physicalEvent: physicalEvent, hasDialogue: hasDialogue, longEnough: longEnough };
    }
    function dialogueRatio(text) {
      const cjk = text.replace(/\s/g, '');
      if (cjk.length === 0) return 0;
      const quoted = (text.match(/[「][^」]*[」]|"[^"]*"|“[^”]*”/g) || []).join('');
      return quoted.replace(/\s/g, '').length / cjk.length;
    }
    function detectIdiomStack(text) {
      const sentences = text.split(/[。！？!?；\n]+/);
      let count = 0;
      for (const raw of sentences) {
        let s = raw.trim();
        if (s.length < 14) continue;
        s = s.replace(/^[他她它我爹娘你]{1,2}/, '');
        const parts = s.split(/[、，]/);
        if (parts.length >= 3 && parts.every(function (p) { return p.length === 4; })) count++;
      }
      return count;
    }
    function repeatedNgrams(text, minLen, minCount) {
      const n = minLen || 5, need = minCount || 3;
      const clean = text.replace(/[\s「」""‘’——…·*#>_\-\[\]()（）]/g, '');
      const freq = {};
      for (let i = 0; i + n <= clean.length; i++) {
        const g = clean.slice(i, i + n);
        freq[g] = (freq[g] || 0) + 1;
      }
      const hits = [];
      const seen = [];
      for (const g in freq) {
        if (freq[g] >= need && seen.indexOf(g) === -1) {
          let covered = false;
          for (let k = 0; k < seen.length; k++) { if (seen[k].indexOf(g) !== -1) { covered = true; break; } }
          if (!covered) { hits.push({ phrase: g, count: freq[g] }); seen.push(g); }
        }
      }
      return hits.slice(0, 10);
    }
    function crossChapterRepeats(currentText, prevTexts, minLen) {
      const n = minLen || 6;
      const prevAll = (prevTexts || []).join('');
      if (prevAll.length < n) return [];
      const cleanPrev = prevAll.replace(/[\s「」""‘’——…·*#>_\-\[\]()（）]/g, '');
      const freq = {};
      for (let i = 0; i + n <= cleanPrev.length; i++) {
        const g = cleanPrev.slice(i, i + n);
        freq[g] = (freq[g] || 0) + 1;
      }
      const cleanCur = currentText.replace(/[\s「」""‘’——…·*#>_\-\[\]()（）]/g, '');
      const hits = [];
      const seen = [];
      for (let i = 0; i + n <= cleanCur.length; i++) {
        const g = cleanCur.slice(i, i + n);
        if ((freq[g] || 0) >= 3 && seen.indexOf(g) === -1) {
          let covered = false;
          for (let k = 0; k < seen.length; k++) { if (seen[k].indexOf(g) !== -1) { covered = true; break; } }
          if (!covered) { hits.push({ phrase: g, prevCount: freq[g] }); seen.push(g); }
        }
      }
      return hits.slice(0, 10);
    }
    // 句构节奏画像（用户实测：电报体是AI味新指纹）
    function sentenceRhythm(text) {
      const paras = text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(function (p) { return p.length > 0 && !/^---+$/.test(p); });
      const sents = [];
      for (const p of paras) {
        const parts = p.split(/(?<=[。！？…])/);
        for (const s of parts) { const x = s.trim(); if (x) sents.push(x); }
      }
      if (sents.length === 0) return { avgLen: 0, shortRatio: 0, longRatio: 0, singleParaRatio: 0, count: 0 };
      const lens = sents.map(function (s) { return s.replace(/[。！？…「」\s]/g, '').length; });
      const short = lens.filter(function (l) { return l <= 10; }).length;
      const long = lens.filter(function (l) { return l > 25; }).length;
      const single = paras.filter(function (p) { return p.split(/(?<=[。！？…])/).filter(function (s) { return s.trim(); }).length === 1; }).length;
      return {
        avgLen: Number((lens.reduce(function (a, b) { return a + b; }, 0) / lens.length).toFixed(1)),
        shortRatio: Number((short / sents.length).toFixed(2)),
        longRatio: Number((long / sents.length).toFixed(2)),
        singleParaRatio: Number((single / paras.length).toFixed(2)),
        count: sents.length,
      };
    }
    function simileDensity(text) {
      const cjk = text.replace(/\s/g, '').length;
      if (cjk.length === 0) return 0;
      const marks = (text.match(/像|仿佛|如同|宛如|似的|一样|般/g) || []).length;
      return Number((marks / (cjk / 1000)).toFixed(1));
    }
    function detectAI(text, rules) {
      const opts = Object.assign({ deThreshold: 0.05, varThreshold: 20, cvThreshold: 0.15, hedgeThreshold: 3, parallelPenalty: 5, forbidden: DEFAULT_FORBIDDEN }, rules || {});
      let score = 100;
      const hits = [];
      const forb = scanForbidden(text, opts.forbidden);
      for (const h of forb) { score -= 3 * h.count; hits.push({ rule: 'forbidden', detail: h.word + ' x' + h.count, severity: 3 }); }
      const tmpl = scanTemplateForbidden(text);
      for (const h of tmpl) { score -= 4 * h.count; hits.push({ rule: 'template-forbidden', detail: h.word + ' x' + h.count, severity: 4 }); }
      const trans = scanTransitions(text);
      for (const h of trans) { score -= 2 * h.count; hits.push({ rule: 'ai-transition', detail: h.word + ' x' + h.count, severity: 2 }); }
      const dd = deDensity(text);
      if (dd > opts.deThreshold) { score -= 10; hits.push({ rule: 'de-density', detail: '的密度 ' + dd.toFixed(3) + ' > ' + opts.deThreshold, severity: 10 }); }
      const lens = sentenceLengths(text);
      const sv = variance(lens);
      if (lens.length >= 3 && sv < opts.varThreshold) { score -= 10; hits.push({ rule: 'sentence-uniformity', detail: '句长方差 ' + sv.toFixed(1) + ' < ' + opts.varThreshold, severity: 10 }); }
      const paras = paragraphLengths(text);
      if (paras.length >= 3) {
        const cv = coefficientOfVariation(paras);
        if (cv < opts.cvThreshold) { score -= 8; hits.push({ rule: 'paragraph-uniformity', detail: '段落CV ' + cv.toFixed(3) + ' < ' + opts.cvThreshold, severity: 8 }); }
      }
      const parallel = detectParallelStructure(text);
      if (parallel.count > 0) { score -= parallel.count * opts.parallelPenalty; hits.push({ rule: 'parallel-structure', detail: '排比三连 x' + parallel.count + ' (如: ' + (parallel.locations[0] ? parallel.locations[0].prefix : '') + '...)', severity: opts.parallelPenalty }); }
      const endings = detectSummaryEndings(text);
      if (endings.length > 0) { score -= endings.length * 3; hits.push({ rule: 'summary-ending', detail: '段尾抒情 x' + endings.length + ' (如: ' + endings[0].ending + ')', severity: 3 }); }
      const tags = detectDialogueTags(text);
      if (tags.repeated.length > 0) { const repCount = tags.repeated.reduce((a, t) => a + (t.count - 1), 0); score -= repCount * 2; hits.push({ rule: 'dialogue-tag', detail: '标签重复 x' + repCount + ' (如: ' + (tags.repeated[0] ? tags.repeated[0].tag : '') + ')', severity: 2 }); }
      const hd = hedgeDensity(text);
      if (hd > opts.hedgeThreshold) { score -= 8; hits.push({ rule: 'hedge-density', detail: '套话密度 ' + hd.toFixed(1) + '/千字 > ' + opts.hedgeThreshold, severity: 8 }); }
      const formulaic = detectFormulaicTransitions(text);
      if (formulaic.length > 0) { const detail = formulaic.map((f) => f.word + 'x' + f.count).join(', '); score -= 8; hits.push({ rule: 'formulaic-transition', detail: '公式化转折: ' + detail, severity: 8 }); }
      const listish = detectListStructure(text);
      if (listish >= 3) { score -= 6; hits.push({ rule: 'list-structure', detail: '连续' + listish + '句相同开头', severity: 6 }); }
      // ── skill 精华 6 维（anti-ai-flavor） ──
      const bushi = countBushiXY(text);
      if (bushi > 2) { score -= 5 * (bushi - 2); hits.push({ rule: 'bushi-xy', detail: '「不是X是Y」x' + bushi + '（免费2次）', severity: 5 }); }
      const dashes = countEmDash(text);
      if (dashes > 20) { score -= 6; hits.push({ rule: 'em-dash', detail: '破折号 x' + dashes + ' > 20', severity: 6 }); }
      const meta = detectMetaDiscourse(text);
      if (meta.length > 0) {
        const mc = meta.reduce(function (a, m) { return a + m.count; }, 0);
        score -= 4 * mc;
        hits.push({ rule: 'meta-discourse', detail: '元话语: ' + meta.map(function (m) { return m.word + 'x' + m.count; }).join(', '), severity: 4 });
      }
      const badEnd = detectBannedEndings(text);
      if (badEnd.length > 0) { score -= 5 * badEnd.length; hits.push({ rule: 'banned-ending', detail: '结尾禁句: ' + badEnd.map(function (e) { return e.word; }).join(', '), severity: 5 }); }
      const opening = checkOpening(text);
      if (opening.longEnough) {
        if (!opening.physicalEvent) { score -= 6; hits.push({ rule: 'opening-no-event', detail: '前300字无物理事件动词', severity: 6 }); }
        if (!opening.hasDialogue) { score -= 3; hits.push({ rule: 'opening-no-dialogue', detail: '前500字无对话', severity: 3 }); }
      }
      const idiom = detectIdiomStack(text);
      if (idiom > 0) { score -= 3 * idiom; hits.push({ rule: 'idiom-stack', detail: '四字格连排 x' + idiom, severity: 3 }); }
      const reps = repeatedNgrams(text, 5, 3);
      if (reps.length > 0) { score -= 2 * reps.length; hits.push({ rule: 'repeated-phrase', detail: '章内重复: ' + reps.map(function (r) { return r.phrase + 'x' + r.count; }).slice(0, 3).join(', '), severity: 2 }); }
      // ── 句构节奏（用户实测反馈） ──
      const rhythm = sentenceRhythm(text);
      if (rhythm.count >= 20) {
        if (rhythm.shortRatio > 0.42 && rhythm.avgLen < 14) { score -= 8; hits.push({ rule: 'telegram-style', detail: '短句占' + Math.round(rhythm.shortRatio * 100) + '% 均' + rhythm.avgLen + '字——电报体，叙述句拉长到15-30字', severity: 8 }); }
        if (rhythm.longRatio < 0.12 && rhythm.avgLen < 15) { score -= 6; hits.push({ rule: 'few-long-sentences', detail: '长句(>25字)仅占' + Math.round(rhythm.longRatio * 100) + '%——描写性长句不足', severity: 6 }); }
        if (rhythm.singleParaRatio > 0.3) { score -= 6; hits.push({ rule: 'single-sentence-paragraphs', detail: '单句成段率' + Math.round(rhythm.singleParaRatio * 100) + '%>30%——段落要2-5句为主', severity: 6 }); }
      }
      const sd = simileDensity(text);
      if (sd > 3) { score -= 5; hits.push({ rule: 'simile-density', detail: '明喻标记' + sd + '/千字>3——意象过密，换白描长句', severity: 5 }); }
      return { score: Math.max(0, Math.min(100, score)), hits: hits };
    }
    function rewriteRules() {
      return '【反AI味规则——4阶段重写】\n\n'
        + '【阶段1·定点清除】禁用词（出现即改写）：' + DEFAULT_FORBIDDEN.slice(0, 30).join('、') + '等。'
        + '「不是X，是Y/而是Y」句式全章保留不超过2处。破折号不超过20个。元话语（前文所述/后文再表/卷X）出现即删。\n'
        + '【阶段2·结构修复】"的"字密度<0.05（一段不超过3个）；句长长短交替（方差>20）；'
        + '段落长度要有差异（短段用于冲击，长段用于沉浸）；打破排比三连；拆掉四字格连排。\n'
        + '【阶段3·风格改写】用动作代替"淡淡道/轻声道"式对话标签；段尾不要抒情总结；'
        + '避免议论文腔限定语（某种程度上/众所周知/毋庸置疑）；避免公式化转折（然而/不过）；打破列表式句首。'
        + '注意：模糊词（大概/也许/我隐约记得/说不清）是人味，保留甚至加分，不要删。\n'
        + '【阶段4·人味注入】加入不完美的细节：打断、跑题、答非所问、口语化、个人偏好与"毛刺"。'
        + '结尾禁止"他不知道的是/这只是开始/一切都变了"式预告腔。'
        + '不要通篇工整，保留人写的随意感和缺陷。';
    }
    // ============ 内联自 src/state-schema.js ============
    const CHAPTER_STATUSES = ['draft', 'revised', 'approved'];
    function isInt(n) { return Number.isInteger(n); }
    function isStr(s) { return typeof s === 'string'; }
    function validateBook(b) {
      const errors = [];
      if (!b || typeof b !== 'object') return { ok: false, errors: ['book is not an object'] };
      if (!isStr(b.bookId) || !isValidBookId(b.bookId)) errors.push('bookId 非法');
      if (!isStr(b.title) || b.title.length === 0) errors.push('title 缺失');
      if (!isInt(b.targetChapters) || b.targetChapters < 1) errors.push('targetChapters 必须为正整数');
      if (!isInt(b.chapterWords) || b.chapterWords < 1) errors.push('chapterWords 必须为正整数');
      if (!isInt(b.nextChapterIndex) || b.nextChapterIndex < 1) errors.push('nextChapterIndex 必须为正整数');
      return { ok: errors.length === 0, errors: errors };
    }
    function validateChapter(c) {
      const errors = [];
      if (!c || typeof c !== 'object') return { ok: false, errors: ['chapter is not an object'] };
      if (!isInt(c.index) || c.index < 1) errors.push('index 必须为正整数');
      if (!isStr(c.filePath) || c.filePath.length === 0) errors.push('filePath 缺失');
      if (!isInt(c.wordCount) || c.wordCount < 0) errors.push('wordCount 必须为非负整数');
      if (typeof c.aiTasteScore !== 'number' || c.aiTasteScore < 0 || c.aiTasteScore > 100) errors.push('aiTasteScore 必须在 [0,100]');
      if (CHAPTER_STATUSES.indexOf(c.status) === -1) errors.push('status 必须是 ' + CHAPTER_STATUSES.join('/'));
      return { ok: errors.length === 0, errors: errors };
    }
    function validateState(s) {
      const errors = [];
      if (!s || typeof s !== 'object') return { ok: false, errors: ['state is not an object'] };
      const book = validateBook(s.book);
      if (!book.ok) for (const e of book.errors) errors.push('book.' + e);
      if (!Array.isArray(s.chapters)) errors.push('chapters 必须为数组');
      else for (const c of s.chapters) { const r = validateChapter(c); if (!r.ok) for (const e of r.errors) errors.push('chapters[' + c.index + '].' + e); }
      if (!Array.isArray(s.summaries)) errors.push('summaries 必须为数组');
      if (!Array.isArray(s.hooks)) errors.push('hooks 必须为数组');
      if (s.outline !== undefined && !Array.isArray(s.outline)) errors.push('outline 必须为数组');
      if (s.characters !== undefined && !Array.isArray(s.characters)) errors.push('characters 必须为数组');
      return { ok: errors.length === 0, errors: errors };
    }

    // ============ 内联自 src/hook-lifecycle.js ============
    const HOOK_STATUSES = ['open', 'progressing', 'deferred', 'resolved'];
    const PAYOFF_TIMINGS = ['immediate', 'near-term', 'mid-arc', 'slow-burn', 'endgame'];
    function defaultHalfLifeChapters(payoffTiming) {
      if (payoffTiming === 'immediate' || payoffTiming === 'near-term') return 10;
      if (payoffTiming === 'slow-burn' || payoffTiming === 'endgame') return 80;
      return 30;
    }
    function resolveHalfLifeChapters(hook) {
      return hook.halfLifeChapters || defaultHalfLifeChapters(hook.payoffTiming);
    }
    function normalizeHook(raw, currentChapter) {
      var name = String(raw.name || '').trim();
      if (!name) return null;
      var hookId = raw.hookId || ('hook-' + name.replace(/\s+/g, '-').toLowerCase());
      var status = HOOK_STATUSES.indexOf(raw.status) >= 0 ? raw.status : 'open';
      return {
        hookId: hookId, name: name,
        startChapter: Number.isInteger(raw.startChapter) ? raw.startChapter : (currentChapter || 0),
        status: status,
        lastAdvancedChapter: Number.isInteger(raw.lastAdvancedChapter) ? raw.lastAdvancedChapter : (status === 'open' ? 0 : (raw.startChapter || currentChapter || 0)),
        expectedPayoff: String(raw.expectedPayoff || raw.note || ''),
        payoffTiming: PAYOFF_TIMINGS.indexOf(raw.payoffTiming) >= 0 ? raw.payoffTiming : undefined,
        notes: String(raw.notes || raw.note || ''),
        dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn : [],
        coreHook: raw.coreHook === true,
        halfLifeChapters: Number.isInteger(raw.halfLifeChapters) ? raw.halfLifeChapters : undefined,
        promoted: raw.promoted === true,
      };
    }
    function mergeHooks(existing, observed, currentChapter) {
      var result = (existing || []).slice();
      var statusRank = { open: 0, progressing: 1, deferred: 1, resolved: 2 };
      for (var i = 0; i < (observed || []).length; i++) {
        var norm = normalizeHook(observed[i], currentChapter);
        if (!norm) continue;
        var idx = -1;
        for (var j = 0; j < result.length; j++) { if (result[j].name === norm.name || result[j].hookId === norm.hookId) { idx = j; break; } }
        if (idx >= 0) {
          var old = result[idx];
          var newStatus = (statusRank[norm.status] || 0) >= (statusRank[old.status] || 0) ? norm.status : old.status;
          result[idx] = Object.assign({}, old, {
            status: newStatus,
            lastAdvancedChapter: norm.status !== old.status ? currentChapter : old.lastAdvancedChapter,
            expectedPayoff: norm.expectedPayoff || old.expectedPayoff,
            notes: norm.notes || old.notes,
            payoffTiming: norm.payoffTiming || old.payoffTiming,
          });
        } else {
          result.push(norm);
        }
      }
      return result;
    }
    function computeHookDiagnostics(hooks, currentChapter) {
      var byId = new Map();
      for (const hook of hooks) { if (hook && hook.hookId) byId.set(hook.hookId, hook); }
      var result = new Map();
      for (const hook of hooks) {
        if (!hook || !hook.hookId) continue;
        var halfLife = resolveHalfLifeChapters(hook);
        var planted = Math.max(0, hook.startChapter || 0);
        var distance = Math.max(0, currentChapter - planted);
        var isResolved = hook.status === 'resolved';
        var stale = !isResolved && planted > 0 && distance > halfLife;
        var missingUpstream = [];
        for (const upstreamId of (hook.dependsOn || [])) {
          var upstream = byId.get(upstreamId);
          if (!upstream) { missingUpstream.push(upstreamId); continue; }
          var upstreamResolved = upstream.status === 'resolved';
          var upstreamPlanted = upstream.startChapter > 0 && upstream.startChapter <= currentChapter;
          if (!upstreamPlanted || !upstreamResolved) { missingUpstream.push(upstreamId); }
        }
        var blocked = missingUpstream.length > 0 && !isResolved;
        result.set(hook.hookId, { stale: stale, blocked: blocked, missingUpstream: missingUpstream, distance: distance, halfLife: halfLife });
      }
      return result;
    }
    function renderHookDiagnosticMarker(diag) {
      var tokens = [];
      if (diag.stale) tokens.push('过期(距' + diag.distance + '/半衰' + diag.halfLife + ')');
      if (diag.blocked) tokens.push('受阻于' + diag.missingUpstream.join(','));
      return tokens.join('; ');
    }
    // ============ 内联自 src/state-projection.js ============
    function normalizeChapterSummary(raw, index) {
      if (typeof raw === 'string') return { chapter: index, title: '第' + index + '章', characters: '', events: raw, stateChanges: '', hookActivity: '', mood: '', chapterType: '' };
      if (!raw || typeof raw !== 'object') return null;
      return {
        chapter: Number.isInteger(raw.chapter) ? raw.chapter : index,
        title: String(raw.title || ('第' + index + '章')),
        characters: String(raw.characters || ''), events: String(raw.events || raw.text || ''),
        stateChanges: String(raw.stateChanges || ''), hookActivity: String(raw.hookActivity || ''),
        mood: String(raw.mood || ''), chapterType: String(raw.chapterType || ''),
      };
    }
    function escapeTableCell(s) { return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim(); }
    function renderHooksProjection(hooks, currentChapter) {
      if (!Array.isArray(hooks) || hooks.length === 0) return '# 伏笔池\n\n（暂无伏笔）\n';
      var lines = ['# 伏笔池', '', '| hook_id | 起始章 | 名称 | 状态 | 最近推进 | 预期回收 | 回收节奏 | 上游依赖 | 核心 | 备注 |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
      var diags = null;
      if (currentChapter !== undefined) { try { diags = computeHookDiagnostics(hooks, currentChapter); } catch (e) {} }
      var sorted = hooks.slice().sort(function (a, b) { return (a.startChapter || 0) - (b.startChapter || 0); });
      for (var i = 0; i < sorted.length; i++) {
        var hook = sorted[i];
        var statusCell = hook.status || 'open';
        if (diags) { var d = diags.get(hook.hookId); if (d) { var marker = renderHookDiagnosticMarker(d); if (marker) statusCell = statusCell + ' (' + marker + ')'; } }
        lines.push('| ' + [hook.hookId || '', hook.startChapter || 0, hook.name || '', statusCell, hook.lastAdvancedChapter || 0, hook.expectedPayoff || '', hook.payoffTiming || '', (hook.dependsOn && hook.dependsOn.length > 0) ? '[' + hook.dependsOn.join(', ') + ']' : '无', hook.coreHook ? '是' : '否', hook.notes || ''].map(escapeTableCell).join(' | ') + ' |');
      }
      return lines.join('\n') + '\n';
    }
    function renderCurrentStateProjection(currentState) {
      var labels = { currentLocation: '当前位置', protagonistState: '主角状态', currentGoal: '当前目标', currentConstraint: '当前限制', currentAlliances: '当前敌我', currentConflict: '当前冲突' };
      var lines = ['# 当前状态', '', '| 字段 | 值 |', '| --- | --- |'];
      var slots = ['currentLocation', 'protagonistState', 'currentGoal', 'currentConstraint', 'currentAlliances', 'currentConflict'];
      for (var i = 0; i < slots.length; i++) { var f = slots[i]; var val = currentState && currentState[f] ? currentState[f] : '（未设定）'; lines.push('| ' + escapeTableCell(labels[f]) + ' | ' + escapeTableCell(val) + ' |'); }
      if (currentState && Array.isArray(currentState.facts)) { lines.push('', '## 其他事实', ''); for (var j = 0; j < currentState.facts.length; j++) { var fact = currentState.facts[j]; lines.push('- ' + escapeTableCell(fact.subject) + ' ' + escapeTableCell(fact.predicate) + ' ' + escapeTableCell(fact.object) + '（第' + fact.validFromChapter + '章起）'); } }
      return lines.join('\n') + '\n';
    }
    function renderChapterSummariesProjection(summaries) {
      if (!Array.isArray(summaries) || summaries.length === 0) return '# 章节摘要\n\n（暂无章节）\n';
      var lines = ['# 章节摘要', '', '| 章节 | 标题 | 出场人物 | 关键事件 | 状态变化 | 伏笔动态 | 情绪基调 | 章节类型 |', '| --- | --- | --- | --- | --- | --- | --- | --- |'];
      var sorted = summaries.slice().sort(function (a, b) { return (a.chapter || a.index || 0) - (b.chapter || b.index || 0); });
      for (var i = 0; i < sorted.length; i++) { var s = normalizeChapterSummary(sorted[i], sorted[i].chapter || sorted[i].index || 0); if (!s) continue; lines.push('| ' + [s.chapter, s.title, s.characters, s.events, s.stateChanges, s.hookActivity, s.mood, s.chapterType].map(escapeTableCell).join(' | ') + ' |'); }
      return lines.join('\n') + '\n';
    }
    // ============ 内联自 src/control-docs.js ============
    var GENERIC_RULES = ['每章有明确推进（事件/关系/信息/伏笔之一），不原地踏步', '主角有主动行为，不被剧情推着走', '对话承担信息量，不空转寒暄', '场景有感官细节（视觉/听觉/触觉至少一种），不纯叙述', '结尾留钩子（危机/悬念/反转/挑衅/留白），章章有"下一页"驱动力', '视角稳定（不频繁切换 POV），切换时有明显标记', '时间线清晰，不跳跃混乱', '因果关系可追溯（前因后果），不无理由突变', '角色行为符合已建立的人设，不崩坏', '伏笔有回收（open→resolved），不挖坑不填', '情绪有起伏（不要全章平淡），张力曲线', '信息量控制（一章不超过2个重大信息），不信息轰炸', '不道德说教，用事件展现而非角色口述', '不旁白解释角色心理，用行为/表情/对话暗示', '不剧透未来（上帝视角剧透降低悬念）', '节奏快慢交替（紧张章后给缓冲章），不全程高压', '世界观通过使用展开（不百科式设定堆砌）', '配角有辨识度（不是路人A/B/C）', '冲突有多层（外部冲突 + 内心冲突）', '章节标题/编号与内容匹配', '地名/人名/术语前后一致（不中途改名）', '不复制粘贴前文内容（不水字数）', '战斗/冲突有代价（不无伤通关）', '重要决策有铺垫（不突然觉醒）', '章末不总结升华（不"这就是成长的代价"式抒情）'];
    var GENRE_RULES = {
      '玄幻': ['力量体系有规则（等级/突破条件明确），不随意变强', '金手指有限制（代价/冷却/条件），不无脑无敌', '战斗展示智谋（利用环境/弱点/策略），不纯拼数值', '宗门/势力有利益逻辑（不为反派而反派）', '修炼/升级有过程感（不一章跳十级）'],
      '都市': ['职业细节真实（行业术语/流程准确），不悬浮', '社会关系有阶层逻辑（不全员富豪/全员底层）', '冲突来源接地气（职场/家庭/金钱/感情），不超自然', '城市地标/生活细节真实（地铁/外卖/房租），增强代入'],
      '悬疑': ['线索提前埋设（公平解谜），不天降证据', '凶手/真相有铺垫（不最后一章才出现的新角色）', '误导有逻辑（红鲱鱼指向真实线索的反面），不纯巧合', '推理过程可复现（读者能跟得上），不跳步', '危机感持续（每章至少一个疑点），不断档'],
      '言情': ['感情有渐进（不一夜相爱），有合理的吸引力建立过程', '误会不过夜（不靠强行误会拖延剧情）', '情敌/阻力有存在逻辑（不是工具人）', '亲密戏有情感铺垫（不突兀），服务角色发展', '甜蜜与虐心交替（不全程甜/全程虐）'],
      '科幻': ['科技设定自洽（规则明确后不违反），有硬约束', '科技对社会有影响（不套皮古代），体现科幻内核', '问题用设定内逻辑解决（不万能科技），有限制', '想象基于现有科学延伸（不纯魔幻），有合理性'],
      '历史': ['史实考据准确（服饰/制度/称谓），不穿越式现代用语', '历史大势与虚构交织（不脱离时代背景）', '人物动机符合时代价值观（不现代人穿古装）', '权谋有博弈逻辑（不降智反派），有来有回'],
    };
    function getRulesForGenre(genre) { var generic = GENERIC_RULES.slice(); var specific = (GENRE_RULES[genre] || []).slice(); return { generic: generic, specific: specific, all: generic.concat(specific) }; }
    // 题材默认章字数（用户调研：男频3000-4000，女频~3000，短篇2000-2500）
    const GENRE_CHAPTER_WORDS = { '玄幻': 3200, '都市': 3200, '科幻': 3200, '历史': 3200, '言情': 3000, '悬疑': 3000, '短篇': 2200 };
    const DEFAULT_CHAPTER_WORDS = 3000;
    function chapterWordsForGenre(genre) { return GENRE_CHAPTER_WORDS[genre] || DEFAULT_CHAPTER_WORDS; }
    function buildWordRange(target) {
      const soft = Math.max(1, Math.floor(target * 300 / 2200));
      const hard = Math.max(1, Math.floor(target * 600 / 2200));
      return { target: target, softMin: target - soft, softMax: target + soft, hardMin: target - hard, hardMax: target + hard };
    }
    function renderAuthorIntent(book) { if (!book) return '# 创作意图\n\n（未设定）\n'; var lines = ['# 创作意图', '']; if (book.title) lines.push('## 书名', '', book.title, ''); if (book.genre) lines.push('## 题材', '', book.genre, ''); if (book.brief) lines.push('## 简报', '', book.brief, ''); if (book.targetChapters) lines.push('## 目标篇幅', '', '约 ' + book.targetChapters + ' 章，每章约 ' + (book.chapterWords || chapterWordsForGenre(book.genre)) + ' 字', ''); var rules = getRulesForGenre(book.genre); if (rules.specific.length > 0) { lines.push('## 题材专属规则', ''); for (var i = 0; i < rules.specific.length; i++) lines.push('- ' + rules.specific[i]); lines.push(''); } return lines.join('\n') + '\n'; }
    function renderCurrentFocus(state, currentChapter) { if (!state) return '# 近期关注\n\n（无状态）\n'; var lines = ['# 近期关注', '', '## 当前进度', '', '第 ' + currentChapter + ' 章 / 目标 ' + ((state.book && state.book.targetChapters) || '?') + ' 章', '']; var hooks = state.hooks || []; if (hooks.length > 0) { var openCount = 0, progressingCount = 0, resolvedCount = 0; var staleHooks = [], blockedHooks = []; for (var i = 0; i < hooks.length; i++) { if (hooks[i].status === 'open') openCount++; else if (hooks[i].status === 'progressing') progressingCount++; else if (hooks[i].status === 'resolved') resolvedCount++; } lines.push('## 伏笔状态', '', '- 已埋下未推进：' + openCount, '- 推进中：' + progressingCount, '- 已回收：' + resolvedCount, ''); try { var diags = computeHookDiagnostics(hooks, currentChapter); for (var j = 0; j < hooks.length; j++) { var d = diags.get(hooks[j].hookId); if (!d) continue; if (d.stale) staleHooks.push(hooks[j].name + '（第' + hooks[j].startChapter + '章埋下，距' + d.distance + '章/半衰' + d.halfLife + '）'); if (d.blocked) blockedHooks.push(hooks[j].name + '（受阻于：' + d.missingUpstream.join(', ') + '）'); } if (staleHooks.length > 0) { lines.push('## ⚠️ 过期伏笔（需尽快回收或推进）', ''); for (var k = 0; k < staleHooks.length; k++) lines.push('- ' + staleHooks[k]); lines.push(''); } if (blockedHooks.length > 0) { lines.push('## ⚠️ 受阻伏笔（上游未回收）', ''); for (var m = 0; m < blockedHooks.length; m++) lines.push('- ' + blockedHooks[m]); lines.push(''); } } catch (e) {} } var cs = state.currentState || {}; var facts = [['当前位置', cs.currentLocation], ['主角状态', cs.protagonistState], ['当前目标', cs.currentGoal], ['当前冲突', cs.currentConflict]].filter(function (f) { return f[1]; }); if (facts.length > 0) { lines.push('## 当前状态', ''); for (var n = 0; n < facts.length; n++) lines.push('- **' + facts[n][0] + '**：' + facts[n][1]); lines.push(''); } var recent = (state.summaries || []).slice(-3); if (recent.length > 0) { lines.push('## 最近章节', ''); for (var p = 0; p < recent.length; p++) { var s = recent[p]; var ch = s.chapter || s.index || '?'; var text = s.events || s.text || ''; lines.push('- 第' + ch + '章：' + text); } lines.push(''); } return lines.join('\n') + '\n'; }
    function renderBookRules(genre) { var rules = getRulesForGenre(genre); var lines = ['# 书级创作规则', '', '> 此文件可手动编辑。写章时作为写作约束注入。', '', '## 通用规则（' + rules.generic.length + ' 条）', '']; for (var i = 0; i < rules.generic.length; i++) lines.push((i + 1) + '. ' + rules.generic[i]); lines.push(''); if (rules.specific.length > 0) { lines.push('## ' + (genre || '') + '题材专属规则（' + rules.specific.length + ' 条）', ''); for (var j = 0; j < rules.specific.length; j++) lines.push((j + 1) + '. ' + rules.specific[j]); lines.push(''); } return lines.join('\n') + '\n'; }
    // ============ 内联自 src/multi-role-pipeline.js ============
    function composeContext(state, index, intent, genreRules) {
      var summaries = state.summaries || [];
      var recentCount = Math.min(5, summaries.length);
      var recentSummaries = summaries.slice(-recentCount).map(function (s) { var chapter = s.chapter || s.index || '?'; var text = s.events || s.text || ''; return { chapter: chapter, text: text }; });
      var cs = state.currentState || {};
      var currentStateFacts = {};
      if (cs.currentLocation) currentStateFacts.currentLocation = cs.currentLocation;
      if (cs.protagonistState) currentStateFacts.protagonistState = cs.protagonistState;
      if (cs.currentGoal) currentStateFacts.currentGoal = cs.currentGoal;
      if (cs.currentConstraint) currentStateFacts.currentConstraint = cs.currentConstraint;
      if (cs.currentAlliances) currentStateFacts.currentAlliances = cs.currentAlliances;
      if (cs.currentConflict) currentStateFacts.currentConflict = cs.currentConflict;
      var allHooks = state.hooks || [];
      var activeHooks = allHooks.filter(function (h) { return h.status === 'open' || h.status === 'progressing'; }).map(function (h) { return { name: h.name, status: h.status, expectedPayoff: h.expectedPayoff || h.notes || '' }; });
      var staleWarnings = [];
      if (allHooks.length > 0 && index > 0) { try { var diags = computeHookDiagnostics(allHooks, index); for (var i = 0; i < allHooks.length; i++) { var d = diags.get(allHooks[i].hookId); if (d && d.stale) staleWarnings.push({ name: allHooks[i].name, startChapter: allHooks[i].startChapter, distance: d.distance, halfLife: d.halfLife, message: '「' + allHooks[i].name + '」已过期（第' + allHooks[i].startChapter + '章埋下，距' + d.distance + '章/半衰' + d.halfLife + '），本章应推进或回收' }); } } catch (e) {} }
      var characters = (state.characters || []).map(function (c) { return { name: c.name, role: c.role || '', desc: c.desc || '' }; });
      return { index: index, intent: intent || '', recentSummaries: recentSummaries, currentState: currentStateFacts, activeHooks: activeHooks, staleWarnings: staleWarnings, characters: characters, genreRules: genreRules || { generic: [], specific: [] } };
    }
    function auditContinuity(body, state, observerResult, index) {
      var errors = []; var warnings = [];
      var knownChars = (state.characters || []).map(function (c) { return c.name; });
      if (observerResult && Array.isArray(observerResult.characters)) { for (var i = 0; i < observerResult.characters.length; i++) { var nc = observerResult.characters[i]; if (nc.name && knownChars.length > 0 && knownChars.indexOf(nc.name) === -1) warnings.push({ type: 'new-character', message: '新角色「' + nc.name + '」首次出现', name: nc.name }); } }
      var stateHooks = state.hooks || []; var hookMap = {};
      for (var j = 0; j < stateHooks.length; j++) hookMap[stateHooks[j].name] = stateHooks[j];
      if (observerResult && Array.isArray(observerResult.hooks)) { for (var k = 0; k < observerResult.hooks.length; k++) { var oh = observerResult.hooks[k]; if (oh.status === 'resolved' && hookMap[oh.name]) { var existing = hookMap[oh.name]; if (existing.status !== 'resolved') warnings.push({ type: 'hook-resolution', message: '伏笔「' + oh.name + '」被标记回收（state 状态为 ' + existing.status + '）', name: oh.name }); } } }
      var summaries = state.summaries || [];
      if (summaries.length > 0) { var lastSummary = summaries[summaries.length - 1]; var lastText = lastSummary.events || lastSummary.text || ''; var tail = lastText.slice(-30); if (tail.length > 5) { for (var m = 0; m < knownChars.length; m++) { if (tail.indexOf(knownChars[m]) >= 0 && body.indexOf(knownChars[m]) === -1) warnings.push({ type: 'character-drop', message: '上一章结尾出现的角色「' + knownChars[m] + '」在本章未提及', name: knownChars[m] }); } } }
      var cs = state.currentState || {}; var obsCS = observerResult && observerResult.currentState ? observerResult.currentState : {};
      if (cs.currentLocation && obsCS.currentLocation && cs.currentLocation !== obsCS.currentLocation) warnings.push({ type: 'location-change', message: '位置变化：「' + cs.currentLocation + '」→「' + obsCS.currentLocation + '」' });
      return { errors: errors, warnings: warnings, ok: errors.length === 0 };
    }

    const llm = ctx.llm;
    const fs = ctx.fs;
    const sandbox = ctx.get('sandboxPolicy');
    const fallbackRoot = sandbox ? sandbox.workspaceRoot : '.';
    let lastBase = null;
    let lastPolicy = null;

    function baseFor(exec) {
      const session = (exec && exec.agent) ? exec.agent.session : undefined;
      const b = session ? session.header.cwd : fallbackRoot;
      lastBase = b;
      if (sandbox) lastPolicy = sandbox.resolve(session ? { session: session } : {});
      return b;
    }

    async function callModel(prompt, systemText, signal) {
      const modelSvc = ctx.get('agentDefaultModel');
      const sel = modelSvc ? modelSvc.currentSelection() : undefined;
      if (!sel || !sel.provider || !sel.model) throw new Error('未配置默认模型（agentDefaultModel 为空）');
      const messages = [{
        id: 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
        role: 'user',
        content: [{ type: 'text', text: prompt }],
        source: { kind: 'user' },
      }];
      const stream = llm.stream({ provider: sel.provider, model: sel.model, messages: messages, system: systemText });
      let out = '';
      for await (const chunk of stream) {
        if (signal && signal.aborted) throw new Error('写作已被用户中止');
        if (chunk && chunk.type === 'text-delta') out += chunk.text;
      }
      return out.trim();
    }

    async function readState(bookId, base) {
      if (!isValidBookId(bookId)) throw new Error('unsafe bookId');
      const t = await fs.resolve('novels/' + bookId + '/story/state/state.json', { cwd: base });
      const info = await fs.stat(t);
      if (info === undefined) return null;
      let raw;
      try { raw = await fs.readText(t); } catch (e) { throw new Error('读取状态失败：' + e.message); }
      try { return JSON.parse(raw); } catch (e) { throw new Error('状态文件损坏（非合法 JSON），请修复 novels/' + bookId + '/story/state/state.json'); }
    }

    async function writeState(bookId, state, base) {
      if (!isValidBookId(bookId)) throw new Error('unsafe bookId');
      const v = validateState(state);
      if (!v.ok) throw new Error('状态非法，拒绝写入：' + v.errors.join('; '));
      const t = await fs.resolve('novels/' + bookId + '/story/state/state.json', { cwd: base });
      await fs.writeText(t, JSON.stringify(state, null, 2), undefined, undefined, lastPolicy);
    }

    async function writeChapter(bookId, index, body, base) {
      if (!isValidBookId(bookId)) throw new Error('unsafe bookId');
      const n = String(index).padStart(3, '0');
      const t = await fs.resolve('novels/' + bookId + '/chapters/' + n + '.md', { cwd: base });
      await fs.writeText(t, body, undefined, undefined, lastPolicy);
      return 'novels/' + bookId + '/chapters/' + n + '.md';
    }

    harness.registerTool(ctx, harness.defineTool({
      name: 'novel_create_book',
      description: 'Create a new novel book. Generates a safe bookId and initializes story state files on disk.',
      parameters: { title: { type: 'string', required: true }, genre: { type: 'string' }, brief: { type: 'string' } },
      output: { schema: { type: 'string' }, render: function (_a, v) { return [{ type: 'text', text: v }]; } },
      execute: async function (args, exec) {
        const base = baseFor(exec);
        const title = String(args.title || '').trim();
        if (!title) throw new Error('title 不能为空');
        if (title.length > 50) throw new Error('title 过长（≤50 字）');
        const bookId = makeBookId(title);
        const existing = await readState(bookId, base);
        if (existing) return '书已存在：' + bookId + '（不覆盖）';
        // 有创作简报时生成章回大纲
        let outline = [];
        if (args.brief) {
          try {
            const op = '你是小说架构师。根据创作简报生成章回大纲：每行「第N章：标题 —— 一句话摘要」，共 8-12 章。只输出大纲，不要解释。\n\n创作简报：\n' + args.brief;
            const ot = await callModel(op, '你是小说架构师。');
            if (ot) {
              outline = ot.split('\n').map(function (line) {
                const m = line.match(/第\s*(\d+)\s*章\s*[：:]\s*(.+)/);
                if (m) return { index: parseInt(m[1], 10) || 0, title: (m[2] || '').trim() };
                const t = line.trim();
                return t ? { index: 0, title: t } : null;
              }).filter(function (o) { return o && o.title; });
            }
          } catch (e) {
            outline = [];
          }
        }
        const state = {
          book: { bookId: bookId, title: title, genre: args.genre || '', brief: args.brief || '', targetChapters: 50, chapterWords: chapterWordsForGenre(args.genre || ''), nextChapterIndex: 1 },
          chapters: [], summaries: [], hooks: [], characters: [], outline: outline,
        };
        await writeState(bookId, state, base);
        // 生成控制面文档
        try {
          const storyDir = 'novels/' + bookId + '/story/';
          const aiMd = await fs.resolve(storyDir + 'author_intent.md', { cwd: base });
          await fs.writeText(aiMd, renderAuthorIntent(state.book), undefined, undefined, lastPolicy);
          const cfMd = await fs.resolve(storyDir + 'current_focus.md', { cwd: base });
          await fs.writeText(cfMd, renderCurrentFocus(state, 0), undefined, undefined, lastPolicy);
          const brMd = await fs.resolve(storyDir + 'book_rules.md', { cwd: base });
          await fs.writeText(brMd, renderBookRules(args.genre || ''), undefined, undefined, lastPolicy);
        } catch (e) { /* 控制文档失败不阻塞 */ }
        return '已创建书《' + title + '》bookId=' + bookId + '，状态写入 novels/' + bookId + '/story/state/state.json' + (outline.length ? '（已生成 ' + outline.length + ' 章大纲）' : '') + '（已生成控制面文档）';
      },
    }));

    harness.registerTool(ctx, harness.defineTool({
      name: 'novel_write_chapter',
      description: 'Write the next chapter of a book: plan → compose → write → anti-AI audit → revise (max 1) → settle. Enforces anti-AI-flavor rules and persists chapter + state.',
      parameters: { bookId: { type: 'string', required: true }, words: { type: 'number' }, context: { type: 'string' } },
      output: { schema: { type: 'string' }, render: function (_a, v) { return [{ type: 'text', text: v }]; } },
      presentCall: function (a) {
        return {
          card: 'generic',
          title: '写《' + (a && a.bookId ? a.bookId : '') + '》下一章',
          kind: 'other',
          content: [{ type: 'text', text: '流水线串行执行：总编备忘录 → 写手正文（约' + ((a && a.words) || '默认') + '字）→ 反AI检测 → 必要时外科修订 → 状态结算。共 2-3 次模型调用，预计 2-6 分钟，期间无中间输出属正常，请勿重复点击。' }],
        };
      },
      execute: async function (args, exec) {
        const base = baseFor(exec);
        if (!isValidBookId(args.bookId)) throw new Error('unsafe bookId');
        const state = await readState(args.bookId, base);
        if (!state) return '书 ' + args.bookId + ' 不存在，请先 novel_create_book';
        const index = state.book.nextChapterIndex;

        // === Phase 1: Planner — LLM 产结构化备忘录（学 inkos planner） ===
        const genreRules = getRulesForGenre(state.book.genre || '');
        const ctx2 = composeContext(state, index, args.context || '', genreRules);

        // 构建 Planner 输入：当前状态 + 前文摘要 + 活跃伏笔 + 大纲
        let plannerInput = '## 书名\n' + state.book.title + '\n';
        if (state.book.brief) plannerInput += '## 创作简报\n' + state.book.brief + '\n';
        if (state.outline && state.outline.length > 0) {
          const thisOutline = state.outline.find(function(o) { return o.index === index; });
          const nextOutline = state.outline.find(function(o) { return o.index === index + 1; });
          if (thisOutline) plannerInput += '## 本章大纲指引\n' + thisOutline.title + '\n';
          if (nextOutline) plannerInput += '## 下一章大纲\n' + nextOutline.title + '\n（规划时要为下一章留口子）\n';
        }
        if (Object.keys(ctx2.currentState).length > 0) {
          plannerInput += '## 当前状态\n';
          for (const k of Object.keys(ctx2.currentState)) {
            plannerInput += '- ' + k + '：' + ctx2.currentState[k] + '\n';
          }
        }
        if (ctx2.recentSummaries.length > 0) {
          plannerInput += '## 前文摘要\n';
          for (const s of ctx2.recentSummaries) plannerInput += '第' + s.chapter + '章：' + s.text + '\n';
        }
        if (ctx2.activeHooks.length > 0) {
          plannerInput += '## 活跃伏笔\n';
          for (const h of ctx2.activeHooks) {
            plannerInput += '- 「' + h.name + '」（' + h.status + '）' + (h.expectedPayoff ? ' → ' + h.expectedPayoff : '') + '\n';
          }
        }
        if (ctx2.staleWarnings.length > 0) {
          plannerInput += '## 过期伏笔（本章必须处理）\n';
          for (const w of ctx2.staleWarnings) plannerInput += '- ' + w.message + '\n';
        }
        if (ctx2.characters.length > 0) {
          plannerInput += '## 已知角色\n';
          for (const c of ctx2.characters) plannerInput += '- ' + c.name + (c.role ? '(' + c.role + ')' : '') + (c.desc ? '：' + c.desc : '') + '\n';
        }
        if (args.context) plannerInput += '## 用户本章指令\n' + args.context + '\n';

        const plannerSystemPrompt = '你是这本小说的创作总编。你的职责是为下一章产出一份备忘录（memo）。你不写正文——你只规划这章要完成什么、兑现什么、不要做什么。下游写手会按你的备忘录扩写正文。\n\n'
          + '工作原则（内化，不要在备忘录里引用条目号）：\n'
          + '1. 每3-5章一个小目标周期：必须有小目标达成或悬念升级，主线持续推进\n'
          + '2. 主动塑造读者期待：制造"还没兑现但快要兑现"的缺口\n'
          + '3. 万物皆饵：日常/过渡段的每一笔都是未来剧情的伏笔\n'
          + '4. 人设防崩：角色行为由"过往经历+当前利益+性格底色"共同驱动\n'
          + '5. 1主线+1支线：支线为主线服务\n'
          + '6. 五感具体化：场景必须有可视化感官细节\n'
          + '7. 钩子承接：每章章尾留钩\n'
          + '8. 钩子账本必须结账：每章对活跃伏笔做明确动作\n\n'
          + '## 输出格式（严格遵守）\n\n'
          + '输出普通 Markdown，不要 YAML、JSON 或代码块。\n\n'
          + '结构：\n\n'
          + '# 第N章备忘录\n\n'
          + '## 本章目标\n（≤50字，一句话，具体可执行）\n\n'
          + '## 当前任务\n（一句话：主角本章要完成的具体动作，不要抽象描述）\n\n'
          + '## 读者此刻在等什么\n（两行：1) 读者现在期待什么 2) 本章对此做什么——制造更强缺口/部分兑现/完全兑现/暂不兑现但给暗示）\n\n'
          + '## 场景规划\n（3-5个场景，每个场景写：标题 + 叙事目标 + 字数预算 + 情绪基调 + 节奏快慢 + 时间标记 + 感官焦点 + 与前场景如何衔接。加起来约' + (args.words || state.book.chapterWords) + '字）\n\n'
          + '## 该兑现的 / 暂不掀的\n（列出本章该推进或回收的伏笔，以及暂不碰的）\n\n'
          + '## 章尾必须发生的改变\n（1-3条，从以下维度选：信息改变/关系改变/物理改变/权力改变）\n\n'
          + '## 本章伏笔动作\n（对每个活跃伏笔声明动作：推进/回收/暂不碰）\n\n'
          + '## 章尾钩子设计\n（钩子类型十三选一：突然揭示/紧急危机/未完成动作/身份反转/两难选择/神秘物品/时间限制/承诺威胁/离奇消失/言外之意/意象钩子/回声钩子/留白钩子。上章已用的类型本章禁用——必须换型）\n\n'
          + '## 不要做\n（2-4条硬约束）\n\n'
          + '## 风格强调\n（本章文风要注意什么）\n\n'
          + '重要规则：\n'
          + '- 不要在备忘录里引用方法论术语——直接用这本书的人物、地点、事件说事\n'
          + '- 不要产生正文片段或对话片段\n'
          + '- 时间线必须一致，标注每个场景发生的时间\n'
          + '- 单章结构预算：开场10%直进事件 / 发展60%冲突升级+至少一次转折 / 高潮20% / 结尾10%留钩\n'
          + '- 开头前300字必须有物理事件（炸/断/打/冲/倒/烧/砸/撞/裂/摔/扑/撕/砍/劈/追/逃/杀/血/叫/喊/哭/骂），禁止写景开头、天气开头、日常流程开头、回顾上章开头；前500字内应有对话\n'
          + '- 情绪债务节奏：每2-3章一个小爽点；担忧型悬念5章内必须回收，委屈型10章内缓解，期待型不超过30章\n'
          + '- 水章自检（满足任意3条即重新规划）：人物状态无变化/无新信息揭露/无冲突张力/主要内容是回忆说明/章末无前向驱动\n'
          + '- 第1-3章是黄金开篇：第1章主角出场800字内必须触发主线冲突（追杀/死局/被夺权/穿越即危机级别），前300字（手机第一屏）的最后一句必须是戏剧性或反差收尾；场景≤2个，有名有姓名参与冲突的人物≤2个；世界观通过主角行动带出，禁止整段背景铺垫\n';

        let memo = '';
        try {
          memo = await callModel(plannerInput, plannerSystemPrompt, exec.signal);
        } catch (e) { memo = ''; }
        if (!memo || memo.length < 50) memo = '# 第' + index + '章备忘录\n\n## 本章目标\n' + (args.context || '推进剧情') + '\n\n## 当前任务\n（按大纲推进）\n';

        // 保存备忘录
        {
          const memoPath = await fs.resolve('novels/' + args.bookId + '/story/runtime/chapter-' + String(index).padStart(3, '0') + '.memo.md', { cwd: base });
          await fs.writeText(memoPath, memo, undefined, undefined, lastPolicy);
          const intentPath = await fs.resolve('novels/' + args.bookId + '/story/runtime/chapter-' + String(index).padStart(3, '0') + '.intent.md', { cwd: base });
          await fs.writeText(intentPath, memo, undefined, undefined, lastPolicy);
        }

        // === Phase 2: Writer — 分层系统提示词（照 inkos writer-prompts 移植） ===
        const targetWords = args.words || state.book.chapterWords;
        const genreName = state.book.genre || '玄幻';
        const genreRuleText = genreRules.specific.length > 0 ? '\n题材规则（' + genreName + '）：\n' + genreRules.specific.map(function (r, i) { return (i + 1) + '. ' + r; }).join('\n') : '';

        // 文风指纹（可选）：story/style_fingerprint.md 存在则注入
        let styleFingerprint = '';
        try {
          const sfTarget = await fs.resolve('novels/' + args.bookId + '/story/style_fingerprint.md', { cwd: base });
          const sfInfo = await fs.stat(sfTarget);
          if (sfInfo !== undefined) styleFingerprint = (await fs.readText(sfTarget)).trim();
        } catch (e) { /* 无指纹则跳过 */ }

        const writerSystemPrompt = '你是专业的' + genreName + '网络小说作家。\n\n'
          + '## 写作铁律\n\n'
          + '- **情绪**：用动作外化，不写"他感到愤怒"，写"他捏碎了茶杯，滚烫的茶水流过指缝"\n'
          + '- **盐溶于汤**：价值观通过行为传达，不喊口号\n'
          + '- **配角**：有自己的算盘和反击，主角压服聪明人不是碾压傻子\n'
          + '- **五感**：潮湿的短袖黏在后背上、医院消毒水的味、雨天公交站的积水\n'
          + '- **具体化**：不写"大城市"，写"三环堵了四十分钟的出租车后座"\n'
          + '- **句式**：少用"虽然但是/然而/因此/了"，用角色内心吐槽替代转折词\n'
          + '- **人设三问**：为什么这么做？符合人设吗？读者会觉得突兀吗？\n'
          + '- **对话**：不同角色说话方式不同——用词习惯、句子长短、口头禅、方言痕迹\n'
          + '- **禁止**：资料卡式介绍角色 / 一次引入超3个新角色 / 众人齐声惊呼\n'
          + '- **升级**：坏事叠坏事，每层比上一层过分\n'
          + '- **信息边界**：角色此刻知道什么？不知道什么？对局势有什么误判？角色只能基于已掌握的信息行动\n\n'
          + '## 文笔执行（跨题材通病纠正）\n\n'
          + '**句构节奏（硬规则）。** 叙述句以 15-30 字的长句为主干——动作、观察、环境用带从句和逗号呼吸的长句写。短句（≤10字）只用于重击节拍（挥斧、断喝、破门），连续短句最多两三句，全章短句占比不超过三成。段落以 2-5 句为主，单句成段一章最多三五次。明喻（像/如同/仿佛）全章至多两三处，宁可写白描长句也不堆意象。\n\n'
          + '**明喻节制。** 不要把"像/仿佛/如同/像……一样"当默认修辞反复用。每个场景明喻最多 1 处，且只在它真能点亮画面、比直写更准时才用。优先级永远是：精确的动词 > 具体的动作或感官细节 > 直接描写 > 明喻。想写"像……"之前，先问一句：换成一个准确的动词或一个具体动作，是不是更狠。\n\n'
          + '**高潮必须演出、不许概述。** 本章的高密度／高风险节拍——冲突爆发、生死、重大转折、真相揭露、动作高潮——必须一拍一拍现场演出（动作、对话、五感、停顿、节奏），绝不能用一两句"然后他救了人、警察来了、对手被捕"带过。字数不够就少塞事件，而不是把高潮写成梗概。\n\n'
          + '## 创作宪法\n\n'
          + '这十四条原则是你写作的脊梁。内化它们——绝不引用、绝不列表、绝不在正文里复述。它们的用途是帮你在"两个都说得通的下一句"之间做出选择。\n\n'
          + 'Show don\'t tell，用细节堆出真实，禁止用一行直白陈述替代情绪。价值观要像盐溶于汤——角色的信念靠"没人看时他在做什么"来证明，不靠口号。任何角色的任何行动都必须同时立于三条腿上：过往经历、当前利益、性格底色；缺一条就成了作者强行安排。每个配角都有自己的账本和利益诉求，他们在遇到主角之前就存在、在离开主角之后继续过日子，不是工具人。节奏即呼吸——慢火才能炖出高汤，日常当饵用，不是填充。每章结尾必须有小悬念或情绪缺口，把读者钉在下一章。全员智商在线——禁止降智、圣母心、无铺垫的妥协。时间线与时代常识不能错。日常场景的七成必须在后面成为主线伏笔。任何关系的改变都要事件驱动——没有一夜称兄道弟、没有莫名其妙的深情。人设前后一致，成长有过程。重要剧情和伏笔用场景，不用总结。拒绝流水账——每一行字要么推动剧情，要么塑造人物。\n\n'
          + '## 代入感六支柱\n\n'
          + '读者代入感靠六根支柱支撑。每一个场景的前几页都要把六根柱子立起来——静默地立，不要点名、不要报告。\n\n'
          + '基础信息标签化：一百字内让读者知道谁在场、在哪儿、发生什么。可视化熟悉感：给出读者亲身碰过的地面级具体细节，场景在第二段之前就要加载完。共鸣分两层：认知共鸣（"这种情况下我也会这么选"）+ 情绪共鸣（亲情、被欺压时的愤怒、不公、隐忍的骄傲）。欲望两条腿走路：基础欲望 + 本章自己挖的期待感——一个读者会带到下一章的情绪缺口。五感钩子：每个场景除视觉外放 1-2 种感官细节，顺手带过，绝不写成大段天气描写。人设要"核心标签 + 一个反差细节"才活——冷面杀手偷偷喂流浪猫、和善父亲开的玩笑像刀子。这六根柱子是场景的默认形状，不是章末打勾的清单。\n\n'
          + '## 人味（正面要求——这些是"像人"的特征，做到加分）\n\n'
          + '动作必须裹着判断或情绪——不是镜头在记录，是有人在经历。模糊词是诚实的：大概、也许、我隐约记得、我说不清为什么、我琢磨着、好像、记不真切了——真人就这么说话，放心用。纯事实陈述是稀缺资源，留给"砸判断"的时刻。对话要有损耗：说漏、说错、被打断、说到一半、答非所问——信息传递从来不完整。允许"无用细节"：有人打了个喷嚏、茶凉了没人喝——真实世界有毛边。允许角色偶尔失控、说脏话、讲废话（扯淡/聊吃的）。每3-5章给主角一次固定小动作复现，建立辨识度。\n'
          + (index <= 3
            ? '\n## 黄金三章写作纪律 — 第 ' + index + ' 章\n\n'
              + '这是开篇三章中的第 ' + index + ' 章——你写出的每一句话都直接决定读者是否留下来。黄金三章法则对你不是建议，是对句子的硬约束。\n\n'
              + (index === 1
                ? '第 1 章：主角出场 800 字以内必须触发主线冲突（追杀、死局、被夺权、穿越即危机），禁止长段背景铺垫，世界观要通过主角的行动自然带出，不要整段解释。**第 1 章正文前 300 字（手机屏第一页）的最后一句必须是带戏剧性/反差/反转的收尾**——而不是介绍背景或交代环境。读者第一屏刷到页尾时必须产生"下一句是什么"的拉力。\n\n'
                : index === 2
                  ? '第 2 章：金手指/能力/系统/重生记忆/信息差必须"做出来"——一次具体使用的事件、一个看得见的后果——而不是"说出来"——旁白介绍它存在。第一个小爽点应在本章出现。\n\n'
                  : '第 3 章：本章中段必须让主角下一个可量化的短期目标浮上水面，读者合上页面要能说出"接下来他要干什么"。章尾钩子要足够强，这是读者决定是否继续追读的关键章。\n\n')
              + '贯穿开篇三章的纪律：段落 2-5 句（手机阅读节奏，但段内句子要长短相济），动词压过形容词，每一章结尾必有小钩子——小悬念、未解之问、情绪缺口。**本章场景 ≤ 2 个、有名有姓参与正面冲突的人物 ≤ 2 个（主角 + 1 个触发者或对手；路人甲乙只报身份不给名字，不展开）。** 信息分层植入到动作里：基础信息通过主角行动自然带出；关键设定结合剧情节点揭示；禁止整段 exposition。\n'
            : '')
          + (styleFingerprint
            ? '\n## 文风指纹（模仿目标）\n\n以下是从参考文本中提取的写作风格特征。你的输出必须尽量贴合这些特征：\n\n' + styleFingerprint + '\n'
            : '')
          + '\n## 输出\n\n只输出正文。场景之间用 --- 分隔。不要标题、不要解释、不要任何元评论。';

        // 逐字事实（可选）：story/verbatim.md 存在则注入——道具原文/专有名词不得漂移
        let verbatimFacts = '';
        try {
          const vfTarget = await fs.resolve('novels/' + args.bookId + '/story/verbatim.md', { cwd: base });
          const vfInfo = await fs.stat(vfTarget);
          if (vfInfo !== undefined) verbatimFacts = (await fs.readText(vfTarget)).trim();
        } catch (e) { /* 无则跳过 */ }

        const recentSummariesText = ctx2.recentSummaries.length > 0
          ? ctx2.recentSummaries.map(function (s) { return '第' + s.chapter + '章：' + s.text; }).join('\n')
          : '（无，此为第一章）';

        const writerPrompt = '总编给你一份结构化备忘录，你严格按照备忘录写第 ' + index + ' 章正文，目标约 ' + targetWords + ' 字。\n\n'
          + '## 创作备忘录\n\n' + memo + '\n'
          + (verbatimFacts ? '\n## 逐字事实（引用必须逐字照抄，不得意译改字）\n\n' + verbatimFacts + '\n' : '')
          + '\n## 前文摘要（连续性事实，不得矛盾）\n' + recentSummariesText + '\n'
          + genreRuleText + '\n'
          + '时间线必须与备忘录标注的一致。';

        let body = await callModel(writerPrompt, writerSystemPrompt, exec.signal);
        if (!body) body = await callModel(writerPrompt, writerSystemPrompt, exec.signal); // 单次重试（流式偶发空返回）
        if (!body) throw new Error('模型返回空正文');

        // === 长度治理（学 inkos LengthNormalizer：低于软区间→扩写一轮，仍不足标注 lengthWarning） ===
        const wordRange = buildWordRange(targetWords);
        let lengthWarning = '';
        let actualWords = countWords(body);
        if (actualWords < wordRange.softMin) {
          try {
            const expandPrompt = '以下是已写好的章节正文，目标字数约 ' + targetWords + ' 字（当前 ' + actualWords + ' 字，差约 ' + (targetWords - actualWords) + ' 字）。\n'
              + '扩写要求：\n'
              + '1. 只在既有场景内部加厚——把一句话带过的动作展开成三句，把一笔带过的环境补成可看见的描写\n'
              + '2. 新增叙述以 15-30 字的长句为主，落成动作、声音、物件、身体感觉——不要短句轰炸，不要新意象\n'
              + '3. 不加新事件、不加快节奏、不改既有情节与对话\n'
              + '4. 保留全部既有内容与 --- 分隔符\n\n'
              + '只输出扩写后的完整正文：\n\n' + body;
            const expanded = await callModel(expandPrompt, writerSystemPrompt, exec.signal);
            if (expanded) {
              const ew = countWords(expanded);
              if (ew > actualWords) { body = expanded; actualWords = ew; }
            }
          } catch (e) { /* 扩写失败不阻塞 */ }
          if (actualWords < wordRange.softMin) lengthWarning = '（字数 ' + actualWords + ' < 目标区间 ' + wordRange.softMin + '-' + wordRange.softMax + '）';
        }

        let ai = detectAI(body);
        let revised = false;
        if (ai.hits.length > 0) {
          // 外科手术式修订：只修命中的句子，不整篇重写
          const hitDetails = ai.hits.map(function(h) { return '- ' + h.rule + ': ' + h.detail; }).join('\n');
          const revisePrompt = '以下是已写好的章节正文。检测到以下AI味问题，请只修复这些问题，保留其余文字不变：\n\n问题清单：\n' + hitDetails + '\n\n修复原则：\n- 禁用词：换成自然的说法或删除\n- 排比三连：打破其中一句的结构\n- 段尾抒情：删掉或改成具体动作\n- 对话标签重复：换成动作描写\n- 「不是X是Y」超量：直接写Y，删掉否定前半句\n- 结尾预告腔（他不知道的是/这只是开始）：改成实物收尾\n- 其他问题：最小改动原则\n\n修改时对每处过一遍三问：这能拍出来吗？这是真人会说的话吗？去掉这句影响核心意思吗？——答不上来就重写那一句。\n\n只输出修复后的完整正文（保留 --- 分隔符）：\n\n' + body;
          const rew = await callModel(revisePrompt, '你是小说文字编辑，做最小改动修复AI味问题。', exec.signal);
          if (rew) { body = rew; ai = detectAI(body); revised = true; }
        }

        // 观察者：抽取角色/伏笔 + 生成结构化摘要 + 当前状态补丁（记忆治理）
        let summary = body.slice(0, 200);
        let structuredSummary = null;
        let currentStatePatch = {};
        const newChars = [];
        const newHooks = [];
        let continuityWarnings = [];
        try {
          const observerPrompt = '你是小说观察者。读完下面这章，只输出一个 JSON 对象（不要任何其他文字）：\n'
            + '{"summary":"本章摘要（80字内，事件+结果）",'
            + '"characters":"出场人物（逗号分隔）","events":"关键事件","stateChanges":"状态变化",'
            + '"hookActivity":"伏笔动态","mood":"情绪基调","chapterType":"章节类型",'
            + '"waterChapter":false,"waterReasons":["命中的水章条件，未命中则空数组"],'
            + '"characters_detail":[{"name":"角色名","role":"主角/配角/反派","desc":"一句话定位"}],'
            + '"hooks":[{"name":"伏笔/悬念","status":"open","note":"一句话","payoffTiming":"near-term"}],'
            + '"currentState":{"currentLocation":"当前位置","protagonistState":"主角状态","currentGoal":"当前目标","currentConflict":"当前冲突"}}\n'
            + 'status 取值：open=刚埋下 / progressing=推进中 / resolved=已回收。\n'
            + 'payoffTiming 取值：immediate/near-term/mid-arc/slow-burn/endgame。\n'
            + '水章诊断（waterChapter，命中≥3条为true）：人物状态无变化 / 无新信息揭露 / 无冲突张力 / 主要内容是回忆说明 / 章末无前向驱动 / 读后记不住任何内容。\n\n章节正文：\n' + body;
          const obsText = await callModel(observerPrompt, '你是小说观察者，只输出 JSON。');
          if (obsText) {
            const m = obsText.match(/\{[\s\S]*\}/);
            const obs = m ? JSON.parse(m[0]) : null;
            if (obs) {
              if (typeof obs.summary === 'string' && obs.summary.trim()) summary = obs.summary.trim();
              if (Array.isArray(obs.characters_detail)) for (const c of obs.characters_detail) if (c && c.name) newChars.push({ name: String(c.name), role: String(c.role || ''), desc: String(c.desc || '') });
              else if (Array.isArray(obs.characters)) for (const c of obs.characters) if (c && c.name) newChars.push({ name: String(c.name), role: String(c.role || ''), desc: String(c.desc || '') });
              if (Array.isArray(obs.hooks)) for (const h of obs.hooks) if (h && h.name) newHooks.push({ name: String(h.name), status: (h.status === 'progressing' || h.status === 'resolved' || h.status === 'deferred') ? h.status : 'open', note: String(h.note || ''), expectedPayoff: String(h.expectedPayoff || ''), payoffTiming: h.payoffTiming, dependsOn: h.dependsOn });
              structuredSummary = normalizeChapterSummary({ chapter: index, title: '第' + index + '章', characters: obs.characters || '', events: obs.events || obs.summary || '', stateChanges: obs.stateChanges || '', hookActivity: obs.hookActivity || '', mood: obs.mood || '', chapterType: obs.chapterType || '' }, index);
              if (obs.currentState && typeof obs.currentState === 'object') currentStatePatch = obs.currentState;
              if (obs.waterChapter === true) {
                const wr = Array.isArray(obs.waterReasons) ? obs.waterReasons.join('、') : '满足≥3条水章条件';
                continuityWarnings.push({ type: 'water-chapter', message: '水章诊断：' + wr + '——下一章必须推进主线或回收伏笔' });
              }
            }
          }
        } catch (e) { /* 观察者失败则回退截断摘要 */ }

        const chars = (state.characters || []).slice();
        for (const nc of newChars) { if (!chars.some(function (c) { return c.name === nc.name; })) chars.push(nc); }
        const hooks = mergeHooks(state.hooks || [], newHooks, index);
        const newCurrentState = Object.assign({}, state.currentState || {}, currentStatePatch);

        // === Auditor：连续性审计（角色名/伏笔冲突/角色断裂/位置变化） ===
        try {
          const contResult = auditContinuity(body, state, { characters: newChars, hooks: newHooks, currentState: currentStatePatch }, index);
          continuityWarnings = continuityWarnings.concat(contResult.warnings);
        } catch (e) { /* 审计失败不阻塞 */ }

        // === 三章一轮：跨章签名短语扫描（skill §一：前文≥2次的表达本章禁用） ===
        if (index % 3 === 0) {
          try {
            const prevTexts = [];
            for (let pi = Math.max(1, index - 5); pi < index; pi++) {
              try {
                const pt = await fs.resolve('novels/' + args.bookId + '/chapters/' + String(pi).padStart(3, '0') + '.md', { cwd: base });
                const pinfo = await fs.stat(pt);
                if (pinfo !== undefined) prevTexts.push(await fs.readText(pt));
              } catch (e2) { /* 缺章跳过 */ }
            }
            const xreps = crossChapterRepeats(body, prevTexts, 6);
            for (const xr of xreps) {
              continuityWarnings.push({ type: 'cross-chapter-repeat', message: '签名短语「' + xr.phrase + '」前文已出现 ' + xr.prevCount + ' 次，本章复用——换成新表达' });
            }
          } catch (e) { /* 跨章扫描失败不阻塞 */ }
        }

        const path = await writeChapter(args.bookId, index, body, base);
        const chapter = {
          index: index, title: '第' + index + '章', wordCount: countWords(body), filePath: path,
          aiTasteScore: ai.score, status: ai.hits.length === 0 ? 'approved' : 'revised',
        };
        const next = {
          book: Object.assign({}, state.book, { nextChapterIndex: Math.max(state.book.nextChapterIndex, index + 1) }),
          chapters: state.chapters.concat([chapter]).sort(function (a, b) { return a.index - b.index; }),
          summaries: state.summaries.concat([structuredSummary || { index: index, text: summary }]),
          hooks: hooks,
          characters: chars,
          currentState: newCurrentState,
          outline: state.outline || [],
        };
        await writeState(args.bookId, next, base);
        // 写 Markdown 人类可读投影 + 控制面文档刷新
        try {
          const storyDir = 'novels/' + args.bookId + '/story/';
          const csMd = await fs.resolve(storyDir + 'current_state.md', { cwd: base });
          await fs.writeText(csMd, renderCurrentStateProjection(newCurrentState), undefined, undefined, lastPolicy);
          const phMd = await fs.resolve(storyDir + 'pending_hooks.md', { cwd: base });
          await fs.writeText(phMd, renderHooksProjection(hooks, index), undefined, undefined, lastPolicy);
          const csumMd = await fs.resolve(storyDir + 'chapter_summaries.md', { cwd: base });
          await fs.writeText(csumMd, renderChapterSummariesProjection(next.summaries), undefined, undefined, lastPolicy);
          const cfMd = await fs.resolve(storyDir + 'current_focus.md', { cwd: base });
          await fs.writeText(cfMd, renderCurrentFocus(next, index), undefined, undefined, lastPolicy);
          // 写连续性审计报告（runtime 产物）
          if (continuityWarnings.length > 0) {
            const auditMd = await fs.resolve(storyDir + 'runtime/chapter-' + String(index).padStart(3, '0') + '.audit.md', { cwd: base });
            var auditLines = ['# 第 ' + index + ' 章连续性审计', ''];
            for (const w of continuityWarnings) auditLines.push('- [' + w.type + '] ' + w.message);
            await fs.writeText(auditMd, auditLines.join('\n') + '\n', undefined, undefined, lastPolicy);
          }
        } catch (e) { /* 投影写入失败不阻塞主流程 */ }
        var resultMsg = '第 ' + index + ' 章完成：字数 ' + chapter.wordCount + lengthWarning + '，AI味评分 ' + ai.score + '（' + ai.hits.length + '项命中）' + (revised ? '（已自动修订）' : '');
        if (continuityWarnings.length > 0) resultMsg += '，连续性审计 ' + continuityWarnings.length + ' 项警告';
        resultMsg += '，落盘 ' + path;
        return resultMsg;
      },
    }));

    harness.registerTool(ctx, harness.defineTool({
      name: 'novel_list_chapters',
      description: 'List all chapters of a book with index/title/wordCount/aiTasteScore.',
      parameters: { bookId: { type: 'string', required: true } },
      output: { schema: { type: 'string' }, render: function (_a, v) { return [{ type: 'text', text: v }]; } },
      execute: async function (args, exec) {
        const base = baseFor(exec);
        const state = await readState(args.bookId, base);
        if (!state) return '书不存在';
        return JSON.stringify(state.chapters.map(function (c) { return { index: c.index, title: c.title, wordCount: c.wordCount, score: c.aiTasteScore }; }));
      },
    }));

    harness.registerTool(ctx, harness.defineTool({
      name: 'novel_read_chapter',
      description: 'Read the full text of one chapter.',
      parameters: { bookId: { type: 'string', required: true }, index: { type: 'number', required: true } },
      output: { schema: { type: 'string' }, render: function (_a, v) { return [{ type: 'text', text: v }]; } },
      execute: async function (args, exec) {
        const base = baseFor(exec);
        if (!Number.isInteger(args.index) || args.index < 1) return '章节号非法';
        const n = String(args.index).padStart(3, '0');
        const t = await fs.resolve('novels/' + args.bookId + '/chapters/' + n + '.md', { cwd: base });
        const info = await fs.stat(t);
        if (info === undefined) return '章节不存在';
        return await fs.readText(t);
      },
    }));

    // RPC handler 专用：尝试多种路径策略找到 novels 目录
    let _novelsBase = null;
    async function findNovelsBase() {
      if (_novelsBase) return _novelsBase;
      var candidates = [];
      // 1. agents.currentInitiator() — 当前 session 的 cwd
      try {
        var ag = ctx.get('agents');
        if (ag) {
          var init = ag.currentInitiator();
          if (init && init.session && init.session.header && init.session.header.cwd)
            candidates.push(init.session.header.cwd);
          // 也尝试 list() 中的 agent sessions
          var all = ag.list();
          for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].session && all[i].session.header && all[i].session.header.cwd)
              candidates.push(all[i].session.header.cwd);
          }
        }
      } catch (e) { console.log('[ninglet] agents probe error:', e.message); }
      // 2. lastBase（工具执行时设置）
      if (lastBase) candidates.push(lastBase);
      // 3. sandboxPolicy.workspaceRoot
      if (sandbox && sandbox.workspaceRoot) candidates.push(sandbox.workspaceRoot);
      // 4. sessions.list() 中的 session cwd
      try {
        var ss = ctx.get('sessions');
        if (ss) {
          var sl = ss.list();
          for (var j = 0; j < sl.length; j++) {
            if (sl[j] && sl[j].header && sl[j].header.cwd) candidates.push(sl[j].header.cwd);
          }
        }
      } catch (e) {}
      // 去重
      var seen = {}; var unique = [];
      for (var k = 0; k < candidates.length; k++) {
        if (candidates[k] && !seen[candidates[k]]) { seen[candidates[k]] = true; unique.push(candidates[k]); }
      }
      console.log('[ninglet] novels base candidates:', JSON.stringify(unique));
      // 尝试每个候选路径
      for (var m = 0; m < unique.length; m++) {
        try {
          var dir = await fs.resolve('novels', { cwd: unique[m] });
          var info = await fs.stat(dir);
          if (info !== undefined && info.type === 'directory') {
            console.log('[ninglet] found novels at base:', unique[m]);
            _novelsBase = unique[m];
            return unique[m];
          }
        } catch (e) { console.log('[ninglet] resolve novels at', unique[m], 'failed:', e.message); }
      }
      console.log('[ninglet] WARNING: no novels directory found in any candidate');
      return unique[0] || fallbackRoot || '.';
    }

    async function rpcReadState(bookId) {
      var base = await findNovelsBase();
      return await readState(bookId, base);
    }

    harness.handle('debug_info', async function () {
      var diag = { candidates: [], lastBase: lastBase, fallbackRoot: fallbackRoot, workspaceRoot: sandbox ? sandbox.workspaceRoot : null };
      try {
        var ag = ctx.get('agents');
        if (ag) {
          diag.agentsCurrentInitiator = ag.currentInitiator() ? 'exists' : 'undefined';
          var all = ag.list();
          diag.agentsList = all.length;
          for (var i = 0; i < all.length; i++) {
            if (all[i] && all[i].session && all[i].session.header && all[i].session.header.cwd)
              diag.candidates.push(all[i].session.header.cwd);
          }
        } else { diag.agentsService = 'not available'; }
      } catch (e) { diag.agentsError = e.message; }
      if (lastBase) diag.candidates.push(lastBase);
      if (sandbox && sandbox.workspaceRoot) diag.candidates.push(sandbox.workspaceRoot);
      // 尝试每个候选
      diag.probes = [];
      var seen = {};
      for (var j = 0; j < diag.candidates.length; j++) {
        var c = diag.candidates[j];
        if (!c || seen[c]) continue; seen[c] = true;
        try {
          var dir = await fs.resolve('novels', { cwd: c });
          var info = await fs.stat(dir);
          if (info !== undefined && info.type === 'directory') {
            var entries = await fs.listDir(dir);
            diag.probes.push({ base: c, found: true, entryCount: entries.length, entries: entries.map(function(e) { return e.name + ':' + e.type; }) });
          } else {
            diag.probes.push({ base: c, found: false, statType: info ? info.type : 'absent' });
          }
        } catch (e) { diag.probes.push({ base: c, found: false, error: e.message }); }
      }
      console.log('[ninglet] debug_info:', JSON.stringify(diag));
      return diag;
    });

    harness.handle('list_books', async function () {
      try {
        var base = await findNovelsBase();
        var dir = await fs.resolve('novels', { cwd: base });
        var info = await fs.stat(dir);
        if (info === undefined) return [];
        var entries = await fs.listDir(dir);
        var books = [];
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          if (e.type !== 'directory') continue;
          try {
            var state = await readState(e.name, base);
            if (state && state.book) books.push({ bookId: state.book.bookId, title: state.book.title });
          } catch (er) { console.log('[ninglet] readState failed for', e.name, ':', er.message); }
        }
        console.log('[ninglet] list_books returning', books.length, 'books');
        return books;
      } catch (err) { console.error('[ninglet] list_books error:', err.message); throw err; }
    });
    harness.handle('list_chapters', async function (args) {
      var state = await rpcReadState(args.bookId);
      return state ? state.chapters.map(function (c) { return { index: c.index, title: c.title, wordCount: c.wordCount, score: c.aiTasteScore }; }) : [];
    });
    harness.handle('list_outline', async function (args) {
      var state = await rpcReadState(args.bookId);
      return state && state.outline ? state.outline : [];
    });
    harness.handle('get_structure', async function (args) {
      var state = await rpcReadState(args.bookId);
      if (!state) return { outline: [], chapters: [], characters: [], hooks: [] };
      return {
        outline: state.outline || [],
        chapters: state.chapters.map(function (c) { return { index: c.index, title: c.title, wordCount: c.wordCount, score: c.aiTasteScore }; }),
        characters: state.characters || [],
        hooks: state.hooks || [],
      };
    });
    harness.handle('read_chapter', async function (args) {
      if (!Number.isInteger(args.index) || args.index < 1) return '';
      var base = await findNovelsBase();
      var n = String(args.index).padStart(3, '0');
      var t = await fs.resolve('novels/' + args.bookId + '/chapters/' + n + '.md', { cwd: base });
      var info = await fs.stat(t);
      return info === undefined ? '' : await fs.readText(t);
    });
  },
};
