"""
风格学习器 - 上传参考小说，学习写作风格

用法：
    learner = StyleLearner("projects/我的小说", llm_config)
    learner.learn_from_novel("path/to/reference_novel/")
    style_guide = learner.get_style_guide()

或者直接分析文本：
    style_guide = learner.analyze_text(text)
"""
import json
import logging
import os
import re
from dataclasses import dataclass, field, asdict
from typing import Optional

logger = logging.getLogger("style_learner")


@dataclass
class StyleGuide:
    """学到的风格指南"""
    # 基本风格
    genre: str = "玄幻"
    genre_tags: list[str] = field(default_factory=list)
    tone: str = "热血、紧凑"           # 基调
    narrative_voice: str = "第三人称"   # 叙事视角

    # 节奏
    chapter_length_avg: int = 3000     # 平均章节字数
    pacing: str = "快节奏"              # 节奏：快/中/慢
    paragraph_avg_chars: int = 30       # 段落平均字数

    # 对话
    dialogue_ratio: float = 0.45        # 对话占比
    dialogue_style: str = "短句冲突"     # 对话风格
    dialogue_length_avg: int = 20       # 平均对话长度
    dialogue_tags: list[str] = field(default_factory=list)  # 对话特征标签

    # 动作
    action_style: str = "精准短促"      # 动作描写风格
    action_length_avg: int = 15        # 动作段落平均长度

    # 心理描写
    inner_monologue: str = "几乎没有"   # 心理描写量

    # 世界观
    world_building: str = "自然带出"     # 世界观呈现方式

    # 开头结尾
    opening_pattern: str = ""           # 开头模式
    closing_pattern: str = ""            # 结尾模式
    chapter_hook: str = ""              # 章末钩子

    # 词汇
    taboo_words: list[str] = field(default_factory=list)      # 禁用词
    preferred_words: list[str] = field(default_factory=list)   # 偏好词
    hot_words: list[str] = field(default_factory=list)        # 热血词
    conflict_phrases: list[str] = field(default_factory=list)  # 冲突用词

    # 爽点模式
    climax_patterns: list[str] = field(default_factory=list)  # 高潮模式
    twist_patterns: list[str] = field(default_factory=list)   # 反转模式

    # 来源
    source_chapters: int = 0            # 分析了多少章节
    source_word_count: int = 0           # 分析了多少字

    def to_prompt(self) -> str:
        """生成喂给 LLM 写手的风格指导"""
        sections = [
            "## 风格指南（参考小说学习）",
            f"题材：{self.genre} {', '.join(self.genre_tags)}",
            f"基调：{self.tone}",
            f"叙事视角：{self.narrative_voice}",
            "",
            "## 节奏要求",
            f"- 每章目标字数：{self.chapter_length_avg}",
            f"- 段落平均字数：{self.paragraph_avg_chars}字",
            f"- 节奏：{self.pacing}",
            f"- 对话占比：约{self.dialogue_ratio:.0%}",
            "",
            "## 对话要求",
            f"- 风格：{self.dialogue_style}",
            f"- 平均长度：{self.dialogue_length_avg}字",
            f"- 特征：{', '.join(self.dialogue_tags) if self.dialogue_tags else '无特殊标签'}",
            "",
            "## 动作描写",
            f"- 风格：{self.action_style}",
            f"- 平均长度：{self.action_length_avg}字",
            "",
            "## 心理描写",
            f"- {self.inner_monologue}",
            "",
            "## 世界观呈现",
            f"- {self.world_building}",
            "",
        ]

        if self.opening_pattern:
            sections.extend(["", "## 开头模式", f"- {self.opening_pattern}"])
        if self.closing_pattern:
            sections.extend(["", "## 结尾模式", f"- {self.closing_pattern}"])
        if self.chapter_hook:
            sections.extend(["", "## 章末钩子", f"- {self.chapter_hook}"])

        if self.taboo_words:
            sections.extend(["", "## 禁用词（原文已不使用）", ", ".join(self.taboo_words)])

        if self.preferred_words:
            sections.extend(["", "## 偏好表达", ", ".join(self.preferred_words)])

        if self.conflict_phrases:
            sections.extend(["", "## 冲突用词", ", ".join(self.conflict_phrases[:10])])

        if self.climax_patterns:
            sections.extend(["", "## 高潮模式", "\n".join(f"- {p}" for p in self.climax_patterns)])

        if self.twist_patterns:
            sections.extend(["", "## 反转模式", "\n".join(f"- {p}" for p in self.twist_patterns)])

        return "\n".join(sections)

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, indent=2)


class StyleLearner:
    """
    从参考小说中学习写作风格。

    支持两种模式：
    1. 批量分析：learn_from_novel(novel_dir) - 分析整个文件夹
    2. 直接分析：analyze_text(text) - 分析给定文本
    3. 对比学习：learn_from_comparison(text1, text2) - 对比两段文本
    """

    # AI味词汇（原文不使用的词）
    TABOO_WORDS = [
        "缓缓", "淡淡", "微微", "仿佛", "宛如", "不禁",
        "暗自思忖", "涌上心头", "心中一紧", "不由自主",
        "一时间", "须臾", "眼眸中", "嘴角微扬", "轻轻点头",
        "不由得", "不由得", "只觉", "只感到", "似乎",
        "仿佛是", "犹如", "恰似", "恰如",
    ]

    def __init__(self, project_dir: str, llm_config=None):
        self.project_dir = project_dir
        self.llm_config = llm_config
        self.guide: Optional[StyleGuide] = None
        self._all_text = ""

        # 风格文件路径
        self.style_file = os.path.join(project_dir, "style_guide.md")
        self.style_json_file = os.path.join(project_dir, "style_guide.json")

    # ── 主要入口 ──────────────────────────────────────────

    def learn_from_novel(self, novel_dir: str) -> StyleGuide:
        """
        分析参考小说文件夹，生成风格指南。

        novel_dir 中的 .txt 或 .md 文件都会被分析。
        """
        files = self._scan_novel_files(novel_dir)
        if not files:
            raise ValueError(f"未找到参考小说文件: {novel_dir}")

        all_texts = []
        for fpath in files:
            with open(fpath, "r", encoding="utf-8") as f:
                content = f.read().strip()
            if content:
                all_texts.append(content)
                self._all_text += content + "\n"

        total_chars = sum(len(t) for t in all_texts)
        total_chapters = len(all_texts)
        logger.info(f"加载参考小说: {len(files)} 个文件, 共 {total_chars} 字")

        # 基础统计
        guide = self._compute_basic_stats(all_texts)

        # 用 LLM 深度分析（如果配置了 LLM）
        if self.llm_config:
            guide = self._llm_analyze(all_texts, guide)

        self.guide = guide
        self._save_guide(guide)
        return guide

    def analyze_text(self, text: str) -> StyleGuide:
        """分析给定文本，生成风格指南"""
        self._all_text = text
        guide = self._compute_basic_stats([text])

        if self.llm_config:
            guide = self._llm_analyze([text], guide)

        self.guide = guide
        self._save_guide(guide)
        return guide

    def get_style_guide(self) -> StyleGuide:
        """获取风格指南（优先加载已保存的）"""
        if self.guide:
            return self.guide

        # 尝试加载已保存的
        json_path = self.style_json_file
        if os.path.exists(json_path):
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.guide = StyleGuide(**data)
            return self.guide

        return StyleGuide()

    def load_style_guide(self) -> Optional[StyleGuide]:
        """加载已保存的风格指南"""
        if os.path.exists(self.style_json_file):
            with open(self.style_json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.guide = StyleGuide(**data)
            return self.guide
        return None

    # ── 基础统计 ──────────────────────────────────────────

    def _scan_novel_files(self, novel_dir: str) -> list[str]:
        supported = (".txt", ".md")
        files = []
        for fname in sorted(os.listdir(novel_dir)):
            if fname.endswith(supported) and not fname.startswith("."):
                fpath = os.path.join(novel_dir, fname)
                if os.path.isfile(fpath):
                    files.append(fpath)
        return files

    def _compute_basic_stats(self, texts: list[str]) -> StyleGuide:
        guide = StyleGuide()
        guide.source_chapters = len(texts)
        guide.source_word_count = sum(len(t) for t in texts)

        combined = "\n".join(texts)

        # 段落统计
        paragraphs = [p.strip() for p in combined.split("\n") if p.strip() and len(p.strip()) > 5]
        if paragraphs:
            guide.paragraph_avg_chars = int(sum(len(p) for p in paragraphs) / len(paragraphs))

        # 对话占比
        guide.dialogue_ratio = self._calc_dialogue_ratio(combined)

        # 对话长度
        guide.dialogue_length_avg = self._calc_dialogue_length(combined)

        # AI味词汇
        guide.taboo_words = self._find_taboo_words(combined)

        # 检测文风
        guide.dialogue_style = self._detect_dialogue_style(texts)
        guide.action_style = self._detect_action_style(texts)
        guide.tone = self._detect_tone(combined)
        guide.genre = self._guess_genre(combined)
        guide.opening_pattern = self._detect_opening_pattern(texts)
        guide.closing_pattern = self._detect_closing_pattern(texts)
        guide.chapter_hook = self._detect_chapter_hook(texts)
        guide.narrative_voice = self._detect_narrative_voice(combined)
        guide.world_building = self._detect_world_building(combined)
        guide.inner_monologue = self._detect_inner_monologue(combined)

        # 节奏判断
        guide.pacing = self._judge_pacing(guide.dialogue_ratio, guide.paragraph_avg_chars)

        # 章节字数
        if texts:
            guide.chapter_length_avg = int(sum(len(t) for t in texts) / len(texts))

        return guide

    def _calc_dialogue_ratio(self, text: str) -> float:
        """计算对话占比"""
        # 统计引号内字数
        quote_pairs = re.findall(r'"([^"]{5,})"|"([^"]{5,})"', text)
        dialogue_chars = sum(len(m[0] or m[1]) for m in quote_pairs)
        total = len(text) or 1
        return min(dialogue_chars / total, 0.9)

    def _calc_dialogue_length(self, text: str) -> int:
        """计算平均对话长度"""
        # 提取所有对话
        lines = re.findall(r'"([^"]{1,50})"', text)
        if not lines:
            return 20
        return int(sum(len(l) for l in lines) / len(lines))

    def _find_taboo_words(self, text: str) -> list[str]:
        """找出文本中未使用的AI味词汇"""
        found = []
        for w in self.TABOO_WORDS:
            if w in text:
                found.append(w)
        return found

    def _detect_dialogue_style(self, texts: list[str]) -> str:
        """检测对话风格"""
        combined = "\n".join(texts)
        lines = re.findall(r'"([^"]{1,50})"', combined)

        if not lines:
            return "无法判断"

        short = sum(1 for l in lines if len(l) <= 15)
        long = sum(1 for l in lines if len(l) > 25)
        total = len(lines)

        if short / total > 0.7:
            return "极短句（15字以内），冲突感强，像真人在吵架"
        elif short / total > 0.4:
            return "短句为主（15-20字），偶有长台词"
        elif long / total > 0.5:
            return "长对话偏多，可能有说教或背景交代"
        return "中等长度对话"

    def _detect_action_style(self, texts: list[str]) -> str:
        """检测动作描写风格"""
        action_lines = []
        action_pattern = r'^.{0,3}[一他她它把].{0,20}[了着]'

        for text in texts:
            for para in text.split("\n"):
                para = para.strip()
                if 5 < len(para) < 35 and re.match(action_pattern, para):
                    action_lines.append(para)

        if len(action_lines) > 5:
            avg = sum(len(l) for l in action_lines) / len(action_lines)
            if avg < 12:
                return "极短促，3-10字，精准打击式动作"
            elif avg < 25:
                return "短促，10-20字，干净利落"
            return "中等长度，有铺垫的动作描写"

        return "动作描写较少"

    def _detect_tone(self, text: str) -> str:
        hot = sum(1 for w in ["热血", "激情", "碾压", "霸道", "凶残", "疯狂", "杀意", "霸气"] if w in text)
        cool = sum(1 for w in ["冷静", "沉稳", "淡然", "冷漠", "隐忍", "低调", "深藏"] if w in text)

        if hot > cool * 1.5:
            return "热血、爽感强"
        elif cool > hot * 1.5:
            return "冷静、隐忍、慢热"
        return "热血与冷静混合"

    def _guess_genre(self, text: str) -> str:
        genre_map = {
            "玄幻": ["灵气", "筑基", "金丹", "元婴", "修士", "丹田", "经脉", "功法", "灵根"],
            "修仙": ["飞升", "渡劫", "天道", "因果", "功德", "业火", "轮回", "道祖"],
            "都市": ["总裁", "豪门", "董事长", "房价", "职场"],
            "武侠": ["江湖", "武林", "剑客", "刀客", "内力", "轻功", "掌门"],
            "科幻": ["联邦", "飞船", "AI", "基因", "量子", "废土"],
            "历史": ["皇帝", "朝堂", "科举", "县令", "将军", "王府"],
        }
        scores = {}
        for genre, keywords in genre_map.items():
            scores[genre] = sum(1 for kw in keywords if kw in text)
        return max(scores, key=scores.get) if scores else "玄幻"

    def _detect_opening_pattern(self, texts: list[str]) -> str:
        if not texts:
            return "无法判断"
        openings = []
        for text in texts[:5]:
            lines = [l.strip() for l in text.split("\n") if l.strip() and len(l.strip()) > 5]
            if lines:
                openings.append(lines[0][:40])

        dialogue_open = sum(1 for o in openings if '"' in o or '"' in o)
        if dialogue_open / len(openings) > 0.5:
            return "以对话开篇，直接进入冲突"
        return "以动作/场景开篇"

    def _detect_closing_pattern(self, texts: list[str]) -> str:
        if not texts:
            return "无法判断"
        closings = []
        for text in texts[:5]:
            lines = [l.strip() for l in text.split("\n") if l.strip() and len(l.strip()) > 5]
            if lines:
                closings.append(lines[-1][:50])

        suspense = sum(1 for c in closings if any(kw in c for kw in ["...", "——", "？", "只见", "忽然", "就在这时", "然而"]))
        if suspense / len(closings) > 0.5:
            return "悬念结尾，反转或冲突未完"
        return "以冲突或场景收尾"

    def _detect_chapter_hook(self, texts: list[str]) -> str:
        if not texts:
            return "无法判断"
        last_lines = []
        for text in texts[:5]:
            lines = [l.strip() for l in text.split("\n") if l.strip()]
            if lines:
                last_lines.append(lines[-1][:60])

        question = sum(1 for l in last_lines if "？" in l or "?" in l)
        suspense = sum(1 for l in last_lines if any(kw in l for kw in ["只见", "忽然", "却不知", "然而"]))
        cliff = sum(1 for l in last_lines if "..." in l or "——" in l)

        if question >= 2:
            return "设问式：结尾抛出问题让读者好奇"
        elif suspense >= 2:
            return "悬念式：忽然转折，意犹未尽"
        elif cliff >= 2:
            return "截断式：戛然而止，像断章"
        return "以冲突收尾"

    def _detect_narrative_voice(self, text: str) -> str:
        third = text.count("他") + text.count("她")
        first = text.count("我")
        if third > first * 2:
            return "第三人称"
        return "第三人称为主"

    def _detect_world_building(self, text: str) -> str:
        lines = text.split("\n")
        info_dump = sum(1 for l in lines if len(l.strip()) > 40 and '"' not in l and '"' not in l)
        ratio = info_dump / len(lines) if lines else 0
        if ratio < 0.15:
            return "通过对话和行动自然带出，不灌设定"
        elif ratio < 0.3:
            return "偶尔有设定介绍，大部分通过行动展现"
        return "有一定设定描写"

    def _detect_inner_monologue(self, text: str) -> str:
        mono_words = ["心中", "暗自", "不禁想", "思忖", "想着", "内心"]
        count = sum(1 for w in mono_words if w in text)
        if count < 3:
            return "几乎没有心理描写"
        elif count < 8:
            return "少量心理描写，点到为止"
        return "有一定心理描写"

    def _judge_pacing(self, dialogue_ratio: float, avg_para: int) -> str:
        if dialogue_ratio > 0.5 and avg_para < 35:
            return "极快节奏，短段落+大量对话"
        elif dialogue_ratio > 0.4:
            return "快节奏，多对话，适量动作描写"
        elif avg_para > 45:
            return "中等节奏，描写较多"
        return "快节奏，简洁有力"

    # ── LLM 深度分析 ────────────────────────────────────

    def _llm_analyze(self, texts: list[str], guide: StyleGuide) -> StyleGuide:
        """用 LLM 深度分析文风"""
        try:
            from openai import OpenAI
            client = OpenAI(
                api_key=self.llm_config.api_key,
                base_url=self.llm_config.base_url,
                timeout=self.llm_config.timeout,
            )

            # 取前3章作为样本
            sample = "\n\n".join(texts[:3])
            if len(sample) > 8000:
                sample = sample[:8000]

            prompt = f"""你是一位网文风格分析专家。请分析以下小说文本的写作风格，输出 JSON 格式。

分析维度：
1. 题材/类型（玄幻/修仙/都市等）
2. 基调（热血/冷静/混合）
3. 叙事视角（第三人称/第一人称）
4. 对话风格（短句冲突/长对话/混合）
5. 节奏（极快/快/中等）
6. 心理描写（大量/少量/几乎没有）
7. 世界观呈现（自然带出/灌设定）
8. 开头模式（对话开/动作开/场景开）
9. 结尾模式（悬念/反转/冲突收尾）
10. 禁用词（原文不使用的AI味词汇）
11. 常用表达（原文高频表达）
12. 冲突用词（原文中的冲突相关词汇）

原文样本：
{sample}

输出 JSON 格式（只输出JSON，不要其他内容）：
{{
  "genre": "...",
  "tone": "...",
  "narrative_voice": "...",
  "dialogue_style": "...",
  "dialogue_tags": ["tag1", "tag2"],
  "pacing": "...",
  "inner_monologue": "...",
  "world_building": "...",
  "opening_pattern": "...",
  "closing_pattern": "...",
  "chapter_hook": "...",
  "taboo_words": ["word1", "word2"],
  "preferred_words": ["word1", "word2"],
  "hot_words": ["word1", "word2"],
  "conflict_phrases": ["phrase1", "phrase2"],
  "climax_patterns": ["pattern1", "pattern2"],
  "twist_patterns": ["pattern1", "pattern2"]
}}"""

            response = client.chat.completions.create(
                model=self.llm_config.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_completion_tokens=2048,
            )
            result_text = response.choices[0].message.content or ""

            # 解析 JSON
            import json
            # 找 JSON
            json_match = re.search(r'\{[\s\S]*\}', result_text)
            if json_match:
                data = json.loads(json_match.group())
                for k, v in data.items():
                    if hasattr(guide, k):
                        setattr(guide, k, v)

            logger.info("LLM 风格分析完成")
        except Exception as e:
            logger.warning(f"LLM 风格分析失败: {e}，使用基础统计")

        return guide

    # ── 保存 ────────────────────────────────────────────

    def _save_guide(self, guide: StyleGuide):
        """保存风格指南"""
        # 保存 JSON
        with open(self.style_json_file, "w", encoding="utf-8") as f:
            json.dump(asdict(guide), f, ensure_ascii=False, indent=2)

        # 保存 Markdown
        lines = ["# 风格指南（参考小说学习）", ""]
        lines.append(guide.to_prompt())
        lines.append("")
        lines.append(f"---")
        lines.append(f"分析来源: {guide.source_chapters} 章节, {guide.source_word_count} 字")

        with open(self.style_file, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        logger.info(f"风格指南已保存: {self.style_json_file}")
