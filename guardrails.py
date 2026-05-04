from pydantic import BaseModel


class BoundaryResponse(BaseModel):
    blocked: bool
    title: str = ""
    message: str = ""


def _has_any(text: str, terms: list[str]) -> bool:
    return any(term in text for term in terms)


def get_boundary_response(question: str) -> BoundaryResponse:
    text = question.lower()

    if _has_any(text, ["suicide", "kill myself", "end my life", "self harm", "hurt myself"]):
        return BoundaryResponse(
            blocked=True,
            title="This needs real support, not a reading",
            message=(
                "I cannot draw cards for immediate self-harm or crisis questions. "
                "Please contact local emergency services or a trusted person now. "
                "If you are in the U.S., call or text 988 for immediate support."
            ),
        )

    if _has_any(text, ["when will i die", "when am i going to die", "how long will i live", "my death date", "date of my death", "predict my death", "will i die soon", "am i going to die soon", "lifespan", "life expectancy"]):
        return BoundaryResponse(
            blocked=True,
            title="A death prediction would not be ethical",
            message=(
                "I cannot draw cards to predict when you or another person will die. "
                "If this question is coming from fear, you can ask a reflective question instead: "
                "What would help me feel more grounded and alive right now?"
            ),
        )

    if _has_any(text, ["kill ", "murder", "hurt someone", "poison", "revenge", "weapon"]):
        return BoundaryResponse(
            blocked=True,
            title="I cannot help plan harm",
            message=(
                "Arcana can help you name anger, fear, or betrayal, but it will not turn those feelings into instructions. "
                "Try asking: What is the safest next step for me right now?"
            ),
        )

    if _has_any(text, ["hack", "password", "spy on", "track my", "stalk", "blackmail", "dox", "break into"]):
        return BoundaryResponse(
            blocked=True,
            title="That crosses a privacy boundary",
            message=(
                "I cannot draw for questions about spying, hacking, coercion, or invading someone else's privacy. "
                "A better reading would ask what clarity or boundary you need without violating another person."
            ),
        )

    if _has_any(text, ["diagnose", "cancer", "pregnant", "pregnancy", "disease", "medical", "lawsuit", "legal advice", "stock", "crypto", "lottery"]):
        return BoundaryResponse(
            blocked=True,
            title="This should not be decided by cards",
            message=(
                "I cannot replace medical, legal, or financial advice. "
                "If you want, reframe the question around your emotions, preparation, "
                "or the conversation you need to have with a qualified professional."
            ),
        )

    if _has_any(text, ["make him love me", "make her love me", "force them", "curse", "control them", "manipulate"]):
        return BoundaryResponse(
            blocked=True,
            title="Love readings need consent",
            message=(
                "I cannot help with controlling another person. You can still ask a powerful question: "
                "What pattern am I repeating, and what boundary would help me love without losing myself?"
            ),
        )

    tarot_signals = [
        "love",
        "relationship",
        "career",
        "job",
        "work",
        "future",
        "choice",
        "decision",
        "feel",
        "stuck",
        "move",
        "path",
        "should",
        "why",
        "friend",
        "family",
        "money",
        "growth",
        "healing",
    ]
    off_topic_signals = ["code", "debug", "recipe", "homework", "translate", "weather", "calculate", "math", "summarize"]

    if not _has_any(text, tarot_signals) and _has_any(text, off_topic_signals):
        return BoundaryResponse(
            blocked=True,
            title="This is outside a tarot reading",
            message=(
                "Arcana is built for reflective questions about choices, relationships, emotions, and life patterns. "
                "Try turning this into a personal question, such as: What am I avoiding in this decision?"
            ),
        )

    return BoundaryResponse(blocked=False)
