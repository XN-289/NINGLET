/**
 * NINGLET 伏笔生命周期引擎 —— 确定性纯函数，移植自 inkos 的 hook 治理体系。
 *
 * 核心概念：
 *   - 伏笔有完整生命周期：open（刚埋下）→ progressing（推进中）→ resolved（已回收）
 *   - 每个[伏笔]有半衰期（halfLifeChapters），超过半衰期未推进 = 过期（stale）
 *   - 因果链（dependsOn）：伏笔可依赖上游伏笔，上游未回收则下游受阻（blocked）
 *   - 回收节奏（payoffTiming）：immediate/near-term/mid-arc/slow-burn/endgame
 *
 * 唯一数据源：本文件是权威 schema 和检测逻辑，插件内联副本由 parity 测试锁死。
 */

// ============ 伏笔状态枚举 ============

export const HOOK_STATUSES = ['open', 'progressing', 'deferred', 'resolved'];

export const PAYOFF_TIMINGS = ['immediate', 'near-term', 'mid-arc', 'slow-burn', 'endgame'];

// ============ 半衰期解析 ============

/**
 * 根据 payoffTiming 推导默认半衰期（章数）。
 * immediate/near-term = 10，mid-arc = 30，slow-burn/endgame = 80。
 */
export function defaultHalfLifeChapters(payoffTiming) {
  switch (payoffTiming) {
    case 'immediate':
    case 'near-term':
      return 10;
    case 'slow-burn':
    case 'endgame':
      return 80;
    case 'mid-arc':
    default:
      return 30;
  }
}

/**
 * 解析[伏笔]的有效半衰期：优先用显式 halfLifeChapters，否则按 payoffTiming 推导。
 */
export function resolveHalfLifeChapters(hook) {
  return hook.halfLifeChapters || defaultHalfLifeChapters(hook.payoffTiming);
}

// ============ [伏笔]规范化与校验 ============

/**
 * 将松散的[伏笔]对象（如观察者抽取的 {name, status, note}）规范化为完整 HookRecord。
 * 补全缺失字段、生成 hookId、设默认值。
 */
export function normalizeHook(raw, currentChapter) {
  const name = String(raw.name || '').trim();
  if (!name) return null;
  const hookId = raw.hookId || ('hook-' + name.replace(/\s+/g, '-').toLowerCase());
  const status = HOOK_STATUSES.includes(raw.status) ? raw.status : 'open';
  return {
    hookId,
    name,
    startChapter: Number.isInteger(raw.startChapter) ? raw.startChapter : (currentChapter || 0),
    status,
    lastAdvancedChapter: Number.isInteger(raw.lastAdvancedChapter)
      ? raw.lastAdvancedChapter
      : (status === 'open' ? 0 : (raw.startChapter || currentChapter || 0)),
    expectedPayoff: String(raw.expectedPayoff || raw.note || ''),
    payoffTiming: PAYOFF_TIMINGS.includes(raw.payoffTiming) ? raw.payoffTiming : undefined,
    notes: String(raw.notes || raw.note || ''),
    dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn : [],
    coreHook: raw.coreHook === true,
    halfLifeChapters: Number.isInteger(raw.halfLifeChapters) ? raw.halfLifeChapters : undefined,
    promoted: raw.promoted === true,
  };
}

export function validateHook(h) {
  const errors = [];
  if (!h || typeof h !== 'object') return { ok: false, errors: ['hook is not an object'] };
  if (typeof h.hookId !== 'string' || h.hookId.length === 0) errors.push('hookId 缺失');
  if (typeof h.name !== 'string' || h.name.length === 0) errors.push('name 缺失');
  if (!HOOK_STATUSES.includes(h.status)) errors.push('status 必须是 ' + HOOK_STATUSES.join('/'));
  if (!Number.isInteger(h.startChapter) || h.startChapter < 0) errors.push('startChapter 必须为非负整数');
  return { ok: errors.length === 0, errors };
}

// ============ 过期/受阻检测（核心） ============

/**
 * 检测所有[伏笔]的 stale（过期）和 blocked（受阻）状态。
 *
 * stale：已埋下（startChapter > 0）且未回收，距离 > 半衰期。
 * blocked：dependsOn 引用的上游[伏笔]未埋下或未回收。
 *
 * @param {HookRecord[]} hooks - 所有[伏笔]
 * @param {number} currentChapter - 当前章号
 * @returns {Map<string, HookDiagnostic>} hookId → 诊断结果
 */
export function computeHookDiagnostics(hooks, currentChapter) {
  const byId = new Map();
  for (const hook of hooks) {
    if (hook && hook.hookId) byId.set(hook.hookId, hook);
  }

  const result = new Map();
  for (const hook of hooks) {
    if (!hook || !hook.hookId) continue;
    const halfLife = resolveHalfLifeChapters(hook);
    const planted = Math.max(0, hook.startChapter || 0);
    const distance = Math.max(0, currentChapter - planted);

    const isResolved = hook.status === 'resolved';
    const stale = !isResolved && planted > 0 && distance > halfLife;

    const missingUpstream = [];
    for (const upstreamId of (hook.dependsOn || [])) {
      const upstream = byId.get(upstreamId);
      if (!upstream) {
        missingUpstream.push(upstreamId);
        continue;
      }
      const upstreamResolved = upstream.status === 'resolved';
      const upstreamPlanted = upstream.startChapter > 0 && upstream.startChapter <= currentChapter;
      if (!upstreamPlanted || !upstreamResolved) {
        missingUpstream.push(upstreamId);
      }
    }
    const blocked = missingUpstream.length > 0 && !isResolved;

    result.set(hook.hookId, { stale, blocked, missingUpstream, distance, halfLife });
  }
  return result;
}

/**
 * 将诊断结果渲染为紧凑标记文本（给面板/提示词用）。
 */
export function renderHookDiagnosticMarker(diag) {
  const tokens = [];
  if (diag.stale) tokens.push('过期(距' + diag.distance + '/半衰' + diag.halfLife + ')');
  if (diag.blocked) tokens.push('受阻于' + diag.missingUpstream.join(','));
  return tokens.join('; ');
}

// ============ [伏笔]合并（观察者抽取结果并入状态） ============

/**
 * 将新观察到的[伏笔]合并进已有[伏笔]列表。
 * - 已存在的按 name 匹配：更新 status（可推进）或 expectedPayoff
 * - 不存在的：normalizeHook 后追加
 *
 * @param {HookRecord[]} existing - 已有[伏笔]
 * @param {object[]} observed - 观察者抽取的原始[伏笔]（{name, status, note}）
 * @param {number} currentChapter - 当前章号
 * @returns {HookRecord[]} 合并后的[伏笔]列表
 */
export function mergeHooks(existing, observed, currentChapter) {
  const result = (existing || []).slice();
  for (const raw of (observed || [])) {
    const norm = normalizeHook(raw, currentChapter);
    if (!norm) continue;
    const idx = result.findIndex((h) => h.name === norm.name || h.hookId === norm.hookId);
    if (idx >= 0) {
      const old = result[idx];
      // 状态可向前推进但不能回退（resolved 不会被重新 open）
      const statusRank = { open: 0, progressing: 1, deferred: 1, resolved: 2 };
      const merged = Object.assign({}, old, {
        status: (statusRank[norm.status] || 0) >= (statusRank[old.status] || 0) ? norm.status : old.status,
        lastAdvancedChapter: norm.status !== old.status ? currentChapter : old.lastAdvancedChapter,
        expectedPayoff: norm.expectedPayoff || old.expectedPayoff,
        notes: norm.notes || old.notes,
        payoffTiming: norm.payoffTiming || old.payoffTiming,
      });
      result[idx] = merged;
    } else {
      result.push(norm);
    }
  }
  return result;
}

// ============ [伏笔]健康度统计 ============

/**
 * 计算整本书的[伏笔]健康度概要。
 */
export function hookHealthSummary(hooks, currentChapter) {
  const diags = computeHookDiagnostics(hooks, currentChapter);
  let open = 0, progressing = 0, resolved = 0, deferred = 0;
  let stale = 0, blocked = 0;
  for (const h of hooks) {
    if (h.status === 'open') open++;
    else if (h.status === 'progressing') progressing++;
    else if (h.status === 'resolved') resolved++;
    else if (h.status === 'deferred') deferred++;
    const d = diags.get(h.hookId);
    if (d && d.stale) stale++;
    if (d && d.blocked) blocked++;
  }
  return {
    total: hooks.length,
    open, progressing, resolved, deferred,
    stale, blocked,
    active: open + progressing,
    staleRatio: hooks.length > 0 ? Number((stale / hooks.length).toFixed(2)) : 0,
  };
}
