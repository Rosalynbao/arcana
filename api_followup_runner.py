import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from agents.pipeline import ArcanaPipeline


def main():
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Question, reading, and user id are required"}))
        os._exit(1)

    question = sys.argv[1]
    reading_payload = sys.argv[2]
    user_id = sys.argv[3]

    try:
        reading = json.loads(reading_payload)
        pipeline = ArcanaPipeline(
            project_id=os.environ.get("VERTEX_PROJECT", "ieor-4576-487001"),
            region=os.environ.get("VERTEX_LOCATION", "us-central1"),
        )
        reply = pipeline.follow_up(question, reading, user_id)
        print(json.dumps({"reply": reply}, default=str))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.stdout.flush()
    finally:
        os._exit(0)


if __name__ == "__main__":
    main()
