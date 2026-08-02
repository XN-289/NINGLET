"""
Short Story Module - 短篇模式核心引擎

把 NINGLET 从「10万字长篇专用」改造为「短篇优先 + 长篇兼容」。
核心：提示词工程 + 字数路由阈值 + 情绪烈度派去AI味。

长短篇范式差异：
- 长篇靠设定一致+节奏+伏笔回收留人；短篇靠单一情绪一次命中。
- 长篇去AI味用克制留白派(Show Don't Tell)；短篇用情绪烈度派(直白烈情绪+具体物件)。
- 长篇用 rolling_window 逐章生成；短篇用 full_preplan 全部节拍一次性规划。

来源：SHORT_STORY_RESEARCH.md 1-7节
"""

from dataclasses import dataclass
from typing import List, Dict, Optional


# 字数路由阈值（来自 oh-story story-short-analyze 硬阈值）
SHORT_MIN_WORDS = 6000
SHORT_MAX_WORDS = 50000
SHORT_SWEET_MIN = 20000
SHORT_SWEET_MAX = 30000
SINGLE_STREAM_MAX = 12000


@dataclass
class ShortStoryPlan:
    project_type: str = "short"
    channel: str = "female"
    genre: str = ""
    platform: str = "tomato"
    target_words: int = 25000
    mode: str = "single_stream"
    section_count: int = 1
    section_words: int = 25000

    def to_dict(self) -> dict:
        return self.__dict__.copy()


def route_short_story(target_words: int) -> Dict:
    """字数路由：根据目标字数决定生成模式。"""
    if target_words < SHORT_MIN_WORDS:
        return {
            "recommend_pipeline": "single_stream",
            "mode": "single_stream",
            "section_count": 1,
            "section_words": max(target_words, 3000),
            "message": "字数偏短，建议单篇流式一次生成。",
        }
    if target_words <= SINGLE_STREAM_MAX:
        return {
            "recommend_pipeline": "single_stream",
            "mode": "single_stream",
            "section_count": 1,
            "section_words": target_words,
            "message": "走单篇流式（一次生成全文）。",
        }
    if target_words <= SHORT_MAX_WORDS:
        base = 1500
        section_count = max(2, (target_words + base - 1) // base)
        section_words = target_words // section_count
        sweet = SHORT_SWEET_MIN <= target_words <= SHORT_SWEET_MAX
        msg = "走多节预规划（%d 节，每节约 %d 字）。" % (section_count, section_words)
        if sweet:
            msg += "位于短篇甜区（2-3万），按短篇全预规划处理最稳。"
        return {
            "recommend_pipeline": "multi_section",
            "mode": "multi_section",
            "section_count": section_count,
            "section_words": section_words,
            "message": msg,
        }
    return {
        "recommend_pipeline": "long",
        "mode": "long",
        "section_count": 0,
        "section_words": 0,
        "message": "超过短篇上限，建议切换长篇模式。",
    }


# 题材库：男频3公式 + 女频10题材
GENRE_LIBRARY = {
    # ==================== 男频（番茄短篇 / 飞卢） ====================
    "male_face_slap": {
        "name": "扮猪吃虎打脸流（男频）",
        "channel": "male",
        "formula": "压迫 - 隐忍 - 掉马 - 碾压 - 后悔",
        "core_emotion": "爽感释放（打脸反转）",
        "style": "节奏极快，短句为主，每节自洽有爽点。",
        "open_hook": "前3行直接抛入死亡/背叛/侮辱（如：解剖刀划开尸体胃袋，我看见女儿的学生证），禁止写景/心理独白。",
        "skeleton": [
            "第1节：绝境切入——主角当众受辱/被夺宝/被退婚，给出具体羞辱场景",
            "第2-3节：隐忍蓄力——主角低调中展露一线实力，反派浑然不知继续作死",
            "第4节：首次掉马——露出冰山一角（身份/实力/靠山），反派开始慌",
            "第5-6节：全面碾压——真实身份揭晓，当众打脸，反派跪求饶",
            "末节：漠视离场——主角不屑一顾扬长而去，围观者震惊议论收尾",
        ],
        "anti_ai_whitelist": "枚举式爽点（第七次羞辱、第九十九次背叛）是卖点不是AI味；亮底牌前瞻（先告诉读者反派要倒霉）增强爽感。",
    },
    "male_god_system": {
        "name": "神豪异能崛起流（男频）",
        "channel": "male",
        "formula": "被欺压 - 开挂 - 碾压 - 逆天改命",
        "core_emotion": "逆袭爽感",
        "style": "系统必须有代价，主角付出什么换来爽点（交换感）。",
        "open_hook": "前500字金手指上线（如：手机弹出「余额已到账1000万，每次消费返现十倍」），第一章末释放第一次小爽+钩子。",
        "skeleton": [
            "第1节：被欺压的绝境——欠债/被甩/被开除的具体场景，系统觉醒",
            "第2节：系统规则+代价——冷却/消耗/副作用明确（不是无脑变强）",
            "第3节：首次使用——付出代价换来第一次翻身，小爽点",
            "第4-5节：连续碾压——用系统解决一系列之前的麻烦，反派逐个跪",
            "末节：逆天改命——站在高处回望，但暗示新的更大代价（钩子）",
        ],
        "anti_ai_whitelist": "系统数值/金额的具体数字（返现327万、冷却24小时）是卖点；亮数值对比（从负债50万到账户1.2亿）增强冲击。",
    },
    "male_xianxia": {
        "name": "仙侠逆袭热血流（男频）",
        "channel": "male",
        "formula": "被嘲讽 - 奇遇 - 修炼 - 碾压 - 逆天改命",
        "core_emotion": "热血爽感",
        "style": "战斗用短句密集描写，修炼突破要有代价与交换。",
        "open_hook": "开局被羞辱/退婚/夺宝（如：宗门大比上被当众宣布废除修为），奇遇在第一节内触发。",
        "skeleton": [
            "第1节：受辱——宗门/家族中当众被贬，给出具体的羞辱台词",
            "第2节：奇遇——秘境/残卷/老者传功，获得逆天机缘",
            "第3-4节：修炼突破——付出代价（走火入魔/寿元消耗），实力暴涨",
            "第5节：反杀——大比/战场上碾压之前羞辱自己的人",
            "末节：更大的势力出现——这只是开始（钩子）",
        ],
        "anti_ai_whitelist": "修为境界/招式名的具体罗列是卖点；战斗中的力量数值对比（从炼气三层到金丹初期）增强爽感。",
    },
    # ==================== 女频（知乎盐选 / 黑岩 / 番茄） ====================
    "female_chase_wife": {
        "name": "追妻火葬场（女频）",
        "channel": "female",
        "formula": "建压40% - 爆点35% - 落定25%",
        "core_emotion": "虐恋反转爽感",
        "style": "情绪烈度派，直白写情绪词但必须接此刻场景特有的具体动作/物件。",
        "open_hook": "开篇即离婚/决裂的具体瞬间（如：签字时笔尖顿了一下，墨水洇湿了「协议」两个字），不要回忆铺垫。",
        "skeleton": [
            "第1节：决裂瞬间——不是回忆，是正在发生的离婚/搬走/撞破场景",
            "第2-3节：建压——丈夫的冷暴力具体事件（不是概述，是具体的一句话/一个动作）",
            "第4节：心死定格——一句独立成段的心死宣告（如：我不再等他了），做宣泄到反击的切换枢纽",
            "第5-6节：反击升级——妻子新生活+丈夫开始后悔+妻子拒绝（至少拒两次）",
            "第7节：底牌揭晓——信息差释放（妻子早已知道某事），全场逆转",
            "末节：漠视离场——丈夫社死或妻子头也不回，不写大团圆和解",
        ],
        "anti_ai_whitelist": "快意剧透/亮底牌前瞻（先告诉读者丈夫要倒霉）是卖点；丈夫视角的悔恨独白比妻子视角的坚强更有冲击，不要怕写男主后悔。",
        "rule": "前期虐越狠后期越爽；妻子至少被拒两次；禁大团圆强行和解。",
    },
    "female_rebirth_revenge": {
        "name": "重生复仇（女频）",
        "channel": "female",
        "formula": "建压35% - 爆点40% - 落定25%",
        "core_emotion": "复仇爽感",
        "style": "情绪烈度派，重生前的痛苦要足够刻骨。",
        "open_hook": "重生瞬间+前世死因（如：再次睁开眼，我回到了被推下楼梯的那天早上——前世的我，就是这么从三楼滚下去的）。",
        "skeleton": [
            "第1节：重生节点——明确前世怎么死的（具体场景），睁眼回到关键节点",
            "第2-3节：信息差优势——利用前世记忆避开第一个陷阱，小试牛刀",
            "第4节：仇人入局——前世的仇人再次出现，但这次主角已先手",
            "第5-6节：连环打脸——逐个清算（第七次、第九十九次背叛的仇），每步有物证/人证翻盘",
            "第7节：真相揭露——当众揭穿仇人的真面目",
            "末节：复仇后的空虚或新生活——不为复仇而活，转身离开",
        ],
        "anti_ai_whitelist": "次数/金额的逐项枚举（第三次下毒、第五次栽赃）是卖点；前世闪回的具体细节（那条毒蛇的样子、那杯茶的温度）不是啰嗦是刻骨。",
    },
    "female_secret_rich": {
        "name": "隐藏身份掉马（女频）",
        "channel": "female",
        "formula": "误解建压 - 身份线索 - 掉马反转 - 打脸",
        "core_emotion": "身份反转爽感",
        "style": "情绪烈度派，掉马瞬间要用具体物件引爆。",
        "open_hook": "被轻视的具体瞬间（如：婆婆把两万块的红包甩我脸上，不知道我名下的公司刚给她儿子发了offer）。",
        "skeleton": [
            "第1节：被轻视——给出具体的羞辱场景（不是概述）",
            "第2-3节：身份线索——不经意的细节（车牌/助理来电/签名），反派没注意",
            "第4节：小掉马——露出冰山一角，某个人物认出主角",
            "第5-6节：全面掉马——当众身份揭晓，用具体物件引爆（名片/股权书/电话）",
            "末节：反派社死——之前羞辱过的人集体震惊，主角漠视离场",
        ],
        "anti_ai_whitelist": "身份信息的逐步透露（先是车牌、再是公司名、最后是家族）是悬念手法不是啰嗦；围观者的具体反应（某个人腿软了）增强爽感。",
    },
    "female_sweet_pet": {
        "name": "甜宠日常（女频·先虐后甜）",
        "channel": "female",
        "formula": "误会/错过 - 暧昧升温 - 表白 - 甜蜜日常",
        "core_emotion": "心动治愈感（甜必须建立在先虐够之上）",
        "style": "情绪烈度派，心动用具体生理反应（耳朵红/手心出汗），禁泛泛的「好甜」。",
        "open_hook": "误会的具体瞬间（如：他以为我和别人在一起，转身就走，我没来得及解释手里的两杯奶茶）。",
        "skeleton": [
            "第1-2节：误会或身份差——具体的隔阂场景，不是概述",
            "第3-4节：暧昧升温——用具体小动作（递东西时指尖碰到、替对方挡风）",
            "第5节：关键事件打破隔阂——生病/危机/告白，双向奔赴",
            "末节：甜蜜日常——确认关系后的高甜细节（早餐/晚安/小习惯）",
        ],
        "anti_ai_whitelist": "甜宠里适度的心动生理描写（心跳加速、脸红到耳根）是卖点不是AI味；但禁连续堆砌「好甜好幸福」这种空情绪。",
    },
    "female_suspense_love": {
        "name": "悬疑言情（女频）",
        "channel": "female",
        "formula": "谜团抛出 - 抽丝剥茧 - 真相反转 - 情感落定",
        "core_emotion": "细思极恐+虐恋",
        "style": "情绪烈度派，恐惧用具体感官（后颈发凉/胃部抽紧）。",
        "open_hook": "异常事件（如：搬进新家第一天，墙里传来敲击声——三长两短，是求救的节奏）。",
        "skeleton": [
            "第1节：谜团——具体的异常（不是「很诡异」，是具体的声音/物件/现象）",
            "第2-3节：调查——主角发现线索，每条线索指向不同的人",
            "第4节：误导——最像凶手的人其实是被陷害的",
            "第5-6节：真相反转——真相颠覆认知（不可靠叙述者/主角自己就是凶手/受害者其实没死）",
            "末节：选择——真相后的道德困境或代价",
        ],
        "anti_ai_whitelist": "线索的逐条罗列（第一条、第二条、第三条证据）是悬念手法；不可靠叙述者的伏笔埋设不是BUG是技巧。",
    },
    "female_rebirth_remedy": {
        "name": "重生弥补遗憾（女频）",
        "channel": "female",
        "formula": "重生 - 避坑 - 弥补 - 新结局",
        "core_emotion": "弥补治愈感",
        "style": "情绪烈度派，遗憾的痛要用具体物件触发（那条围巾/那班车/那句没说出口的话）。",
        "open_hook": "重生回到遗憾发生的瞬间（如：回到他问我「你愿不愿意」的那天，这次我没有沉默）。",
        "skeleton": [
            "第1节：重生节点——回到哪个遗憾瞬间，前世错过了什么（具体）",
            "第2-3节：避开第一个坑——这次做出不同选择，小改变",
            "第4节：弥补——去找那个前世错过的人/说没说的话/做没做的事",
            "第5节：蝴蝶效应——改变带来连锁反应，有好的也有新的麻烦",
            "末节：新结局——和前世完全不同的走向，释怀",
        ],
        "anti_ai_whitelist": "前世遗憾的具象闪回（那碗没喝完的汤、那趟没赶上的车）是情感锚点不是啰嗦。",
    },
    "female_double_faced": {
        "name": "双面人生/替身（女频）",
        "channel": "female",
        "formula": "身份替换 - 破绽累积 - 真相暴露 - 选择",
        "core_emotion": "身份撕裂感",
        "style": "情绪烈度派，撕裂感用具体动作（摘下假发/换掉口红色号/删掉那个手机号）。",
        "open_hook": "双面的具体冲突（如：白天我是他温顺的妻子，晚上他打电话找的那个女人，就是我）。",
        "skeleton": [
            "第1节：双面日常——白天一个身份、晚上一个身份的具体对照",
            "第2-3节：破绽累积——小细节差点暴露（同一个习惯/同一处伤疤）",
            "第4节：有人起疑——某个角色开始调查",
            "第5-6节：真相暴露——最不想被发现的人发现了",
            "末节：选择——做回哪个身份，代价是什么",
        ],
        "anti_ai_whitelist": "双面生活的具体对照细节（白天喝美式、晚上点拿铁）是人物刻画不是啰嗦。",
    },
    "female_campus_youth": {
        "name": "校园青春（女频）",
        "channel": "female",
        "formula": "初遇 - 暗恋/误会 - 表白 - 成长",
        "core_emotion": "青春共鸣+心动",
        "style": "情绪烈度派，心动用校园特有场景（传纸条/操场跑道/广播站点歌）。",
        "open_hook": "初遇的尴尬/意外（如：我传的纸条飞到了他桌上，上面写着「前排那个男生好帅」）。",
        "skeleton": [
            "第1节：初遇——具体的尴尬/意外场景",
            "第2-3节：暗恋——校园日常中的暗恋细节（偷看/故意路过/对答案）",
            "第4节：误会——某个事件造成误解，疏远",
            "第5节：关键事件——考试/毕业/意外，推动表白",
            "末节：成长——多年后回望，或在了一起",
        ],
        "anti_ai_whitelist": "校园物件的具体使用（校服第二颗扣子、广播站、晚自习）是青春感来源不是堆砌。",
    },
    "female_workplace": {
        "name": "职场逆袭（女频）",
        "channel": "female",
        "formula": "被打压 - 觉醒 - 反击 - 站稳",
        "core_emotion": "职场爽感",
        "style": "情绪烈度派，爽感用具体职场物件（撤回的邮件/打错的报表/会议室投屏）。",
        "open_hook": "被打压的具体瞬间（如：同事抢了我的方案当众汇报，PPT上还留着我名字的水印）。",
        "skeleton": [
            "第1节：被打压——具体的职场打压事件（抢功劳/甩锅/穿小鞋）",
            "第2-3节：觉醒——不再忍气吞声，开始收集证据/提升能力",
            "第4节：反击机会——关键项目/汇报/客户，有了翻盘的舞台",
            "第5-6节：当众反击——用证据/实力打脸，反派社死",
            "末节：站稳——获得认可或跳槽更好的去处",
        ],
        "anti_ai_whitelist": "职场细节的真实感（PPT页脚、邮件抄送名单、周报数据）是质感来源；具体的职场术语（OKR、对齐、复盘）用对了是加分。",
    },
    "female_healing": {
        "name": "治愈救赎（女频）",
        "channel": "female",
        "formula": "破碎相遇 - 互相治愈 - 重建 - 温暖",
        "core_emotion": "治愈共鸣",
        "style": "情绪烈度派，温暖用具体感官（一碗热汤/盖上的毯子/窗台上的多肉）。",
        "open_hook": "破碎相遇（如：凌晨三点的便利店，我买了最后一盒关东煮，转身撞上了同样眼睛红肿的他）。",
        "skeleton": [
            "第1节：破碎相遇——两个有创伤的人的具体相遇场景",
            "第2-3节：试探靠近——不经意的关心（留一盏灯/多买一份早餐）",
            "第4节：互相治愈——对方的创伤被触碰到，开始面对",
            "第5节：关键救赎——一方为另一方做出了重要的陪伴/牺牲",
            "末节：重建——创伤不是消失，而是有了一起带着伤活下去的勇气",
        ],
        "anti_ai_whitelist": "创伤要具体（不是「她很惨」而是具体事件）；治愈靠陪伴细节不是靠说教。",
    },
    # ==================== 新增时兴题材（2025-2026 爆款增长点） ====================
    "female_rule_horror": {
        "name": "规则怪谈（女频·强势上升）",
        "channel": "female",
        "formula": "规则抛出 - 试探边界 - 违规危机 - 破解真相",
        "core_emotion": "细思极恐+求生爽感",
        "style": "情绪烈度派，恐惧用错位的感官（以为是热的，其实是凉的）。",
        "open_hook": "规则出现的瞬间（如：搬进新宿舍，枕头下压着一张纸条——「1.晚上11点后不要回应敲门声。2.如果有人叫你名字，数到三再回头。」）。",
        "skeleton": [
            "第1节：规则抛出——具体的规则清单（不要泛泛，要具体到数字/颜色/时间）",
            "第2节：试探——主角尝试理解规则，发现有些规则互相矛盾",
            "第3节：第一次违规（无意或被迫）——后果出现，恐惧建立",
            "第4-5节：深入——发现规则的来源（前任住户？某个仪式？），找到破解线索",
            "第6节：真相——规则的真相颠覆认知（规则其实是保护？违反规则的人变成了规则？）",
            "末节：逃离或接受——带着某个改变离开，或留下来成为新的规则守护者",
        ],
        "anti_ai_whitelist": "规则的逐条罗列（第一条、第二条、第三条）是核心叙事不是啰嗦；矛盾规则的设计是技巧不是BUG。",
    },
    "female_infinite_flow": {
        "name": "无限流女强（女频·上升）",
        "channel": "female",
        "formula": "副本进入 - 规则破解 - 通关升级 - 主线推进",
        "core_emotion": "智力碾压爽感+反套路",
        "style": "情绪烈度派，女主不恋爱只搞事业，冷静理性，恐惧用具体感官。",
        "open_hook": "副本开始的瞬间（如：电梯停在13楼，门开了，外面不是走廊，是一片麦田。广播响起：「欢迎来到副本【丰收】，存活条件：不要吃任何东西。」）。",
        "skeleton": [
            "第1节：副本进入——明确副本规则和存活条件（具体）",
            "第2-3节：观察破局——女主冷静分析规则漏洞，找到通关方法（智力碾压，不是蛮力）",
            "第4节：队友冲突——猪队友违规或背叛，女主果断处理",
            "第5-6节：通关——用智慧破解副本核心，获得奖励/线索",
            "末节：主线推进——回到现实，暗示下一个副本或主线谜团",
        ],
        "anti_ai_whitelist": "副本规则的具体设定（存活条件、时间限制、禁忌物品）是核心；女主的冷静分析过程（推理链）是卖点不是啰嗦。",
    },
    "female_true_false_daughter": {
        "name": "真假千金（女频·顶流）",
        "channel": "female",
        "formula": "身份错位 - 真相揭露 - 夺回一切 - 打脸",
        "core_emotion": "身份夺回爽感",
        "style": "情绪烈度派，真假对比要用具体物件（真千金的玉佩/假千金的高仿）。",
        "open_hook": "身份被质疑的瞬间（如：婆婆指着我说「你根本不是沈家的女儿」，我笑了——我不仅是，沈家那份验DNA的报告，还是我亲自送去的）。",
        "skeleton": [
            "第1节：身份被质疑——有人当众质疑主角身份",
            "第2-3节：真相浮现——真千金回归/假千金被揭穿的线索出现",
            "第4节：真假对比——具体场景里真假千龙的差别（教养/品味/细节）",
            "第5-6节：夺回——主角拿回属于自己的东西（家/爱人/地位），过程有物证",
            "末节：假千金的结局——不强行洗白，给出合理的结局",
        ],
        "anti_ai_whitelist": "真假对比的具体细节（真千金喝茶的姿态、假千金穿错的颜色）是人物刻画；DNA报告/胎记/信物等物证的具体描写是爽点来源。",
    },
}


def get_genres_by_channel(channel):
    """按频道筛选题材库。"""
    return {k: v for k, v in GENRE_LIBRARY.items() if v["channel"] == channel}


PLATFORM_FORMAT = {
    "tomato": {
        "name": "番茄短篇",
        "section_words": (1000, 2000),
        "chapter_mark": "###第N章",
        "dialogue_quote": '""',
        "reader_patience": 300,
        "emotion_density": 800,
        "emotion_formula": "全谱爽感密集，更新稳定优先；善恶可以模糊但节奏不能拖",
        "hook_check": "前300字必须有冲突或悬念，禁止铺背景",
    },
    "feilu": {
        "name": "飞卢",
        "section_words": (800, 1200),
        "chapter_mark": "###第N章",
        "dialogue_quote": '""',
        "reader_patience": 200,
        "emotion_density": 500,
        "emotion_formula": "极快节奏，一句话含环境+情绪+冲突；每节都要有爽点",
        "hook_check": "前200字必须炸，开篇即绝境",
    },
    "heiyan": {
        "name": "黑岩/红果",
        "section_words": (800, 1200),
        "chapter_mark": "###1.",
        "dialogue_quote": '""',
        "reader_patience": 300,
        "emotion_density": 700,
        "emotion_formula": "偏成熟剧情向，重付费转化；情绪要有层次不能平",
        "hook_check": "前300字抛核心矛盾，让人想掏钱看下去",
    },
    "zhiyan": {
        "name": "知乎盐选",
        "section_words": (1000, 2000),
        "chapter_mark": "1.",
        "dialogue_quote": "「」",
        "reader_patience": 200,
        "emotion_density": 800,
        "emotion_formula": "该虐的虐该甜的甜，极致化；推荐页只展示前200-300字定生死",
        "hook_check": "前300字必须是冲突前置+强感官冲击，禁止任何铺垫",
    },
    "miniapp": {
        "name": "小程序",
        "section_words": (800, 1500),
        "chapter_mark": "###第N章",
        "dialogue_quote": '""',
        "reader_patience": 250,
        "emotion_density": 600,
        "emotion_formula": "即时反馈成就感，身份代入补偿；善恶分明，直白情感",
        "hook_check": "前250字必须给读者代入感和即时爽感",
    },
}


# ============================================================
# 爽点梯级体系（来自 RTY798/agent-novel）
# 核心心法：踩得越深，后面越爽；没有铺垫就踩高梯级=假高潮
# ============================================================

PLEASURE_LADDER = {
    "emotion": {
        "name": "情感爽点梯级（L1=最虐 L4=最爽）",
        "levels": [
            {"level": "L1", "name": "被误解/被辜负", "feel": "读者心疼、替主角委屈", "rule": "写L1不要急——把委屈写具体写透，这是后面爽的燃料"},
            {"level": "L2", "name": "被理解/被看见", "feel": "读者松一口气、小感动", "rule": "L2是转折点，必须建立在L1铺垫足够之后"},
            {"level": "L3", "name": "和解/回应", "feel": "读者满足、眼眶发热", "rule": "L3要有一个具体的破冰动作或物件"},
            {"level": "L4", "name": "清算/彻底打脸", "feel": "读者大爽、拍手称快", "rule": "L4是高潮，前面L1-L2铺得越深，这里越爽"},
        ],
    },
    "action": {
        "name": "战斗/对抗爽点梯级（L1=最低 L5=最高）",
        "levels": [
            {"level": "L1", "name": "被碾压/受辱", "feel": "读者憋屈、期待反击", "rule": "L1要把憋屈写具体（具体的羞辱台词/动作）"},
            {"level": "L2", "name": "险胜/小反击", "feel": "读者看到希望", "rule": "L2要付出代价才赢，不能白捡"},
            {"level": "L3", "name": "智取/策略翻盘", "feel": "读者佩服主角的脑子", "rule": "L3要有前文铺垫的线索回收，禁机械降神"},
            {"level": "L4", "name": "碾压/实力碾压", "feel": "读者大爽", "rule": "L4需要前面L1-L2的压抑做对比"},
            {"level": "L5", "name": "不战而胜/降维打击", "feel": "读者极致爽感", "rule": "L5是终极释放，必须前面踩够L1-L2，否则是假高潮"},
        ],
    },
}

# 铺垫深度闸：多深的前期压抑，才配多高的爽点释放
PADDING_GATE = {
    "L3_release": "释放L3（智取/策略翻盘）前，至少要有2个L1的铺垫节",
    "L4_release": "释放L4（碾压）前，至少要有3个L1-L2的铺垫节",
    "L5_release": "释放L5（不战而胜）前，整篇至少40%篇幅在踩L1-L2",
}


def build_pleasure_ladder_block():
    """构建爽点梯级约束块，注入大纲提示词。"""
    parts = []
    parts.append("【爽点梯级体系——治假高潮】")
    parts.append("爽点不是二元有/无，而是分梯级。前期踩得越深（L1），后期释放越爽（L4/L5）。")
    parts.append("")
    for key, info in PLEASURE_LADDER.items():
        parts.append(info["name"] + "：")
        for lv in info["levels"]:
            parts.append("  %s %s：%s。%s" % (lv["level"], lv["name"], lv["feel"], lv["rule"]))
        parts.append("")
    parts.append("【铺垫深度闸（假高潮检测）】")
    for k, v in PADDING_GATE.items():
        parts.append("  " + v)
    parts.append("如果某节安排了L4/L5的高潮，但前面铺垫不够，这是假高潮，必须往前补踩。")
    return "\n".join(parts)


SHORT_IDEA_PROMPT = """你是短篇网文的爆款构思手。根据用户的初始想法，锁定"单一情绪爆点"，并选出最适合的题材三幕结构。

【总原则】
短篇不是"更短的长篇"，是"情绪产品"。靠单一情绪一次命中留人：意难平/反转震撼/爽感释放/治愈/细思极恐/共鸣。整套构思围绕这一个情绪轴心。

【用户输入】
初始想法：${story_description}
目标字数：${target_words}
频道：${channel}
题材倾向：${genre}

【你的任务——只输出以下四块，不要废话】

1. 【核心情绪】（一句话锁定本篇要命中读者的什么情绪，如"离婚三年后前夫跪在雨里的爽感释放"）

2. 【题材三幕】（按所选题材公式拆三幕，每幕标注占比和关键事件）
   - 建压（约40%）：写什么具体事件把情绪压到最低
   - 爆点（约35%）：反转/打脸/掉马的引爆点
   - 落定（约25%）：情绪释放后的收束

3. 【反转点清单】（3-5个反转节点，按时间顺序，每个一句话）

4. 【开篇三行法则】（写出实际的开头3行，直接抛入死亡/背叛/侮辱/绝境，禁止写景/心理独白/世界观说明书）

【禁忌】
- 禁铺世界观，禁账本体系，禁写长篇设定。
- 开篇不准写景、不准心理独白、不准世界观说明书。"""


SHORT_OUTLINE_PROMPT = """你是短篇网文的结构工程师。根据构思方案，用 full_preplan 方式一次性规划全部节拍，把三幕拆成可执行的分节大纲。

【构思方案】
${short_idea}

【基础设定】
背景：${background}
人物：${characters}
关系：${relationships}
剧情：${plot}
风格：${style}

【生成参数】
目标字数：${target_words}
生成模式：${gen_mode}
总节数：${section_count}
每节字数：${section_words}
平台：${platform}（章节标记格式：${chapter_mark}）

【你的任务——按节输出完整节拍表】

输出 ${section_count} 节，每节必须包含：
- 【第N节】标题
- 情绪烈度（1-10，10为最爆）
- 本节目标字数
- 核心事件（一句话）
- 开头钩子（具体到动作/物件/对话，不准写景）
- 结尾钩子（未解决的动作/物件/沉默收尾，禁道德总结）
- 情绪曲线（本节情绪如何起伏）
- 情绪点清单：列出本节要埋的爽点/虐点/反转（每${emotion_density}字至少一个，给出具体是什么）

【情绪密度硬约束（${platform_name}平台标准）】
每${emotion_density}字必须有一个泪点/爽点/反转，不能有大段平铺。
${emotion_formula}

【三幕占比铁律】
- 建压 40%：把情绪压到最低的具体事件
- 爆点 35%：反转/打脸/掉马的引爆点
- 落定 25%：情绪释放后的收束

${pleasure_ladder}

【每节新增要求】
- 爽点梯级：标注本节踩哪个梯级（L1受辱/L2小反击/L3智取/L4碾压/L5不战而胜），以及为什么配这个梯级
- 铺垫检查：如果本节是L3+，说明前面哪几节踩了L1-L2做铺垫（铺垫不够就调）

【禁忌】
- 禁铺世界观，禁账本。
- 每节结尾禁"他终于明白了""这一夜注定无人入眠""更大的风暴即将来临"这种总结体。
- 反转点必须有前文铺垫，禁机械降神。"""


SHORT_CONTENT_PROMPT = """你是短篇网文的写手。根据分节大纲写出本节正文。这是短篇，核心是"情绪烈度派"——情绪宁烈不温，靠直白共鸣留人。

╔══════════════════════════════════════════════════════════╗
║【绝对禁令——出现以下任何一句，整篇作废重写】              ║
╚══════════════════════════════════════════════════════════╝
这三类句式是AI写小说最深的惯性，是读者一眼识破"这是AI写的"的致命标记。
你的正文里一个都不许出现。没有例外，没有"为了效果用一次"，零容忍。

╳ 禁令一："不是X，而是Y" / "不是X，是Y" / "并非X，而是Y"
  这是AI最爱用的"否定+修正"节奏。人类作者极少这么写。
  违规例：不是隐隐作痛，是十片指甲缝胀痛。
  违规例：不是走，是逃。
  违规例：不是挥手再见。是示意。
  违规例：并非恐惧，而是一种兴奋。
  正确写法：直接写Y，把前半句删掉。
  正例：十片指甲缝胀痛。
  正例：是逃。
  正例：那挥手的姿势是示意。
  违规变体（用句号/逗号断开，本质一样）：
  违规例：不是那种紧张的发抖。是冷。
  违规例：不是没看。是不敢看。
  违规例：他戴的不是白手套。手套原本是白色的。
  正例：他的手冷。冷得像在冰水里泡过。
  正例：他没往电梯里看。不敢看。
  正例：他戴的白手套已经灰了。掌心那一面全是灰。
  记住：永远不要先用"不是"开头再纠正。读者要看"是什么"，不要看"不是什么"。

╳ 禁令二："或者说" / "或者说是" / "准确地说是" / "换句话说"
  这是AI假装精确、假装在补充说明的口头禅。人类作者不这么说话。
  违规例：他很冷，或者说，他装得很冷。
  违规例：那不是爱，或者说是占有欲。
  违规例：准确地说，她已经死了。
  正确写法：选一个说法写死，不要补充不要修正。
  正例：他冷。装的。
  正例：那是占有欲。

╳ 禁令三："是不是X的时候，就是Y" / "是不是X，就是Y" / 反问确认句
  这是AI制造"顿悟感""宿命感"的廉价反问句式。
  违规例：是不是一个人撑不住的时候，就会想找个人一起沉下去？
  违规例：是不是所有靠近你的人，最后都会变成你的一部分？
  违规例：所谓成长，是不是就是学会闭嘴？
  正确写法：删掉反问，直接陈述。
  正例：人撑不住的时候会找人一起沉下去。
  正例：所有靠近她的人最后都变成了她的一部分。

写之前默念三遍：不要"不是而是"，不要"或者说"，不要"是不是就是"。

【本节大纲】
${section_outline}

【全篇构思（保持情绪轴心一致）】
${short_idea}

【基础设定】
背景：${background}
人物：${characters}
风格：${style}

${genre_craft}

${pleasure_craft}

【前文（保持连贯）】
${previous_content}

═══════════════════════════════════════════
【红线禁令——AI腔句式，一个都不许出现】
═══════════════════════════════════════════
以下句式是AI写小说最深的惯性，出现即判定为AI文，一条都不能用：

1. 禁"不是X，而是Y""不是X，是Y"——否定+修正句式。直接写Y，不要先说不是什么。
   违规例："不是隐隐作痛，是十片指甲缝像灌了水泥。" → 正例："十片指甲缝像灌了水泥，胀。"

2. 禁"不像X，而像Y""不像X，像Y"——明喻对比。删掉前半，直接写像的那个。

3. 禁破折号"——"。全篇最多2处。停顿用句号+短句、换行、动作。

4. 禁"像X一样""像X似的""如同X一般"——明喻泛滥。一段最多一个比喻，且必须指向
   具体、反常识的意象。"像胶水一样"是废话，"指甲缝里渗出沥青"才是比喻。

5. 禁"不由得""不禁""情不自禁""下意识""忍不住"——情绪万能胶。换成具体身体动作。

6. 禁"那一刻""那一瞬间""这一刻"——时间抒情腔。直接写动作，不要标时间。

7. 禁"终于明白""终于意识到""意味着""也就是说"——解释腔。读者比你聪明，别替他总结。

8. 禁"仿佛""犹如""宛如""恍若"——文言明喻。用口语，或更好——直接写细节。

9. 禁"某种""一种""一股"——泛指腔。"某种恐惧"不如"后脖颈发凉"。

10. 禁"心中一凛""心头一紧""眼中闪过一丝"——模板化情绪标签。换成此刻场景特有的动作。

11. 禁"不仅仅是""不止是"——递进腔。要么删前半句，要么把"不止"的东西直接写出来。

12. 禁"无比""十分""格外""异常""极其"——程度副词堆砌。让细节自己产生强度。

═══════════════════════════════════════════
【人味的核心——写出AI写不出的东西】
═══════════════════════════════════════════
AI写不出的，是"不整齐的真实"。记住三条：

A. 感官要错位、要脏。不要"冷风刺骨"，要"空调出风口的塑料味混着楼下煎饼摊的油烟"。
   恐怖不要"诡异感"，要具体到"电梯按键上有别人的体温，温的，像刚被按过"。

B. 节奏要不均匀。重要的瞬间写极细（一句话拆成三个短句），不重要的过渡一笔带过甚至跳过。
   AI的毛病是每个细节用一样篇幅——这是机器均匀，不是人的注意力。

C. 人物要有脏逻辑。真人会后悔、会自欺、会明知危险还伸手。不要写"她理性地分析后决定"，
   要写"她知道不该开门，但手已经拧开反锁了。"

═══════════════════════════════════════════
【情绪烈度派——最重要的审美原则，和长篇相反】
═══════════════════════════════════════════
短篇靠直白共鸣留人，不靠克制留白。

允许并鼓励直接写情绪词（心如死灰/心如刀绞/几欲作呕），这是卖点不是AI味——
但情绪词后面必须立刻接一个【此刻场景里特有的具体动作或物件】，不能让情绪词单独飘着。
- 反例："我心如死灰，泪水早已模糊了视线。"（空，删）
- 正例："我紧紧抿着嘴唇，直到尝到血腥味，才勉强找回一丝清明。"
- 正例："摸到那碗凉掉的排骨汤时，我的心更冰冷了。上面还浮着凝固的油，根本喝不了。"
情绪后也可接【任务卡点】（卡住救命钱/证据/离场/求救/反击）。

必须删掉两种：
1. 接不上具体东西、单独飘着的情绪总结句。
2. 同一情绪反复写还补一句解释多疼。

═══════════════════════════════════════════
【短篇正文格式约束（平台适配）】
═══════════════════════════════════════════
1. 相邻段落间只允许一个换行符，不得空行。
2. 无缩进（不用全角空格）。
3. 段落禁用 Markdown 符号。
4. 对话独立成行，用动作 beat 代替"他说""她道"；两人连续对话省略标签靠内容区分。
5. 标点：正文统一不出现省略号和破折号（停顿用短句、动作 beat、换行）。
6. 章节标记：${chapter_mark}
7. 对话引号：${dialogue_quote}

═══════════════════════════════════════════
【长短句与口语化】
═══════════════════════════════════════════
- 最大的敌人是 script prose（"他站起。拔剑。攻击。"）——必须长短句交替，段落3-6句但允许单句成段制造冲击。
- 书面腔转口语化：瓦解散了/没了，无名火变烦躁，不容置疑就是，往我心上捅刀子变心烦意乱。

═══════════════════════════════════════════
【开篇三行法则】（仅第一节）
═══════════════════════════════════════════
前3行直接抛入死亡/背叛/侮辱/绝境，禁止写景/心理独白/世界观说明书。前${reader_patience}字定生死。

${platform_emotion}

【写完自检（内部完成，不输出检查过程）】
- 前${reader_patience}字有没有冲突/悬念/感官冲击？没有就重写开头。
- 有没有超过${emotion_density}字的平铺段落没有情绪点？有就插入一个反转或动作。
- 情绪词后面有没有接具体动作/物件？单独飘着的补上。

直接写正文，不要任何解释、不要标题以外的小标题、不要"以下是正文"。"""


SHORT_ANTIAI_HUMANIZE_PROMPT = """请为以下短篇正文强化"情绪烈度"，让它读起来更像爆款短篇而非AI生成的温吞文。

【情绪烈度派核心——和长篇去AI味相反】
长篇去AI味要克制留白（Show Don't Tell），短篇恰恰相反：情绪宁烈不温，靠直白共鸣留人。

【强化方向】
1. 保留直白情绪词（心如死灰/心如刀绞/几欲作呕/崩溃/绝望），这是短篇的卖点。
2. 但检查每个情绪词后面——必须接一个【此刻场景里特有的具体动作或物件】，不能让情绪词单独飘着。
   - 如果情绪词后是空的（如"泪水模糊了视线"这种套话），改成具体的动作/物件。
3. 情绪后可补【任务卡点】（卡住救命钱/证据/离场/求救/反击），让情绪落到具体阻碍上。
4. 删掉两种：
   - 接不上具体东西、单独飘着的情绪总结句。
   - 同一情绪反复写还补一句解释多疼。
5. 段落结尾禁总结体（"他终于明白了""这一夜注定无人入眠""更大的风暴即将来临"），改用动作/对话/悬念收尾。

【长短句】
长短句交替，允许单句成段制造冲击，禁 script prose。

【原文】
${current_text}

请直接输出强化情绪烈度后的正文，不要加任何解释、不要"修改如下"、不要分点。"""


def build_short_idea_prompt(story_description, target_words, channel, genre_key):
    """构建短篇构思提示词。"""
    genre_info = GENRE_LIBRARY.get(genre_key, {})
    if genre_info:
        genre_desc = "%s：%s" % (genre_info.get("name", genre_key), genre_info.get("formula", ""))
    else:
        genre_desc = genre_key or "不限"
    prompt = SHORT_IDEA_PROMPT
    prompt = prompt.replace("${story_description}", story_description or "")
    prompt = prompt.replace("${target_words}", str(target_words))
    prompt = prompt.replace("${channel}", channel or "")
    prompt = prompt.replace("${genre}", genre_desc)
    return prompt


def build_short_outline_prompt(short_idea, plan, field_vars):
    """构建短篇分节大纲提示词。"""
    platform_info = PLATFORM_FORMAT.get(plan.platform, PLATFORM_FORMAT["tomato"])
    prompt = SHORT_OUTLINE_PROMPT
    prompt = prompt.replace("${short_idea}", short_idea or "")
    prompt = prompt.replace("${background}", field_vars.get("background", ""))
    prompt = prompt.replace("${characters}", field_vars.get("characters", ""))
    prompt = prompt.replace("${relationships}", field_vars.get("relationships", ""))
    prompt = prompt.replace("${plot}", field_vars.get("plot", ""))
    prompt = prompt.replace("${style}", field_vars.get("style", ""))
    prompt = prompt.replace("${target_words}", str(plan.target_words))
    gen_mode = "单篇流式" if plan.mode == "single_stream" else "多节预规划"
    prompt = prompt.replace("${gen_mode}", gen_mode)
    prompt = prompt.replace("${section_count}", str(plan.section_count))
    prompt = prompt.replace("${section_words}", str(plan.section_words))
    prompt = prompt.replace("${platform}", platform_info["name"])
    prompt = prompt.replace("${chapter_mark}", platform_info["chapter_mark"])
    # 注入题材节奏骨架，让大纲按题材专属节拍排
    genre_info = GENRE_LIBRARY.get(plan.genre, {})
    if genre_info.get("skeleton"):
        skeleton_text = "\n".join("  " + s for s in genre_info["skeleton"])
        prompt += "\n\n【题材节奏骨架参考（按此节拍安排各节，可微调但大节奏要对齐）】\n" + skeleton_text
    if genre_info.get("open_hook"):
        prompt += "\n\n【本题材开篇钩子要求（第一节必须遵守）】\n" + genre_info["open_hook"]
    # 填充情绪密度占位符
    prompt = prompt.replace("${emotion_density}", str(platform_info.get("emotion_density", 800)))
    prompt = prompt.replace("${platform_name}", platform_info.get("name", ""))
    prompt = prompt.replace("${emotion_formula}", platform_info.get("emotion_formula", ""))
    # 注入爽点梯级
    prompt = prompt.replace("${pleasure_ladder}", build_pleasure_ladder_block())
    return prompt


def build_genre_craft_block(genre_key):
    """从题材库提取题材专属写作约束（骨架/开篇钩子/偏差白名单）。"""
    info = GENRE_LIBRARY.get(genre_key, {})
    if not info:
        return ""
    parts = []
    parts.append("═══════════════════════════════════════════")
    parts.append("【题材专属约束：%s】" % info.get("name", genre_key))
    parts.append("═══════════════════════════════════════════")
    if info.get("core_emotion"):
        parts.append("核心情绪：必须全程服务于「%s」这一个情绪轴心。" % info["core_emotion"])
    if info.get("style"):
        parts.append("题材风格：%s" % info["style"])
    if info.get("open_hook"):
        parts.append("开篇钩子（仅第一节遵守）：%s" % info["open_hook"])
    if info.get("skeleton"):
        parts.append("节奏骨架（本节写到哪里要对齐）：")
        for i, beat in enumerate(info["skeleton"]):
            parts.append("  %s" % beat)
    if info.get("anti_ai_whitelist"):
        parts.append("题材偏差白名单（这些在别处是AI味，在本题材是卖点，别误删）：")
        parts.append("  %s" % info["anti_ai_whitelist"])
    return "\n".join(parts)


def build_short_content_prompt(section_outline, short_idea, previous_content, plan, field_vars):
    """构建短篇正文提示词（单节）。注入题材专属约束。"""
    platform_info = PLATFORM_FORMAT.get(plan.platform, PLATFORM_FORMAT["tomato"])
    prompt = SHORT_CONTENT_PROMPT
    prompt = prompt.replace("${section_outline}", section_outline or "")
    prompt = prompt.replace("${short_idea}", short_idea or "")
    prev = previous_content or "（本节为开篇，无前文）"
    prompt = prompt.replace("${previous_content}", prev)
    prompt = prompt.replace("${background}", field_vars.get("background", ""))
    prompt = prompt.replace("${characters}", field_vars.get("characters", ""))
    prompt = prompt.replace("${style}", field_vars.get("style", ""))
    # 注入题材专属约束
    genre_craft = build_genre_craft_block(plan.genre)
    prompt = prompt.replace("${genre_craft}", genre_craft)
    # 填充钩子自检 + 平台情绪配方
    emotion_block = "【平台情绪配方：%s】\n%s" % (platform_info.get("name",""), platform_info.get("emotion_formula",""))
    prompt = prompt.replace("${platform_emotion}", emotion_block)
    prompt = prompt.replace("${emotion_density}", str(platform_info.get("emotion_density", 800)))
    prompt = prompt.replace("${hook_check}", platform_info.get("hook_check", ""))
    # 注入爽点梯级声明要求（正文版，比大纲版精简）
    pleasure_craft = (
        "【爽点梯级——写前先声明本节踩哪级】\n"
        "写之前先看本节大纲标注的爽点梯级（L1-L5），如果标注了L3及以上，"
        "确认前面已经铺垫够（L4需要前面3节踩L1-L2）。\n"
        "写的时候：踩L1/L2不要急，把委屈/受辱写具体写透，这是后面爽的燃料；"
        "到L4/L5释放时节奏要快，短句密集，一气呵成。"
    )
    prompt = prompt.replace("${pleasure_craft}", pleasure_craft)
    prompt = prompt.replace("${chapter_mark}", platform_info["chapter_mark"])
    prompt = prompt.replace("${dialogue_quote}", platform_info["dialogue_quote"])
    prompt = prompt.replace("${reader_patience}", str(platform_info["reader_patience"]))
    return prompt


def build_short_humanize_prompt(current_text):
    """构建短篇情绪烈度派去AI味提示词。"""
    return SHORT_ANTIAI_HUMANIZE_PROMPT.replace("${current_text}", current_text or "")
