import { test } from 'node:test';
import assert from 'node:assert';
import {
  scanForbidden, scanTemplateForbidden, scanTransitions, deDensity,
  detectAI, rewriteRules, detectParallelStructure, detectSummaryEndings,
  detectDialogueTags, hedgeDensity, detectFormulaicTransitions, detectListStructure,
  paragraphLengths, flavorBreakdown,
} from '../src/anti-ai-engine.js';
import { DEFAULT_FORBIDDEN } from '../src/anti-ai-engine.js';

test('scanForbidden 命中禁用词', () => {
  const hits = scanForbidden('他心中一凛，不由自主地后退一步。');
  assert.ok(hits.some((h) => h.word === '心中一凛'));
  assert.ok(hits.some((h) => h.word === '不由自主'));
});

test('scanForbidden 无命中返回空', () => {
  assert.deepEqual(scanForbidden('他退了一步，没说话。'), []);
});

test('scanForbidden 禁用词表已扩充到 50+', () => {
  assert.ok(DEFAULT_FORBIDDEN.length >= 50, `禁用词仅 ${DEFAULT_FORBIDDEN.length} 个，预期 ≥50`);
});

test('scanTemplateForbidden 检测模板词', () => {
  const hits = scanTemplateForbidden('他仿佛一座山一般站在那里。宛如幽灵似的消失。');
  assert.ok(hits.some((h) => h.word.includes('仿佛')));
  assert.ok(hits.some((h) => h.word.includes('宛如')));
});

test('scanTransitions 检测AI过渡词', () => {
  const hits = scanTransitions('首先，他站起来。其次，他看向远方。最后，他离开了。');
  assert.ok(hits.some((h) => h.word === '首先'));
  assert.ok(hits.some((h) => h.word === '最后'));
});

test('deDensity 计算"的"字密度', () => {
  const d = deDensity('他的眼神里透着冷的、硬的光。');
  assert.ok(d > 0.04);
});

test('detectParallelStructure 检测排比三连', () => {
  const r = detectParallelStructure('有时候他会笑。有时候他会哭。有时候他会沉默。然后他走了。然后他回来了。');
  assert.ok(r.count >= 1, `排比数 ${r.count}，预期 ≥1`);
});

test('detectParallelStructure 无排比返回 0', () => {
  const r = detectParallelStructure('他笑了。她走了。风吹过。');
  assert.equal(r.count, 0);
});

test('detectSummaryEndings 检测段尾抒情', () => {
  const text = '他独自坐在窗前。\n\n这就是孤独的意义。';
  const hits = detectSummaryEndings(text);
  assert.ok(hits.length >= 1);
});

test('detectDialogueTags 检测重复标签', () => {
  const text = '他淡淡道："走。"他淡淡道："不走。"他淡淡道："随便。"';
  const { repeated } = detectDialogueTags(text);
  assert.ok(repeated.length >= 1, `重复标签数 ${repeated.length}`);
});

test('hedgeDensity 计算套话密度', () => {
  const text = '似乎下雨了。可能要降温。或许明天会好。大概吧。某种程度上说，天气就是这样。';
  const hd = hedgeDensity(text);
  assert.ok(hd > 3, `套话密度 ${hd}，预期 >3`);
});

test('detectFormulaicTransitions 检测公式化转折', () => {
  const text = '然而他没走。然而她来了。然而风暴将至。';
  const r = detectFormulaicTransitions(text);
  assert.ok(r.some((f) => f.word === '然而' && f.count >= 3));
});

test('detectListStructure 检测列表式结构', () => {
  const text = '他想走。他想留。他想哭。他想笑。然后真的笑了。';
  const r = detectListStructure(text);
  assert.ok(r >= 3, `列表式连续 ${r} 句，预期 ≥3`);
});

test('paragraphLengths 分段', () => {
  const text = '第一段内容。\n\n第二段内容。\n\n第三段。';
  assert.equal(paragraphLengths(text).length, 3);
});

test('detectAI 命中越多分越低', () => {
  const bad = detectAI('他心中一凛，不由自主地望了过去，眼中闪过一丝复杂。首先他感到恐惧，其次他感到愤怒，最后他转身离去。');
  const good = detectAI('他退了一步，没说话。');
  assert.ok(bad.score < good.score);
  assert.ok(bad.hits.length > good.hits.length);
});

test('detectAI 分数落在 [0,100]', () => {
  for (const t of ['', '一句话', '他心中一凛不由自主眼中闪过一丝复杂情绪难以言表']) {
    const { score } = detectAI(t);
    assert.ok(score >= 0 && score <= 100);
  }
});

test('detectAI hits 含 severity 字段', () => {
  const { hits } = detectAI('他心中一凛。');
  assert.ok(hits.length > 0);
  assert.equal(hits[0].severity, 3);
});

test('detectAI rules 覆盖阈值', () => {
  const r = detectAI('他的眼神里透着冷的、硬的光。', { deThreshold: 1 });
  assert.ok(!r.hits.some((h) => h.rule === 'de-density'));
});

test('detectAI 检测段落等长维度', () => {
  const text = '他走了一步。\n\n他走了两步。\n\n他走了三步。';
  const r = detectAI(text);
  assert.ok(r.hits.some((h) => h.rule === 'paragraph-uniformity'));
});

test('rewriteRules 包含禁用词表', () => {
  const rules = rewriteRules();
  assert.ok(rules.includes('心中一凛'));
});

test('rewriteRules 含4阶段结构', () => {
  const rules = rewriteRules();
  assert.ok(rules.includes('阶段1'));
  assert.ok(rules.includes('阶段2'));
  assert.ok(rules.includes('阶段3'));
  assert.ok(rules.includes('阶段4'));
  assert.ok(rules.includes('人味注入'));
});

test('rewriteRules 含完整约束', () => {
  const rules = rewriteRules();
  assert.ok(rules.includes('不超过3个') || rules.includes('不超过 3 个'));
  assert.ok(rules.includes('长短交替'));
});

test('flavorBreakdown 返回12维度摘要', () => {
  const fb = flavorBreakdown('他心中一凛，不由自主地后退。首先他害怕了。\n\n这就是孤独的意义。');
  assert.ok(typeof fb.forbidden === 'number');
  assert.ok(typeof fb.deDensity === 'number');
  assert.ok(typeof fb.parallel === 'number');
  assert.ok(typeof fb.summaryEndings === 'number');
});

// ============ skill 精华移植测试（anti-ai-flavor §一/§三/§六） ============

test('countBushiXY 计数「不是X是Y」并允许2次免费', async () => {
  const { countBushiXY } = await import('../src/anti-ai-engine.js');
  assert.equal(countBushiXY('这不是剑，是烧火棍。'), 1);
  assert.equal(countBushiXY('他不是不想去，而是不能去。那不是血，是锈。'), 2);
  assert.equal(countBushiXY('那不是声音，是声音的消失。不是雷，是更低的闷响。不是风，是呼吸。'), 3);
  // 三次出现在 detectAI 里才触发扣分
  const r = detectAI('那不是声音，是声音的消失。不是雷，是更低的闷响。不是风，是呼吸。他走了很远。');
  assert.ok(r.hits.some((h) => h.rule === 'bushi-xy'));
  const r2 = detectAI('这不是剑，是烧火棍。他走了很远很远的路，路上没有别人。');
  assert.ok(!r2.hits.some((h) => h.rule === 'bushi-xy'), '≤2次不罚');
});

test('countEmDash 计数全角破折号', async () => {
  const { countEmDash } = await import('../src/anti-ai-engine.js');
  assert.equal(countEmDash('他——走了。她——也走了。'), 2);
  const many = '冷——热——明——暗——远——近——'.repeat(4);
  const r = detectAI(many);
  assert.ok(r.hits.some((h) => h.rule === 'em-dash'), '>20 破折号触发扣分');
});

test('detectMetaDiscourse 元话语零容忍', async () => {
  const { detectMetaDiscourse } = await import('../src/anti-ai-engine.js');
  const hits = detectMetaDiscourse('如前文所述，他早就知道。后文再表，此处不提。');
  assert.ok(hits.some((h) => h.word === '前文所述'));
  assert.ok(hits.some((h) => h.word === '后文再表'));
  const r = detectAI('如前文所述，他早就知道这件事的来龙去脉，所以他没问。');
  assert.ok(r.hits.some((h) => h.rule === 'meta-discourse'));
});

test('detectBannedEndings 只查结尾120字', async () => {
  const { detectBannedEndings } = await import('../src/anti-ai-engine.js');
  assert.equal(detectBannedEndings('他不知道的是，这一切才刚开始。他不知道的是风暴将至。').length, 1);
  const r = detectAI('他往山下走。走了很久。天黑透了。他不知道的是，这只是开始。');
  assert.ok(r.hits.some((h) => h.rule === 'banned-ending'));
});

test('checkOpening 前300字物理事件 + 前500字对话', async () => {
  const { checkOpening } = await import('../src/anti-ai-engine.js');
  const quiet = '天空湛蓝。云很白。远山安静。'.repeat(50);
  const o1 = checkOpening(quiet);
  assert.ok(o1.longEnough && !o1.physicalEvent);
  const violent = '他一斧劈下去，木头裂了。' + '很安静。'.repeat(100);
  const o2 = checkOpening(violent);
  assert.ok(o2.physicalEvent);
  const withDlg = '他喊："站住！"' + '很安静。'.repeat(60);
  assert.ok(checkOpening(withDlg).hasDialogue);
});

test('dialogueRatio 计量对话占比', async () => {
  const { dialogueRatio } = await import('../src/anti-ai-engine.js');
  const half = '「你走。」他站着没动，看着对方。';
  assert.ok(dialogueRatio(half) > 0.05);
  assert.equal(dialogueRatio('全是叙述没有任何引号内容。'.repeat(5)), 0);
});

test('detectIdiomStack 四字格连排', async () => {
  const { detectIdiomStack } = await import('../src/anti-ai-engine.js');
  assert.ok(detectIdiomStack('他从容不迫，游刃有余，胸有成竹。') >= 1);
  assert.equal(detectIdiomStack('他慢慢地走，没有说话。'), 0);
});

test('repeatedNgrams 章内重复表达', async () => {
  const { repeatedNgrams } = await import('../src/anti-ai-engine.js');
  const text = ('他指节发白。' + '过了一会儿。').repeat(4);
  const reps = repeatedNgrams(text, 5, 3);
  assert.ok(reps.length > 0);
});

test('crossChapterRepeats 跨章签名短语禁用', async () => {
  const { crossChapterRepeats } = await import('../src/anti-ai-engine.js');
  const prev = ['他指节攥得发白，说不出话。'.repeat(3).replace(/。/g, '。')];
  const cur = '他指节攥得发白，说不出话。这是第三章。';
  const hits = crossChapterRepeats(cur, prev, 6);
  assert.ok(hits.length > 0, '前文≥3次的短语本章再现应命中');
  assert.equal(crossChapterRepeats('完全不同的新内容，没有旧短语。', prev, 6).length, 0);
});

// ============ 句构节奏检测（用户实测反馈：电报体/意象堆叠） ============

test('sentenceRhythm 画像：电报体被识别', async () => {
  const { sentenceRhythm } = await import('../src/anti-ai-engine.js');
  const telegram = '他站起来。走到门口。停住。回头看。没人。他走了。门开着。风进来。灯灭了。天亮了。他坐下。喝水。放下碗。看着墙。墙很白。';
  const r = sentenceRhythm(telegram);
  assert.ok(r.shortRatio > 0.6, '短句占比应过半，实际 ' + r.shortRatio);
  assert.ok(r.avgLen < 14);
});

test('detectAI 罚电报体：短句轰炸+均句长过低', async () => {
  const telegram = ('他站起来。走到门口。停住。回头看。没人。他走了。门开着。风进来。灯灭了。天亮了。他坐下。喝水。放下碗。看着墙。墙很白。他躺下。闭眼。睡不着。').repeat(2);
  const r = detectAI(telegram);
  assert.ok(r.hits.some((h) => h.rule === 'telegram-style'), '电报体应命中，hits: ' + r.hits.map((h) => h.rule).join(','));
});

test('detectAI 罚单句成段过密', async () => {
  const lines = [];
  for (let i = 0; i < 25; i++) lines.push('他往山下的镇子走去，路上没有遇到一个人，日头晒得后颈发烫。');
  const r = detectAI(lines.join('\n\n'));
  assert.ok(r.hits.some((h) => h.rule === 'single-sentence-paragraphs'));
});

test('simileDensity 明喻密度超标被罚', async () => {
  const { simileDensity } = await import('../src/anti-ai-engine.js');
  const thick = '剑光像水一样泻下来。他的眼神如同寒冰。声音仿佛雷鸣般炸开。心像被无形的手攥住似的。人宛如枯木一样站着。';
  assert.ok(simileDensity(thick) > 3);
  const r = detectAI(thick + '他往后退了两步，踩碎了地上的枯枝，碎屑扎进草鞋底。');
  assert.ok(r.hits.some((h) => h.rule === 'simile-density'));
});

test('健康长句叙述不被误罚', async () => {
  const healthy = '他把柴捆从肩上卸下来靠在墙根，抹了一把脸上的汗，汗里混着柴灰，在颧骨上留下一道灰印。灶屋的烟囱冒着青灰色的烟，被傍晚的风压得贴着屋脊跑，跑出十几丈才散。他娘掀开门帘探出半个身子，看见他回来了，又缩回去，往灶膛里添了一把柴，火光把她的影子投在墙上，晃了两晃。';
  const r = detectAI(healthy);
  assert.ok(!r.hits.some((h) => h.rule === 'telegram-style'));
  assert.ok(!r.hits.some((h) => h.rule === 'few-long-sentences'));
  assert.ok(!r.hits.some((h) => h.rule === 'simile-density'));
});

test('HEDGE_WORDS 不再惩罚人味模糊词（skill §八）', async () => {
  const { HEDGE_WORDS, hedgeDensity } = await import('../src/anti-ai-engine.js');
  assert.ok(!HEDGE_WORDS.includes('似乎'));
  assert.ok(!HEDGE_WORDS.includes('可能'));
  assert.ok(!HEDGE_WORDS.includes('或许'));
  assert.ok(!HEDGE_WORDS.includes('大概'));
  const human = '我大概记不清了，也许是他，我隐约记得他咳嗽了两声。'.repeat(3);
  const r = detectAI(human);
  assert.ok(!r.hits.some((h) => h.rule === 'hedge-density'), '诚实模糊词不罚');
  const lecture = '从某种意义上说，这是必然的。众所周知，他很强。毋庸置疑，他赢了。综上所述，他赢了。'.repeat(2);
  assert.ok(detectAI(lecture).hits.some((h) => h.rule === 'hedge-density'), '议论文腔仍罚');
});
