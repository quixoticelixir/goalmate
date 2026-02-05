// habitUtils.js
import * as Auth from './auth.js';

// ==================== КОНСТАНТЫ ====================
// Эти константы теперь экспортируются
export const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];
export const SHORT_MONTH_NAMES = [
  'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
  'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'
];
export const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export const FULL_DAY_NAMES = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

/**
 * Форматирует дату в локальный YYYY-MM-DD (без UTC-сдвига)
 */
export function formatLocalDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
    .toLocaleDateString('en-CA');
}

/**
 * Проверяет, является ли строка даты будущей (сегодня включительно - это не будущее)
 */
export function isFutureDate(dateStr) {
  const todayStr = new Date().toISOString().slice(0, 10);
  return dateStr > todayStr;
}

/**
 * Рассчитывает текущую серию (стрик) на основе массива дат отметок.
 * @param {Set<string>} checkinsSet - Множество строк дат в формате YYYY-MM-DD.
 * @returns {number} - Текущая серия в днях.
 */
export function calculateCurrentStreak(checkinsSet) {
  if (!checkinsSet || !checkinsSet.size) return 0;

  const today = new Date();
  const todayStr = formatLocalDate(today);
  // Нет отметки сегодня - серия 0
  if (!checkinsSet.has(todayStr)) return 0;

  let streak = 1;
  let currentDate = new Date(today);

  // Идём назад по дням
  for (let i = 1; i < 365; i++) {
    currentDate.setDate(currentDate.getDate() - 1);
    const dateStr = formatLocalDate(currentDate);

    if (checkinsSet.has(dateStr)) {
      streak++;
    } else {
      break; // серия прервана
    }
  }
  return streak;
}

/**
 * Рассчитывает максимальную серию на основе массива дат отметок.
 * @param {Array<string>} checkins - Массив строк дат в формате YYYY-MM-DD.
 * @returns {number} - Максимальная серия в днях.
 */
export function calculateMaxStreak(checkins) {
  if (!checkins || !checkins.length) return 0;

  const sorted = [...checkins].sort(); // сортируем по возрастанию
  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prevDate = new Date(sorted[i - 1]);
    const currDate = new Date(sorted[i]);
    const diffTime = currDate - prevDate;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      // Последовательные дни
      currentStreak++;
    } else if (diffDays > 1) {
      // Пропуск — обновляем максимум и сбрасываем
      maxStreak = Math.max(maxStreak, currentStreak);
      currentStreak = 1;
    }
    // Если diffDays === 0 — дубликат, игнорируем
  }

  return Math.max(maxStreak, currentStreak);
}

/**
 * Форматирует дату для отображения в UI.
 */
export function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Проверяет аутентификацию и показывает экран входа при необходимости
 * @returns {boolean} — true если авторизован
 */
export function ensureAuthenticated() {
  if (!Auth.isAuthenticated()) {
    // Предполагаем, что UI.showToast будет импортирован отдельно или вызываться через callback
    // console.error('Authentication required.');
    return false;
  }
  return true;
}

/**
 * Проверяет статус ответа fetch и выбрасывает ошибку при необходимости.
 * Используется внутри Auth.safeFetch, но можно вынести для переиспользования.
 * @param {Response} response
 * @returns {Promise<Object>} - JSON-ответ, если OK.
 */
export async function checkResponseStatus(response) {
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return await response.json();
}