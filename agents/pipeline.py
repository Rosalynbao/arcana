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
    boundary_decision: str
    decline_title: str
    decline_message: str
    tone: str
    memory_relevance: str
    history_hint: str
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
        self.graph = self._build_graph()

    def _build_graph(self):
        graph = StateGraph(PipelineState)
        graph.add_node("guardrail_hard_check", self._node_guardrail_hard_check)
        graph.add_node("classify_intent", self._node_classify_intent)
        graph.add_node("triage_agent", self._node_triage_agent)
        graph.add_node("pre_consult", self._node_pre_consult)
        graph.add_node("determine_spread", self._node_determine_spread)
        graph.add_node("draw_cards", self._node_draw_cards)
        graph.add_node("standard_interpretation", self._node_standard_interpretation)
        graph.add_node("emotional_interpretation", self._node_emotional_interpretation)
        graph.add_node("long_term_reflection", self._node_long_term_reflection)
        graph.add_node("summarize", self._node_summarize)

        graph.set_entry_point("guardrail_hard_check")

        graph.add_conditional_edges(
            "guardrail_hard_check",
            lambda s: "blocked" if s["hard_blocked"] else "pass",
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
        graph.add_conditional_edges(
            "draw_cards",
            self._route_interpretation,
            {
                "long_term_reflection": "long_term_reflection",
                "emotional_interpretation": "emotional_interpretation",
                "standard_interpretation": "standard_interpretation",
            },
        )
        graph.add_edge("standard_interpretation", "summarize")
        graph.add_edge("emotional_interpretation", "summarize")
        graph.add_edge("long_term_reflection", "summarize")
        graph.add_edge("summarize", END)

        return graph.compile()

    def _route_interpretation(self, state: PipelineState) -> str:
        if state["remember"] and state["memory_relevance"] == "deep":
            return "long_term_reflection"
        if state["tone"] == "emotional_sensitive":
            return "emotional_interpretation"
        return "standard_interpretation"

    # --- nodes ---

    def _node_guardrail_hard_check(self, state: PipelineState) -> dict:
        boundary = get_boundary_response(state["query"])
        if boundary.blocked:
            return {
                "hard_blocked": True,
                "hard_block_title": boundary.title,
                "hard_block_message": boundary.message,
            }
        return {"hard_blocked": False}

    def _node_classify_intent(self, state: PipelineState) -> dict:
        prompt = PromptTemplate.from_template(
            "Classify the intent of this query into ONE of: [Love, Career, Wealth, General].\n"
            "Query: {query}\nOutput ONLY the category name."
        )
        intent = (prompt | self.llm).invoke({"query": state["query"]}).content.strip()
        return {"intent": intent}

    def _node_triage_agent(self, state: PipelineState) -> dict:
        prompt = PromptTemplate.from_template(
            "You are the Triage Agent for Arcana, a tarot reflection product grounded in narrative therapy.\n"
            "User question: '{query}'\n"
            "Classified intent: {intent}\n"
            "User has reading memory enabled: {remember}\n"
            "User's reading history:\n{memory_context}\n\n"
            "Decide boundary_decision, tone, and memory_relevance for this question."
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
        }

    def _node_pre_consult(self, state: PipelineState) -> dict:
        prompt = PromptTemplate.from_template(
            "You are a Tarot reader using narrative therapy.\n"
            "User asked: '{query}'. Intent: {intent}.\n"
            "Their reading history:\n{memory_context}\n\n"
            "Ask ONE brief empathetic clarifying question. "
            "If they have past readings, gently acknowledge any recurring themes."
        )
        pre_consult = (prompt | self.llm).invoke({
            "query": state["query"], "intent": state["intent"], "memory_context": state["memory_context"]
        }).content.strip()
        return {"pre_consult_question": pre_consult}

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
        return "Do not reference the user's reading history."

    def _node_standard_interpretation(self, state: PipelineState) -> dict:
        prompt = PromptTemplate.from_template(
            "You are Arcana, a Tarot reader trained in Jungian psychology and narrative therapy.\n"
            "User asked: '{query}'\nSpread: {spread_name}\nCards:\n{cards_text}\n\n"
            "{history_line}\n\n"
            "Write for a polished mobile product, not an essay.\n"
            "Format exactly as:\n"
            "Core Signal: one sentence, max 28 words.\n"
            "Insight 1: max 45 words.\n"
            "Insight 2: max 45 words.\n"
            "Insight 3: max 45 words.\n"
            "Focus on self-reflection, not prediction. No greetings, no preamble, no markdown."
        )
        interpretation = (prompt | self.llm).invoke({
            "query": state["query"],
            "spread_name": state["spread_name"],
            "cards_text": self._cards_text(state),
            "history_line": self._history_line(state),
        }).content.strip()
        return {"interpretation": interpretation}

    def _node_emotional_interpretation(self, state: PipelineState) -> dict:
        prompt = PromptTemplate.from_template(
            "You are Arcana, a Tarot reader trained in Jungian psychology and narrative therapy.\n"
            "This user's question carries real emotional weight. Read gently: acknowledge the feeling "
            "first, slow the pace, avoid anything that could sound like a verdict or a diagnosis.\n"
            "User asked: '{query}'\nSpread: {spread_name}\nCards:\n{cards_text}\n\n"
            "{history_line}\n\n"
            "Write for a polished mobile product, not an essay.\n"
            "Format exactly as:\n"
            "Core Signal: one sentence, max 28 words, gentle in tone.\n"
            "Insight 1: max 45 words.\n"
            "Insight 2: max 45 words.\n"
            "Insight 3: max 45 words.\n"
            "Focus on self-reflection and emotional grounding, not prediction. No greetings, no preamble, no markdown."
        )
        interpretation = (prompt | self.llm).invoke({
            "query": state["query"],
            "spread_name": state["spread_name"],
            "cards_text": self._cards_text(state),
            "history_line": self._history_line(state),
        }).content.strip()
        return {"interpretation": interpretation}

    def _node_long_term_reflection(self, state: PipelineState) -> dict:
        prompt = PromptTemplate.from_template(
            "You are Arcana, a Tarot reader trained in Jungian psychology and narrative therapy.\n"
            "This reading clearly connects to a recurring pattern in the user's history. Trace the arc: "
            "name what has shifted, what has stayed the same, and what this new reading adds to that "
            "ongoing story. This is a growth-oriented reading, not a repeat of the same advice.\n"
            "User asked: '{query}'\nSpread: {spread_name}\nCards:\n{cards_text}\n\n"
            "Their reading history:\n{memory_context}\n\n"
            "Write for a polished mobile product, not an essay.\n"
            "Format exactly as:\n"
            "Core Signal: one sentence, max 28 words, naming the through-line across readings.\n"
            "Insight 1: max 45 words.\n"
            "Insight 2: max 45 words.\n"
            "Insight 3: max 45 words.\n"
            "Focus on growth and self-reflection, not prediction. No greetings, no preamble, no markdown."
        )
        interpretation = (prompt | self.llm).invoke({
            "query": state["query"],
            "spread_name": state["spread_name"],
            "cards_text": self._cards_text(state),
            "memory_context": state["memory_context"],
        }).content.strip()
        return {"interpretation": interpretation}

    def _node_summarize(self, state: PipelineState) -> dict:
        prompt = PromptTemplate.from_template(
            "Based on this Tarot reading, give exactly 2 concrete actions.\n"
            "Each action must be under 35 words.\n"
            "Format exactly as:\n"
            "1. **Short action title:** one specific action.\n"
            "2. **Short action title:** one specific action.\n"
            "No introduction or conclusion.\n"
            "Reading: {interpretation}"
        )
        summary = (prompt | self.llm).invoke({"interpretation": state["interpretation"]}).content.strip()
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
            "boundary_decision": "",
            "decline_title": "",
            "decline_message": "",
            "tone": "standard",
            "memory_relevance": "none",
            "history_hint": "",
            "pre_consult_question": "",
            "spread_name": "",
            "card_positions": [],
            "num_cards": 0,
            "cards_drawn": [],
            "interpretation": "",
            "summary_advice": "",
            "route": "",
        }

        result = self.graph.invoke(initial_state)

        if result["hard_blocked"]:
            raise ValueError(f"{result['hard_block_title']}: {result['hard_block_message']}")
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
