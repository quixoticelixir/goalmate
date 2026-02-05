// api.js
import * as Auth from './auth.js';

// ==================== ВНУТРЕННИЙ КЭШ ====================
// Приватный объект для хранения данных
const _cache = {};

class ApiCacheManager {
  static get(key) {
    if (!_cache[key]) return null;
    // Проверка времени жизни (опционально, если нужно)
    // const { data, timestamp } = _cache[key];
    // if (Date.now() - timestamp > TTL) {
    //   this.delete(key);
    //   return null;
    // }
    return _cache[key];
  }

  static set(key, data) {
    _cache[key] = data;
  }

  static delete(key) {
    delete _cache[key];
  }

  static clear() {
    Object.keys(_cache).forEach(key => this.delete(key));
  }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

/**
 * Проверяет аутентификацию и выбрасывает ошибку, если не авторизован.
 */
function ensureAuthenticated() {
  if (!Auth.isAuthenticated()) {
    throw new Error('Требуется авторизация');
  }
}

/**
 * Обертка для fetch с обработкой аутентификации и ошибок.
 * @param {string} url - URL для запроса.
 * @param {object} options - Опции fetch.
 * @returns {Promise<object>} - JSON-ответ.
 */
async function makeApiRequest(url, options = {}) {
  try {
    const response = await Auth.safeFetch(url, {
      credentials: 'include', // Важно для cookie
      ...options,
    });

    // Если сервер вернул ошибку в теле (например, { error: "message" })
    if (response && response.error) {
      throw new Error(response.error);
    }

    return response;
  } catch (error) {
    // Обработка специфичной ошибки 401
    if (error.status === 401) {
      console.warn('🔐 Сессия истекла — перенаправление на авторизацию');
      ApiCacheManager.clear(); // Очищаем кэш при истечении сессии
      // Предполагаем, что глобальная функция для перенаправления будет вызвана в UI слое
      // window.location.assign('/');
      throw error; // Пробрасываем дальше для UI
    }
    throw error; // Пробрасываем другие ошибки для обработки в вызывающем коде
  }
}

// ==================== ФУНКЦИИ ЦЕЛЕЙ ====================

export async function loadGoals(forceRefresh = false, filter = 'active') {
  console.log(`📥 Загрузка целей с фильтром: ${filter}...`);

  ensureAuthenticated(); // Проверяем перед любыми запросами

  const cacheKey = `goals_${filter}`;
  if (!forceRefresh) {
    const cached = ApiCacheManager.get(cacheKey);
    if (cached) {
      console.log('📋 Цели загружены из кэша');
      return cached;
    }
  }

  try {
    // Передаём filter как query-параметр
    const data = await makeApiRequest(`/api/goals?filter=${encodeURIComponent(filter)}`);
    const goals = data.goals || [];

    console.log('📊 Загруженные цели:', {
      filter,
      total: goals.length,
      completed: goals.filter(g => g.completed).length,
      archived: goals.filter(g => g.archived).length,
      active: goals.filter(g => !g.completed && !g.archived).length,
      sample: goals.slice(0, 3).map(g => ({ id: g.id, title: g.title, completed: g.completed, archived: g.archived }))
    });

    ApiCacheManager.set(cacheKey, goals);
    return goals;
  } catch (error) {
    console.error('❌ Ошибка загрузки целей:', error);
    throw error; // Пробрасываем ошибку для обработки в UI
  }
}

export async function saveGoal(goalData) {
  console.log('💾 Сохранение новой цели:', goalData);

  ensureAuthenticated();

  try {
    const response = await makeApiRequest('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(goalData),
    });
    ApiCacheManager.clear(); // Очищаем кэш после изменения
    return response;
  } catch (error) {
    console.error('❌ Ошибка сохранения цели:', error);
    throw error;
  }
}

export async function updateGoal(goalId, goalData) {
  console.log('✏️ Обновление цели:', goalId, goalData);

  ensureAuthenticated();

  try {
    const response = await makeApiRequest(`/api/goals/${goalId}`, {
      method: 'PATCH', // Используем PATCH для частичного обновления
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(goalData),
    });
    ApiCacheManager.clear(); // Очищаем кэш
    return response;
  } catch (error) {
    console.error('❌ Ошибка обновления цели:', error);
    throw error;
  }
}

export async function deleteGoal(goalId) {
  console.log('🗑 Удаление цели:', goalId);

  ensureAuthenticated();

  try {
    const response = await makeApiRequest(`/api/goals/${goalId}`, {
      method: 'DELETE',
    });
    ApiCacheManager.clear(); // Очищаем кэш
    return response;
  } catch (error) {
    console.error('❌ Ошибка удаления цели:', error);
    throw error;
  }
}

export async function toggleGoalCompletion(goalId, completed) {
  console.log(`🔄 Изменение статуса завершения цели ${goalId} на ${completed}`);

  ensureAuthenticated();

  try {
    const response = await makeApiRequest(`/api/goals/${goalId}/complete`, {
      method: completed ? 'POST' : 'DELETE', // POST для завершения, DELETE для отмены
    });
    ApiCacheManager.clear(); // Очищаем кэш
    return response;
  } catch (error) {
    console.error('❌ Ошибка изменения статуса завершения цели:', error);
    throw error;
  }
}

export async function archiveGoal(goalId, archived) {
  console.log(`📦 Изменение статуса архива цели ${goalId} на ${archived}`);

  ensureAuthenticated();

  try {
    const response = await makeApiRequest(`/api/goals/${goalId}/archive`, {
      method: archived ? 'POST' : 'DELETE', // POST для архивации, DELETE для восстановления
    });
    ApiCacheManager.clear(); // Очищаем кэш
    return response;
  } catch (error) {
    console.error('❌ Ошибка изменения статуса архива цели:', error);
    throw error;
  }
}

// ==================== ФУНКЦИИ ПОДЦЕЛЕЙ ====================

export async function createSubgoal(subgoalData) {
  console.log('➕ Создание подцели:', subgoalData);

  ensureAuthenticated();

  try {
    const response = await makeApiRequest('/api/subgoals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subgoalData),
    });
    ApiCacheManager.clear(); // Очищаем кэш
    return response;
  } catch (error) {
    console.error('❌ Ошибка создания подцели:', error);
    throw error;
  }
}

export async function updateSubgoal(subgoalId, subgoalData) {
  console.log('✏️ Обновление подцели:', subgoalId, subgoalData);

  ensureAuthenticated();

  try {
    const response = await makeApiRequest(`/api/subgoals/${subgoalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subgoalData),
    });
    ApiCacheManager.clear(); // Очищаем кэш
    return response;
  } catch (error) {
    console.error('❌ Ошибка обновления подцели:', error);
    throw error;
  }
}

export async function deleteSubgoal(subgoalId) {
  console.log('🗑 Удаление подцели:', subgoalId);

  ensureAuthenticated();

  try {
    const response = await makeApiRequest(`/api/subgoals/${subgoalId}`, {
      method: 'DELETE',
    });
    ApiCacheManager.clear(); // Очищаем кэш
    return response;
  } catch (error) {
    console.error('❌ Ошибка удаления подцели:', error);
    throw error;
  }
}

// ==================== ФУНКЦИИ ПРИВЫЧЕК ====================

export async function loadHabits(forceRefresh = false) {
  console.log('📥 Загрузка привычек...');

  ensureAuthenticated();

  if (!forceRefresh) {
    const cached = ApiCacheManager.get('habits');
    if (cached) {
      console.log('📋 Привычки загружены из кэша');
      return cached;
    }
  }

  try {
    const data = await makeApiRequest('/api/habits');
    const habits = data.habits || [];

    ApiCacheManager.set('habits', habits);
    return habits;
  } catch (error) {
    console.error('❌ Ошибка загрузки привычек:', error);
    throw error; // Пробрасываем для обработки в UI
  }
}

export async function saveHabit(habitData) {
  console.log('💾 Сохранение новой привычки:', habitData);

  ensureAuthenticated();

  try {
    const response = await makeApiRequest('/api/habits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(habitData),
    });
    ApiCacheManager.clear(); // Очищаем кэш
    return response;
  } catch (error) {
    console.error('❌ Ошибка сохранения привычки:', error);
    throw error;
  }
}

export async function deleteHabit(habitId) {
  console.log('🗑 Удаление привычки:', habitId);

  ensureAuthenticated();

  try {
    const response = await makeApiRequest(`/api/habits/${habitId}`, {
      method: 'DELETE',
    });
    ApiCacheManager.clear(); // Очищаем кэш
    return response;
  } catch (error) {
    console.error('❌ Ошибка удаления привычки:', error);
    throw error;
  }
}

export async function toggleHabitCheckin(habitId, dateStr, shouldCheck) {
  console.log(`🔄 Отметка привычки ${habitId} на ${dateStr} -> ${shouldCheck ? 'Выполнено' : 'Не выполнено'}`);

  ensureAuthenticated();

  try {
    const method = shouldCheck ? 'POST' : 'DELETE';
    const response = await makeApiRequest(`/api/habits/${habitId}/checkin`, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateStr }),
    });
    ApiCacheManager.clear(); // Очищаем кэш
    return response;
  } catch (error) {
    console.error('❌ Ошибка отметки привычки:', error);
    throw error;
  }
}

// ==================== AI ФУНКЦИИ ====================

export async function decomposeGoalAI(goalText) {
  console.log('🤖 Декомпозиция цели через AI:', goalText);

  ensureAuthenticated();

  if (!goalText?.trim()) {
    throw new Error('Текст цели не может быть пустым');
  }

  try {
    const response = await makeApiRequest('/api/goals/decompose', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ goal: goalText.trim() })
    });

    if (!response.subgoals?.length) {
      throw new Error('AI не смог сгенерировать подцели');
    }

    return response;
  } catch (error) {
    console.error('❌ Ошибка декомпозиции AI:', error);
    throw error;
  }
}

// ==================== AI INTERPRETATION ====================

export async function interpretAI(text) {
  ensureAuthenticated();

  const response = await makeApiRequest('/api/ai-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: text.trim()
    })
  });

  return response;
}


// ==================== ЭКСПОРТ УТИЛИТ ====================

export function clearCache() {
  ApiCacheManager.clear();
}

// Экспортируем также внутренние утилиты, если они нужны в других модулях
export { ensureAuthenticated, makeApiRequest };