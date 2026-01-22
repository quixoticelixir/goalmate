// ==================== КОНСТАНТЫ ====================
const TOAST_DURATION = 5000;
const DEBOUNCE_DEFAULT = 300;

// ==================== ВСПОМОГАТЕЛЬНЫЕ УТИЛИТЫ ====================

/**
 * Безопасное получение элемента по ID
 */
function getElement(id) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`UI element not found: #${id}`);
  }
  return el;
}

/**
 * Создаёт обёртку для функции с debounce
 */
export function debounce(func, wait = DEBOUNCE_DEFAULT) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// ==================== УПРАВЛЕНИЕ МОДАЛКАМИ ====================

const modalKeyHandlers = new WeakMap();

/**
 * Показывает модальное окно
 */
export function showModal(modalId) {
  const modal = getElement(modalId);
  if (!modal) return;

  modal.style.display = 'flex';

  const handleEscape = (e) => {
    if (e.key === 'Escape') hideModal(modalId);
  };

  modalKeyHandlers.set(modal, handleEscape);
  document.addEventListener('keydown', handleEscape);
}

/**
 * Скрывает модальное окно
 */
export function hideModal(modalId) {
  const modal = getElement(modalId);
  if (!modal) return;

  modal.style.display = 'none';

  const handler = modalKeyHandlers.get(modal);
  if (handler) {
    document.removeEventListener('keydown', handler);
    modalKeyHandlers.delete(modal);
  }
}

// ==================== УВЕДОМЛЕНИЯ (TOAST) ====================

/**
 * Показывает уведомление
 */
export function showToast(message, type = 'info', duration = TOAST_DURATION) {
  const container = getElement('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toast.setAttribute('role', 'alert');
  toast.style.animation = 'slideIn 0.3s ease-out';

  container.appendChild(toast);

  // Автоматическое скрытие
  const autoHide = setTimeout(() => {
    animateOut(toast);
  }, duration);

  // Ручное скрытие по клику
  toast.addEventListener('click', () => {
    clearTimeout(autoHide);
    animateOut(toast);
  });
}

function animateOut(toast) {
  toast.style.animation = 'slideIn 0.3s ease-out reverse';
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}

// ==================== УПРАВЛЕНИЕ КНОПКАМИ ====================

/**
 * Переключает состояние загрузки кнопки
 */
export function setButtonLoading(button, isLoading) {
  if (!button) return;

  button.disabled = isLoading;

  const spinner = button.querySelector('.spinner');
  const textElements = Array.from(button.querySelectorAll('span:not(.spinner)'));

  if (spinner) {
    spinner.style.display = isLoading ? 'inline-block' : 'none';
  }

  textElements.forEach(el => {
    el.style.display = isLoading ? 'none' : 'inline';
  });
}

// ==================== ОБНОВЛЕНИЕ UI ПОЛЬЗОВАТЕЛЯ ====================

/**
 * Обновляет интерфейс пользователя
 */
export function updateUserUI(user) {
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
  } else if (authScreen && appContent) {
    authScreen.style.display = 'block';
    appContent.style.display = 'none';
  }
}

// ==================== ЭЛЕМЕНТЫ РЕДАКТОРА ====================

/**
 * Создаёт HTML-элемент редактора подцели
 */
export function createSubgoalEditorItem(subgoal, index) {
  // Нормализация данных
  const title = typeof subgoal === 'string' ? subgoal : (subgoal.title || '');
  const description = subgoal.description || '';
  const estimatedDays = subgoal.estimated_days || '';
  const priority = subgoal.priority || 'medium';

  // Экранирование HTML для безопасности
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);

  return `
    <div class="subgoal-editor-item" data-index="${index}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;flex:1;">
          <button type="button" class="btn-toggle-details" data-index="${index}" 
                  style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:16px;padding:2px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
            ▶
          </button>
          <input type="text" class="subgoal-title-input" value="${safeTitle}" 
                placeholder="Название подцели" 
                style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--card);color:var(--text);">
        </div>
        <button type="button" class="btn-remove-subgoal" data-index="${index}" 
                style="background:none;border:none;color:var(--error);cursor:pointer;font-size:18px;padding:0;line-height:1;margin-left:8px;">
          ×
        </button>
      </div>
      
      <div class="subgoal-details" data-index="${index}" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
        <div style="margin-bottom:8px;">
          <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Описание</label>
          <textarea class="subgoal-description-input" 
                    placeholder="Описание подцели (опционально)"
                    style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:13px;min-height:80px;resize:vertical;">${safeDescription}</textarea>
        </div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Срок (дни)</label>
            <input type="number" class="subgoal-days-input" value="${escapeHtml(String(estimatedDays))}" min="1" max="365"
                  placeholder="Введите срок"
                  style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--card);color:var(--text);">
          </div>
          <div>
            <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Приоритет</label>
            <select class="subgoal-priority-select" 
                    style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--card);color:var(--text);">
              <option value="low" ${priority === 'low' ? 'selected' : ''}>Низкий</option>
              <option value="medium" ${priority === 'medium' ? 'selected' : ''}>Средний</option>
              <option value="high" ${priority === 'high' ? 'selected' : ''}>Высокий</option>
            </select>
          </div>
        </div>
      </div>
      
      <div style="height:1px;background:var(--border);margin:8px 0;"></div>
    </div>
  `;
}

/**
 * Показывает модальное окно подтверждения
 * @param {string} message - Сообщение
 * @param {string} confirmText - Текст кнопки подтверждения
 * @param {Function} callback - Колбэк, вызываемый при подтверждении
 */
export function showConfirmModal(message, confirmText = 'Подтвердить', callback) {
  // Проверяем, есть ли уже модалка подтверждения
  let modal = document.getElementById('confirm-modal');
  
  if (!modal) {
    // Создаем модалку
    modal = document.createElement('div');
    modal.id = 'confirm-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:400px;">
        <div style="padding:20px;">
          <h3 style="margin:0 0 16px 0;color:var(--text-primary);">Подтверждение</h3>
          <p id="confirm-message" style="color:var(--text-secondary);margin-bottom:24px;">${message}</p>
          <div style="display:flex;gap:10px;">
            <button id="confirm-cancel" class="btn btn-secondary" style="flex:1;">Отмена</button>
            <button id="confirm-ok" class="btn btn-error" style="flex:1;">${confirmText}</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Добавляем стили для confirm модалки
    if (!document.getElementById('confirm-modal-styles')) {
      const style = document.createElement('style');
      style.id = 'confirm-modal-styles';
      style.textContent = `
        #confirm-modal .modal-content {
          animation: modalSlideIn 0.3s ease-out;
        }
        
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Обработчики событий
    const cancelBtn = modal.querySelector('#confirm-cancel');
    const okBtn = modal.querySelector('#confirm-ok');
    
    const hideModal = () => {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    };
    
    cancelBtn.addEventListener('click', hideModal);
    
    okBtn.addEventListener('click', () => {
      hideModal();
      if (callback) callback(true);
    });
    
    // Закрытие по клику вне модалки
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        hideModal();
        if (callback) callback(false);
      }
    });
    
    // Закрытие по ESC
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        hideModal();
        if (callback) callback(false);
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  } else {
    // Обновляем существующую модалку
    modal.querySelector('#confirm-message').textContent = message;
    modal.querySelector('#confirm-ok').textContent = confirmText;
    
    // Удаляем старые обработчики и добавляем новые
    const okBtn = modal.querySelector('#confirm-ok');
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    
    const hideModal = () => {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    };
    
    newOkBtn.addEventListener('click', () => {
      hideModal();
      if (callback) callback(true);
    });
  }
  
  // Показываем модалку
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

/**
 * Экранирует HTML-символы для предотвращения XSS
 */
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}