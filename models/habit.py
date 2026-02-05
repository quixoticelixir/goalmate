from pydantic import BaseModel, Field
from typing import Literal, Optional


class HabitAction(BaseModel):
    action: Literal["create", "track"]
    title: str = Field(description="Название привычки")
    frequency: Optional[str] = Field(description="daily / weekly")
    amount: Optional[str] = Field(description="Количество (например: 2 литра)")
