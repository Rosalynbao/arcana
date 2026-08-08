"""Eval B: does memory selection surface the memories that matter?

Pure logic eval, no LLM calls needed - it directly tests memory.user_store's selection function.
Compares two selection strategies against a hand-labeled "should surface" set per scenario:
  - V1 (baseline): entries[-limit:], i.e. whatever was actually shipped originally
  - V2 (current):  get_user_history's recency-decay * importance top-K (memory/user_store.py)
"""
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from memory.user_store import MemoryEntry, select_top_memories

NOW = datetime.now(timezone.utc)


def days_ago(n: int) -> str:
    return (NOW - timedelta(days=n)).isoformat()


def make_entry(session_id: str, days_old: int, importance: int, topic: str = "General") -> MemoryEntry:
    return MemoryEntry(
        session_id=session_id,
        user_id="test_user",
        timestamp=days_ago(days_old),
        question=f"question for {session_id}",
        intent=topic,
        cards=["The Fool"],
        reading_summary=f"summary for {session_id}",
        emotion_type=topic.lower(),
        importance=importance,
    )


def v1_select(entries: list[MemoryEntry], limit: int = 5) -> list[str]:
    """Reimplements the original shipped logic (entries[-limit:] on disk order) for comparison only -
    the real V1 code has since been replaced by select_top_memories."""
    ordered = sorted(entries, key=lambda m: m.timestamp)
    return [e.session_id for e in ordered[-limit:]]


def v2_select(entries: list[MemoryEntry], limit: int = 5) -> list[str]:
    return [e.session_id for e in select_top_memories(entries, limit)]


SCENARIOS = [
    {
        "name": "important_old_memory_should_survive",
        "entries": [
            make_entry("old_crisis", days_old=90, importance=10, topic="General"),
            make_entry("filler_1", days_old=20, importance=3),
            make_entry("filler_2", days_old=15, importance=3),
            make_entry("filler_3", days_old=10, importance=3),
            make_entry("filler_4", days_old=5, importance=3),
            make_entry("filler_5", days_old=2, importance=3),
            make_entry("filler_6", days_old=1, importance=3),
        ],
        "should_surface": {"old_crisis"},
    },
    {
        "name": "all_recent_low_importance_recency_wins",
        "entries": [
            make_entry("r1", days_old=5, importance=4),
            make_entry("r2", days_old=4, importance=4),
            make_entry("r3", days_old=3, importance=4),
            make_entry("r4", days_old=2, importance=4),
            make_entry("r5", days_old=1, importance=4),
        ],
        "should_surface": {"r1", "r2", "r3", "r4", "r5"},
    },
    {
        "name": "trivial_recent_vs_important_slightly_older",
        "entries": [
            make_entry("trivial_today", days_old=0, importance=1),
            make_entry("important_2weeks", days_old=14, importance=9),
            make_entry("filler_1", days_old=1, importance=2),
            make_entry("filler_2", days_old=2, importance=2),
            make_entry("filler_3", days_old=3, importance=2),
            make_entry("filler_4", days_old=4, importance=2),
        ],
        "should_surface": {"important_2weeks", "trivial_today"},
    },
    {
        "name": "very_old_low_importance_should_drop",
        "entries": [
            make_entry("ancient_trivial", days_old=200, importance=2),
            make_entry("r1", days_old=5, importance=5),
            make_entry("r2", days_old=4, importance=5),
            make_entry("r3", days_old=3, importance=5),
            make_entry("r4", days_old=2, importance=5),
            make_entry("r5", days_old=1, importance=5),
        ],
        "should_surface": {"r1", "r2", "r3", "r4", "r5"},
    },
]


def precision_recall(selected: set, expected: set) -> tuple[float, float]:
    if not selected:
        precision = 0.0
    else:
        precision = len(selected & expected) / len(selected)
    recall = len(selected & expected) / len(expected) if expected else 1.0
    return precision, recall


def run_eval():
    print("\nEval B: memory recall quality (V1 recency-only vs V2 recency-decay*importance)\n")
    v1_recalls, v2_recalls = [], []

    for scenario in SCENARIOS:
        entries = scenario["entries"]
        expected = scenario["should_surface"]

        v1 = set(v1_select(entries))
        v2 = set(v2_select(entries))

        v1_p, v1_r = precision_recall(v1, expected)
        v2_p, v2_r = precision_recall(v2, expected)
        v1_recalls.append(v1_r)
        v2_recalls.append(v2_r)

        print(f"[{scenario['name']}]")
        print(f"  should surface: {sorted(expected)}")
        print(f"  V1 selected:    {sorted(v1)}  (precision={v1_p:.2f}, recall={v1_r:.2f})")
        print(f"  V2 selected:    {sorted(v2)}  (precision={v2_p:.2f}, recall={v2_r:.2f})")
        missed_by_v1 = expected - v1
        missed_by_v2 = expected - v2
        if missed_by_v1 or missed_by_v2:
            print(f"  V1 missed: {sorted(missed_by_v1) or 'none'} | V2 missed: {sorted(missed_by_v2) or 'none'}")
        print()

    avg_v1 = sum(v1_recalls) / len(v1_recalls)
    avg_v2 = sum(v2_recalls) / len(v2_recalls)
    print(f"Average recall  V1: {avg_v1:.0%}   V2: {avg_v2:.0%}   (delta: {avg_v2 - avg_v1:+.0%})")


WEIGHT_SPLITS = [
    ("0.5 / 0.5", 0.5, 0.5),
    ("0.4 / 0.6 (shipped)", 0.4, 0.6),
    ("0.3 / 0.7", 0.3, 0.7),
    ("0.2 / 0.8", 0.2, 0.8),
    ("0.6 / 0.4 (reversed)", 0.6, 0.4),
]


def run_weight_sensitivity():
    """Checks whether the 0.4/0.6 recency/importance split is a robust choice, or whether it just
    happens to work on these 4 hand-written scenarios. If recall stays high across a range of splits,
    the formula's shape (weighted sum + guaranteed-most-recent) is doing the real work, not the exact
    numbers. If recall is only high right at 0.4/0.6, that split is overfit to this test set."""
    print("\nWeight sensitivity sweep (recency_weight / importance_weight)\n")
    print(f"{'split':22s} " + " | ".join(s["name"][:18].ljust(18) for s in SCENARIOS) + " | avg recall")
    print("-" * (24 + 21 * len(SCENARIOS) + 12))

    for label, rw, iw in WEIGHT_SPLITS:
        recalls = []
        for scenario in SCENARIOS:
            selected = set(
                e.session_id for e in select_top_memories(
                    scenario["entries"], limit=5, recency_weight=rw, importance_weight=iw
                )
            )
            _, recall = precision_recall(selected, scenario["should_surface"])
            recalls.append(recall)
        avg = sum(recalls) / len(recalls)
        row = f"{label:22s} " + " | ".join(f"{r:.0%}".ljust(18) for r in recalls) + f" | {avg:.0%}"
        print(row)


if __name__ == "__main__":
    run_eval()
    run_weight_sensitivity()
