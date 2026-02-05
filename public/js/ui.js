// ui.js
import { MONTH_NAMES, SHORT_MONTH_NAMES, DAY_NAMES, FULL_DAY_NAMES } from './habitUtils.js'; // Импорт констант

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

/**
 * Получает элемент по ID, с проверкой.
 * @param {string} id - ID элемента.
 * @returns {HTMLElement|null} - Найденный элемент или null.
 */
function getElement(id) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`⚠️ Элемент с ID '${id}' не найден.`);
  }
  return el;
}

// ==================== МОДАЛЬНЫЕ ОКНА ====================

const openModals = new Set(); // Для отслеживания открытых модальных окон

/**
 * Показывает модальное окно.
 * @param {string} modalId - ID модального окна.
 */
function showModal(modalId) {
  const modal = getElement(modalId);
  if (!modal) return;

  // Закрываем другие открытые модалки
  openModals.forEach(id => {
    if (id !== modalId) {
      hideModal(id);
    }
  });

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  openModals.add(modalId);
}

/**
 * Скрывает модальное окно.
 * @param {string} modalId - ID модального окна.
 */
function hideModal(modalId) {
  const modal = getElement(modalId);
  if (!modal) return;

  modal.style.display = 'none';
  document.body.style.overflow = '';
  openModals.delete(modalId);
}

/**
 * Показывает модальное окно подтверждения.
 * @param {string} title - Заголовок.
 * @param {string} message - Сообщение.
 * @param {Function} callback - Callback (true/false).
 */
function showConfirmModal(title, message, callback) {
  const modal = getElement('confirm-modal');
  if (!modal) {
    console.error("Модальное окно подтверждения 'confirm-modal' не найдено в HTML.");
    // Если модалки нет, можно просто вызвать callback с true
    if (callback) callback(true);
    return;
  }

  const titleEl = getElement('confirm-title');
  const messageEl = getElement('confirm-message');

  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.innerHTML = message; // innerHTML для поддержки <br>

  // Удаляем старые обработчики, если есть
  const oldOkBtn = modal.querySelector('#confirm-ok');
  const oldCancelBtn = modal.querySelector('#confirm-cancel');
  if (oldOkBtn._clickHandler) oldOkBtn.removeEventListener('click', oldOkBtn._clickHandler);
  if (oldCancelBtn._clickHandler) oldCancelBtn.removeEventListener('click', oldCancelBtn._clickHandler);

  const okHandler = () => {
    hideModal('confirm-modal');
    if (callback) callback(true);
  };
  const cancelHandler = () => {
    hideModal('confirm-modal');
    if (callback) callback(false);
  };

  oldOkBtn.addEventListener('click', okHandler);
  oldCancelBtn.addEventListener('click', cancelHandler);
  // Привязываем обработчики к элементам для возможного удаления
  oldOkBtn._clickHandler = okHandler;
  oldCancelBtn._clickHandler = cancelHandler;

  // Обработчик закрытия по клику вне
  const backdropHandler = (e) => {
    if (e.target === modal) {
      hideModal('confirm-modal');
      if (callback) callback(false);
    }
  };
  modal.removeEventListener('click', modal._backdropHandler); // Удаляем старый
  modal.addEventListener('click', backdropHandler);
  modal._backdropHandler = backdropHandler; // Сохраняем для удаления

  // Обработчик клавиши Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      hideModal('confirm-modal');
      if (callback) callback(false);
    }
  };
  document.removeEventListener('keydown', escHandler); // Удаляем старый
  document.addEventListener('keydown', escHandler);
  modal._escHandler = escHandler; // Сохраняем для удаления

  showModal('confirm-modal');
}

// ==================== УВЕДОМЛЕНИЯ ====================

let toastTimeout = null;

/**
 * Показывает уведомление (toast).
 * @param {string} message - Текст сообщения.
 * @param {'success'|'error'|'warning'|'info'} type - Тип уведомления.
 */
function showToast(message, type = 'info') {
  const toastContainer = getElement('toast-container');
  if (!toastContainer) {
    console.warn("Контейнер для уведомлений 'toast-container' не найден.");
    // Создаем его динамически, если не существует
    const tc = document.createElement('div');
    tc.id = 'toast-container';
    tc.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 10000;
      display: flex; flex-direction: column; gap: 10px;
    `;
    document.body.appendChild(tc);
    // Повторяем попытку
    showToast(message, type);
    return;
  }

  // Очищаем предыдущий тост
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  // Анимация появления
  toast.style.opacity = '0';
  toastContainer.appendChild(toast);
  setTimeout(() => toast.style.opacity = '1', 10);

  // Автоматическое скрытие
  toastTimeout = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toast.parentNode === toastContainer) {
        toastContainer.removeChild(toast);
      }
    }, 300); // Длительность анимации исчезновения
  }, 5000); // 5 секунд
}

// ==================== ОБНОВЛЕНИЕ UI ПОЛЬЗОВАТЕЛЯ ====================

/**
 * Обновляет отображение данных пользователя в UI.
 * @param {Object|null} user - Объект пользователя или null.
 */
function updateUserUI(user) {
  const authScreen = getElement('auth-screen');
  const appContent = getElement('app-content');

  if (user && authScreen && appContent) {
    // Показываем основное приложение
    authScreen.style.display = 'none';
    appContent.style.display = 'block';

    // Обновляем данные пользователя
    const userName = user.name || user.email.split('@')[0];
    const initial = userName.charAt(0).toUpperCase();
    const nameEl = getElement('user-name');
    const emailEl = getElement('user-email');
    const initialEl = getElement('user-initial');

    if (nameEl) nameEl.textContent = userName;
    if (emailEl) emailEl.textContent = user.email;
    if (initialEl) initialEl.textContent = initial;
  } else if (!user && authScreen && appContent) {
     // Пользователь не авторизован
     authScreen.style.display = 'block';
     appContent.style.display = 'none';
  }
  // Не обновляем UI, если элементы не найдены
}

// ==================== КНОПКИ ====================

/**
 * Устанавливает состояние загрузки для кнопки.
 * @param {HTMLElement} button - Кнопка.
 * @param {boolean} loading - true для включения состояния загрузки.
 */
function setButtonLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  if (loading) {
    button.innerHTML = '<span class="spinner-small"></span> Загрузка...';
  } else {
    // Восстанавливаем оригинальный текст
    // Храним его в dataset при первом вызове
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    button.innerHTML = button.dataset.originalText;
  }
}

// ==================== ДЕБАУНС ====================

/**
 * Возвращает функцию с примененным debouncing.
 * @param {Function} func - Функция для оборачивания.
 * @param {number} delay - Задержка в миллисекундах.
 * @returns {Function} - Обернутая функция.
 */
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

// ==================== ЭКСПОРТ ====================

export {
  getElement,
  showModal,
  hideModal,
  showConfirmModal,
  showToast,
  updateUserUI,
  setButtonLoading,
  debounce
};

// Глобальные функции для использования в HTML (если требуются)
// window.UI = {
//   showModal,
//   hideModal,
//   showConfirmModal,
//   showToast,
//   updateUserUI,
//   setButtonLoading,
//   debounce
// };