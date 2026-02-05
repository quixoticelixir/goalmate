from gigachat import GigaChat
from langchain.chat_models.base import BaseChatModel
from langchain.schema import AIMessage, HumanMessage


class GigaChatLLM(BaseChatModel):
    def __init__(self, credentials: str):
        self.client = GigaChat(
            credentials=credentials,
            model="GigaChat-2",
            timeout=30,
            verify_ssl_certs=False
        )

    def _generate(self, messages, stop=None):
        # Берём последнее сообщение пользователя
        prompt = messages[-1].content

        response = self.client.chat(prompt)

        return {
            "generations": [[
                {
                    "text": response.choices[0].message.content,
                    "message": AIMessage(
                        content=response.choices[0].message.content
                    )
                }
            ]]
        }

    @property
    def _llm_type(self) -> str:
        return "gigachat-2"
