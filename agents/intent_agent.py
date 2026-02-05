from models.intent import IntentResult


class IntentOrchestratorAgent:
    def __init__(self, llm):
        self.llm = llm

    def detect_intent(self, user_input: str) -> IntentResult:
        prompt = f"""
            Ты определяешь намерение пользователя.

            Интенты:
            - goal — постановка цели
            - habit — создание или трекинг привычки
            - unknown — другое

            Ответ ТОЛЬКО в JSON:
            {{
            "intent": "goal | habit | unknown",
            "confidence": число от 0 до 1
            }}

            Примеры:
            "хочу научиться играть на гитаре к концу года" → goal
            "хочу каждый день пить воду" → habit

            Запрос:
            "{user_input}"
            """

        response = self.llm.invoke(prompt)
        return IntentResult.model_validate_json(response.content)
