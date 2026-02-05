from pydantic import BaseModel, Field
from typing import Optional
from datetime import date


class GoalDraft(BaseModel):
    title: str = Field(description="Краткое название цели")
    description: Optional[str] = Field(description="Описание цели")
    deadline: Optional[date] = Field(description="Дедлайн цели")
