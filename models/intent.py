from pydantic import BaseModel, Field
from typing import Literal


class IntentResult(BaseModel):
    intent: Literal["goal", "habit", "unknown"]
    confidence: float = Field(description="Уверенность от 0 до 1")
