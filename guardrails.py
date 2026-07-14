from pydantic import BaseModel


class BoundaryResponse(BaseModel):
    blocked: bool
    title: str = ""
    message: str = ""


def _has_any(text: str, terms: list[str]) -> bool:
    return any(term in text for term in terms)


def get_boundary_response(question: str) -> BoundaryResponse:
    # Zero-tolerance categories only. Softer, context-dependent calls (death predictions,
    # medical/legal/financial mentions, off-topic questions) are judged by the Triage
    # Agent in agents/pipeline.py, since keyword matching over-blocks legitimate
    # emotional questions that merely touch those topics.
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

    if _has_any(text, ["make him love me", "make her love me", "force them", "curse", "control them", "manipulate"]):
        return BoundaryResponse(
            blocked=True,
            title="Love readings need consent",
            message=(
                "I cannot help with controlling another person. You can still ask a powerful question: "
                "What pattern am I repeating, and what boundary would help me love without losing myself?"
            ),
        )

    return BoundaryResponse(blocked=False)
