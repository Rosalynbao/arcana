import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from memory.user_store import update_reading_followup


def main():
    if len(sys.argv) < 5:
        print(json.dumps({"error": "user id, session id, note, and status are required"}))
        os._exit(1)

    user_id = sys.argv[1]
    session_id = sys.argv[2]
    note = sys.argv[3]
    is_resolved = sys.argv[4].lower() == "true"

    try:
        updated = update_reading_followup(user_id, session_id, note, is_resolved)
        print(json.dumps({"updated": updated}))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.stdout.flush()
    finally:
        os._exit(0)


if __name__ == "__main__":
    main()
