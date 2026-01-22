import * as Auth from './auth.js';

// ==================== КОНСТАНТЫ ====================
const CACHE_TTL = 30_000; // 30 секунд

// ==================== ВНУТРЕННЕЕ СОСТОЯНИЕ (инкапсулировано) ====================
let cache = {
  habits: null,
  goals: null,
  timestamp: 0
};

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function ensureAuthenticated() {
  if (!Auth.isAuthenticated()) {
    throw new Error('Требуется авторизация');
  }
}

/**
 * Управляет кэшем данных
 */
const CacheManager = {
  isFresh(key) {
    const now = Date.now();
    return cache[key] !== null && (now - cache.timestamp < CACHE_TTL);
  },

  get(key) {
    if (this.isFresh(key)) {
      console.log(`📦 Используем кэшированные данные: ${key}`);
      return cache[key];
    }
    return null;
  },

  set(key, data) {
    cache[key] = data;
    cache.timestamp = Date.now();
    console.log(`💾 Сохранили в кэш: ${key}`, Array.isArray(data) ? data.length : 'N/A', 'элементов');
  },

  clear() {
    cache = { habits: null, goals: null, timestamp: 0 };
    console.log('🧹 Кэш очищен');
  }
};

/**
 * Обёртка для API-вызовов с обработкой ошибок
 */
async function apiCall(url, options = {}) {
  try {
    const response = await Auth.safeFetch(url, options);
    
    // Если запрос успешен, но вернул ошибку в теле
    if (response.error) {
      throw new Error(response.error);
    }
    
    return response;
  } catch (error) {
    // Обработка ошибки 401: сессия истекла
    if (error.status === 401) {
      console.warn('🔐 Сессия истекла — перенаправление на авторизацию');
      // Очищаем кэш и UI-состояние
      CacheManager.clear();
      // Глобальный редирект на экран входа
      if (typeof window !== 'undefined') {
        window.location.assign('/'); // или вызов showAuthScreen()
      }
    }
    throw error;
  }
}

// ==================== ЗАГРУЗКА ДАННЫХ ====================

/**
 * Загружает список целей
 */
export async function loadGoals(forceRefresh = false, filter = 'active') {
  console.log(`📥 Загрузка целей с фильтром: ${filter}...`);
  
  if (!Auth.isAuthenticated()) {
    console.log('❌ Пользователь не авторизован');
    return [];
  }

  // Ключ кэша должен зависеть от фильтра
  const cacheKey = `goals_${filter}`;

  if (!forceRefresh) {
    const cached = CacheManager.get(cacheKey);
    if (cached) return cached;
  }

  try {
    // Передаём filter как query-параметр
    const data = await apiCall(`/api/goals?filter=${encodeURIComponent(filter)}`);
    const goals = data.goals || [];
    
    console.log('📊 Загруженные цели:', {
      filter,
      total: goals.length,
      completed: goals.filter(g => g.completed).length,
      archived: goals.filter(g => g.archived).length,
      active: goals.filter(g => !g.completed && !g.archived).length,
      sample: goals.slice(0, 3).map(g => ({ id: g.id, title: g.title, completed: g.completed, archived: g.archived }))
    });
    
    CacheManager.set(cacheKey, goals);
    return goals;
  } catch (error) {
    console.error('❌ Ошибка загрузки целей:', error);
    return [];
  }
}

export async function updateGoal(goalId, goalData) {
  console.log('✏️ Обновление цели:', goalId);
  ensureAuthenticated();
  
  const response = await apiCall(`/api/goals/${goalId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(goalData)
  });
  
  CacheManager.clear();
  return response;
}

/**
 * Загружает список привычек
 */
export async function loadHabits(forceRefresh = false) {
  console.log('📥 Загрузка привычек...');
  
  if (!Auth.isAuthenticated()) {
    console.log('❌ Пользователь не авторизован');
    return [];
  }

  if (!forceRefresh) {
    const cached = CacheManager.get('habits');
    if (cached) return cached;
  }

  try {
    const data = await apiCall('/api/habits');
    const habits = data.habits || [];
    CacheManager.set('habits', habits);
    return habits;
  } catch (error) {
    console.error('❌ Ошибка загрузки привычек:', error);
    return [];
  }
}

// ==================== МУТАЦИИ ЦЕЛЕЙ ====================

/**
 * Создаёт новую цель
 */
export async function saveGoal(goalData) {
  console.log('💾 Сохранение цели...');
  ensureAuthenticated();
  
  const response = await apiCall('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(goalData)
  });
  
  CacheManager.clear(); // Инвалидируем весь кэш целей
  return response;
}

export async function completeGoal(goalId) {
  console.log('✅ Завершение цели:', goalId);
  ensureAuthenticated();
  
  const response = await apiCall(`/api/goals/${goalId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed: true })
  });
  
  CacheManager.clear();
  return response;
}

/**
 * Возвращает цель в работу (отменяет завершение)
 */
export async function uncompleteGoal(goalId) {
  console.log('↩ Возврат цели в работу:', goalId);
  ensureAuthenticated();
  
  const response = await apiCall(`/api/goals/${goalId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed: false })
  });
  
  CacheManager.clear();
  return response;
}

/**
 * Универсальная функция для переключения статуса
 */
export async function toggleGoalCompletion(goalId, completed = true) {
  console.log('🔄 Переключение статуса цели:', { goalId, completed });
  ensureAuthenticated();
  
  const response = await apiCall(`/api/goals/${goalId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed })
  });
  
  // Логируем ответ для отладки
  console.log('📤 Ответ от сервера при изменении статуса:', response);
  
  CacheManager.clear();
  
  return response;
}

/**
 * Удаляет цель
 */
export async function deleteGoal(goalId) {
  console.log('🗑 Удаление цели:', goalId);
  ensureAuthenticated();
  
  const response = await apiCall(`/api/goals/${goalId}`, {
    method: 'DELETE'
  });
  
  CacheManager.clear();
  return response;
}

/**
 * Обновляет подцель
 */
export async function updateSubgoal(subgoalId, data) {
  console.log('✏️ Обновление подцели:', subgoalId);
  ensureAuthenticated();
  
  const response = await apiCall(`/api/subgoals/${subgoalId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  CacheManager.clear();
  return response;
}

/**
 * Удаляет подцель
 */
export async function deleteSubgoal(subgoalId) {
  console.log('🗑 Удаление подцели:', subgoalId);
  ensureAuthenticated();
  
  const response = await apiCall(`/api/subgoals/${subgoalId}`, {
    method: 'DELETE'
  });
  
  CacheManager.clear();
  return response;
}

// ==================== AI ФУНКЦИИ ====================

/**
 * Декомпозиция цели через AI
 */
export async function decomposeGoalAI(goalText) {
  console.log('🤖 Декомпозиция цели через AI:', goalText);
  ensureAuthenticated();
  
  if (!goalText?.trim()) {
    throw new Error('Текст цели не может быть пустым');
  }

  const response = await apiCall('/api/goals/decompose', {
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
}

// ==================== ЭКСПОРТ УТИЛИТ ====================

/**
 * Очищает весь кэш API
 */
export function clearCache() {
  CacheManager.clear();
}