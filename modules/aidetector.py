"""
AI 味检测引擎（机器闸门）

设计依据：oh-story-claudecode 的 check-ai-patterns.js（2025-2026 业界共识）
核心原则：
- blocking（必改）vs advisory（提示复核）分级
- 用「密度/千字」阈值而非简单命中数，避免误杀正常中文
- 只报不重写——安全修法依赖上下文，交给模型或人工
- 题材感知：某些「AI味」在特定题材是卖点（由调用方传 whitelist 控制）
"""

import re
from dataclasses import dataclass, field
from typing import List, Dict


def _count_per_kilo(text: str, hits: int) -> float:
    """把命中次数换算成「每千字密度」。"""
    chars = max(len(text), 1)
    return round(hits * 1000 / chars, 2)


@dataclass
class Detection:
    """单条检测结果。"""
    level: str          # blocking / advisory
    category: str       # 分类名
    pattern: str        # 命中的具体词或模式
    position: int       # 字符位置
    context: str        # 命中处的前后文（方便定位）
    advice: str         # 修法建议

    def to_dict(self) -> dict:
        return self.__dict__.copy()


@dataclass
class ScanReport:
    """完整扫描报告。"""
    total_chars: int = 0
    ai_taste_score: int = 100       # 0-100，100=最像人写的
    blocking_count: int = 0
    advisory_count: int = 0
    detections: List[Detection] = field(default_factory=list)
    density_stats: Dict = field(default_factory=dict)   # {category: per_kilo密度}

    def to_dict(self) -> dict:
        return {
            "total_chars": self.total_chars,
            "ai_taste_score": self.ai_taste_score,
            "blocking_count": self.blocking_count,
            "advisory_count": self.advisory_count,
            "detections": [d.to_dict() for d in self.detections],
            "density_stats": self.density_stats,
        }


# ============================================================
# 检测规则
# ============================================================

# --- blocking 级（必须改）---
# 密度阈值单位：每千字。超过才算病。
BLOCKING_RULES = [
    {
        "category": "破折号——",
        "patterns": [r"——"],
        "threshold_per_kilo": 0.5,
        "advice": "破折号是AI制造停顿的万能工具。一篇短篇最多2-3处。停顿用句号+短句、动作beat、换行代替。",
    },
    {
        "category": "或者说/准确地说（补充修正腔）",
        "patterns": [r"或者说", r"或者说是", r"准确地?说", r"换句话说", r"说白了", r"确切地说"],
        "threshold_per_kilo": 0.1,
        "advice": "补充修正腔是AI假装精确的口头禅。选一个说法写死，不要补充不要修正。",
    },
    {
        "category": "是不是X就是Y（反问顿悟腔）",
        "patterns": [r"是不是.{1,15}就是", r"是不是.{1,15}的时候", r"所谓.{1,10}是不是"],
        "threshold_per_kilo": 0.1,
        "advice": "反问顿悟句是AI制造宿命感的廉价手段。删掉反问，直接陈述。",
    },
    {
        "category": "不是…而是…（议论对比）",
        "patterns": [r"不是.{1,15}而是", r"不是.{1,10}，而是", r"不是.{1,8}[。.]\s*是", r"不是.{1,8}[，,]\s*是[^的]", r"不是.{1,6}是[^的]"],
        "threshold_per_kilo": 0.5,
        "advice": "议论式对比是AI最爱。直接写'是'的部分，或用动作/对话体现对比。",
    },
    {
        "category": "不像…而像…（明喻对比）",
        "patterns": [r"不像.{1,15}而像", r"不像.{1,15}，像是", r"不像.{1,10}像[^是]"],
        "threshold_per_kilo": 0.3,
        "advice": "明喻对比是AI腔。要么直接写像的那个东西，要么删掉比喻用具体细节。",
    },
    {
        "category": "像…一样/似的（明喻泛滥）",
        "patterns": [r"像[^，。\n]{2,15}一样", r"像[^，。\n]{2,15}似的", r"如同[^，。\n]{2,15}一样"],
        "threshold_per_kilo": 1.0,
        "advice": "明喻太密就廉价。一段最多一个比喻，且必须指向具体、反常识的意象，不要随手'像X一样'。",
    },
    {
        "category": "省略号……",
        "patterns": [r"……"],
        "threshold_per_kilo": 0.5,
        "advice": "省略号是AI假装留白。删掉，用未完成的动作或沉默代替。",
    },
    {
        "category": "音量反差腔（不由得/不禁/下意识）",
        "patterns": [r"不由得", r"不禁", r"情不自禁", r"下意识", r"潜意识", r"忍不住"],
        "threshold_per_kilo": 0.5,
        "advice": "这些词是AI写情绪反应的万能胶。换成具体的身体动作或物件。",
    },
    {
        "category": "否定排比（不X不X不X）",
        "patterns": [r"不.{1,6}不.{1,6}不", r"不再.{1,8}不再.{1,8}不再"],
        "threshold_per_kilo": 0.3,
        "advice": "三连否定排比是典型AI味。删掉，只留一个最具体的否定。",
    },
    {
        "category": "预告式总结收尾",
        "patterns": [
            r"他终于明白", r"她终于明白", r"终于明白了", r"终于意识到", r"终于懂了",
            r"这一夜.{0,4}注定", r"更大的风暴", r"这只是开始",
            r"命运的齿轮", r"一切都变了", r"故事由此展开",
            r"这意味着", r"从这一刻起", r"他不知道的是", r"她不知道的是",
        ],
        "threshold_per_kilo": 0.3,
        "advice": "段尾/章尾的总结式抒情或预告。改成未解决的动作、物件、沉默收尾。",
    },
    {
        "category": "解释腔（意味着/代表/指的是/也就是说）",
        "patterns": [r"这意味着", r"代表[^表]", r"指的是", r"也就是说", r"换句话说", r"说白了"],
        "threshold_per_kilo": 0.3,
        "advice": "解释腔是AI怕读者不懂的毛病。读者比你聪明，写出来就行，不要替读者总结。",
    },
    {
        "category": "模板化情绪标签（飘着的空情绪）",
        "patterns": [
            r"心中一凛", r"心中一紧", r"心中一惊", r"心头一紧",
            r"眼中闪过.{0,6}一丝", r"眼中闪过.{0,6}一抹",
            r"嘴角勾起.{0,6}一抹", r"嘴角微微上扬",
            r"五味杂陈", r"百感交集", r"心潮澎湃",
        ],
        "threshold_per_kilo": 0.5,
        "advice": "情绪词单独飘着没接具体动作/物件。补上此刻场景特有的具体物件，或换成动作。",
    },
    {
        "category": "那一瞬间/这一刻（时间抒情腔）",
        "patterns": [r"那一瞬间", r"那一刻", r"这一刻", r"在那一秒", r"此时此刻"],
        "threshold_per_kilo": 0.3,
        "advice": "时间抒情腔是AI制造戏剧感的廉价手段。直接写那个动作，不要标注'那一刻'。",
    },
    {
        "category": "泛指腔（某种/一种/一股）",
        "patterns": [r"某种", r"一种[^名]", r"一股[^气]"],
        "threshold_per_kilo": 1.0,
        "advice": "泛指词让描写变虚。'某种恐惧'不如'后脖颈发凉'，'一种感觉'不如直接写那个感觉本身。",
    },
]

# --- advisory 级（提示复核）---
ADVISORY_RULES = [
    {
        "category": "碎句号（电报体）",
        "patterns": [r"[。！？]\s*[\u4e00-\u9fff]{1,3}[。！？]"],  # 极短句连续
        "threshold_per_kilo": 8.0,
        "advice": "连续极短句（电报体）。长短句交替，允许单句成段但不要全是短句。",
    },
    {
        "category": "微动作复读（了下/了一下）",
        "patterns": [r"了下", r"了一下"],
        "threshold_per_kilo": 3.0,
        "advice": "「了下/了一下」高频出现会变成新模板指纹。换不同的具体化写法。",
    },
    {
        "category": "套词密度（仿佛/宛如/好似）",
        "patterns": [r"仿佛", r"宛如", r"好似", r"恍若", r"犹如"],
        "threshold_per_kilo": 2.0,
        "advice": "比喻套词聚集。单个是正常中文，密集就是AI味。换成具体物件或动作。",
    },
    {
        "category": "解释链密度（因为/所以/于是）",
        "patterns": [r"因为", r"所以", r"于是", r"因此", r"之所以"],
        "threshold_per_kilo": 4.0,
        "advice": "因果连接词过多显得像说明文。短篇靠事件推进，少用逻辑连接词。",
    },
    {
        "category": "的字过载",
        "patterns": [r"的"],
        "threshold_per_kilo": 35.0,
        "advice": "「的」字密度过高（>3.5%）。删掉多余的定语，用动词或具体名词替代。",
    },
    {
        "category": "副词堆砌（缓缓/轻轻/微微）",
        "patterns": [r"缓缓", r"轻轻", r"微微", r"淡淡", r"静静"],
        "threshold_per_kilo": 3.0,
        "advice": "程度副词堆砌。一个段落里超过一个就删，用具体动作代替。",
    },
    {
        "category": "我知道/我懂（自白腔）",
        "patterns": [r"我知道[，。]", r"我懂了", r"我明白了", r"我心里清楚"],
        "threshold_per_kilo": 1.0,
        "advice": "自白腔是AI写内心戏的偷懒。用行动证明她懂，而不是声明她懂。",
    },
    {
        "category": "程度副词堆砌（无比/十分/格外）",
        "patterns": [r"无比", r"十分", r"格外", r"异常", r"极其", r"分外"],
        "threshold_per_kilo": 1.0,
        "advice": "程度副词堆砌是AI加强语气的惯性。删掉，让具体细节自己产生强度。",
    },
    {
        "category": "仿佛/犹如/宛如（文言明喻）",
        "patterns": [r"仿佛", r"犹如", r"宛如", r"恍若"],
        "threshold_per_kilo": 1.0,
        "advice": "文言明喻在现代短篇里显假。用口语的'像'，或更好——直接写细节不要比喻。",
    },
    {
        "category": "不仅仅是/不止（递进腔）",
        "patterns": [r"不仅仅", r"不单单", r"不止是", r"不止于"],
        "threshold_per_kilo": 0.8,
        "advice": "递进腔是AI假装深刻的套路。要么删掉前半句，要么把'不止'的东西直接写出来。",
    },
]


def _get_context(text: str, pos: int, length: int = 30) -> str:
    """提取命中处的前后文。"""
    start = max(0, pos - 15)
    end = min(len(text), pos + length + 15)
    snippet = text[start:end].replace("\n", " ")
    if start > 0:
        snippet = "..." + snippet
    if end < len(text):
        snippet = snippet + "..."
    return snippet


def scan_text(text: str, whitelist_categories: List[str] = None) -> ScanReport:
    """扫描正文，返回 AI 味检测报告。

    Args:
        text: 正文文本
        whitelist_categories: 题材白名单分类列表（这些分类在本题材是卖点，降级或跳过）
    """
    whitelist_categories = whitelist_categories or []
    report = ScanReport(total_chars=len(text))
    density_stats = {}

    all_rules = [(r, "blocking") for r in BLOCKING_RULES] + \
                [(r, "advisory") for r in ADVISORY_RULES]

    for rule, level in all_rules:
        hits = []
        for pat in rule["patterns"]:
            for m in re.finditer(pat, text):
                hits.append((m.start(), m.group(0)))

        if not hits:
            continue

        density = _count_per_kilo(text, len(hits))
        density_stats[rule["category"]] = density

        # 密度未超阈值，不报（单个「仿佛」是正常中文）
        if density < rule["threshold_per_kilo"]:
            continue

        # 题材白名单：降级为 advisory 或跳过
        effective_level = level
        if rule["category"] in whitelist_categories:
            if level == "blocking":
                effective_level = "advisory"  # 降级，只提示不强制

        # 只取前 5 个命中（避免报告过长）
        for pos, matched in hits[:5]:
            report.detections.append(Detection(
                level=effective_level,
                category=rule["category"],
                pattern=matched,
                position=pos,
                context=_get_context(text, pos, len(matched)),
                advice=rule["advice"],
            ))

        if effective_level == "blocking":
            report.blocking_count += len(hits)
        else:
            report.advisory_count += len(hits)

    # 计算 AI 味分数（100=最像人写的）
    score = 100
    score -= report.blocking_count * 4
    score -= min(report.advisory_count * 2, 30)
    # 的字密度额外扣分
    de_density = density_stats.get("的字过载", 0)
    if de_density > 40:
        score -= min(int((de_density - 40)), 15)
    report.ai_taste_score = max(0, min(100, score))
    report.density_stats = density_stats

    return report
