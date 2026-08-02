/**
 * NINGLET 短篇创作台 v1.0
 * 干净的短篇生成界面：构思 → 分节大纲 → 正文
 * 依赖后端：/api/short/* 和 /gen, /gen2
 */

// ---------- 状态 ----------
const State = {
    genres: null,
    platforms: null,
    chapters: [],
};

const $ = (id) => document.getElementById(id);

// ---------- 工具 ----------
function toast(msg, type = 'info') {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast show ' + type;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.className = 'toast'; }, 3000);
}

async function streamGen(prompt, targetEl, endpoint = '/gen') {
    const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        if (targetEl) { targetEl.value = text; targetEl.scrollTop = targetEl.scrollHeight; }
    }
    if (typeof onDone === 'function') onDone(text);
    return text;
}

async function fetchShortPrompt(params) {
    const resp = await fetch('/api/short/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    return data;
}

function getFieldVars() {
    return {
        background: $('field-background').value,
        characters: $('field-characters').value,
        style: $('field-style').value,
    };
}

function getShortParams() {
    return {
        channel: $('short-channel').value,
        genre: $('short-genre').value,
        platform: $('short-platform').value,
        target_words: parseInt($('short-target-words').value, 10) || 25000,
        ...getFieldVars(),
    };
}

// ---------- 初始化 ----------
async function init() {
    // 健康检查
    try {
        const r = await fetch('/api/health');
        const h = await r.json();
        const el = $('health');
        el.textContent = h.status === 'ok' ? '已连接 · ' + h.version : '连接异常';
        el.className = 'health ' + (h.status === 'ok' ? 'ok' : 'err');
    } catch (e) {
        $('health').textContent = '未连接';
        $('health').className = 'health err';
    }

    // 加载题材库
    try {
        const r = await fetch('/api/short/genres');
        const data = await r.json();
        State.genres = data.genres || {};
        State.platforms = data.platforms || {};
        fillPlatforms();
        updateGenres();
    } catch (e) {
        toast('题材库加载失败: ' + e.message, 'error');
    }

    // 事件绑定
    $('short-channel').addEventListener('change', updateGenres);
    $('short-target-words').addEventListener('input', debounce(updateRoute, 400));
    $('btn-idea').addEventListener('click', genIdea);
    $('btn-outline').addEventListener('click', genOutline);
    $('btn-all-content').addEventListener('click', genAllContent);
    const ea = $('btn-export-all'); if (ea) ea.addEventListener('click', exportAllMarkdown);
    const ec = $('btn-export-copy'); if (ec) ec.addEventListener('click', copyAllText);

    updateRoute();
}


// ---------- 导出 ----------
function buildFullText() {
    const idea = ($("short-idea").value || "").trim();
    const chs = State.chapters.filter(c => c.content && c.content.trim());
    if (chs.length === 0) { toast("还没有正文可导出", "warning"); return null; }
    let parts = [];
    if (idea) { parts.push("# 构思\n\n" + idea + "\n\n---\n"); }
    chs.forEach((c, i) => {
        const idx = State.chapters.indexOf(c);
        parts.push("## 第 " + (idx + 1) + " 节\n\n" + c.content.trim());
    });
    return parts.join("\n\n");
}

function exportAllMarkdown() {
    const text = buildFullText();
    if (!text) return;
    const ts = new Date().toISOString().slice(0,10);
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "青澜庭-正文-" + ts + ".md";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("已导出 " + State.chapters.filter(c=>c.content&&c.content.trim()).length + " 节正文", "success");
}

async function copyAllText() {
    const text = buildFullText();
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
        toast("全文已复制到剪贴板", "success");
    } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
        toast("全文已复制", "success");
    }
}

function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function fillPlatforms() {
    const sel = $('short-platform');
    sel.innerHTML = '';
    Object.entries(State.platforms).forEach(([k, v]) => {
        const o = document.createElement('option');
        o.value = k; o.textContent = v.name;
        sel.appendChild(o);
    });
}

function updateGenres() {
    const sel = $('short-genre');
    const ch = $('short-channel').value;
    sel.innerHTML = '';
    Object.entries(State.genres).forEach(([k, v]) => {
        if (v.channel !== ch) return;
        const o = document.createElement('option');
        o.value = k; o.textContent = v.name;
        sel.appendChild(o);
    });
}

async function updateRoute() {
    const tw = parseInt($('short-target-words').value, 10) || 25000;
    const el = $('route-hint');
    try {
        const r = await fetch('/api/short/route', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_words: tw }),
        });
        const d = await r.json();
        const modeText = d.recommend_pipeline === 'long' ? '⚠ 建议用长篇系统'
                       : d.mode === 'single_stream' ? '单篇流式（一次生成全文）'
                       : '多节预规划（' + d.section_count + ' 节）';
        el.textContent = d.message + ' → ' + modeText;
        el.style.color = d.recommend_pipeline === 'long' ? 'var(--warning)' : 'var(--accent)';
    } catch (e) {
        el.textContent = '路由查询失败';
    }
}

// ---------- 三步生成 ----------
async function genIdea() {
    const btn = $('btn-idea');
    btn.disabled = true; btn.textContent = '生成中…';
    const ta = $('short-idea');
    try {
        const params = { ...getShortParams(), type: 'idea', story_description: $('story-desc').value };
        const data = await fetchShortPrompt(params);
        ta.value = '';
        await streamGen(data.prompt, ta);
        toast('构思已生成', 'success');
    } catch (e) {
        toast('构思失败: ' + e.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = '生成构思';
    }
}

async function genOutline() {
    const idea = $('short-idea').value.trim();
    if (!idea) { toast('请先生成构思', 'warning'); return; }
    const btn = $('btn-outline');
    btn.disabled = true; btn.textContent = '生成中…';
    const ta = $('short-outline');
    try {
        const params = { ...getShortParams(), type: 'outline', short_idea: idea };
        const data = await fetchShortPrompt(params);
        ta.value = '';
        const text = await streamGen(data.prompt, ta);
        // 解析成章节
        const sections = parseSections(text);
        State.chapters = sections.map(s => ({ outline: s, content: '' }));
        renderChapters();
        toast('大纲已生成，拆成 ' + sections.length + ' 节', 'success');
    } catch (e) {
        toast('大纲失败: ' + e.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = '生成分节大纲';
    }
}

function parseSections(text) {
    // 优先按【第N节】标记拆
    let parts = text.split(/【第[一二三四五六七八九十百零0-9]+节[^】]*】/).filter(s => s.trim());
    // 其次按 ### 标记拆
    if (parts.length <= 1) {
        parts = text.split(/###\s*/).map(s => s.trim()).filter(s => s.length > 20);
    }
    // 再按「第N节」无括号拆
    if (parts.length <= 1) {
        parts = text.split(/第[一二三四五六七八九十百零0-9]+节[^\n]*\n/).filter(s => s.trim());
    }
    // 兜底：按双换行分段，合并过短的
    if (parts.length <= 1) {
        const paras = text.split(/\n\s*\n/).filter(s => s.trim().length > 30);
        if (paras.length > 1) parts = paras;
    }
    if (parts.length === 0) parts = [text];
    // 清理每段首尾空白
    return parts.map(s => s.trim()).filter(s => s);
}

function renderChapters() {
    const box = $('chapters');
    box.innerHTML = '';
    State.chapters.forEach((ch, idx) => {
        const div = document.createElement('div');
        div.className = 'chapter';
        const wc = ch.content ? ' · ' + ch.content.length + ' 字' : '';
        div.innerHTML =
            '<div class="chapter-head">' +
                '<span class="chapter-title">第 ' + (idx + 1) + ' 节</span>' +
                '<div class="chapter-actions">' +
                    '<button class="btn sm ghost" data-act="gen" data-idx="' + idx + '">生成本节</button>' +
                    '<button class="btn sm ghost" data-act="scan" data-idx="' + idx + '">AI味诊断</button>' +
                    '<button class="btn sm accent" data-act="humanize" data-idx="' + idx + '">情绪烈度重写</button>' +
                '</div>' +
            '</div>' +
            '<div class="meta">大纲：' + (ch.outline.slice(0, 80) || '（无）') + '…' + wc + '</div>' +
            '<textarea data-idx="' + idx + '" placeholder="点「生成本节」写正文"></textarea>';
        box.appendChild(div);
    });
    // 绑定章节内按钮和文本框
    box.querySelectorAll('button[data-act]').forEach(b => {
        b.addEventListener('click', () => {
            const idx = parseInt(b.dataset.idx, 10);
            if (b.dataset.act === 'gen') genContent(idx);
            else if (b.dataset.act === 'scan') scanChapter(idx);
            else humanizeChapter(idx);
        });
    });
    box.querySelectorAll('textarea[data-idx]').forEach(t => {
        t.addEventListener('input', () => {
            const idx = parseInt(t.dataset.idx, 10);
            State.chapters[idx].content = t.value;
        });
    });
    // 回填已有内容
    box.querySelectorAll('textarea[data-idx]').forEach(t => {
        const idx = parseInt(t.dataset.idx, 10);
        t.value = State.chapters[idx].content || '';
    });
}

async function genContent(idx) {
    const ch = State.chapters[idx];
    if (!ch) return;
    const ta = document.querySelector('#chapters textarea[data-idx="' + idx + '"]');
    try {
        const prev = State.chapters.slice(0, idx).map(c => c.content || '').filter(Boolean).join('\n');
        const params = {
            ...getShortParams(), type: 'content',
            short_idea: $('short-idea').value,
            section_outline: ch.outline,
            previous_content: prev,
        };
        const data = await fetchShortPrompt(params);
        if (ta) ta.value = '';
        const text = await streamGen(data.prompt, ta);
        ch.content = text;
        renderChapters();
        toast('第 ' + (idx + 1) + ' 节正文已生成', 'success');
    } catch (e) {
        toast('第 ' + (idx+1) + ' 节失败: ' + e.message, 'error');
    }
}

async function genAllContent() {
    if (State.chapters.length === 0) { toast('请先生成分节大纲', 'warning'); return; }
    const btn = $('btn-all-content');
    btn.disabled = true; btn.textContent = '批量生成中…';
    try {
        for (let i = 0; i < State.chapters.length; i++) {
            if (!State.chapters[i].content || !State.chapters[i].content.trim()) {
                await genContent(i);
            }
        }
        toast('全部正文生成完成', 'success');
    } catch (e) {
        toast('批量生成中断: ' + e.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = '批量生成全部正文';
    }
}

async function scanChapter(idx) {
    const ch = State.chapters[idx];
    if (!ch || !ch.content || !ch.content.trim()) { toast('该节还没有正文', 'warning'); return; }
    const btn = document.querySelector('#chapters button[data-act="scan"][data-idx="' + idx + '"]');
    if (btn) { btn.disabled = true; btn.textContent = '扫描中…'; }
    try {
        const resp = await fetch('/api/short/scan', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: ch.content, genre: $('short-genre').value }),
        });
        const r = await resp.json();
        if (r.error) throw new Error(r.error);
        renderScanReport(r, idx);
    } catch (e) {
        toast('诊断失败: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'AI味诊断'; }
    }
}

function renderScanReport(r, idx) {
    const sc = (s) => s >= 80 ? 'var(--success)' : s >= 60 ? 'var(--warning)' : 'var(--danger)';
    let html = '<div class="scan-score-row">' +
        '<div class="scan-score-card"><div class="scan-score" style="color:' + sc(r.ai_taste_score) + '">' + r.ai_taste_score + '</div><div class="scan-score-label">人味分数</div></div>' +
        '<div class="scan-score-card"><div class="scan-score" style="color:var(--danger)">' + r.blocking_count + '</div><div class="scan-score-label">必改</div></div>' +
        '<div class="scan-score-card"><div class="scan-score" style="color:var(--warning)">' + r.advisory_count + '</div><div class="scan-score-label">提示</div></div>' +
        '<div class="scan-score-card"><div class="scan-score">' + r.total_chars + '</div><div class="scan-score-label">总字数</div></div>' +
        '</div>';

    const blocking = r.detections.filter(d => d.level === 'blocking');
    const advisory = r.detections.filter(d => d.level === 'advisory');

    if (blocking.length > 0) {
        html += '<div class="scan-section"><div class="scan-section-title" style="color:var(--danger)">必改项（blocking）</div>';
        blocking.forEach(d => {
            html += '<div class="scan-item scan-blocking"><span class="scan-cat">' + d.category + '</span><span class="scan-ctx">' + d.context + '</span><div class="scan-advice">' + d.advice + '</div></div>';
        });
        html += '</div>';
    }
    if (advisory.length > 0) {
        html += '<div class="scan-section"><div class="scan-section-title" style="color:var(--warning)">提示项（advisory，复核即可）</div>';
        // advisory 去重显示（同类只显示一次）
        const seen = new Set();
        advisory.forEach(d => {
            if (seen.has(d.category)) return;
            seen.add(d.category);
            html += '<div class="scan-item scan-advisory"><span class="scan-cat">' + d.category + '</span><span class="scan-ctx">' + d.context + '</span><div class="scan-advice">' + d.advice + '</div></div>';
        });
        html += '</div>';
    }
    if (blocking.length === 0 && advisory.length === 0) {
        html += '<div class="scan-clean">未检测到明显AI味问题，人味分数 ' + r.ai_taste_score + '/100。</div>';
    }

    $('scan-title').textContent = '第 ' + (idx + 1) + ' 节 AI味诊断';
    $('scan-body').innerHTML = html;
    $('scan-modal').style.display = 'flex';
}

async function humanizeChapter(idx) {
    const ch = State.chapters[idx];
    if (!ch || !ch.content || !ch.content.trim()) { toast('该节还没有正文', 'warning'); return; }
    const ta = document.querySelector('#chapters textarea[data-idx="' + idx + '"]');
    try {
        toast('情绪烈度重写中…', 'info');
        // 用 /api/short/prompt 构建 humanize 提示词，再走 /gen2（辅助模型）
        const resp = await fetch('/api/short/prompt', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'humanize', current_text: ch.content }),
        });
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        // 流式调 /gen2（复用 streamGen，endpoint 参数化）
        const text = await streamGen(data.prompt, ta, '/gen2');
        ch.content = text;
        toast('第 ' + (idx+1) + ' 节情绪烈度重写完成', 'success');
    } catch (e) {
        toast('重写失败: ' + e.message, 'error');
    }
}

// 启动
document.addEventListener('DOMContentLoaded', init);

// 全局错误捕获（诊断用，确认无错后可删）
window.addEventListener('error', function(e) {
    let banner = document.getElementById('error-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'error-banner';
        document.body.appendChild(banner);
    }
    banner.style.display = 'block';
    banner.textContent = '[JS错误] ' + e.message + ' @ ' + (e.filename||'').split('/').pop() + ':' + e.lineno;
});
