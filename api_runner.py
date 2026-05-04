import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))

from agents.pipeline import ArcanaPipeline

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No question provided"}))
        os._exit(1)

    question = sys.argv[1]
    user_id = sys.argv[2] if len(sys.argv) > 2 else "anonymous"
    remember = len(sys.argv) > 3 and sys.argv[3].lower() == "true"

    try:
        pipeline = ArcanaPipeline(
            project_id=os.environ.get("VERTEX_PROJECT", "ieor-4576-487001"),
            region=os.environ.get("VERTEX_LOCATION", "us-central1"),
        )
        result = pipeline.run(question, user_id, remember)
        print(json.dumps(result.model_dump(), default=str))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.stdout.flush()
    finally:
        os._exit(0)

if __name__ == "__main__":
    main()
