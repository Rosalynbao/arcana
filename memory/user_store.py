import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from pydantic import BaseModel
from typing import Optional

MEMORY_DIR = Path(__file__).parent.parent / "data" / "memory"
MEMORY_DIR.mkdir(parents=True, exist_ok=True)

RECENCY_HALF_LIFE_DAYS = 30.0
RECENCY_WEIGHT = 0.4
IMPORTANCE_WEIGHT = 0.6


class MemoryEntry(BaseModel):
    session_id: str
    user_id: str
    timestamp: str
    question: str
    intent: str
    cards: list[str]
    reading_summary: str
    emotion_type: str
    importance: int = 5
    is_resolved: bool = False
    followup_note: Optional[str] = None
    route: Optional[str] = None


def _user_file(user_id: str) -> Path:
    safe = "".join(c for c in user_id if c.isalnum() or c in "-_")
    if not safe:
        safe = "anonymous"
    return MEMORY_DIR / f"{safe}.json"


def save_reading(entry: MemoryEntry) -> None:
    path = _user_file(entry.user_id)
    entries = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    entries.append(entry.model_dump())
    path.write_text(json.dumps(entries, indent=2, default=str), encoding="utf-8")


def update_reading_followup(
    user_id: str,
    session_id: str,
    followup_note: str,
    is_resolved: bool,
) -> bool:
    path = _user_file(user_id)
    if not path.exists():
        return False

    entries = json.loads(path.read_text(encoding="utf-8"))
    updated = False
    for entry in entries:
        if entry.get("session_id") == session_id:
            entry["followup_note"] = followup_note
            entry["is_resolved"] = is_resolved
            updated = True
            break

    if updated:
        path.write_text(json.dumps(entries, indent=2, default=str), encoding="utf-8")
    return updated


def _recency_score(timestamp: str, half_life_days: float = RECENCY_HALF_LIFE_DAYS) -> float:
    try:
        ts = datetime.fromisoformat(timestamp)
    except ValueError:
        return 0.0
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    days_elapsed = max((datetime.now(timezone.utc) - ts).total_seconds() / 86400, 0.0)
    return math.exp(-math.log(2) * days_elapsed / half_life_days)


def _salience(
    entry: MemoryEntry,
    recency_weight: float = RECENCY_WEIGHT,
    importance_weight: float = IMPORTANCE_WEIGHT,
) -> float:
    """Weighted sum, not a product: a very old but high-importance memory (recency -> ~0) must still be
    able to outscore a recent but trivial one, which a multiplicative recency*importance score cannot do
    once decay has crushed the recency term close to zero."""
    recency = _recency_score(entry.timestamp)
    importance_norm = entry.importance / 10
    return recency_weight * recency + importance_weight * importance_norm


def select_top_memories(
    memories: list[MemoryEntry],
    limit: int = 5,
    recency_weight: float = RECENCY_WEIGHT,
    importance_weight: float = IMPORTANCE_WEIGHT,
) -> list[MemoryEntry]:
    """Always keeps the single most recent entry (conversational continuity), then fills the rest of the
    window by salience so an old-but-important memory isn't crowded out by a run of recent trivial ones.
    Pure function over an in-memory list so eval scripts can exercise the exact selection logic without
    touching disk. Weights are overridable so eval scripts can sanity-check how sensitive the result is
    to the specific 0.4/0.6 split, not just whether that one split happens to work."""
    if not memories or limit <= 0:
        return []

    most_recent = max(memories, key=lambda m: m.timestamp)
    remaining = [m for m in memories if m.session_id != most_recent.session_id]
    ranked = sorted(
        remaining,
        key=lambda m: _salience(m, recency_weight, importance_weight),
        reverse=True,
    )[: limit - 1]

    top = [most_recent] + ranked
    return sorted(top, key=lambda m: m.timestamp)


def get_user_history(user_id: str, limit: int = 5) -> list[MemoryEntry]:
    path = _user_file(user_id)
    if not path.exists():
        return []
    entries = json.loads(path.read_text(encoding="utf-8"))
    memories = [MemoryEntry(**e) for e in entries]
    return select_top_memories(memories, limit)


def build_memory_context(user_id: str) -> str:
    history = get_user_history(user_id)
    if not history:
        return "This is the user's first reading. No prior history."
    lines = ["Past readings for this user:"]
    for e in reversed(history):
        lines.append(
            f"- [{e.timestamp[:10]}] Topic: {e.intent} | "
            f"Cards: {', '.join(e.cards[:2])} | Summary: {e.reading_summary[:80]}..."
        )
        if e.followup_note:
            status = "resolved" if e.is_resolved else "still open"
            lines.append(f"  User follow-up ({status}): {e.followup_note[:180]}")
    return "\n".join(lines)
