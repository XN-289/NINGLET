"""
五道检查关卡
1. WorldReviewer   - 世界观一致性
2. CharacterReviewer - 人物性格/行为一致性
3. PlotReviewer     - 剧情逻辑/节奏
4. ForeshadowReviewer - 伏笔管理
5. AIFlavourDetector  - AI味检测
6. QualityReviewer    - 质量终检（主决定是否重写）

每个 Reviewer 在 call() 后自动解析原始输出，填充
issues / checks_passed / checks_failed 字段，供 studio 决策。
"""
import re
from typing import List, Optional
from config import LLMConfig
from agents.v2.base import BaseAgentV2, AgentResult


# ─── 通用解析工具 ─────────────────────────────────────────────────────────────

def _extract_result_tag(raw: str) -> str:
    """从报告开头找 Result/Status 行"""
    for line in raw.split("\n"):
        line = line.strip()
        if "Result:" in line or "Score:" in line or "Status:" in line:
            m = re.search(
                r"(PASS|ISSUES? FOUND|OK|NEEDS? REWRITE|REWRITE NEEDED|"
                r"Issues Found|No issues found)",
                line, re.IGNORECASE,
            )
            if m:
                tag = m.group(1).strip()
                tag_up = tag.upper()
                if any(k in tag_up for k in ["PASS", "OK", "NO ISSUES"]):
                    return "PASS"
                if "REWRITE" in tag_up:
                    return "REWRITE"
                return "ISSUES"
    return "UNKNOWN"


def _extract_score(raw: str) -> Optional[int]:
    """提取 AI 味评分 (0-100)"""
    m = re.search(r"Score:\s*(\d+)", raw)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+)\s*/\s*100", raw)
    if m:
        return int(m.group(1))
    return None


def _extract_needs_rewrite(raw: str) -> bool:
    """从 Quality 报告判断是否需要整章重写"""
    if re.search(r"Needs Rewrite:\s*Yes", raw, re.IGNORECASE):
        return True
    m = re.search(r"Total Score:\s*([\d.]+)", raw)
    if m:
        try:
            return float(m.group(1)) < 6.0
        except ValueError:
            pass
    return False


def _parse_issue_blocks(raw: str, check_type: str, tag: str) -> tuple[List[str], List[dict]]:
    """
    解析 Markdown 格式的 Issue 列表。

    Returns: (checks_passed, issues)
    """
    if tag == "PASS":
        return [check_type], []

    checks_failed: List[str] = []
    issues: List[dict] = []

    # 收集所有 "- ..." 行作为候选问题
    issue_candidates: List[str] = []
    capture = False
    for line in raw.split("\n"):
        stripped = line.strip()
        if stripped.startswith("- ["):
            capture = True
            issue_candidates.append(stripped)
        elif capture and stripped.startswith("- ") and not stripped.startswith("- **"):
            # 继续收集 Fix 行
            issue_candidates.append(stripped)
        else:
            capture = False

    for line in issue_candidates:
        # 提取 [type] 标签
        type_tag = check_type
        m = re.search(r"\[([^\]]+)\]", line)
        if m:
            type_tag = m.group(1).strip()

        # 提取位置 (括号内内容)
        location = ""
        m = re.search(r"\(([^)]+)\)", line)
        if m:
            location = m.group(1).strip()

        # 提取 Fix/Suggestion
        fix = ""
        for fm in re.finditer(r"(?:Fix|Suggestion|Changed to):\s*(.+?)(?=\n|$)", line, re.IGNORECASE):
            fix = fm.group(1).strip()

        # 提取正文（去掉 [xxx] 标签和 Fix: 部分）
        body = re.sub(r"^\s*[-*]\s*", "", line).strip()
        body = re.sub(r"^\[[^\]]+\]\s*", "", body)
        body = re.sub(r"\s*(?:Fix|Suggestion|Changed to):\s*.+", "", body, flags=re.IGNORECASE)
        body = body.rstrip(".-").strip()

        if body:
            issues.append({
                "type": type_tag,
                "location": location,
                "problem": body,
                "suggestion": fix,
            })
            checks_failed.append(type_tag)

    return checks_failed, issues


def parse_review_output(raw: str, check_type: str) -> tuple[List[str], List[str], List[dict]]:
    """
    通用解析入口。

    Returns:
        checks_passed: 通过的检查项
        checks_failed: 未通过的检查项
        issues: 问题列表
    """
    if not raw or raw.startswith("[ERROR]"):
        return [], [check_type], [{
            "type": check_type,
            "location": "整章",
            "problem": f"检查失败：{raw[:100]}",
            "suggestion": "跳过此检查项",
        }]

    tag = _extract_result_tag(raw)

    if tag == "PASS":
        return [check_type], [], []

    if tag == "REWRITE":
        return [], [check_type], [{
            "type": check_type,
            "location": "整章",
            "problem": "质量不达标，需要整章重写",
            "suggestion": "根据前述所有问题，重新生成章节",
        }]

    # Quality 特殊判断：即使没有 Result 标签，也从总分和 Needs Rewrite 判定
    if check_type == "quality_reviewer":
        if _extract_needs_rewrite(raw):
            return [], [check_type], [{
                "type": check_type,
                "location": "整章",
                "problem": "质量不达标，需要整章重写",
                "suggestion": "根据前述所有问题，重新生成章节",
            }]
        score = _extract_score(raw)
        if score is not None and score >= 7.0:
            return [check_type], [], []

    checks_failed, issues = _parse_issue_blocks(raw, check_type, tag)
    return [], checks_failed, issues


def parse_ai_flavour_output(raw: str) -> tuple[List[str], List[str], List[dict]]:
    """解析 AI 味检测报告"""
    score = _extract_score(raw)
    if score is None:
        return [], ["ai_flavour"], [{
            "type": "ai_flavour",
            "location": "整章",
            "problem": "无法解析 AI 味评分",
            "suggestion": "检查报告格式",
        }]

    if score <= 40:
        return ["ai_flavour"], [], []

    # 提取 AI pattern 行
    issues: List[dict] = []
    for line in raw.split("\n"):
        stripped = line.strip()
        if stripped.startswith("- "):
            body = re.sub(r"^\s*[-*]\s*", "", stripped).strip()
            body = re.sub(r"^\[[^\]]+\]\s*", "", body)
            body = re.sub(r"\s*Changed to:\s*.+", "", body, flags=re.IGNORECASE)
            body = body.rstrip(".-").strip()
            if body:
                issues.append({
                    "type": "ai_flavour",
                    "location": "整章",
                    "problem": f"AI味严重 (Score {score}/100)：{body}",
                    "suggestion": "",
                })

    return [], ["ai_flavour"], issues


# ─── Reviewer Mixin ────────────────────────────────────────────────────────────
# 让所有审查器共享 call() 的自动解析逻辑


class ReviewerMixin:
    """
    Mixin：所有审查器在 call() 后自动解析原始输出，
    填充 AgentResult.issues / checks_passed / checks_failed。

    子类必须定义 self.name（审查类型名）。
    """

    def call(self, *args, **kwargs) -> AgentResult:
        # 先调父类拿原始结果
        result: AgentResult = super().call(*args, **kwargs)

        # 根据审查类型选择解析函数
        check_type = getattr(self, "name", "unknown")
        if check_type == "ai_flavour_detector":
            cp, cf, iss = parse_ai_flavour_output(result.raw)
        else:
            cp, cf, iss = parse_review_output(result.raw, check_type)

        result.checks_passed = cp
        result.checks_failed = cf
        result.issues = iss

        # 把评分写 metadata
        score = _extract_score(result.raw)
        if score is not None:
            result.metadata["score"] = score

        # Quality 决定是否重写
        if check_type == "quality_reviewer":
            result.metadata["needs_rewrite"] = _extract_needs_rewrite(result.raw)

        return result


# ─── 1. World Reviewer ────────────────────────────────────────────────────────

WORLD_SYSTEM = """You are a world-consistency reviewer. Check the novel for contradictions in:
1. Geography/locations vs established world setting
2. Power systems (cultivation/martial arts) consistency
3. Social rules (sect rules, currency, ranks)
4. Timeline logic
5. General plot holes

When you find problems:
- Point to exact location (which paragraph/scene)
- Explain what is inconsistent
- Give fix suggestions

If everything is fine, output "PASS: no issues found"."""

WORLD_REVIEW_PROMPT = """Review this chapter for world-consistency:

[Chapter Text]
{chapter_text}

[World Setting]
{world_setting}

Check:
1. Are locations consistent with the world?
2. Are power systems (cultivation/artifacts/techniques) consistent?
3. Are social rules consistent?
4. Is the logic sound?

Output format:
## World Consistency Review
### Result: PASS / ISSUES FOUND
### Issues (if any)
- [Power System] description (location: ...)
  Fix: ...
### Notes"""

class WorldReviewer(ReviewerMixin, BaseAgentV2):
    name = "world_reviewer"

    def __init__(self, llm_config, audit_hook=None):
        super().__init__(llm_config, WORLD_SYSTEM, audit_hook)

    def review(self, chapter_text: str, world_setting: str) -> AgentResult:
        prompt = WORLD_REVIEW_PROMPT.format(
            chapter_text=chapter_text,
            world_setting=world_setting[:3000],
        )
        return self.call(
            prompt,
            max_tokens=2048,
            input_summary="World consistency check",
            metadata={"phase": "review", "check_type": "world"},
        )


# ─── 2. Character Reviewer ────────────────────────────────────────────────────

CHAR_SYSTEM = """You are a character-consistency reviewer. Check if character behavior matches their established profiles.

Check:
1. Character behavior matches personality?
2. Dialogue style matches character?
3. Motivations are reasonable?
4. Relationship interactions are logical?

When you find problems:
- Name the character and the specific behavior
- Explain the inconsistency
- Give fix suggestions"""

CHAR_REVIEW_PROMPT = """Review this chapter for character consistency:

[Chapter Text]
{chapter_text}

[Character Profiles]
{characters}

[Relationship History]
{relationship_history}

Check:
1. Does behavior match personality?
2. Does dialogue style match character?
3. Are motivations reasonable?
4. Are relationship interactions logical?

Output format:
## Character Review
### Result: PASS / ISSUES FOUND
### Issues (if any)
- [character] description (location: ...)
  Fix: ...
### Notes"""

class CharacterReviewer(ReviewerMixin, BaseAgentV2):
    name = "character_reviewer"

    def __init__(self, llm_config, audit_hook=None):
        super().__init__(llm_config, CHAR_SYSTEM, audit_hook)

    def review(
        self,
        chapter_text: str,
        characters: str,
        relationship_history: str = "",
    ) -> AgentResult:
        prompt = CHAR_REVIEW_PROMPT.format(
            chapter_text=chapter_text,
            characters=characters[:3000],
            relationship_history=relationship_history[:1000] if relationship_history else "No additional background",
        )
        return self.call(
            prompt,
            max_tokens=2048,
            input_summary="Character consistency check",
            metadata={"phase": "review", "check_type": "character"},
        )


# ─── 3. Plot Reviewer ─────────────────────────────────────────────────────────

PLOT_SYSTEM = """You are a plot-architecture reviewer. Check the logic, pacing and conflict design of the story.

Check:
1. Logic chain: does Event A lead naturally to Event B?
2. Pacing: too slow or too fast? Any padding?
3. Conflict design: are there enough conflicts driving the plot?
4. Suspense hooks: does the ending leave effective hooks?
5. Information delivery: is enough context provided?

When you find problems:
- Point to exact location
- Explain why logic fails or pacing is off
- Give fix suggestions"""

PLOT_REVIEW_PROMPT = """Review this chapter's plot architecture:

[Chapter Text]
{chapter_text}

[Chapter Outline]
{chapter_outline}

[Previous Summary]
{previous_summary}

Check:
1. Is the logic sound?
2. Is pacing appropriate?
3. Is conflict driving the plot?
4. Are suspense hooks effective?
5. Is information density appropriate?

Output format:
## Plot Architecture Review
### Result: PASS / ISSUES FOUND
### Issues (if any)
- Description (location: ...)
  Fix: ...
### Notes"""

class PlotReviewer(ReviewerMixin, BaseAgentV2):
    name = "plot_reviewer"

    def __init__(self, llm_config, audit_hook=None):
        super().__init__(llm_config, PLOT_SYSTEM, audit_hook)

    def review(
        self,
        chapter_text: str,
        chapter_outline: str,
        previous_summary: str = "",
    ) -> AgentResult:
        prompt = PLOT_REVIEW_PROMPT.format(
            chapter_text=chapter_text,
            chapter_outline=chapter_outline[:1500],
            previous_summary=previous_summary[:800] if previous_summary else "Chapter 1, no previous context",
        )
        return self.call(
            prompt,
            max_tokens=2048,
            input_summary="Plot architecture check",
            metadata={"phase": "review", "check_type": "plot"},
        )


# ─── 4. Foreshadow Reviewer ───────────────────────────────────────────────────

FORESHADOW_SYSTEM = """You are a foreshadowing manager. Check if foreshadowing is properly planted and revealed.

Check:
1. Did this chapter plant foreshadowing as planned?
2. Did previously planted foreshadowing get revealed at the right time?
3. Are major events connected to earlier foreshadowing?
4. Are enough hooks left for readers to continue?"""

FORESHADOW_PROMPT = """Review this chapter's foreshadowing management:

[Chapter Text]
{chapter_text}

[Chapter Outline]
{foreshadow_plan}

[Buried Foreshadowing]
{buried_str}

[Revealed Foreshadowing]
{revealed_str}

Check:
1. Did this chapter plant planned foreshadowing?
2. Did earlier foreshadowing get revealed at the right time?
3. Are there any foreshadowing that should have been revealed?

Output format:
## Foreshadowing Review
### Result: OK / ISSUES FOUND
### Foreshadowing Status
- [name] PLANTED / NOT PLANTED / PENDING (Chapter X)
  Note: ...
### Issues (if any)
...
### Notes"""

class ForeshadowReviewer(ReviewerMixin, BaseAgentV2):
    name = "foreshadow_reviewer"

    def __init__(self, llm_config, audit_hook=None):
        super().__init__(llm_config, FORESHADOW_SYSTEM, audit_hook)

    def review(
        self,
        chapter_text: str,
        chapter_num: int,
        foreshadow_plan: str,
        foreshadow_buried: dict = None,
        foreshadow_revealed: dict = None,
    ) -> AgentResult:
        buried_str = "\n".join(
            f"Chapter {k} planted: {', '.join(v)}" for k, v in (foreshadow_buried or {}).items()
        )
        revealed_str = "\n".join(
            f"Chapter {k} revealed: {', '.join(v)}" for k, v in (foreshadow_revealed or {}).items()
        )
        prompt = FORESHADOW_PROMPT.format(
            chapter_text=chapter_text,
            foreshadow_plan=foreshadow_plan[:2000],
            buried_str=buried_str or "(no tracking data)",
            revealed_str=revealed_str or "(no revealed yet)",
        )
        return self.call(
            prompt,
            max_tokens=2048,
            input_summary=f"Foreshadowing check (Chapter {chapter_num})",
            metadata={"phase": "review", "check_type": "foreshadow", "chapter": chapter_num},
        )


# ─── 5. AI Flavour Detector ──────────────────────────────────────────────────

AIFLAVOUR_SYSTEM = """You are an AI-flavor detector. Find artificial intelligence writing patterns in text.

AI-pattern indicators:
- Overused degree adverbs: "不禁", "缓缓", "淡淡", "微微", "仿佛", "宛如"
- Excessive emotion descriptions: "心中一紧", "眼中闪过", "嘴角上扬", "眉头紧锁"
- Mechanical sentence structure: similar length, similar structure
- Adjective piling: 3+ adjectives modifying one noun
- Robotic transitions: "然而", "于是", "因此", "与此同时", "紧接着"
- Formulaic openings: setting description -> sudden event -> protagonist reaction -> face-slapping
- "Fact ledger" prose: sentences that only record actions/events with no consciousness, judgment, or hesitation behind them. This is the deepest AI tell — even when sentence lengths vary and paragraphs breathe, if every sentence is a clean objective fact with no person feeling/judging/doubting behind it, it reads like surveillance footage. REAL HUMAN WRITING HAS UNCERTAINTY: memory is fuzzy, perception is ambiguous, judgment wavers. Words like "大概/也许/我隐约记得/我说不清为什么/越想越糊涂" are NOT filler — they are honesty. Cold precise facts should be scarce, reserved only for hammer-blow revelations.
- Lazy psychological summary IS an AI tell: "他心想：这件事不简单" / "她感到一阵恐惧" — author jumping out to hand reader a conclusion. Flag this.
- BUT soft fuzzy wavering inner activity is NOT an AI tell — it is the opposite. "我越想越糊涂" / "我说不上来哪儿不对" show a real person struggling and must NOT be flagged. Do NOT penalize inner monologue merely for being inner monologue; penalize only when it is a tidy conclusion instead of genuine confusion.

Scoring (0-100):
- 0-20: almost no AI-flavor, reads like a real person
- 21-40: slight AI-flavor, minor traces
- 41-60: obvious AI-flavor, multiple AI-pattern words
- 61-80: severe AI-flavor, many AI-patterns
- 81-100: almost entirely AI-flavor

If score > 40, give specific fix suggestions and quote the original text."""

AIFLAVOUR_REVIEW_PROMPT = """Detect AI-flavor in this chapter:

[Text]
{chapter_text}

Please:
1. Give AI-flavor score (0-100)
2. Point out specific AI-pattern words/phrases
3. Give specific fix suggestions (quote the original and show what to change to)

Output format:
## AI Flavor Detection
### Score: __/100
### AI Patterns Found
- Degree adverbs: ...
- Emotion descriptions: ...
- Sentence patterns: ...
- Other: ...
### Fix Suggestions
Original: "..."
Changed to: "..."
### Notes"""

class AIFlavourDetector(ReviewerMixin, BaseAgentV2):
    name = "ai_flavour_detector"

    def __init__(self, llm_config, audit_hook=None):
        super().__init__(llm_config, AIFLAVOUR_SYSTEM, audit_hook)

    def detect(self, chapter_text: str) -> AgentResult:
        prompt = AIFLAVOUR_REVIEW_PROMPT.format(chapter_text=chapter_text)
        return self.call(
            prompt,
            max_tokens=2048,
            input_summary="AI flavor detection",
            metadata={"phase": "review", "check_type": "ai_flavour"},
        )


# ─── 6. Quality Reviewer ──────────────────────────────────────────────────────

QUALITY_SYSTEM = """You are the final quality reviewer. Give each chapter an overall quality assessment.

Scoring (1-10 each):
1. Narrative appeal (highest weight) - will readers keep reading?
2. Excitement density - face-slapping/reversal/opportunities, at least one?
3. Pacing control - good slow-fast alternation?
4. Character development - memorable characters?
5. Dialogue quality - do characters sound like real people?
6. Emotional impact - does it move readers?

Total = weighted average. Thresholds:
- >= 7.0: Excellent, no changes needed
- 6.0-6.9: Good, minor changes optional
- 5.0-5.9: Average, improvements recommended
- < 5.0: Poor, rewrite needed

Be specific about which paragraphs need work. Do not be vague."""

QUALITY_REVIEW_PROMPT = """Final quality assessment of this chapter:

[Text]
{chapter_text}

[Chapter Outline]
{chapter_outline}

Score each (1-10):
1. Narrative Appeal (highest weight) _/10
2. Excitement Density _/10
3. Pacing Control _/10
4. Character Development _/10
5. Dialogue Quality _/10
6. Emotional Impact _/10

Total Score: _/10

Strengths: (be specific about which paragraphs)

Improvement Suggestions: (2-3 areas, specific paragraphs + fix direction)

Needs Rewrite: Yes/No"""

class QualityReviewer(ReviewerMixin, BaseAgentV2):
    name = "quality_reviewer"

    def __init__(self, llm_config, audit_hook=None):
        super().__init__(llm_config, QUALITY_SYSTEM, audit_hook)

    def evaluate(self, chapter_text: str, chapter_outline: str = "") -> AgentResult:
        prompt = QUALITY_REVIEW_PROMPT.format(
            chapter_text=chapter_text,
            chapter_outline=chapter_outline[:1000],
        )
        return self.call(
            prompt,
            max_tokens=2048,
            input_summary="Quality final review",
            metadata={"phase": "review", "check_type": "quality"},
        )
