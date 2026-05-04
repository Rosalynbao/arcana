import uuid
from pydantic import BaseModel, Field
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

class ArcanaPipeline:
    def __init__(self, project_id: str, region: str):
        self.llm = ChatVertexAI(
            model="gemini-2.5-pro",
            project=project_id,
            location=region,
            temperature=0.7
        )

    def _get_intent(self, query: str) -> str:
        prompt = PromptTemplate.from_template(
            "Classify the intent of this query into ONE of: [Love, Career, Wealth, General].\n"
            "Query: {query}\nOutput ONLY the category name."
        )
        return (prompt | self.llm).invoke({"query": query}).content.strip()

    def _get_pre_consult(self, query: str, intent: str, memory_context: str) -> str:
        prompt = PromptTemplate.from_template(
            "You are a Tarot reader using narrative therapy.\n"
            "User asked: '{query}'. Intent: {intent}.\n"
            "Their reading history:\n{memory_context}\n\n"
            "Ask ONE brief empathetic clarifying question. "
            "If they have past readings, gently acknowledge any recurring themes."
        )
        return (prompt | self.llm).invoke({
            "query": query, "intent": intent, "memory_context": memory_context
        }).content.strip()

    def _determine_spread(self, query: str) -> SpreadDecision:
        prompt = PromptTemplate.from_template(
            "You are a master Tarot reader. Analyze: '{query}'.\n"
            "Choose the best spread (e.g., Past/Present/Future, Problem/Cause/Advice, Two Choices).\n"
            "Provide spread name, position meanings, and card count."
        )
        return self.llm.with_structured_output(SpreadDecision).invoke(prompt.format(query=query))

    def _get_interpretation(self, query: str, spread_name: str, card_positions: list[str],
                             cards: list[str], memory_context: str) -> str:
        cards_text = "\n".join(f"- '{pos}': {card}" for pos, card in zip(card_positions, cards))
        prompt = PromptTemplate.from_template(
            "You are Arcana, a Tarot reader trained in Jungian psychology and narrative therapy.\n"
            "User asked: '{query}'\nSpread: {spread_name}\nCards:\n{cards_text}\n\n"
            "Their reading history:\n{memory_context}\n\n"
            "Write for a polished mobile product, not an essay.\n"
            "Format exactly as:\n"
            "Core Signal: one sentence, max 28 words.\n"
            "Insight 1: max 45 words.\n"
            "Insight 2: max 45 words.\n"
            "Insight 3: max 45 words.\n"
            "If there are recurring patterns from history, mention them in only one insight. "
            "Focus on self-reflection, not prediction. No greetings, no preamble, no markdown."
        )
        return (prompt | self.llm).invoke({
            "query": query, "spread_name": spread_name,
            "cards_text": cards_text, "memory_context": memory_context
        }).content.strip()

    def _get_summary(self, interpretation: str) -> str:
        prompt = PromptTemplate.from_template(
            "Based on this Tarot reading, give exactly 2 concrete actions.\n"
            "Each action must be under 35 words.\n"
            "Format exactly as:\n"
            "1. **Short action title:** one specific action.\n"
            "2. **Short action title:** one specific action.\n"
            "No introduction or conclusion.\n"
            "Reading: {interpretation}"
        )
        return (prompt | self.llm).invoke({"interpretation": interpretation}).content.strip()

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

        boundary = get_boundary_response(query)
        if boundary.blocked:
            raise ValueError(f"{boundary.title}: {boundary.message}")

        # Memory: load past readings context
        memory_context = (
            build_memory_context(user_id)
            if remember
            else "Memory is off for this reading. Treat the user as new and do not reference past readings."
        )

        print("[1/6] Analyzing intent...")
        intent = self._get_intent(query)

        print("[2/6] Generating pre-consultation question...")
        pre_consult = self._get_pre_consult(query, intent, memory_context)

        print("[3/6] Determining spread...")
        spread = self._determine_spread(query)

        print(f"[4/6] Drawing {spread.num_cards} cards...")
        cards = draw_cards(spread.num_cards)

        print("[5/6] Interpreting...")
        interpretation = self._get_interpretation(
            query, spread.spread_name, spread.card_positions, cards, memory_context
        )

        print("[6/6] Summarizing...")
        summary = self._get_summary(interpretation)

        star_color = get_star_color(cards)

        if remember:
            save_reading(MemoryEntry(
                session_id=session_id,
                user_id=user_id,
                timestamp=datetime.now(timezone.utc).isoformat(),
                question=query,
                intent=intent,
                cards=cards,
                reading_summary=interpretation[:200],
                emotion_type=intent.lower(),
            ))

        return PipelineResult(
            intent=intent,
            spread_name=spread.spread_name,
            card_positions=spread.card_positions,
            pre_consult_question=pre_consult,
            cards_drawn=cards,
            interpretation=interpretation,
            summary_advice=summary,
            star_color=star_color,
            session_id=session_id,
            memory_enabled=remember,
        )
