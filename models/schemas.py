from pydantic import BaseModel
from typing import List, Optional

class UserQuery(BaseModel):
    user_id: str
    query: str

class TarotCard(BaseModel):
    name: str
    orientation: str

class PipelineResult(BaseModel):
    intent: str
    spread_name: str
    card_positions: List[str]
    pre_consult_question: str
    cards_drawn: List[str]
    interpretation: str
    summary_advice: str
    star_color: str = "#b388ff"
    session_id: str = ""
    memory_enabled: bool = False
    route: str = ""
