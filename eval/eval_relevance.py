"""Eval A: does the triage agent's memory_relevance judgment match human-labeled expectations?

Runs the real _node_triage_agent (same prompt/rubric used in production) against a hand-labeled
golden set, then reports a confusion matrix. The costliest error is expected=deep -> got=none
(the product silently "forgets" something important), so those cases are printed separately.
"""
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.pipeline import ArcanaPipeline

PROJECT_ID = os.environ.get("VERTEX_PROJECT", "ieor-4576-487001")
REGION = os.environ.get("VERTEX_LOCATION", "us-central1")

# 9 relevance patterns x 4 topic domains = 36 cases. Each pattern is tested once per domain
# (Love/Career/Wealth/General) to check the rubric generalizes and isn't overfit to relationship
# examples, which is where most hand-written eval sets like this default to.
GOLDEN_SET = [
    # --- pattern: no_history_first_reading (expected: none) ---
    {"name": "N1_love", "pattern": "no_history", "domain": "Love", "expected": "none",
     "memory_context": "This is the user's first reading. No prior history.",
     "query": "我应该主动去跟喜欢的人表白吗?"},
    {"name": "N1_career", "pattern": "no_history", "domain": "Career", "expected": "none",
     "memory_context": "This is the user's first reading. No prior history.",
     "query": "我该接受这个新的工作机会吗?"},
    {"name": "N1_wealth", "pattern": "no_history", "domain": "Wealth", "expected": "none",
     "memory_context": "This is the user's first reading. No prior history.",
     "query": "我要不要现在就开始定投?"},
    {"name": "N1_general", "pattern": "no_history", "domain": "General", "expected": "none",
     "memory_context": "This is the user's first reading. No prior history.",
     "query": "我该不该跟家里坦白最近的烦恼?"},

    # --- pattern: unrelated_topic_history_present (expected: none) ---
    {"name": "N2_love", "pattern": "unrelated_topic", "domain": "Love", "expected": "none",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-03-01] Topic: Career | Cards: The Tower | Summary: 关于要不要接受新工作offer的阅读...\n"),
     "query": "我最近暗恋一个人,要不要主动告白?"},
    {"name": "N2_career", "pattern": "unrelated_topic", "domain": "Career", "expected": "none",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-02-20] Topic: Wealth | Cards: The Star | Summary: 关于要不要买房的阅读...\n"),
     "query": "我该不该接受这次跨部门轮岗?"},
    {"name": "N2_wealth", "pattern": "unrelated_topic", "domain": "Wealth", "expected": "none",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-01-15] Topic: General | Cards: The Sun | Summary: 关于要不要跟朋友和好的阅读...\n"),
     "query": "我要不要现在把存款拿去投资?"},
    {"name": "N2_general", "pattern": "unrelated_topic", "domain": "General", "expected": "none",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-03-10] Topic: Love | Cards: Two of Cups | Summary: 关于要不要重新开始约会的阅读...\n"),
     "query": "我的猫最近行为很奇怪,有什么灵性含义吗?"},

    # --- pattern: two_unrelated_histories (expected: none) ---
    {"name": "N3_love", "pattern": "two_unrelated", "domain": "Love", "expected": "none",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-01-10] Topic: Career | Cards: The Star | Summary: 关于要不要跳槽的阅读...\n"
         "- [2026-02-05] Topic: Wealth | Cards: The Sun | Summary: 关于要不要买车的阅读...\n"),
     "query": "我该不该答应跟一个新认识的人约会?"},
    {"name": "N3_career", "pattern": "two_unrelated", "domain": "Career", "expected": "none",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-01-10] Topic: Wealth | Cards: The Star | Summary: 关于要不要还清信用卡的阅读...\n"
         "- [2026-02-05] Topic: General | Cards: The Sun | Summary: 关于要不要搬家的阅读...\n"),
     "query": "我明天有个面试,有什么建议吗?"},
    {"name": "N3_wealth", "pattern": "two_unrelated", "domain": "Wealth", "expected": "none",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-01-10] Topic: General | Cards: The Star | Summary: 关于要不要养宠物的阅读...\n"
         "- [2026-02-05] Topic: Love | Cards: The Sun | Summary: 关于要不要表白的阅读...\n"),
     "query": "我该不该借钱给一个亲戚?"},
    {"name": "N3_general", "pattern": "two_unrelated", "domain": "General", "expected": "none",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-01-10] Topic: Love | Cards: The Star | Summary: 关于要不要复合的阅读...\n"
         "- [2026-02-05] Topic: Career | Cards: The Sun | Summary: 关于要不要转行的阅读...\n"),
     "query": "我该不该跟多年没联系的老朋友重新联系?"},

    # --- pattern: same_category_different_situation (expected: light) ---
    {"name": "L1_love", "pattern": "same_category_diff_situation", "domain": "Love", "expected": "light",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-02-14] Topic: Love | Cards: Two of Cups | Summary: 关于要不要开始一段新恋情的阅读...\n"),
     "query": "我在纠结要不要跟现在的伴侣求婚。"},
    {"name": "L1_career", "pattern": "same_category_diff_situation", "domain": "Career", "expected": "light",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-03-01] Topic: Career | Cards: The Tower | Summary: 跟经理起冲突,考虑要不要沟通的阅读...\n"),
     "query": "我在纠结要不要彻底转行做完全不同的领域。"},
    {"name": "L1_wealth", "pattern": "same_category_diff_situation", "domain": "Wealth", "expected": "light",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-01-20] Topic: Wealth | Cards: The Star | Summary: 关于要不要开始定投基金的阅读...\n"),
     "query": "我在纠结要不要网贷解决短期资金周转。"},
    {"name": "L1_general", "pattern": "same_category_diff_situation", "domain": "General", "expected": "light",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-02-01] Topic: General | Cards: The Sun | Summary: 跟朋友闹掰,考虑要不要和好的阅读...\n"),
     "query": "我在纠结要不要跟家人坦白一个一直瞒着的秘密。"},

    # --- pattern: same_category_loose_echo (expected: light) ---
    {"name": "L2_love", "pattern": "loose_echo", "domain": "Love", "expected": "light",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-02-14] Topic: Love | Cards: Two of Cups | Summary: 关于重新开始约会的阅读...\n"),
     "query": "我又匹配到一个新的人,要不要主动打招呼?"},
    {"name": "L2_career", "pattern": "loose_echo", "domain": "Career", "expected": "light",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-01-05] Topic: Career | Cards: Five of Pentacles | Summary: 感觉自己不被认可的阅读...\n"),
     "query": "同事升职了,我该怎么调整心态?"},
    {"name": "L2_wealth", "pattern": "loose_echo", "domain": "Wealth", "expected": "light",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-01-05] Topic: Wealth | Cards: Five of Pentacles | Summary: 担心存款不够用的阅读...\n"),
     "query": "看到朋友买了新车,我会不会太焦虑于跟别人比较?"},
    {"name": "L2_general", "pattern": "loose_echo", "domain": "General", "expected": "light",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-01-05] Topic: General | Cards: Five of Pentacles | Summary: 换了新发型很纠结的阅读...\n"),
     "query": "我在纠结要不要换个新的爱好试试看。"},

    # --- pattern: shared_entity_not_continuation (expected: light) ---
    {"name": "L3_love", "pattern": "shared_entity", "domain": "Love", "expected": "light",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-01-15] Topic: Love | Cards: The Tower | Summary: 纠结要不要接受前任复合请求,最终没有接受...\n"),
     "query": "听说前任现在过得很好,我该怎么调整心情?"},
    {"name": "L3_career", "pattern": "shared_entity", "domain": "Career", "expected": "light",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-01-15] Topic: Career | Cards: The Wheel of Fortune | Summary: 纠结要不要接受某offer,最终拒绝了...\n"),
     "query": "听说我拒绝的那家公司现在发展得很好,我是不是选错了?"},
    {"name": "L3_wealth", "pattern": "shared_entity", "domain": "Wealth", "expected": "light",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-01-15] Topic: Wealth | Cards: The Wheel of Fortune | Summary: 纠结要不要买某支股票,最终没买...\n"),
     "query": "那支股票现在涨了很多,我是不是错过机会了?"},
    {"name": "L3_general", "pattern": "shared_entity", "domain": "General", "expected": "light",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-01-15] Topic: General | Cards: The Wheel of Fortune | Summary: 纠结要不要参加某聚会,最终没去...\n"),
     "query": "听说那天的聚会很有趣,我是不是错过了什么?"},

    # --- pattern: explicit_continuation_same_situation (expected: deep) ---
    {"name": "D1_love", "pattern": "explicit_continuation", "domain": "Love", "expected": "deep",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-02-10] Topic: Love | Cards: The Lovers, Ten of Swords | Summary: 同一个伴侣第一次说谎被发现...\n"),
     "query": "同一个伴侣又说谎了,这是第二次了,要不要分手?"},
    {"name": "D1_career", "pattern": "explicit_continuation", "domain": "Career", "expected": "deep",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-02-10] Topic: Career | Cards: The Tower | Summary: 同一个项目第一次被经理否决...\n"),
     "query": "同一个项目又被经理否决了,我该怎么办?"},
    {"name": "D1_wealth", "pattern": "explicit_continuation", "domain": "Wealth", "expected": "deep",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-02-10] Topic: Wealth | Cards: Ten of Swords | Summary: 同一笔投资第一次出现明显亏损...\n"),
     "query": "同一笔投资又亏了,要不要及时止损?"},
    {"name": "D1_general", "pattern": "explicit_continuation", "domain": "General", "expected": "deep",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-02-10] Topic: General | Cards: Ten of Swords | Summary: 同一个朋友第一次放我鸽子...\n"),
     "query": "同一个朋友又放我鸽子了,这段友情还要不要继续?"},

    # --- pattern: recurring_pattern_two_readings (expected: deep) ---
    {"name": "D2_love", "pattern": "recurring_2x", "domain": "Love", "expected": "deep",
     "memory_context": ("Past readings for this user:\n"
         "- [2025-11-01] Topic: Love | Cards: The Moon | Summary: 在上一段关系里总是缺乏安全感...\n"
         "- [2026-01-15] Topic: Love | Cards: The Moon, Nine of Swords | Summary: 在另一段关系里又出现同样的不安全感...\n"),
     "query": "为什么我在每一段关系里都会没有安全感?"},
    {"name": "D2_career", "pattern": "recurring_2x", "domain": "Career", "expected": "deep",
     "memory_context": ("Past readings for this user:\n"
         "- [2025-11-01] Topic: Career | Cards: Five of Pentacles | Summary: 一个项目的功劳被同事拿走...\n"
         "- [2026-01-15] Topic: Career | Cards: Five of Pentacles, The Hermit | Summary: 又一次功劳被别人拿走...\n"),
     "query": "为什么每次都是我的功劳被别人拿走?"},
    {"name": "D2_wealth", "pattern": "recurring_2x", "domain": "Wealth", "expected": "deep",
     "memory_context": ("Past readings for this user:\n"
         "- [2025-11-01] Topic: Wealth | Cards: Seven of Cups | Summary: 一次冲动消费后很后悔...\n"
         "- [2026-01-15] Topic: Wealth | Cards: Seven of Cups, The Devil | Summary: 又一次冲动消费后后悔...\n"),
     "query": "为什么我总是冲动消费,然后事后又后悔?"},
    {"name": "D2_general", "pattern": "recurring_2x", "domain": "General", "expected": "deep",
     "memory_context": ("Past readings for this user:\n"
         "- [2025-11-01] Topic: General | Cards: Nine of Swords | Summary: 不敢拒绝朋友的请求...\n"
         "- [2026-01-15] Topic: General | Cards: Nine of Swords, The Hermit | Summary: 又一次不敢拒绝家人的请求...\n"),
     "query": "为什么我总是不敢拒绝别人?"},

    # --- pattern: user_explicit_backreference (expected: deep) ---
    {"name": "D3_love", "pattern": "explicit_backreference", "domain": "Love", "expected": "deep",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-01-15] Topic: Love | Cards: Death, The Star | Summary: 关于一段刚结束的恋情的阅读...\n"),
     "query": "还记得我说的那个前任吗,他昨天联系我了。"},
    {"name": "D3_career", "pattern": "explicit_backreference", "domain": "Career", "expected": "deep",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-01-15] Topic: Career | Cards: Death, The Star | Summary: 关于一次求职被拒的阅读...\n"),
     "query": "还记得我提过那家没录取我的公司吗,他们又联系我了。"},
    {"name": "D3_wealth", "pattern": "explicit_backreference", "domain": "Wealth", "expected": "deep",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-01-15] Topic: Wealth | Cards: Death, The Star | Summary: 关于欠朋友一笔钱的阅读...\n"),
     "query": "还记得我说的那笔欠朋友的钱吗,我终于还清了。"},
    {"name": "D3_general", "pattern": "explicit_backreference", "domain": "General", "expected": "deep",
     "memory_context": ("Past readings for this user:\n"
         "- [2026-01-15] Topic: General | Cards: Death, The Star | Summary: 关于跟妈妈一次争吵的阅读...\n"),
     "query": "还记得我说的跟我妈的那次争吵吗,我们昨天和好了。"},
]


def run_eval():
    pipeline = ArcanaPipeline(project_id=PROJECT_ID, region=REGION)
    labels = ["none", "light", "deep"]
    confusion = Counter()
    rows = []

    for case in GOLDEN_SET:
        state = {
            "query": case["query"],
            "intent": "General",
            "remember": case.get("remember", True),
            "memory_context": case["memory_context"],
        }
        try:
            out = pipeline._node_triage_agent(state)
            predicted = out["memory_relevance"]
            error = None
        except Exception as e:
            predicted = "ERROR"
            error = str(e)
        confusion[(case["expected"], predicted)] += 1
        rows.append({**case, "predicted": predicted, "error": error})

    total = len(rows)
    correct = sum(1 for r in rows if r["expected"] == r["predicted"])

    print(f"\nEval A: memory_relevance classification ({correct}/{total} correct, {correct/total:.0%})\n")
    print(f"{'case':16s} {'pattern':26s} {'domain':9s} {'expected':10s} {'predicted':10s}")
    print("-" * 75)
    for r in rows:
        flag = "  <-- MISS" if r["expected"] != r["predicted"] else ""
        print(f"{r['name']:16s} {r['pattern']:26s} {r['domain']:9s} {r['expected']:10s} {r['predicted']:10s}{flag}")
        if r["error"]:
            print(f"    ERROR: {r['error']}")

    print("\nConfusion matrix (rows=expected, cols=predicted):")
    header = "expected\\predicted".ljust(20) + "".join(l.ljust(10) for l in labels)
    print(header)
    for exp in labels:
        row = exp.ljust(20)
        for pred in labels:
            row += str(confusion.get((exp, pred), 0)).ljust(10)
        print(row)

    print("\nAccuracy by pattern (checks the rubric isn't overfit to one domain):")
    patterns = sorted(set(r["pattern"] for r in rows))
    for p in patterns:
        subset = [r for r in rows if r["pattern"] == p]
        acc = sum(1 for r in subset if r["expected"] == r["predicted"]) / len(subset)
        print(f"  {p:26s} {acc:.0%}  ({sum(1 for r in subset if r['expected']==r['predicted'])}/{len(subset)})")

    print("\nAccuracy by domain:")
    domains = sorted(set(r["domain"] for r in rows))
    for d in domains:
        subset = [r for r in rows if r["domain"] == d]
        acc = sum(1 for r in subset if r["expected"] == r["predicted"]) / len(subset)
        print(f"  {d:10s} {acc:.0%}  ({sum(1 for r in subset if r['expected']==r['predicted'])}/{len(subset)})")

    high_cost = [r for r in rows if r["expected"] == "deep" and r["predicted"] == "none"]
    if high_cost:
        print(f"\nHigh-cost misses (expected deep, predicted none): {len(high_cost)}")
        for r in high_cost:
            print(f"  - {r['name']}")


if __name__ == "__main__":
    run_eval()
