"""
Director Agent v2

Duty:
1. Break chapter outline into scenes
2. Direct who speaks next in each scene
3. Write to audit log
"""
from config import LLMConfig
from agents.v2.base import BaseAgentV2, AgentResult

SYSTEM_PROMPT = """你是一名导演，正在执导一部中文网络小说。

你不是在"写"小说，你是在"导"戏。

你的工作：
- 把大纲拆成场景
- 决定每场戏谁说话/行动
- 给演员精确指令（不是模糊建议）
- 保持剧情推进

指令格式：
- "让[角色名]：[做什么、说什么、什么情绪]"
- 场景切换时写一句过渡

不要写完整对话，只给演员方向。所有输出必须用中文。"""

SYSTEM_PROMPT_CN = """You are a veteran web-novel director. Style: hard-boiled, fast-paced, conflict-driven.

Your duties:
1. Split chapters into 3-6 scenes. Each scene MUST have a clear change of location or time.
2. Control pacing. You despise characters philosophizing while danger is imminent.
3. Intervene aggressively:
   - If characters echo each other's words or metaphors, immediately assign a third person to interrupt.
   - Every dialogue turn must introduce new information or a physical change.
   - NEVER let characters simply "sigh", "ponder", or "fall into thought".

Director instruction rules:
- Each instruction must contain a concrete COMMUNICATION GOAL (probe, threaten, deceive, reveal). NEVER "share feelings".
- You do NOT dictate specific lines or actions — actors decide those themselves.
- When the scene goal is achieved, end immediately. No dragging.

Scene planning output format (use Chinese for character names and locations):
【第1场】location | atmosphere | goal
角色：character1、character2

【第2场】...

Your goal: make the reader keep reading, not make characters achieve enlightenment."""


class DirectorAgent(BaseAgentV2):
    name = "director"

    def __init__(self, llm_config, audit_hook=None):
        super().__init__(llm_config, SYSTEM_PROMPT_CN, audit_hook)

    def plan_chapter(self, chapter_outline: str, chapter_num: int, prev_summary: str = "") -> AgentResult:
        prev_section = ""
        if prev_summary:
            prev_section = f"\n{prev_summary}\n\n注意：场景设计必须承接前文，不要重复已发生的事件，不要遗忘已建立的关系和线索。\n"

        prompt = f"""把第{chapter_num}章的大纲拆成 3-6 场戏。
{prev_section}
大纲：
{chapter_outline}

要求：
- 3-6 场戏
- 每场戏包含：地点、氛围、目标
- 指定每场戏的出场角色

输出格式（必须用中文）：
【第1场】地点 | 氛围 | 目标
角色：角色名1、角色名2

【第2场】..."""
        return self.call(
            prompt,
            max_tokens=4096,
            input_summary=f"Chapter {chapter_num} scene planning",
            metadata={"phase": "plan", "chapter": chapter_num},
        )

    def decide_next_action(
        self,
        scene_context: str,
        history: str,
        character_contexts: str,
        available_characters: list,
    ) -> AgentResult:
        """通过 function calling 指派演员，确保结构化输出"""
        ASSIGN_TOOL = {
            "type": "function",
            "function": {
                "name": "assign_actor",
                "description": "指派一个角色执行下一步动作或台词",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "character": {
                            "type": "string",
                            "enum": available_characters,
                            "description": "角色姓名",
                        },
                        "instruction": {
                            "type": "string",
                            "description": "给演员的指令：做什么、说什么、什么情绪（中文，一两句话）",
                        },
                        "end_scene": {
                            "type": "boolean",
                            "description": "这个动作之后是否结束本场戏",
                        },
                    },
                    "required": ["character", "instruction"],
                },
            },
        }

        prompt = f"""一场戏正在进行中，请调用 assign_actor 函数指派下一个动作。

场景：{scene_context}
在场角色：{'、'.join(available_characters)}

已发生：
{history[-800:] if len(history) > 800 else history if history else '（开场，还没有人说话）'}

角色资料：
{character_contexts[:600]}

请调用 assign_actor 指派角色。指令要具体（动作+情绪+台词方向），不要泛泛而谈。"""

        # 用 tool calling
        result_data = {"character": "", "instruction": "", "end_scene": False}

        def executor(fn_name, fn_args):
            if fn_name == "assign_actor":
                result_data["character"] = fn_args.get("character", "")
                result_data["instruction"] = fn_args.get("instruction", "")
                result_data["end_scene"] = fn_args.get("end_scene", False)
                return f"已指派 {result_data['character']}"
            return "未知函数"

        self.call_with_tools(
            user_prompt=prompt,
            tools=[ASSIGN_TOOL],
            tool_executor=executor,
            max_tokens=512,
            max_rounds=1,
        )

        # 组装成 AgentResult，把结构化数据放在 raw 和 metadata 里
        char = result_data["character"]
        inst = result_data["instruction"]
        end = result_data["end_scene"]

        raw_text = f"让{char}：{inst}" if char else ""
        if end:
            raw_text += "【结束本场】"

        result = AgentResult(
            raw=raw_text,
            issues=[],
            checks_passed=[],
            checks_failed=[],
            metadata={"character": char, "instruction": inst, "end_scene": end, "phase": "direct"},
        )

        if self.audit_hook:
            try:
                self.audit_hook(
                    agent_name=self.name,
                    input_summary=f"Director decision: {scene_context[:50]}",
                    raw_output=raw_text,
                    result=result,
                )
            except Exception:
                pass

        return result

    def scene_transition(self, prev_scene: str, next_scene: str, chapter_num: int) -> AgentResult:
        prompt = f"""写一段场景过渡（2-3句话，最多50字）。

上一场：{prev_scene}
下一场：{next_scene}

要求：
- 2-3句话，最多50字
- 体现地点/时间变化
- 不带感情，纯叙事

只输出过渡文字，不要前缀。"""
        return self.call(
            prompt,
            max_tokens=4096,
            input_summary="Scene transition",
            metadata={"phase": "transition", "chapter": chapter_num},
        )
