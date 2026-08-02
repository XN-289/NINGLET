"""
NINGLET - 短篇分支后端
精简版：只保留短篇创作所需的 8 个路由。

路由清单：
  GET  /                      首页
  GET  /api/health            健康检查
  GET  /api/short/genres      题材库 + 平台
  POST /api/short/route       字数路由（单篇流式 vs 多节预规划）
  POST /api/short/prompt      构建提示词（idea/outline/content/humanize）
  POST /api/short/scan        AI 味诊断
  POST /gen                   流式生成（主模型）
  POST /gen2                  流式生成（辅助模型）
"""

from flask import Flask, request, Response, render_template, jsonify
import requests
import json
import logging
import os
import time
from dotenv import load_dotenv

from modules.config import (
    APP_VERSION, APP_NAME, DEFAULT_HOST, DEFAULT_PORT, DEFAULT_DEBUG,
)
from modules.auth import require_auth, AUTH_ENABLED
from modules.database import init_db
from modules.aidetector import scan_text
from modules.shortstory import (
    GENRE_LIBRARY, PLATFORM_FORMAT, route_short_story, ShortStoryPlan,
    build_short_idea_prompt, build_short_outline_prompt,
    build_short_content_prompt, build_short_humanize_prompt,
)

load_dotenv()

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.after_request
def add_header(response):
    # 静态文件不缓存，方便开发期热更新
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.errorhandler(Exception)
def handle_exception(e):
    logger.error(f"未捕获的异常: {e}", exc_info=True)
    return jsonify({"error": str(e)}), 500


START_TIME = time.time()

# ============================================================
# 模型配置（OpenAI 兼容格式；从 .env 读取）
# ============================================================
CONFIG = {
    "primary": {
        "api_key": os.getenv("PRIMARY_API_KEY", "sk-your-key-here"),
        "api_endpoint": os.getenv("PRIMARY_API_ENDPOINT", "https://api.deepseek.com/v1/chat/completions"),
        "model": os.getenv("PRIMARY_MODEL", "deepseek-chat"),
        "temperature": float(os.getenv("PRIMARY_TEMPERATURE", "0.6")),
        "max_tokens": int(os.getenv("PRIMARY_MAX_TOKENS", "8192")),
        "timeout": int(os.getenv("PRIMARY_TIMEOUT", "180")),
    },
    "secondary": {
        "api_key": os.getenv("SECONDARY_API_KEY", ""),
        "api_endpoint": os.getenv("SECONDARY_API_ENDPOINT", "https://api.deepseek.com/v1/chat/completions"),
        "model": os.getenv("SECONDARY_MODEL", "deepseek-chat"),
        "temperature": float(os.getenv("SECONDARY_TEMPERATURE", "0.5")),
        "max_tokens": int(os.getenv("SECONDARY_MAX_TOKENS", "8192")),
        "timeout": int(os.getenv("SECONDARY_TIMEOUT", "180")),
    },
}


def build_headers(api_key: str) -> dict:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }


# ---- <think> 块过滤（reasoning 模型兼容层）----
# 该网关上的 deepseek/glm 等模型是 reasoning-only：它们把 <think>...</think>
# 思考过程直接塞进流式 delta.content 一起吐出。小说生成只需要思考结束后的
# 正文，这里跨 chunk 维护状态，剥除整个 think 块。标签可能被拆到多个
# chunk（如 "<thi" + "nk>"），用 pending 缓冲尾部拼接。
THINK_OPEN = "<think>"
THINK_CLOSE = "</think>"


def _strip_think_from_chunk(chunk, state):
    """从单个 chunk 中剥离 <think>...</think>，返回应输出的正文。"""
    out = []
    buf = state["pending"] + chunk
    state["pending"] = ""
    i = 0
    n = len(buf)
    while i < n:
        if state["in_think"]:
            idx = buf.find(THINK_CLOSE, i)
            if idx == -1:
                tail = buf[i:]
                if tail == THINK_CLOSE[: len(tail)]:
                    state["pending"] = tail
                i = n
            else:
                state["in_think"] = False
                i = idx + len(THINK_CLOSE)
                if i < n and buf[i] == "\r":
                    i += 1
                if i < n and buf[i] == "\n":
                    i += 1
        else:
            idx = buf.find(THINK_OPEN, i)
            if idx == -1:
                tail = buf[i:]
                prefix_len = 0
                for pl in range(min(len(THINK_OPEN) - 1, len(tail)), 0, -1):
                    if tail == THINK_OPEN[:pl]:
                        prefix_len = pl
                        break
                if prefix_len > 0:
                    out.append(tail[: len(tail) - prefix_len])
                    state["pending"] = tail[len(tail) - prefix_len :]
                else:
                    out.append(tail)
                i = n
            else:
                out.append(buf[i:idx])
                state["in_think"] = True
                i = idx + len(THINK_OPEN)
    return "".join(out)


def strip_think_stream(gen):
    """包装一个流式生成器，过滤掉其中的 <think>...</think> 块。"""
    state = {"in_think": False, "pending": ""}
    for chunk in gen:
        filtered = _strip_think_from_chunk(chunk, state)
        if filtered:
            yield filtered


def stream_openai_compat(endpoint, headers, payload, timeout=180):
    """处理 OpenAI 兼容格式的流式响应（带重试）。"""
    max_retries = 3
    retry_count = 0
    while retry_count < max_retries:
        try:
            logger.info(f"调用API: {endpoint}, model: {payload.get('model')}")
            resp = requests.post(endpoint, headers=headers, json=payload, stream=True, timeout=timeout)

            if resp.status_code == 429:
                retry_count += 1
                wait_time = min(2 ** retry_count, 10)
                logger.warning(f"速率限制，等待{wait_time}秒后重试 ({retry_count}/{max_retries})")
                time.sleep(wait_time)
                continue

            if resp.status_code != 200:
                error_msg = f"API错误 [{resp.status_code}]: {resp.text[:500]}"
                logger.error(error_msg)
                yield error_msg
                return

            for line in resp.iter_lines():
                if not line:
                    continue
                decoded = line.decode("utf-8")
                if not decoded.startswith("data: "):
                    continue
                data_str = decoded[6:]
                if data_str.strip() == "[DONE]":
                    break
                try:
                    data = json.loads(data_str)
                    delta = data.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content", "")
                    if content:
                        yield content
                except json.JSONDecodeError:
                    continue
            return

        except requests.exceptions.Timeout:
            retry_count += 1
            if retry_count < max_retries:
                logger.warning(f"请求超时，重试中 ({retry_count}/{max_retries})")
                time.sleep(1)
                continue
            yield "\n[错误: 请求超时，请检查网络或稍后重试]"
            return

        except requests.exceptions.ConnectionError:
            retry_count += 1
            if retry_count < max_retries:
                logger.warning(f"连接失败，重试中 ({retry_count}/{max_retries})")
                time.sleep(2)
                continue
            yield "\n[错误: 无法连接到API服务器，请检查网络]"
            return

        except Exception as e:
            logger.error(f"流式处理异常: {e}")
            yield f"\n[错误: {str(e)}]"
            return


def call_model(prompt: str, model_key: str = "primary"):
    """统一的模型调用入口（生成器，产出流式文本）。"""
    cfg = CONFIG[model_key]
    if not cfg["api_key"] or cfg["api_key"] == "sk-your-key-here":
        yield "[错误: 请先在 .env 中配置 PRIMARY_API_KEY]"
        return

    headers = build_headers(cfg["api_key"])
    payload = {
        "model": cfg["model"],
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
        "temperature": cfg["temperature"],
        "max_tokens": cfg["max_tokens"],
    }
    yield from strip_think_stream(
        stream_openai_compat(cfg["api_endpoint"], headers, payload, cfg.get("timeout", 180))
    )


# ============================================================
# 路由
# ============================================================
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/health", methods=["GET"])
def health_check():
    uptime = int(time.time() - START_TIME)
    primary_ok = bool(CONFIG["primary"]["api_key"]) and CONFIG["primary"]["api_key"] != "sk-your-key-here"
    secondary_ok = bool(CONFIG["secondary"]["api_key"]) and CONFIG["secondary"]["api_key"] != "sk-your-key-here"
    return jsonify({
        "status": "ok",
        "uptime": uptime,
        "uptime_human": f"{uptime // 3600}h {(uptime % 3600) // 60}m {uptime % 60}s",
        "models": {
            "primary": {
                "configured": primary_ok,
                "model": CONFIG["primary"]["model"],
                "endpoint": CONFIG["primary"]["api_endpoint"],
            },
            "secondary": {
                "configured": secondary_ok,
                "model": CONFIG["secondary"]["model"],
                "endpoint": CONFIG["secondary"]["api_endpoint"],
            },
        },
        "version": APP_VERSION,
        "auth_enabled": AUTH_ENABLED,
    })


@app.route("/gen", methods=["POST"])
@require_auth
def generate():
    """主生成接口 - 用于大纲、章节、正文（流式）。"""
    data = request.json
    if not data:
        return Response("错误: 无效的请求体", status=400)
    prompt = data.get("prompt", "")
    if not prompt:
        return Response("错误: 空提示词", status=400)
    if len(prompt) > 200000:
        return Response("错误: 提示词过长（超过200000字符）", status=400)
    logger.info(f"收到 /gen 请求，prompt长度: {len(prompt)}, model: {CONFIG['primary']['model']}")
    return Response(
        call_model(prompt, "primary"),
        mimetype="text/event-stream",
        headers={"X-Accel-Buffering": "no"},
    )


@app.route("/gen2", methods=["POST"])
@require_auth
def generate2():
    """辅助生成接口 - 用于 AI 迭代优化（流式）。"""
    data = request.json
    if not data:
        return Response("错误: 无效的请求体", status=400)
    prompt = data.get("prompt", "")
    if not prompt:
        return Response("错误: 空提示词", status=400)
    if len(prompt) > 200000:
        return Response("错误: 提示词过长（超过200000字符）", status=400)
    logger.info(f"收到 /gen2 请求，prompt长度: {len(prompt)}, model: {CONFIG['secondary']['model']}")
    return Response(
        call_model(prompt, "secondary"),
        mimetype="text/event-stream",
        headers={"X-Accel-Buffering": "no"},
    )


@app.route("/api/short/genres", methods=["GET"])
@require_auth
def api_short_genres():
    """返回题材库（按频道分组）和平台列表。"""
    return jsonify({
        "genres": {k: dict(v) for k, v in GENRE_LIBRARY.items()},
        "platforms": {k: dict(v) for k, v in PLATFORM_FORMAT.items()},
    })


@app.route("/api/short/route", methods=["POST"])
@require_auth
def api_short_route():
    """字数路由：根据目标字数决定生成模式。"""
    data = request.json or {}
    target = int(data.get("target_words", 25000) or 25000)
    return jsonify(route_short_story(target))


@app.route("/api/short/prompt", methods=["POST"])
@require_auth
def api_short_prompt():
    """构建短篇提示词（idea/outline/content/humanize）。"""
    data = request.json or {}
    prompt_type = data.get("type", "idea")
    field_vars = {
        "background": data.get("background", ""),
        "characters": data.get("characters", ""),
        "relationships": data.get("relationships", ""),
        "plot": data.get("plot", ""),
        "style": data.get("style", ""),
    }
    target_words = int(data.get("target_words", 25000) or 25000)
    channel = data.get("channel", "female")
    genre_key = data.get("genre", "")
    platform = data.get("platform", "tomato")

    if prompt_type == "idea":
        story_description = data.get("story_description", "")
        prompt = build_short_idea_prompt(story_description, target_words, channel, genre_key)
        return jsonify({"prompt": prompt})

    if prompt_type == "outline":
        routing = route_short_story(target_words)
        plan = ShortStoryPlan(
            channel=channel, genre=genre_key, platform=platform,
            target_words=target_words,
            mode=routing.get("mode", "multi_section"),
            section_count=routing.get("section_count", 1),
            section_words=routing.get("section_words", target_words),
        )
        short_idea = data.get("short_idea", "")
        prompt = build_short_outline_prompt(short_idea, plan, field_vars)
        return jsonify({"prompt": prompt, "plan": plan.to_dict(), "routing": routing})

    if prompt_type == "content":
        routing = route_short_story(target_words)
        plan = ShortStoryPlan(
            channel=channel, genre=genre_key, platform=platform,
            target_words=target_words,
            mode=routing.get("mode", "multi_section"),
            section_count=routing.get("section_count", 1),
            section_words=routing.get("section_words", target_words),
        )
        short_idea = data.get("short_idea", "")
        section_outline = data.get("section_outline", "")
        previous_content = data.get("previous_content", "")
        prompt = build_short_content_prompt(section_outline, short_idea, previous_content, plan, field_vars)
        return jsonify({"prompt": prompt, "plan": plan.to_dict()})

    if prompt_type == "humanize":
        current_text = data.get("current_text", "")
        prompt = build_short_humanize_prompt(current_text)
        return jsonify({"prompt": prompt})

    return jsonify({"error": "无效的 type 参数"}), 400


@app.route("/api/short/scan", methods=["POST"])
@require_auth
def api_short_scan():
    """AI 味诊断：扫描正文，返回人味分数 + 命中规则。

    body: { text, genre? }
    genre 的 anti_ai_whitelist 目前是说明文字（非分类列表），暂不做分类级
    降级；保留参数以便后续把白名单结构化。
    """
    data = request.json or {}
    text = data.get("text", "")
    if not text.strip():
        return jsonify({"error": "空文本"}), 400
    report = scan_text(text)
    return jsonify(report.to_dict())


# ============================================================
# 启动
# ============================================================
if __name__ == "__main__":
    init_db()
    host = os.getenv("HOST", DEFAULT_HOST)
    port = int(os.getenv("PORT", DEFAULT_PORT))
    debug = os.getenv("DEBUG", str(DEFAULT_DEBUG)).lower() in ("1", "true", "yes")
    print("=" * 50)
    print(f"  {APP_NAME} v{APP_VERSION}")
    print(f"  访问地址: http://localhost:{port}")
    print(f"  健康检查: http://localhost:{port}/api/health")
    print(f"  认证: {'已启用' if AUTH_ENABLED else '未启用（本地开发模式）'}")
    print(f"  主模型: {CONFIG['primary']['model']}")
    print(f"  辅助模型: {CONFIG['secondary']['model']}")
    print("=" * 50)
    app.run(debug=debug, port=port, host=host, threaded=True)
