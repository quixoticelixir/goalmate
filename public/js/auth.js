// ==================== КОНСТАНТЫ ====================
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 минут
const FETCH_TIMEOUT_MS = 10000;

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

/**
 * Безопасный fetch с таймаутом и обработкой ошибок
 */
async function safeFetch(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error('Таймаут запроса');
    }

    console.error('Fetch error:', error);
    throw error;
  }
}

/**
 * Валидация email
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Валидация пароля
 */
function isValidPassword(password) {
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

/**
 * Сохраняет данные пользователя в localStorage
 */
function cacheUserForUI(user) {
  if (user) {
    localStorage.setItem('cachedUser', JSON.stringify(user));
    localStorage.setItem('cachedAt', Date.now().toString());
  } else {
    localStorage.removeItem('cachedUser');
    localStorage.removeItem('cachedAt');
  }
}

/**
 * Получает кэшированного пользователя из localStorage
 */
function getCachedUser() {
  try {
    const cached = localStorage.getItem('cachedUser');
    const cachedAt = localStorage.getItem('cachedAt');

    if (cached && cachedAt) {
      const age = Date.now() - parseInt(cachedAt, 10);
      if (age < SESSION_TIMEOUT_MS) {
        return JSON.parse(cached);
      }
    }
  } catch (e) {
    console.warn('Failed to parse cached user data');
  }
  return null;
}

// ==================== ОСНОВНЫЕ ФУНКЦИИ АУТЕНТИФИКАЦИИ ====================

/**
 * Проверяет текущую сессию на сервере
 * @returns {Promise<{ success: boolean, user?: Object, message: string }>}
 */
export async function checkSession() {
  try {
    console.log('🔍 Проверка сессии на сервере...');
    
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await response.json();

    if (response.ok && data.user) {
      console.log('✅ Сессия активна:', data.user.email);
      cacheUserForUI(data.user);
      return { success: true, user: data.user, message: 'Пользователь авторизован' };
    }

    console.log('❌ Сессия недействительна');
    cacheUserForUI(null);
    return { success: false, user: null, message: 'Требуется авторизация' };
  } catch (error) {
    console.error('❌ Ошибка при проверке сессии:', error);
    return { success: false, user: null, message: 'Ошибка соединения с сервером' };
  }
}

/**
 * Авторизация пользователя
 */
export async function login(email, password) {
  if (!email || !password) {
    throw new Error('Заполните email и пароль');
  }
  if (!isValidEmail(email)) {
    throw new Error('Некорректный email');
  }

  try {
    const data = await safeFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password })
    });

    if (!data?.user) {
      throw new Error('Сервер не вернул данные пользователя');
    }

    // Кэшируем для UI
    cacheUserForUI(data.user);

    // Дополнительная проверка: убедимся, что сессия действительно установлена
    const sessionCheck = await checkSession();
    if (!sessionCheck.success) {
      throw new Error('Сессия не была установлена');
    }

    return { success: true, user: data.user, message: 'Вход выполнен успешно' };
  } catch (error) {
    cacheUserForUI(null);
    throw new Error(error.message || 'Ошибка входа. Проверьте email и пароль');
  }
}

/**
 * Регистрация нового пользователя
 */
export async function register(name, email, password) {
  if (!name?.trim() || !email?.trim() || !password) {
    throw new Error('Заполните все поля');
  }
  if (!isValidEmail(email)) {
    throw new Error('Некорректный email');
  }
  if (!isValidPassword(password)) {
    throw new Error('Пароль должен содержать минимум 8 символов, буквы и цифры');
  }

  try {
    const data = await safeFetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        password
      })
    });

    if (!data?.user) {
      throw new Error('Сервер не вернул данные пользователя');
    }

    cacheUserForUI(data.user);
    return { success: true, user: data.user, message: 'Регистрация успешна' };
  } catch (error) {
    cacheUserForUI(null);
    throw new Error(error.message || 'Ошибка регистрации');
  }
}

/**
 * Выход из системы
 */
export async function logout() {
  console.log('🚪 Инициализация выхода...');
  
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (error) {
    console.warn('⚠️ Ошибка при вызове logout на сервере:', error);
    // Продолжаем очистку локально
  } finally {
    cacheUserForUI(null);
    // Перезагрузка гарантирует полную очистку состояния
    setTimeout(() => window.location.reload(), 300);
  }
}

/**
 * Синхронная проверка: есть ли кэшированный пользователь
 */
export function isAuthenticated() {
  return !!getCachedUser();
}

/**
 * Получает кэшированного пользователя
 */
export function getCurrentUser() {
  return getCachedUser();
}

// ==================== ЭКСПОРТ УТИЛИТ ====================
export { safeFetch, isValidEmail, isValidPassword };