import functools
import sys
import time
import uuid
from typing import Literal, TypedDict
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, END
from langchain_google_vertexai import ChatVertexAI
from langchain_core.prompts import PromptTemplate
from models.schemas import PipelineResult
from tools.tarot_tool import draw_cards, get_star_color
from memory.user_store import save_reading, build_memory_context, MemoryEntry
from guardrails import get_boundary_response
from datetime import datetime, timezone


def _timed(func):
    """Diagnostic-only: logs how long each pipeline node takes to stderr (surfaced in
    Cloud Run logs via the worker's stderr passthrough) so the slow node(s) in the
    7-call chain can be identified instead of guessed at."""

    @functools.wraps(func)
    def wrapper(self, state, *args, **kwargs):
        start = time.monotonic()
        try:
            return func(self, state, *args, **kwargs)
        finally:
            elapsed = time.monotonic() - start
            print(f"[timing] {func.__name__}: {elapsed:.2f}s", file=sys.stderr, flush=True)

    return wrapper


class SemanticGuardrailDecision(BaseModel):
    blocked: bool = Field(
        description=(
            "True ONLY if the question expresses, even without using obvious trigger words, one of: "
            "(a) intent toward self-harm or suicide, (b) intent to harm/threaten another person, "
            "(c) intent to spy on, hack, stalk, or invade someone else's privacy, or (d) intent to "
            "control, manipulate, or coerce another person against their will. "
            "False for questions that merely mention these topics in a safe, reflective, metaphorical, "
            "or past-tense way (e.g. dream interpretation, grief, a completed breakup)."
        )
    )
    title: str = Field(default="", description="Short, gentle title, only if blocked.")
    message: str = Field(default="", description="Gentle redirect message, only if blocked.")


class PreConsultQuestion(BaseModel):
    """Diagnostic: same content as the old free-text pre_consult call, just wrapped in a
    single-field schema to test whether structured output is what makes the
    guardrail/triage/spread nodes faster than the free-text nodes on gemini-2.5-pro."""

    question: str = Field(description="One brief, empathetic clarifying question for the user.")


class InterpretationOutput(BaseModel):
    """Same content contract as the old free-text interpretation call. The node reassembles
    these fields into the exact 'Core Signal: ...\\nInsight 1: ...' text the frontend regex
    parser (getInsightCards/getTldr in page.tsx) already expects, so nothing downstream needs
    to change."""

    core_signal: str = Field(description="One sentence, no markdown, no greetings, no preamble.")
    insight_1: str = Field(description="Max 45 words, no markdown.")
    insight_2: str = Field(description="Max 45 words, no markdown.")
    insight_3: str = Field(description="Max 45 words, no markdown.")


class SummaryAction(BaseModel):
    title: str = Field(description="A short action title, a few words, no markdown.")
    action: str = Field(description="One specific, concrete action.")


class SummaryOutput(BaseModel):
    """Reassembled into the exact '1. **title:** action' text the frontend regex parser
    (getActionItems in page.tsx) already expects."""

    action_1: SummaryAction
    action_2: SummaryAction


class SpreadDecision(BaseModel):
    spread_name: str = Field(description="The name of the chosen Tarot spread.")
    card_positions: list[str] = Field(description="The specific meaning of each position.")
    num_cards: int = Field(description="Total number of cards. Must match length of card_positions.")


class TriageDecision(BaseModel):
    boundary_decision: Literal["proceed", "decline_gracefully"] = Field(
        description=(
            "Decline ONLY if the user is literally seeking a death-timing prediction, a literal "
            "medical/legal/financial diagnosis or decision, or the question has nothing to do with a "
            "reflective or emotional life question (e.g. coding help, homework, translation, trivia). "
            "Proceed if the question merely mentions illness, death, money, or legal trouble while "
            "fundamentally being about how the person feels or copes with it."
        )
    )
    decline_title: str = Field(default="", description="Short, gentle title, only if declining.")
    decline_message: str = Field(
        default="",
        description=(
            "If declining, a gentle message that redirects the user toward a valid reflective question. "
            "Never preachy, never robotic, never clinical."
        ),
    )
    tone: Literal["standard", "emotional_sensitive"] = Field(
        description=(
            "'emotional_sensitive' if the question carries heavy emotional weight (grief, heartbreak, "
            "despair, crisis-adjacent distress); otherwise 'standard'."
        )
    )
    memory_relevance: Literal["none", "light", "deep"] = Field(
        description=(
            "'none' if there is no history or no meaningful connection to this question. 'light' if there "
            "is a loose but real connection worth one soft mention (also fill history_hint). 'deep' if there "
            "is a strong, clear connection to a recurring pattern across multiple past readings."
        )
    )
    history_hint: str = Field(
        default="", description="A few-word theme to softly reference, only if memory_relevance is 'light'."
    )
    importance: int = Field(
        ge=1,
        le=10,
        description=(
            "How emotionally significant this reading is likely to be for the user later on, 1-10. "
            "Score high (7-10) for readings tied to major life decisions, grief, recurring conflict, or "
            "crisis-adjacent distress. Score low (1-3) for casual, low-stakes, or one-off questions."
        ),
    )


class PipelineState(TypedDict):
    query: str
    user_id: str
    remember: bool
    session_id: str
    memory_context: str
    intent: str
    hard_blocked: bool
    hard_block_title: str
    hard_block_message: str
    semantic_blocked: bool
    semantic_block_title: str
    semantic_block_message: str
    boundary_decision: str
    decline_title: str
    decline_message: str
    tone: str
    memory_relevance: str
    history_hint: str
    importance: int
    pre_consult_question: str
    spread_name: str
    card_positions: list[str]
    num_cards: int
    cards_drawn: list[str]
    interpretation: str
    summary_advice: str
    route: str


class ArcanaPipeline:
    def __init__(self, project_id: str, region: str):
        self.llm = ChatVertexAI(
            model="gemini-2.5-pro",
            project=project_id,
            location=region,
            temperature=0.7
        )
        # classify_intent is a plain 4-way category call (Love/Career/Wealth/General) with
        # no creative writing or safety judgment involved, so it doesn't need the pro-tier
        # reasoning model. Flash is both faster and cheaper here; the safety-critical
        # guardrail nodes and the interpretation node stay on gemini-2.5-pro.
        self.llm_fast = ChatVertexAI(
            model="gemini-2.5-flash",
            project=project_id,
            location=region,
            temperature=0.0,
        )
        self.graph = self._build_graph()

    def _build_graph(self):
        graph = StateGraph(PipelineState)
        graph.add_node("guardrail_hard_check", self._node_guardrail_hard_check)
        graph.add_node("guardrail_semantic_check", self._node_guardrail_semantic_check)
        graph.add_node("classify_intent", self._node_classify_intent)
        graph.add_node("triage_agent", self._node_triage_agent)
        graph.add_node("pre_consult", self._node_pre_consult)
        graph.add_node("determine_spread", self._node_determine_spread)
        graph.add_node("draw_cards", self._node_draw_cards)
        graph.add_node("interpretation", self._node_interpretation)
        graph.add_node("summarize", self._node_summarize)

        graph.set_entry_point("guardrail_hard_check")

        graph.add_conditional_edges(
            "guardrail_hard_check",
            lambda s: "blocked" if s["hard_blocked"] else "pass",
            {"blocked": END, "pass": "guardrail_semantic_check"},
        )
        graph.add_conditional_edges(
            "guardrail_semantic_check",
            lambda s: "blocked" if s["semantic_blocked"] else "pass",
            {"blocked": END, "pass": "classify_intent"},
        )
        graph.add_edge("classify_intent", "triage_agent")
        graph.add_conditional_edges(
            "triage_agent",
            lambda s: s["boundary_decision"],
            {"decline_gracefully": END, "proceed": "pre_consult"},
        )
        graph.add_edge("pre_consult", "determine_spread")
        graph.add_edge("determine_spread", "draw_cards")
        graph.add_edge("draw_cards", "interpretation")
        graph.add_edge("interpretation", "summarize")
        graph.add_edge("summarize", END)

        return graph.compile()

    def _route_interpretation(self, state: PipelineState) -> str:
        """Descriptive label for which modifiers shaped this reading (used for logging/eval, not routing)."""
        parts = []
        if state["remember"] and state["memory_relevance"] == "deep":
            parts.append("long_term_reflection")
        if state["tone"] == "emotional_sensitive":
            parts.append("emotional_interpretation")
        return "+".join(parts) if parts else "standard_interpretation"

    # --- nodes ---

    @_timed
    def _node_guardrail_hard_check(self, state: PipelineState) -> dict:
        boundary = get_boundary_response(state["query"])
        if boundary.blocked:
            return {
                "hard_blocked": True,
                "hard_block_title": boundary.title,
                "hard_block_message": boundary.message,
            }
        return {"hard_blocked": False}

    @_timed
    def _node_guardrail_semantic_check(self, state: PipelineState) -> dict:
        """Second, isolated safety layer: catches the same zero-tolerance categories as the keyword
        hard check when phrased without trigger words. Kept as its own single-purpose LLM call so it
        can be tested and monitored independently of triage_agent's unrelated product judgments
        (tone, memory_relevance, off-topic scope)."""
        prompt = PromptTemplate.from_template(
            "You are a safety classifier for Arcana, a tarot reflection product. Decide only whether "
            "this question, even if phrased indirectly or without obvious trigger words, expresses "
            "intent toward self-harm, harming another person, privacy invasion/stalking/hacking, or "
            "coercing/controlling another person.\n"
            "Question: '{query}'"
        )
        decision = self.llm.with_structured_output(SemanticGuardrailDecision).invoke(
            prompt.format(query=state["query"])
        )
        if decision.blocked:
            return {
                "semantic_blocked": True,
                "semantic_block_title": decision.title or "This needs a different kind of support",
                "semantic_block_message": decision.message or (
                    "I can't take this question as a reading. Please reach out to a trusted person or, "
                    "if you're in immediate danger, local emergency services."
                ),
            }
        return {"semantic_blocked": False}

    @_timed
    def _node_classify_intent(self, state: PipelineState) -> dict:
        prompt = PromptTemplate.from_template(
            "Classify the intent of this query into ONE of: [Love, Career, Wealth, General].\n"
            "Query: {query}\nOutput ONLY the category name."
        )
        intent = (prompt | self.llm_fast).invoke({"query": state["query"]}).content.strip()
        return {"intent": intent}

    @_timed
    def _node_triage_agent(self, state: PipelineState) -> dict:
        prompt = PromptTemplate.from_template(
            "You are the Triage Agent for Arcana, a tarot reflection product grounded in narrative therapy.\n"
            "User question: '{query}'\n"
            "Classified intent: {intent}\n"
            "User has reading memory enabled: {remember}\n"
            "User's reading history:\n{memory_context}\n\n"
            "Decide boundary_decision, tone, importance, and memory_relevance for this question.\n\n"
            "For memory_relevance, follow this rubric exactly:\n"
            "- 'none': the current question shares no person/relationship/goal/emotional theme with any "
            "past reading.\n"
            "- 'light': the current question shares only a topic category with a past reading (e.g. both "
            "about career) but is not clearly the same underlying situation continuing.\n"
            "- 'deep': at least one of the following holds — (a) the current question is a continuation "
            "of the same specific situation as a past reading (same relationship/decision/conflict), "
            "(b) the user explicitly references a past reading, or (c) the same theme or emotional "
            "pattern appears in 2 or more past readings, not just this one."
        )
        decision = self.llm.with_structured_output(TriageDecision).invoke(
            prompt.format(
                query=state["query"],
                intent=state["intent"],
                remember=state["remember"],
                memory_context=state["memory_context"],
            )
        )
        return {
            "boundary_decision": decision.boundary_decision,
            "decline_title": decision.decline_title,
            "decline_message": decision.decline_message,
            "tone": decision.tone,
            "memory_relevance": decision.memory_relevance if state["remember"] else "none",
            "history_hint": decision.history_hint,
            "importance": decision.importance,
        }

    @_timed
    def _node_pre_consult(self, state: PipelineState) -> dict:
        prompt = PromptTemplate.from_template(
            "You are a Tarot reader using narrative therapy.\n"
            "User asked: '{query}'. Intent: {intent}.\n"
            "Their reading history:\n{memory_context}\n\n"
            "Ask ONE brief empathetic clarifying question. "
            "If they have past readings, gently acknowledge any recurring themes."
        )
        decision = self.llm.with_structured_output(PreConsultQuestion).invoke(
            prompt.format(
                query=state["query"], intent=state["intent"], memory_context=state["memory_context"]
            )
        )
        return {"pre_consult_question": decision.question.strip()}

    @_timed
    def _node_determine_spread(self, state: PipelineState) -> dict:
        prompt = PromptTemplate.from_template(
            "You are a master Tarot reader. Analyze: '{query}'.\n"
            "Choose the best spread (e.g., Past/Present/Future, Problem/Cause/Advice, Two Choices).\n"
            "Provide spread name, position meanings, and card count."
        )
        spread = self.llm.with_structured_output(SpreadDecision).invoke(prompt.format(query=state["query"]))
        return {
            "spread_name": spread.spread_name,
            "card_positions": spread.card_positions,
            "num_cards": spread.num_cards,
        }

    @_timed
    def _node_draw_cards(self, state: PipelineState) -> dict:
        return {"cards_drawn": draw_cards(state["num_cards"])}

    def _cards_text(self, state: PipelineState) -> str:
        return "\n".join(
            f"- '{pos}': {card}" for pos, card in zip(state["card_positions"], state["cards_drawn"])
        )

    def _history_line(self, state: PipelineState) -> str:
        if state["memory_relevance"] == "light" and state["history_hint"]:
            return (
                f"Softly reference this recurring theme in exactly one insight, without dwelling on it: "
                f"{state['history_hint']}."
            )
        return (
            "Do not reference the user's reading history. Do not speculate about, allude to, or invent "
            "any past event, prior upheaval, or earlier pattern in this user's life that is not stated "
            "in their current question - treat this as a self-contained, present-moment reading."
        )

    @_timed
    def _node_interpretation(self, state: PipelineState) -> dict:
        is_emotional = state["tone"] == "emotional_sensitive"
        is_deep_memory = state["remember"] and state["memory_relevance"] == "deep"

        guidance_lines = []
        if is_emotional:
            guidance_lines.append(
                "This user's question carries real emotional weight. Read gently: acknowledge the "
                "feeling first, slow the pace, avoid anything that could sound like a verdict or a "
                "diagnosis."
            )
        if is_deep_memory:
            guidance_lines.append(
                "This reading clearly connects to a recurring pattern in the user's history. Trace the "
                "arc: name what has shifted, what has stayed the same, and what this new reading adds "
                "to that ongoing story. This is a growth-oriented reading, not a repeat of the same "
                "advice."
            )
        guidance = "\n".join(guidance_lines)

        history_line = (
            f"Their reading history:\n{state['memory_context']}" if is_deep_memory else self._history_line(state)
        )

        core_signal_note = "one sentence, max 28 words"
        if is_emotional:
            core_signal_note += ", gentle in tone"
        if is_deep_memory:
            core_signal_note += ", naming the through-line across readings"

        if is_deep_memory:
            focus_note = "growth and self-reflection"
        elif is_emotional:
            focus_note = "self-reflection and emotional grounding"
        else:
            focus_note = "self-reflection"

        prompt = PromptTemplate.from_template(
            "You are Arcana, a Tarot reader trained in Jungian psychology and narrative therapy.\n"
            "{guidance}\n"
            "User asked: '{query}'\nSpread: {spread_name}\nCards:\n{cards_text}\n\n"
            "{history_line}\n\n"
            "Write for a polished mobile product, not an essay. No greetings, no preamble, no "
            "markdown in any field.\n"
            "core_signal: {core_signal_note}.\n"
            "insight_1, insight_2, insight_3: each max 45 words.\n"
            "Focus on {focus_note}, not prediction."
        )
        decision = self.llm.with_structured_output(InterpretationOutput).invoke(
            prompt.format(
                guidance=guidance,
                query=state["query"],
                spread_name=state["spread_name"],
                cards_text=self._cards_text(state),
                history_line=history_line,
                core_signal_note=core_signal_note,
                focus_note=focus_note,
            )
        )
        # Reassembled to match the exact text shape the old free-text prompt produced, since
        # the frontend parses this string with regex (getInsightCards/getTldr in page.tsx).
        interpretation = (
            f"Core Signal: {decision.core_signal.strip()}\n"
            f"Insight 1: {decision.insight_1.strip()}\n"
            f"Insight 2: {decision.insight_2.strip()}\n"
            f"Insight 3: {decision.insight_3.strip()}"
        )
        return {"interpretation": interpretation}

    @_timed
    def _node_summarize(self, state: PipelineState) -> dict:
        prompt = PromptTemplate.from_template(
            "Based on this Tarot reading, give exactly 2 concrete actions.\n"
            "Each action must be under 35 words total (title + action). No introduction or "
            "conclusion.\n"
            "Reading: {interpretation}"
        )
        decision = self.llm.with_structured_output(SummaryOutput).invoke(
            prompt.format(interpretation=state["interpretation"])
        )
        # Reassembled to match the exact "1. **title:** action" text the old free-text prompt
        # produced, since the frontend parses this string with regex (getActionItems in page.tsx).
        summary = (
            f"1. **{decision.action_1.title.strip()}:** {decision.action_1.action.strip()}\n"
            f"2. **{decision.action_2.title.strip()}:** {decision.action_2.action.strip()}"
        )
        return {"summary_advice": summary, "route": self._route_interpretation(state)}

    def follow_up(self, question: str, reading: dict, user_id: str = "anonymous") -> str:
        boundary = get_boundary_response(question)
        if boundary.blocked:
            return f"{boundary.title}. {boundary.message}"

        memory_context = build_memory_context(user_id)
        cards = ", ".join(reading.get("cards_drawn", []))
        interpretation = reading.get("interpretation", "")
        original_question = reading.get("question", "")
        prompt = PromptTemplate.from_template(
            "You are Arcana, a reflective Tarot reader trained in Jungian psychology and narrative therapy.\n"
            "The user is asking a paid follow-up question after a completed reading.\n\n"
            "Original question: {original_question}\n"
            "Cards drawn: {cards}\n"
            "Original interpretation:\n{interpretation}\n\n"
            "User follow-up: {question}\n"
            "Relevant user history:\n{memory_context}\n\n"
            "Answer in a premium product voice. Be specific to the cards and the follow-up.\n"
            "Keep it under 110 words. Do not predict another person's private thoughts.\n"
            "Give one reflective interpretation and one grounded next step. No markdown."
        )
        return (prompt | self.llm).invoke({
            "original_question": original_question,
            "cards": cards,
            "interpretation": interpretation,
            "question": question,
            "memory_context": memory_context,
        }).content.strip()

    def run(self, query: str, user_id: str = "anonymous", remember: bool = False) -> PipelineResult:
        session_id = str(uuid.uuid4())
        memory_context = (
            build_memory_context(user_id)
            if remember
            else "Memory is off for this reading. Treat the user as new and do not reference past readings."
        )

        initial_state: PipelineState = {
            "query": query,
            "user_id": user_id,
            "remember": remember,
            "session_id": session_id,
            "memory_context": memory_context,
            "intent": "",
            "hard_blocked": False,
            "hard_block_title": "",
            "hard_block_message": "",
            "semantic_blocked": False,
            "semantic_block_title": "",
            "semantic_block_message": "",
            "boundary_decision": "",
            "decline_title": "",
            "decline_message": "",
            "tone": "standard",
            "memory_relevance": "none",
            "history_hint": "",
            "importance": 5,
            "pre_consult_question": "",
            "spread_name": "",
            "card_positions": [],
            "num_cards": 0,
            "cards_drawn": [],
            "interpretation": "",
            "summary_advice": "",
            "route": "",
        }

        _run_start = time.monotonic()
        result = self.graph.invoke(initial_state)
        print(f"[timing] TOTAL graph.invoke: {time.monotonic() - _run_start:.2f}s", file=sys.stderr, flush=True)

        if result["hard_blocked"]:
            raise ValueError(f"{result['hard_block_title']}: {result['hard_block_message']}")
        if result["semantic_blocked"]:
            raise ValueError(f"{result['semantic_block_title']}: {result['semantic_block_message']}")
        if result["boundary_decision"] == "decline_gracefully":
            raise ValueError(f"{result['decline_title']}: {result['decline_message']}")

        star_color = get_star_color(result["cards_drawn"])

        if remember:
            save_reading(MemoryEntry(
                session_id=session_id,
                user_id=user_id,
                timestamp=datetime.now(timezone.utc).isoformat(),
                question=query,
                intent=result["intent"],
                cards=result["cards_drawn"],
                reading_summary=result["interpretation"][:200],
                emotion_type=result["intent"].lower(),
                importance=result["importance"],
                route=result["route"],
            ))

        return PipelineResult(
            intent=result["intent"],
            spread_name=result["spread_name"],
            card_positions=result["card_positions"],
            pre_consult_question=result["pre_consult_question"],
            cards_drawn=result["cards_drawn"],
            interpretation=result["interpretation"],
            summary_advice=result["summary_advice"],
            star_color=star_color,
            session_id=session_id,
            memory_enabled=remember,
            route=result["route"],
        )
