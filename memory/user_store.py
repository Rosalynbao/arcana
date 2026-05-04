import json
import os
from pathlib import Path
from pydantic import BaseModel
from typing import Optional

MEMORY_DIR = Path(__file__).parent.parent / "data" / "memory"
MEMORY_DIR.mkdir(parents=True, exist_ok=True)


class MemoryEntry(BaseModel):
    session_id: str
    user_id: str
    timestamp: str
    question: str
    intent: str
    cards: list[str]
    reading_summary: str
    emotion_type: str
    is_resolved: bool = False
    followup_note: Optional[str] = None


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


def get_user_history(user_id: str, limit: int = 5) -> list[MemoryEntry]:
    path = _user_file(user_id)
    if not path.exists():
        return []
    entries = json.loads(path.read_text(encoding="utf-8"))
    return [MemoryEntry(**e) for e in entries[-limit:]]


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
