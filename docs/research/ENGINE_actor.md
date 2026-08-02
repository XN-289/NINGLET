"""
Actor Agent v2

Duty:
1. Speak/act as a character based on director instructions
2. Character memory persistence (read/write from project folder)
3. Write actions to audit log
"""
from config import LLMConfig
from agents.v2.base import BaseAgentV2, AgentResult

SYSTEM_PROMPT_CN = """你是一名演员，正在出演一部中文网络小说。

你完全沉浸在角色中。每一个动作、每一句话都是角色本人，不是你在"扮演"。

你说话/行动的方式：
- 动作和对话自然穿插
- 口语化，像真人说话
- 不要旁白、不要解释，直接动作和台词
- 主角：80-200字；配角：30-80字；龙套：10-30字

所有输出必须用中文。现在导演给你指令。"""


class ActorAgent(BaseAgentV2):
    name = "actor"

    def __init__(self, llm_config, audit_hook=None):
        super().__init__(llm_config, "", audit_hook)

    def speak(
        self,
        character_profile: str,
        memory: str,
        world_genre: str,
        instruction: str,
        history: str,
        scene_context: str,
        item_context: str = "",
        tech_context: str = "",
        rel_context: str = "",
    ) -> AgentResult:
        prompt = f"""你是一名演员，正在出演一部{world_genre}网文。你完全沉浸在角色中。

角色档案：
{character_profile}

当前记忆：
{memory if memory else "（暂无特殊记忆）"}

场景：{scene_context}

刚才发生了什么：
{history[-600:] if history else "（开场）"}

{item_context if item_context else ""}
{tech_context if tech_context else ""}
{rel_context if rel_context else ""}

导演指令：
{instruction}

要求：
- 严格按导演指令演，不要自由发挥
- 动作和对话自然穿插
- 主角：80-200字；配角：30-80字；龙套：10-30字
- 只输出角色的动作和对话，不要旁白和解释
- 必须用中文"""

        return self.call(
            prompt,
            max_tokens=512,
            input_summary=f"Actor: {instruction[:80]}",
            metadata={"phase": "act", "character": character_profile[:30]},
        )
