"""Eval B2: does the memory system, end to end, do what a human would actually want?

The original eval_memory_recall.py tests select_top_memories() in isolation with hand-assigned
importance numbers - that only proves the sorting math is correct, it says nothing about whether the
importance scores or the "is this actually relevant" judgment match what a real user would expect.

This eval replays 5 realistic multi-turn narratives through the REAL production functions in sequence:
save_reading -> build_memory_context -> triage_agent's importance scoring, turn by turn, using the
project's own database files (via a throwaway user_id, deleted after each scenario). At the final query
of each story it checks two things against a human-labeled expectation:
  1. candidate pool: did select_top_memories actually pull the memory that matters into context?
  2. relevance judgment: given that context, did triage_agent correctly decide whether it's relevant -
     including the negative case (an unrelated new question shouldn't get dragged into an old pattern
     just because a high-importance memory happens to be sitting in context).
"""
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.pipeline import ArcanaPipeline
from memory.user_store import MemoryEntry, save_reading, build_memory_context, get_user_history, _user_file

PROJECT_ID = os.environ.get("VERTEX_PROJECT", "ieor-4576-487001")
REGION = os.environ.get("VERTEX_LOCATION", "us-central1")

NOW = datetime.now(timezone.utc)


def days_ago(n: int) -> str:
    return (NOW - timedelta(days=n)).isoformat()


SCENARIOS = [
    {
        "name": "recurring_workplace_mistreatment",
        "domain": "Career",
        "turns": [
            ("T1", 100, "我这周被经理当众批评,说我能力不行,我是不是真的不适合这份工作"),
            ("T2", 70, "今天工作还挺顺利的,新项目分到我了"),
            ("T3", 40, "又被经理阴阳怪气了,我觉得他就是针对我"),
            ("T4", 10, "今天中午吃了什么都不知道该吃啥"),
        ],
        "final_query": "我又开始想要不要辞职了,好像每次见到经理就会很难受",
        "expected_pool_hits": {"T1", "T3"},  # at least one should survive into context
        "expected_relevance": "deep",
    },
    {
        "name": "breakup_and_reconciliation",
        "domain": "Love",
        "turns": [
            ("T1", 60, "我们分手了,他说受不了我总是没有安全感,我很难过"),
            ("T2", 50, "今天天气不错,想去哪里玩玩"),
            ("T3", 45, "我们复合了,他说愿意一起努力"),
            ("T4", 20, "今天纠结要不要染头发"),
            ("T5", 5, "晚饭吃什么好呢"),
        ],
        "final_query": "我们又吵架了,他又提到我太没安全感这件事",
        "expected_pool_hits": {"T1", "T3"},
        "expected_relevance": "deep",
    },
    {
        "name": "grief_should_not_leak_into_new_pet",
        "domain": "General",
        "turns": [
            ("T1", 90, "我养了十年的狗狗昨天走了,我真的很难过,不知道该怎么面对"),
            ("T2", 60, "工作上遇到一点小麻烦"),
            ("T3", 30, "最近财务上有点紧张"),
            ("T4", 10, "今天心情还不错"),
        ],
        "final_query": "我新养的小猫总是半夜叫,这正常吗",
        "expected_pool_hits": set(),  # not the point of this scenario - relevance is
        "expected_relevance": "none",  # different pet, different situation - must NOT be pulled in
    },
    {
        "name": "plain_daily_no_pattern",
        "domain": "General",
        "turns": [
            ("T1", 20, "今天天气很好,想出去走走"),
            ("T2", 15, "晚饭不知道吃什么"),
            ("T3", 10, "周末要不要去看电影"),
            ("T4", 3, "今天工作有点累"),
        ],
        "final_query": "我想知道这周整体运势怎么样",
        "expected_pool_hits": set(),
        "expected_relevance": "none",
    },
    {
        "name": "slow_building_financial_anxiety",
        "domain": "Wealth",
        "turns": [
            ("T1", 80, "最近开支有点多,有点担心"),
            ("T2", 55, "又忍不住买了一些东西,过后有点后悔"),
            ("T3", 30, "看了下账单,比想的还要紧张一些"),
            ("T4", 10, "朋友建议我记账,但还没开始"),
        ],
        "final_query": "这个月又超支了,我是不是永远都存不到钱",
        "expected_pool_hits": {"T1", "T2", "T3", "T4"},
        "expected_relevance": "deep",
    },
]


def run_scenario(pipeline, scenario):
    user_id = f"eval_b2_{scenario['name']}"
    path = _user_file(user_id)
    if path.exists():
        path.unlink()

    try:
        for turn_id, days_old, text in scenario["turns"]:
            memory_context = build_memory_context(user_id)
            state = {
                "query": text,
                "intent": scenario["domain"],
                "remember": True,
                "memory_context": memory_context,
            }
            out = pipeline._node_triage_agent(state)
            save_reading(MemoryEntry(
                session_id=turn_id,
                user_id=user_id,
                timestamp=days_ago(days_old),
                question=text,
                intent=scenario["domain"],
                cards=["The Fool"],
                reading_summary=text[:100],
                emotion_type=scenario["domain"].lower(),
                importance=out["importance"],
            ))

        pool = get_user_history(user_id)
        pool_ids = {e.session_id for e in pool}
        pool_importances = {e.session_id: e.importance for e in pool}

        final_memory_context = build_memory_context(user_id)
        final_state = {
            "query": scenario["final_query"],
            "intent": scenario["domain"],
            "remember": True,
            "memory_context": final_memory_context,
        }
        final_out = pipeline._node_triage_agent(final_state)

        return {
            "pool_ids": pool_ids,
            "pool_importances": pool_importances,
            "final_relevance": final_out["memory_relevance"],
            "error": None,
        }
    except Exception as e:
        return {"pool_ids": set(), "pool_importances": {}, "final_relevance": "ERROR", "error": str(e)}
    finally:
        if path.exists():
            path.unlink()


def run_eval():
    pipeline = ArcanaPipeline(project_id=PROJECT_ID, region=REGION)
    print("\nEval B2: end-to-end memory recall + relevance (real importance scores, real selection, real judgment)\n")

    pool_hits, relevance_hits = 0, 0
    for scenario in SCENARIOS:
        result = run_scenario(pipeline, scenario)
        print(f"[{scenario['name']}]")
        if result["error"]:
            print(f"  ERROR: {result['error']}\n")
            continue

        pool_ok = (not scenario["expected_pool_hits"]) or bool(scenario["expected_pool_hits"] & result["pool_ids"])
        relevance_ok = result["final_relevance"] == scenario["expected_relevance"]
        pool_hits += pool_ok
        relevance_hits += relevance_ok

        print(f"  candidate pool: {sorted(result['pool_ids'])}  importances: {result['pool_importances']}")
        if scenario["expected_pool_hits"]:
            print(f"  expected at least one of {sorted(scenario['expected_pool_hits'])} in pool: {'OK' if pool_ok else 'MISS'}")
        print(f"  final relevance: expected={scenario['expected_relevance']}  got={result['final_relevance']}  {'OK' if relevance_ok else '<-- MISS'}")
        print()

    print(f"Pool-selection checks passed: {pool_hits}/{len(SCENARIOS)}")
    print(f"Final relevance judgment correct: {relevance_hits}/{len(SCENARIOS)}")


if __name__ == "__main__":
    run_eval()
