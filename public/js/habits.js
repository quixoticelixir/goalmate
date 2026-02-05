// habits.js
import * as API from './api.js';
import * as UI from './ui.js';
import * as Auth from './auth.js';
// Импортируем константы и утилиты
import { formatLocalDate, isFutureDate, calculateCurrentStreak, calculateMaxStreak, ensureAuthenticated, MONTH_NAMES, SHORT_MONTH_NAMES } from './habitUtils.js';
import { renderHabitsList, renderTodayHabits, renderCalendar, renderHabitsCardsAboveCalendar } from './habitUI.js';

// ==================== КОНСТАНТЫ И СОСТОЯНИЕ ====================
let calendarView = 'month';
let currentPeriod = new Date();

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

function initHabits() {
  console.log('🔁 Инициализация модуля привычек...');
  initHabitModal();
  initCalendarListeners();
  console.log('✅ Модуль привычек инициализирован');
}

function initHabitModal() {
  // === Создание новой привычки ===
  const btnAdd = document.getElementById('btn-add-habit');
  const btnSave = document.getElementById('habit-save');
  const btnCancel = document.getElementById('habit-cancel');
  const modal = document.getElementById('habit-modal');

  if (btnAdd) btnAdd.addEventListener('click', showHabitModal);
  if (btnSave) btnSave.addEventListener('click', UI.debounce(saveHabitHandler, 300));
  if (btnCancel) btnCancel.addEventListener('click', () => UI.hideModal('habit-modal'));
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) UI.hideModal('habit-modal');
    });
  }

  // === Редактирование существующей привычки ===
  const editSaveBtn = document.getElementById('edit-habit-save');
  const editCancelBtn = document.getElementById('edit-habit-cancel');
  const editModal = document.getElementById('edit-habit-modal');

  if (editSaveBtn) editSaveBtn.addEventListener('click', UI.debounce(saveEditedHabit, 300));
  if (editCancelBtn) editCancelBtn.addEventListener('click', () => UI.hideModal('edit-habit-modal'));
  if (editModal) {
    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) UI.hideModal('edit-habit-modal');
    });
  }
}

function initCalendarListeners() {
  const handlers = {
    'btn-calendar-week': () => setCalendarView('week'),
    'btn-calendar-month': () => setCalendarView('month'),
    'btn-prev-period': () => navigateCalendar(-1),
    'btn-next-period': () => navigateCalendar(1),
    'btn-export-data': exportAllHabitsData,
    'btn-today': resetToCurrentMonth
  };

  Object.entries(handlers).forEach(([id, handler]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
  });

  updateViewButtons();
}

// ==================== МОДАЛКА ПРИВЫЧКИ ====================

function showHabitModal() {
  if (!ensureAuthenticated()) {
    UI.showToast('Требуется авторизация', 'warning');
    showAuthScreen();
    return;
  }

  const titleInput = document.getElementById('habit-title');
  const dailyCheckbox = document.getElementById('habit-daily');
  if (titleInput) titleInput.value = '';
  if (dailyCheckbox) dailyCheckbox.checked = true;

  setTimeout(() => titleInput?.focus(), 100);
  UI.showModal('habit-modal');
}

let currentEditHabitId = null;

async function saveHabitHandler() {
  const titleInput = document.getElementById('habit-title');
  const dailyCheckbox = document.getElementById('habit-daily');
  const saveBtn = document.getElementById('habit-save');

  if (!titleInput || !saveBtn) return;

  const title = titleInput.value.trim();
  const description = document.getElementById('habit-description')?.value.trim() || '';
  const isDaily = dailyCheckbox?.checked ?? true;

  if (!title) return UI.showToast('Введите название привычки', 'error');
  if (title.length < 2) return UI.showToast('Минимум 2 символа', 'error');
  if (!ensureAuthenticated()) return;

  UI.setButtonLoading(saveBtn, true);
  try {
    const res = await Auth.safeFetch('/api/habits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, daily: isDaily })
    });

    UI.hideModal('habit-modal');
    UI.showToast(`Привычка "${res.habit.title}" создана!`, 'success');
    API.clearCache();
    setTimeout(refreshHabitViews, 500);
  } catch (error) {
    handleApiError(error, 'Создание привычки');
  } finally {
    UI.setButtonLoading(saveBtn, false);
  }
}

// ==================== РЕДАКТИРОВАНИЕ ПРИВЫЧКИ ====================

function showEditHabitModal(habitId, currentTitle) {
  if (!ensureAuthenticated()) {
    UI.showToast('Требуется авторизация', 'warning');
    showAuthScreen();
    return;
  }

  const input = document.getElementById('edit-habit-title');
  const modal = document.getElementById('edit-habit-modal');

  if (!input || !modal) {
    UI.showToast('Модальное окно редактирования не найдено', 'error');
    return;
  }

  input.value = currentTitle;
  currentEditHabitId = habitId;
  UI.showModal('edit-habit-modal');
  setTimeout(() => input.focus(), 100);
}

async function saveEditedHabit() {
  const input = document.getElementById('edit-habit-title');
  const saveBtn = document.getElementById('edit-habit-save');

  if (!input || !currentEditHabitId) return;

  const newTitle = input.value.trim();
  if (!newTitle || newTitle.length < 2) {
    return UI.showToast('Название должно содержать минимум 2 символа', 'error');
  }

  UI.setButtonLoading(saveBtn, true);
  try {
    await Auth.safeFetch(`/api/habits/${currentEditHabitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle })
    });

    UI.hideModal('edit-habit-modal');
    UI.showToast('Привычка обновлена!', 'success');
    API.clearCache();
    refreshHabitViews(); // обновит и трекер, и список
  } catch (error) {
    handleApiError(error, 'Обновление привычки');
  } finally {
    UI.setButtonLoading(saveBtn, false);
  }
}

// ==================== РЕНДЕР И ДАННЫЕ ====================

async function loadAndRenderHabitsList() {
  if (!Auth.isAuthenticated()) {
    renderUnauthenticatedState('habits-list-container');
    return;
  }

  try {
    const habits = await API.loadHabits(true);
    renderHabitsList(habits, toggleTodayHabit, deleteHabit, exportHabitData);
  } catch (error) {
    handleApiError(error, 'Загрузка привычек');
    renderErrorState('habits-list-container', error.message, loadAndRenderHabitsList);
  }
}

async function refreshTracker() {
  if (!ensureAuthenticated()) {
    renderUnauthenticatedState('calendar-container');
    return;
  }

  const habits = await API.loadHabits(true);
  renderHabitsCardsAboveCalendar(
    habits,
    toggleTodayHabit,
    deleteHabit,
    showEditHabitModal // ← передаём функцию как коллбэк
  );
  const days = getDaysForView();
  renderCalendar(habits, days, calendarView, currentPeriod, toggleHabitCheckin);
}

// ==================== ДЕЙСТВИЯ ====================

async function toggleTodayHabit(habitId, habitTitle, isCurrentlyChecked) {
  const todayStr = formatLocalDate(new Date());
  const button = document.querySelector(`.habit-card[data-habit-id="${habitId}"] .btn-toggle-today`);
  const newIsChecked = !isCurrentlyChecked;

  if (button) {
    button.disabled = true;
    button.className = `btn-toggle-today ${newIsChecked ? 'button-secondary' : 'button-success'}`;
    button.textContent = newIsChecked ? 'Отменить' : 'Выполнить';
  }

  try {
    if (!Auth.isAuthenticated()) {
      throw new Error('Требуется авторизация');
    }

    const method = newIsChecked ? 'POST' : 'DELETE';
    await Auth.safeFetch(`/api/habits/${habitId}/checkin`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayStr })
    });

    const message = newIsChecked
      ? `Отличная работа! "${habitTitle}" выполнен!`
      : `День отменен для "${habitTitle}"`;
    UI.showToast(message, newIsChecked ? 'success' : 'info');

    API.clearCache();
    await refreshHabitViews();

  } catch (error) {
    console.error('Toggle habit error:', error);

    if (button) {
      button.className = `btn-toggle-today ${isCurrentlyChecked ? 'button-secondary' : 'button-success'}`;
      button.textContent = isCurrentlyChecked ? 'Отменить' : 'Выполнить';
    }

    UI.showToast('Ошибка обновления привычки: ' + error.message, 'error');

    if (error.status === 401) {
      showAuthScreen();
    }
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

async function toggleHabitCheckin(habitId, dateStr, shouldCheck, habitTitle) {
  if (!ensureAuthenticated()) {
    UI.showToast('Требуется авторизация', 'warning');
    showAuthScreen();
    return;
  }

  if (isFutureDate(dateStr)) {
    UI.showToast('Нельзя отмечать привычки в будущем', 'error');
    return;
  }

  try {
    const method = shouldCheck ? 'POST' : 'DELETE';
    await Auth.safeFetch(`/api/habits/${habitId}/checkin`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateStr })
    });
    API.clearCache();
    await refreshHabitViews();
    UI.showToast(`${shouldCheck ? 'Отмечено' : 'Отменено'} для "${habitTitle}"`, shouldCheck ? 'success' : 'info');
  } catch (error) {
    handleApiError(error, 'Обновление отметки');
  }
}

async function deleteHabit(habitId, habitTitle) {
  if (!confirm(`Удалить привычку "${habitTitle}"?`)) return;
  if (!ensureAuthenticated()) return;

  try {
    await Auth.safeFetch(`/api/habits/${habitId}`, { method: 'DELETE' });
    API.clearCache();
    
    // Проверяем, находимся ли мы на странице трекера
    const isOnTrackerPage = document.getElementById('page-habits-tracker')?.style.display !== 'none';
    
    if (isOnTrackerPage) {
      await refreshTracker(); // ← перерисует и карточки, и календарь
    } else {
      await refreshHabitViews(); // ← для других страниц
    }
    
    UI.showToast(`Привычка "${habitTitle}" удалена`, 'success');
  } catch (error) {
    handleApiError(error, 'Удаление привычки');
  }
}

// ==================== НАВИГАЦИЯ И ВИД ====================

function setCalendarView(view) {
  if (view === calendarView) return;
  calendarView = view;
  if (view === 'month') {
    const now = new Date();
    currentPeriod = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  updateViewButtons();
  updatePeriodTitle();
  refreshTracker();
}

function navigateCalendar(direction) {
  if (calendarView === 'week') {
    currentPeriod.setDate(currentPeriod.getDate() + direction * 7);
  } else {
    const d = new Date(currentPeriod.getFullYear(), currentPeriod.getMonth(), 1);
    const newMonth = d.getMonth() + direction;
    currentPeriod = new Date(d.getFullYear() + Math.floor(newMonth / 12), ((newMonth % 12) + 12) % 12, 1);
  }
  updatePeriodTitle();
  refreshTracker();
}

function resetToCurrentMonth() {
  const now = new Date();
  currentPeriod = new Date(now.getFullYear(), now.getMonth(), 1);
  refreshTracker();
}

function updateViewButtons() {
  const weekBtn = document.getElementById('btn-calendar-week');
  const monthBtn = document.getElementById('btn-calendar-month');
  if (weekBtn && monthBtn) {
    weekBtn.classList.toggle('active', calendarView === 'week');
    monthBtn.classList.toggle('active', calendarView === 'month');
  }
}

function updatePeriodTitle() {
  const titleEl = document.getElementById('calendar-period-title');
  if (!titleEl) return;

  if (calendarView === 'week') {
    const days = getDaysForView();
    const first = days[0], last = days[days.length - 1];
    if (first.getMonth() === last.getMonth()) {
      titleEl.textContent = `${first.getDate()}-${last.getDate()} ${SHORT_MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`;
    } else {
      titleEl.textContent = `${first.getDate()} ${SHORT_MONTH_NAMES[first.getMonth()]} – ${last.getDate()} ${SHORT_MONTH_NAMES[last.getMonth()]} ${first.getFullYear()}`;
    }
  } else {
    // ИСПРАВЛЕНО: используем currentPeriod.getMonth()
    titleEl.textContent = `${MONTH_NAMES[currentPeriod.getMonth()]} ${currentPeriod.getFullYear()}`;
  }
}

function getDaysForView() {
  const d = new Date(currentPeriod);
  if (calendarView === 'week') {
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      day.setHours(12, 0, 0, 0);
      return day;
    });
  } else {
    const year = d.getFullYear();
    const month = d.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = new Date(year, month, i + 1);
      day.setHours(12, 0, 0, 0);
      return day;
    });
  }
}

// ==================== ОБНОВЛЕНИЕ ====================

/**
 * Обновляет все компоненты, связанные с привычками
 */
async function refreshHabitViews() {
  try {
    const activePage = getCurrentActivePage();
    const freshHabits = await API.loadHabits(true);

    switch (activePage) {
      case 'habits-list':
        renderHabitsList(freshHabits, toggleTodayHabit, deleteHabit, exportHabitData);
        break;
      case 'habits-tracker':
        renderTodayHabits(freshHabits, toggleTodayHabit);
        const days = getDaysForView();
        renderCalendar(freshHabits, days, calendarView, currentPeriod, toggleHabitCheckin);
        break;
      case 'home':
        renderTodayHabits(freshHabits, toggleTodayHabit);
        break;
      default:
        // Обновляем все возможные контейнеры
        const containers = [
          { id: 'calendar-container', fn: () => {
              const days = getDaysForView();
              renderCalendar(freshHabits, days, calendarView, currentPeriod, toggleHabitCheckin);
            }
          },
          { id: 'today-habits', fn: () => renderTodayHabits(freshHabits, toggleTodayHabit) },
          { id: 'habits-list-container', fn: () => renderHabitsList(freshHabits, toggleTodayHabit, deleteHabit, exportHabitData) }
        ];
        containers.forEach(({ id, fn }) => {
          const el = document.getElementById(id);
          if (el && getComputedStyle(el).display !== 'none') fn();
        });
        break;
    }
  } catch (error) {
    console.error('❌ Ошибка обновления компонентов:', error);
    UI.showToast('Не удалось обновить данные', 'error');
  }
}

function getCurrentActivePage() {
  const activeSidebarItem = document.querySelector('.sidebar-item.active');
  if (activeSidebarItem) return activeSidebarItem.dataset.page;

  const pages = ['home', 'goals', 'habits-list', 'habits-tracker'];
  for (const page of pages) {
    const el = document.getElementById(`page-${page}`);
    if (el && el.style.display !== 'none') return page;
  }
  return 'home';
}

// ==================== ЭКСПОРТ И СТИЛИ ====================

async function exportHabitData(habitId, habitTitle) {
  if (!ensureAuthenticated()) {
    UI.showToast('Требуется авторизация', 'warning');
    showAuthScreen();
    return;
  }
  try {
    const habits = await API.loadHabits(true);
    const habit = habits.find(h => h.id === habitId);
    if (!habit) throw new Error('Привычка не найдена');

    const data = {
      title: habit.title,
      created_at: habit.created_at,
      total_days: habit.checkin_dates?.length || 0,
      checkins: habit.checkin_dates || []
    };
    downloadJson(data, `habit-${habitTitle.replace(/\s+/g, '-').toLowerCase()}`);
  } catch (error) {
    UI.showToast('Ошибка экспорта', 'error');
  }
}

async function exportAllHabitsData() {
  if (!ensureAuthenticated()) {
    UI.showToast('Требуется авторизация', 'warning');
    showAuthScreen();
    return;
  }
  try {
    const habits = await API.loadHabits(true);
    if (!habits?.length) return UI.showToast('Нет данных', 'warning');

    const exportData = {
      exported_at: new Date().toISOString(),
      total_habits: habits.length,
      habits: habits.map(h => ({
        title: h.title,
        created_at: h.created_at,
        total_checkins: h.checkin_dates?.length || 0,
        checkins: h.checkin_dates || [],
        current_streak: calculateCurrentStreak(new Set(h.checkin_dates || [])),
        max_streak: calculateMaxStreak(h.checkin_dates || [])
      }))
    };
    downloadJson(exportData, 'habits-export');
  } catch (error) {
    UI.showToast('Ошибка экспорта', 'error');
  }
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==================== УТИЛИТЫ ====================

function showAuthScreen() {
  const authScreen = document.getElementById('auth-screen');
  const appContent = document.getElementById('app-content');
  if (authScreen && appContent) {
    authScreen.style.display = 'block';
    appContent.style.display = 'none';
  }
}

function renderUnauthenticatedState(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <h3>Требуется авторизация</h3>
      <p style="color: var(--muted); margin-bottom: 16px;">Для просмотра привычек необходимо войти в систему</p>
      <button id="show-auth-btn" class="button-primary">Войти</button>
    </div>
  `;
  document.getElementById('show-auth-btn')?.addEventListener('click', showAuthScreen);
}

function renderErrorState(containerId, message, retryFn) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <div style="color: var(--error); font-size: 48px; margin-bottom: 16px;">⚠</div>
      <h3>Ошибка загрузки привычек</h3>
      <p style="color: var(--muted); margin-bottom: 16px;">${message || 'Неизвестная ошибка'}</p>
      <button id="retry-load-habits" class="button-secondary">Повторить попытку</button>
    </div>
  `;
  document.getElementById('retry-load-habits')?.addEventListener('click', retryFn);
}

function handleApiError(error, context = 'Запрос') {
  console.error(`${context} error:`, error);
  if (error.status === 401) {
    showAuthScreen();
    UI.showToast('Сессия истекла. Пожалуйста, войдите снова.', 'error');
  } else {
    UI.showToast(`${context}: ${error.message || 'Неизвестная ошибка'}`, 'error');
  }
}

// ==================== ЭКСПОРТ ====================

export {
  initHabits,
  loadAndRenderHabitsList,
  refreshTracker,
  showHabitModal,
  setCalendarView,
  navigateCalendar,
  exportAllHabitsData,
  toggleTodayHabit
};