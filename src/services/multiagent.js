// multiagent.js
const { invoke } = require('./hfChat');

class IntentOrchestratorAgent {
  async detectIntent(userInput) {
    const prompt = `
Ты определяешь намерение пользователя.

Интенты:
- goal — постановка цели
- habit — создание или трекинг привычки
- unknown — другое

Ответ ТОЛЬКО в JSON:
{
"intent": "goal | habit | unknown",
"confidence": число от 0 до 1
}

Примеры:
"хочу научиться играть на гитаре к концу года" → goal
"хочу каждый день пить воду" → habit

Запрос:
"${userInput}"
`;
    const { content } = await invoke(prompt);
    try {
      return JSON.parse(content);
    } catch (e) {
      return { intent: 'unknown', confidence: 0.0 };
    }
  }
}

class GoalAgent {
  async extractGoal(userInput) {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yearEnd = `${today.getFullYear()}-12-31`;

    // === ШАГ 1: Просим модель извлечь ВСЁ ===
    const prompt = `
Ты — эксперт по SMART-целям. Преобразуй запрос пользователя в структуру цели.

Извлеки:
- **title**: краткое название действия (без срока!)
- **description**: 
    • если в запросе есть мотивация/детали — используй их;
    • если нет — придумай мотивирующее, полезное описание (1-2 предложения), которое поможет пользователю:
        - понять критерий успеха
        - вспомнить, зачем это нужно
        - измерить результат
- **deadline**: дата в формате ГГГГ-ММ-ДД. Используй относительные даты:
    • "за X дней/недель/месяцев" → прибавь к сегодня (${todayStr})
    • "до DD.MM" → текущий год
    • "к концу года" → ${yearEnd}
  Если срок не указан — null.

❗Правила:
- Никаких пояснений — ТОЛЬКО JSON.
- Описание должно быть 1-2 предложения, мотивирующее!
- Срок НЕ должен попадать в title или description.

Примеры:

"выучить английский за 2 месяца"
→ {"title":"Выучить английский","description":"Свободно общаться на повседневные темы, смотреть фильмы без субтитров и читать статьи в оригинале. Через 2 месяца буду уверенно чувствовать себя в англоязычной среде!","deadline":"2026-03-23"}

"сделать сайт, чтобы запустить бизнес"
→ {"title":"Сделать сайт","description":"Запустить онлайн-продажи товаров и получить достойную прибыль","deadline":null}

"пробежать марафон до 15 июня"
→ {"title":"Пробежать марафон","description":"Завершить дистанцию 42 км и получить медаль на финише","deadline":"2026-06-15"}

"научиться играть на гитаре"
→ {"title":"Научиться играть на гитаре","description":"Играть 5 любимых песен по памяти и удивить друзей!","deadline":null}

"сделать уборку"
→ {"title":"Сделать уборку","description":"Чистая квартира без пыли. Это поможет мне поддерживать иммунитет в порядке","deadline":null}

Запрос:
"${userInput}"
`;

    let title = userInput.trim().replace(/^хочу\s+/i, '');
    let description = '';
    let deadline = null;

    try {
      const { content } = await invoke(prompt);
      const result = JSON.parse(content);
      
      if (result.title) title = result.title;
      if (result.description !== undefined) description = result.description;
      if (result.deadline) deadline = result.deadline;
    } catch (e) {
      console.warn('Модель не смогла распарсить цель, используем fallback:', e.message);
    }

    // === ШАГ 2: Если модель не нашла deadline — парсим вручную ===
    if (!deadline) {
      // Парсим "за X месяцев"
      const monthMatch = userInput.match(/за\s+(\d+)\s*месяц/i);
      if (monthMatch) {
        const months = parseInt(monthMatch[1], 10);
        const d = new Date();
        d.setMonth(d.getMonth() + months);
        deadline = d.toISOString().split('T')[0];
        // Убираем срок из title, если он там остался
        title = title.replace(/за\s+\d+\s*месяц.*/i, '').trim();
      }

      // Парсим "за X недель"
      const weekMatch = userInput.match(/за\s+(\d+)\s*недел/i);
      if (weekMatch && !deadline) {
        const weeks = parseInt(weekMatch[1], 10);
        const d = new Date();
        d.setDate(d.getDate() + weeks * 7);
        deadline = d.toISOString().split('T')[0];
        title = title.replace(/за\s+\d+\s*недел.*/i, '').trim();
      }
    }

    return { 
      title: title || userInput, 
      description: description || '', 
      deadline 
    };
  }
}

class HabitAgent {
  async extractHabitAction(userInput) {
    const prompt = `
    Ты — строгий ассистент для создания привычек. ТВОЯ ЗАДАЧА — ИЗВЛЕЧЬ ДАННЫЕ БЕЗ ПОТЕРЬ.

    Из запроса пользователя извлеки:

    - **action**: "create" или "track"
    - **title**: ПОЛНОЕ НАЗВАНИЕ ПРИВЫЧКИ, как её сказал бы пользователь. ОБЯЗАТЕЛЬНО ВКЛЮЧИ:
        • длительность («30 минут», «1 час»)
        • объём («2 литра», «5 км»)
        • частоту/время («в день», «по утрам», «3 раза в неделю»)
        • объект («воду», «книгу»)
    Примеры ХОРОШИХ title:
        → "Читать 30 минут в день"
        → "Пить 2 литра воды"
        → "Бегать 5 км по утрам"
    НИКОГДА не сокращай до одного слова!

    - **description**: только если есть мотивация или условие (например: "чтобы меньше нервничать"). Иначе "".
    - **frequency**: "daily", "weekly" или null

    ❗ПРАВИЛА:
    1. Никаких пояснений — ТОЛЬКО JSON.
    2. Title ДОЛЖЕН быть понятен сам по себе.

    Примеры:

    "хочу каждый день выпивать по 2 литра воды"
    → {"action":"create","title":"Пить 2 литра воды в день","description":"","frequency":"daily"}

    "хочу читать 30 минут перед сном"
    → {"action":"create","title":"Читать 30 минут перед сном","description":"","frequency":"daily"}

    "хочу медитировать утром, чтобы меньше нервничать"
    → {"action":"create","title":"Медитировать утром","description":"Чтобы меньше нервничать","frequency":"daily"}

    "сегодня сделал зарядку 20 минут"
    → {"action":"track","title":"Сделать зарядку 20 минут","description":"","frequency":null}

    Запрос:
    "${userInput}"
    `;
    const { content } = await invoke(prompt);
    try {
      return JSON.parse(content);
    } catch (e) {
      // fallback: используем весь запрос как title
      return { 
        action: 'create', 
        title: userInput, 
        description: '', 
        frequency: null 
      };
    }
  }
}

class GoalHabitMultiAgentSystem {
  constructor() {
    this.intentAgent = new IntentOrchestratorAgent();
    this.goalAgent = new GoalAgent();
    this.habitAgent = new HabitAgent();
  }

  async process(userInput) {
    const intent = await this.intentAgent.detectIntent(userInput);

    if (intent.intent === 'goal') {
      const goal = await this.goalAgent.extractGoal(userInput);
      return {
        type: 'create_goal',
        payload: goal
      };
    }

    if (intent.intent === 'habit') {
        const habit = await this.habitAgent.extractHabitAction(userInput);
        
        if (habit.action === 'track') {
            // 🔍 ИЩЕМ ПРИВЫЧКУ ПО НАЗВАНИЮ
            const db = require('../../better-sqlite3'); // или как у тебя подключена БД
            const dbInstance = new db(process.env.DB_PATH || './data/goals.db');
            const habitRecord = dbInstance.prepare(
                'SELECT id FROM habits WHERE user_id = ? AND title LIKE ?'
            ).get(req.session.userId, `%${habit.title}%`); // ← нужно передать userId!

            return {
                type: 'complete_habit',
                payload: {
                    habit_id: habitRecord?.id || null,
                    title: habit.title,
                    is_checked: true
                }
            };
        } else {
        return {
            type: 'create_habit',
            payload: {
                title: habit.title,
                description: habit.description || '',
                frequency: habit.frequency
            }
        };
      }
    }

    return {
      type: 'clarify',
      payload: {
        question: 'Я пока не понял, что ты хочешь сделать. Можешь уточнить?'
      }
    };
  }
}

module.exports = { GoalHabitMultiAgentSystem };