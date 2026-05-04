from agents.pipeline import ArcanaPipeline

PROJECT_ID = "ieor-4576-487001"
REGION = "us-central1"


def main():
    print("Initializing Arcana Pipeline...")
    pipeline = ArcanaPipeline(project_id=PROJECT_ID, region=REGION)

    test_query = "I feel very confused about my current job, should I quit?"
    print(f"\nUser Query: {test_query}\n")
    print("-" * 40)

    try:
        result = pipeline.run(test_query)

        print("\n" + "=" * 40)
        print("ARCANA READING RESULTS")
        print("=" * 40)
        print(f"Intent: {result.intent}\n")
        print(f"Pre-Consult Question:\n{result.pre_consult_question}\n")
        print(f"Cards Drawn: {', '.join(result.cards_drawn)}\n")
        print(f"Interpretation:\n{result.interpretation}\n")
        print(f"Actionable Advice:\n{result.summary_advice}")
        print("=" * 40)

    except Exception as e:
        print(f"\nPipeline execution failed. Error details: {e}")


if __name__ == "__main__":
    main()
