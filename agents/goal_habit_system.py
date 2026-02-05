# backend/agents/goal_habit_system.py
from agents.intent_agent import IntentOrchestratorAgent
from agents.goal_agent import GoalAgent
from agents.habit_agent import HabitAgent

class GoalHabitMultiAgentSystem:
    def __init__(self, llm):
        self.intent_agent = IntentOrchestratorAgent(llm)
        self.goal_agent = GoalAgent(llm)
        self.habit_agent = HabitAgent(llm)

    def process(self, user_input: str) -> dict:
        intent = self.intent_agent.detect_intent(user_input)

        if intent.intent == "goal":
            goal = self.goal_agent.extract_goal(user_input)
            result = {
                "type": "create_goal",
                "payload": goal.model_dump()
            }
            # 🔴 ОТЛАДКА: что отправляем клиенту?
            print(">>> GOAL RESULT:", result)
            return result

        if intent.intent == "habit":
            habit = self.habit_agent.extract_habit_action(user_input)
            return {
                "type": "create_habit",
                "payload": habit.model_dump()
            }
        return {
            "type": "clarify",
            "payload": {"question": "Я пока не понял, что ты хочешь сделать"}
        }