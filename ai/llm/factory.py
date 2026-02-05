import os
from ai.llm.gigachat import GigaChatLLM


def create_llm():
    giga_key = os.getenv("GIGACHAT_API_KEY")
    if not giga_key:
        raise RuntimeError("GIGACHAT_API_KEY is not set")

    return GigaChatLLM(credentials=giga_key)
