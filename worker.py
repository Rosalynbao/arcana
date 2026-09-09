"""Persistent Python worker for the Next.js API routes.

Historically every /api/read, /api/followup, /api/memory request spawned a brand-new
Python process (see api_runner.py / api_followup_runner.py / api_memory_runner.py),
which re-imports langchain/langgraph/langchain-google-vertexai and re-builds a fresh
ChatVertexAI client on every single request before any model call even happens. This
worker is started once per Node.js server process and kept alive: it reads one JSON
request per line from stdin and writes one JSON response per line to stdout, so the
pipeline/model clients are constructed exactly once and reused across requests.
"""

import json
import os
import sys
import threading

sys.path.insert(0, os.path.dirname(__file__))

from agents.pipeline import ArcanaPipeline
from memory.user_store import update_reading_followup

PROJECT_ID = os.environ.get("VERTEX_PROJECT", "ieor-4576-487001")
REGION = os.environ.get("VERTEX_LOCATION", "us-central1")

_pipeline = None
_pipeline_lock = threading.Lock()


def get_pipeline() -> ArcanaPipeline:
    global _pipeline
    if _pipeline is None:
        with _pipeline_lock:
            if _pipeline is None:
                _pipeline = ArcanaPipeline(project_id=PROJECT_ID, region=REGION)
    return _pipeline


def handle(req: dict) -> dict:
    action = req.get("action")
    try:
        if action == "read":
            pipeline = get_pipeline()
            result = pipeline.run(
                req["question"],
                req.get("userId", "anonymous"),
                bool(req.get("remember", False)),
            )
            return result.model_dump()

        if action == "followup":
            pipeline = get_pipeline()
            reply = pipeline.follow_up(
                req["question"], req["reading"], req.get("userId", "anonymous")
            )
            return {"reply": reply}

        if action == "memory":
            updated = update_reading_followup(
                req["userId"],
                req["sessionId"],
                req.get("note", ""),
                bool(req.get("isResolved", False)),
            )
            return {"updated": updated}

        return {"error": f"Unknown action: {action!r}"}
    except Exception as e:  # noqa: BLE001 - reported back over the protocol, not raised
        return {"error": str(e)}


def main():
    # Build the pipeline eagerly at startup so the cost is paid once, at process
    # boot, instead of on the first real request.
    get_pipeline()
    sys.stderr.write("[worker] ready\n")
    sys.stderr.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            print(json.dumps({"id": None, "error": f"bad request json: {e}"}), flush=True)
            continue

        req_id = req.get("id")
        result = handle(req)
        print(json.dumps({"id": req_id, **result}, default=str), flush=True)


if __name__ == "__main__":
    main()
