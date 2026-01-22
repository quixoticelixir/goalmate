import * as API from './api.js';
import * as UI from './ui.js';
import * as Auth from './auth.js';

// ==================== КОНСТАНТЫ И СОСТОЯНИЕ ====================
const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const SHORT_MONTH_NAMES = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const FULL_DAY_NAMES = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

let calendarView = 'month';
let currentPeriod = new Date();

// ==================== ВСПОМОГАТЕЛЬНЫЕ УТИЛИТЫ ====================

/**
 * Форматирует дату в локальный YYYY-MM-DD (без UTC-сдвига)
 */
function formatLocalDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
    .toLocaleDateString('en-CA');
}

/**
 * Проверяет авторизацию и показывает экран входа при необходимости
 * @returns {boolean} — true если авторизован
 */
function ensureAuthenticated() {
  if (!Auth.isAuthenticated()) {
    UI.showToast('Требуется авторизация', 'warning');
    showAuthScreen();
    return false;
  }
  return true;
}

/**
 * Показывает экран авторизации
 */
function showAuthScreen() {
  const authScreen = document.getElementById('auth-screen');
  const appContent = document.getElementById('app-content');
  if (authScreen && appContent) {
    authScreen.style.display = 'block';
    appContent.style.display = 'none';
  }
}

/**
 * Получает текущую активную страницу
 */
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

/**
 * Обновляет все виды, зависящие от привычек
 */
async function refreshHabitViews() {
  try {
    const habits = await API.loadHabits(true);
    const activePage = getCurrentActivePage();

    switch (activePage) {
      case 'habits-list':
        renderHabitsList(habits);
        break;
      case 'habits-tracker':
        renderTodayHabits(habits);
        renderCalendar(habits);
        break;
      case 'home':
        renderTodayHabits(habits);
        break;
      default:
        // Обновляем все возможные контейнеры
        const containers = [
          { id: 'calendar-container', fn: () => renderCalendar(habits) },
          { id: 'today-habits', fn: () => renderTodayHabits(habits) },
          { id: 'habits-list-container', fn: () => renderHabitsList(habits) }
        ];
        containers.forEach(({ id, fn }) => {
          const el = document.getElementById(id);
          if (el && el.style.display !== 'none') fn();
        });
    }
  } catch (error) {
    console.error('Ошибка обновления компонентов привычек:', error);
    UI.showToast('Не удалось обновить данные', 'error');
  }
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

function initHabits() {
  console.log('🔁 Инициализация модуля привычек...');
  initHabitModal();
  initCalendarListeners();

  console.log('✅ Модуль привычек инициализирован');
}

function initHabitModal() {
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

  // Активная кнопка вида
  updateViewButtons();
}

// ==================== МОДАЛКА ПРИВЫЧКИ ====================

function showHabitModal() {
  if (!ensureAuthenticated()) return;

  const titleInput = document.getElementById('habit-title');
  const dailyCheckbox = document.getElementById('habit-daily');
  if (titleInput) titleInput.value = '';
  if (dailyCheckbox) dailyCheckbox.checked = true;

  setTimeout(() => titleInput?.focus(), 100);
  UI.showModal('habit-modal');
}

async function saveHabitHandler() {
  const titleInput = document.getElementById('habit-title');
  const dailyCheckbox = document.getElementById('habit-daily');
  const saveBtn = document.getElementById('habit-save');

  if (!titleInput || !saveBtn) return;

  const title = titleInput.value.trim();
  const isDaily = dailyCheckbox?.checked ?? true;

  if (!title) return UI.showToast('Введите название привычки', 'error');
  if (title.length < 2) return UI.showToast('Минимум 2 символа', 'error');
  if (!ensureAuthenticated()) return;

  UI.setButtonLoading(saveBtn, true);
  try {
    const res = await Auth.safeFetch('/api/habits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, daily: isDaily })
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

// ==================== РЕНДЕР И ДАННЫЕ ====================

async function loadAndRenderHabitsList() {
  if (!Auth.isAuthenticated()) {
    renderUnauthenticatedState('habits-list-container');
    return;
  }

  try {
    const habits = await API.loadHabits(true);
    renderHabitsList(habits);
  } catch (error) {
    handleApiError(error, 'Загрузка привычек');
    renderErrorState('habits-list-container', error.message, loadAndRenderHabitsList);
  }
}

function renderHabitsList(habits) {
  const container = document.getElementById('habits-list-container');
  if (!container) return;

  const todayStr = formatLocalDate(new Date());

  if (!habits?.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>У вас пока нет привычек.</p>
        <p style="margin-top:10px;color:var(--accent);">Нажмите "Добавить привычку", чтобы начать!</p>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  habits.forEach(habit => {
    const checkins = new Set(habit.checkin_dates || []);
    const isTodayChecked = checkins.has(todayStr);
    const currentStreak = calculateCurrentStreak(checkins);
    const maxStreak = calculateMaxStreak(checkins);
    const streakPercentage = maxStreak ? Math.min((currentStreak / maxStreak) * 100, 100) : 0;

    const card = document.createElement('div');
    card.className = 'habit-card fade-in';
    card.dataset.habitId = habit.id;
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;">
        <div class="habit-title">${habit.title}</div>
        <div style="display:flex;gap:4px;">
          <button class="btn-toggle-habit button-secondary" style="font-size:12px;padding:4px 8px;" title="Детали">📊</button>
          <button class="btn-delete-habit button-warning" style="font-size:12px;padding:4px 8px;" title="Удалить">🗑</button>
        </div>
      </div>
      <div class="habit-stats">
        <span>${isTodayChecked ? '✅ Сегодня выполнено' : '⏳ Сегодня не выполнено'}</span>
        <button class="btn-toggle-today ${isTodayChecked ? 'button-secondary' : 'button-success'}" style="font-size:11px;padding:4px 8px;">
          ${isTodayChecked ? 'Отменить' : 'Выполнить'}
        </button>
      </div>
      <div class="habit-stats" style="display:flex;justify-content:space-between;margin:8px 0;">
        <span>🔥 Текущая цепочка: <strong>${currentStreak}</strong> дн.</span>
        <span>🥇 Рекорд: <strong>${maxStreak}</strong> дн.</span>
      </div>
      <div class="habit-stats" style="margin-bottom:8px;">📅 Всего дней: <strong>${checkins.size}</strong></div>
      <div class="progress-bar" style="margin:8px 0;"><div class="progress-fill" style="width:${streakPercentage}%"></div></div>
      <div class="habit-details" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">📅 Дни выполнения за последнюю неделю:</div>
        <div id="habit-week-${habit.id}" style="display:flex;gap:4px;margin-bottom:12px;"></div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);">
          <span>Создано: ${formatDate(habit.created_at)}</span>
          <button class="btn-export-habit" style="background:none;border:none;color:var(--accent);cursor:pointer;">📥 Экспорт данных</button>
        </div>
      </div>
    `;
    fragment.appendChild(card);
    setTimeout(() => renderHabitWeekDays(habit.id, checkins), 0);
  });

  container.innerHTML = '';
  container.appendChild(fragment);
  initHabitCardHandlers();
}

function renderHabitWeekDays(habitId, checkins) {
  const container = document.getElementById(`habit-week-${habitId}`);
  if (!container) return;

  const now = new Date();
  container.innerHTML = '';
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dateStr = formatLocalDate(date);
    const dayName = DAY_NAMES[date.getDay() === 0 ? 6 : date.getDay() - 1];
    const isChecked = checkins.has(dateStr);

    const el = document.createElement('div');
    el.style.cssText = `
      width: 28px; height: 28px; border-radius: 6px;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-size: 9px; cursor: pointer;
      background: ${isChecked ? 'var(--accent)' : 'var(--border)'};
      color: ${isChecked ? '#020617' : 'var(--text)'};
    `;
    el.innerHTML = `<div>${dayName}</div><div style="font-weight:bold;font-size:10px;">${date.getDate()}</div>`;
    el.addEventListener('click', () => toggleHabitCheckin(habitId, dateStr, !isChecked));
    container.appendChild(el);
  }
}

// ==================== КАЛЕНДАРЬ ====================

async function refreshTracker() {
  if (!ensureAuthenticated()) {
    const container = document.getElementById('calendar-container');
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Требуется авторизация</h3>
          <p style="color: var(--muted);">Для просмотра трекера необходимо войти в систему</p>
        </div>
      `;
    }
    return;
  }

  const habits = await API.loadHabits(true);
  renderTodayHabits(habits);
  renderCalendar(habits);

}

function renderTodayHabits(habits) {
  const container = document.getElementById('today-habits');
  if (!container) return;

  const todayStr = formatLocalDate(new Date());
  if (!habits?.length) {
    container.innerHTML = '<p class="empty-state">Нет активных привычек</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  habits.forEach(habit => {
    const isChecked = new Set(habit.checkin_dates || []).has(todayStr);
    const wrapper = document.createElement('div');
    wrapper.className = 'slide-down';
    wrapper.style.cssText = `display:flex;align-items:center;gap:12px;margin-bottom:10px;padding:10px;background-color:rgba(30,41,59,0.5);border-radius:8px;`;
    const btn = document.createElement('button');
    btn.className = isChecked ? 'button-success' : 'button-accent';
    btn.textContent = isChecked ? '✅ Выполнено' : '☑ Выполнить';
    btn.addEventListener('click', UI.debounce(() => toggleTodayHabit(habit.id, habit.title, isChecked), 300));
    wrapper.innerHTML = `<span style="flex:1;">${habit.title}</span>`;
    wrapper.appendChild(btn);
    fragment.appendChild(wrapper);
  });

  container.innerHTML = '';
  container.appendChild(fragment);
}

function renderCalendar(habits) {
  const container = document.getElementById('calendar-container');
  if (!container) return;

  const days = getDaysForView();
  const todayStr = formatLocalDate(new Date());

  // Обновляем заголовок
  const periodTitle = document.getElementById('calendar-period-title');
  if (periodTitle) {
    if (calendarView === 'week') {
      const first = days[0], last = days[days.length - 1];
      if (first.getMonth() === last.getMonth()) {
        periodTitle.textContent = `${first.getDate()}-${last.getDate()} ${SHORT_MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`;
      } else {
        periodTitle.textContent = `${first.getDate()} ${SHORT_MONTH_NAMES[first.getMonth()]} – ${last.getDate()} ${SHORT_MONTH_NAMES[last.getMonth()]} ${first.getFullYear()}`;
      }
    } else {
      const d = new Date(currentPeriod);
      periodTitle.textContent = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    }
  }

  if (!habits?.length) {
    container.innerHTML = '<p class="empty-state">Добавьте привычки, чтобы увидеть календарь</p>';
    return;
  }

  // Создаём адаптивную сетку
  const calendarWrapper = document.createElement('div');
  calendarWrapper.className = 'calendar-responsive-wrapper';
  
  const grid = document.createElement('div');
  grid.className = 'calendar-responsive-grid';
  grid.style.setProperty('--days-count', days.length);

  // Заголовок дней
  const daysHeader = document.createElement('div');
  daysHeader.className = 'calendar-days-header';
  
  // Ячейка для названий привычек
  const habitLabelCell = document.createElement('div');
  habitLabelCell.className = 'calendar-habit-label';
  habitLabelCell.textContent = 'Привычка';
  daysHeader.appendChild(habitLabelCell);

  // Дни недели/месяца
  days.forEach(date => {
    const dateLocal = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const isToday = formatLocalDate(dateLocal) === todayStr;
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day-header';
    dayCell.innerHTML = `
      <div class="day-number ${isToday ? 'today' : ''}">${date.getDate()}</div>
      <div class="day-name">${DAY_NAMES[date.getDay()]}</div>
    `;
    dayCell.style.color = isWeekend ? 'var(--warning)' : 'var(--text)';
    daysHeader.appendChild(dayCell);
  });
  
  grid.appendChild(daysHeader);

  // Строки привычек
  habits.forEach((habit, rowIndex) => {
    const row = document.createElement('div');
    row.className = 'calendar-habit-row';
    
    // Название привычки
    const habitLabel = document.createElement('div');
    habitLabel.className = 'calendar-habit-label';
    habitLabel.textContent = habit.title;
    habitLabel.title = habit.title;
    row.appendChild(habitLabel);
    
    const checkins = new Set(habit.checkin_dates || []);
    
    // Ячейки дней
    days.forEach(date => {
      const dateLocal = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayStr = formatLocalDate(dateLocal);
      const isChecked = checkins.has(dayStr);
      const isToday = dayStr === todayStr;
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      
      const dayCell = document.createElement('div');
      dayCell.className = `calendar-day-cell ${isChecked ? 'checked' : ''} ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}`;
      dayCell.dataset.habit = habit.id;
      dayCell.dataset.date = dayStr;
      dayCell.title = `${FULL_DAY_NAMES[date.getDay()]}, ${date.getDate()} ${MONTH_NAMES[date.getMonth()].toLowerCase()} ${date.getFullYear()} — ${habit.title}`;
      
      if (isChecked) {
        dayCell.innerHTML = '<div class="marker">✓</div>';
      } else if (isToday) {
        dayCell.textContent = date.getDate();
      } else {
        dayCell.textContent = date.getDate();
        dayCell.style.opacity = '0.6';
      }
      
      dayCell.addEventListener('click', UI.debounce(() => 
        toggleHabitCheckin(habit.id, dayStr, !isChecked), 300));
      
      row.appendChild(dayCell);
    });
    
    grid.appendChild(row);
  });

  container.innerHTML = '';
  calendarWrapper.appendChild(grid);
  container.appendChild(calendarWrapper);
  
  // Добавляем стили
  addCalendarStyles();
  
  // Удаляем старый обработчик ресайза и добавляем новый
  if (window.calendarResizeHandler) {
    window.removeEventListener('resize', window.calendarResizeHandler);
  }
  
  window.calendarResizeHandler = UI.debounce(() => {
    updateCalendarResponsiveWidth();
  }, 150);
  
  window.addEventListener('resize', window.calendarResizeHandler);
  
  // Инициализируем ширину
  setTimeout(() => updateCalendarResponsiveWidth(), 100);
}

function updateCalendarResponsiveWidth() {
  const grid = document.querySelector('.calendar-responsive-grid');
  if (!grid) return;
  
  const container = document.getElementById('calendar-container');
  if (!container) return;
  
  // Проверяем ширину контейнера
  const containerWidth = container.clientWidth;
  const dayCells = grid.querySelectorAll('.calendar-day-cell, .calendar-day-header');
  
  if (containerWidth < 768) {
    // Мобильный режим - уменьшаем размер ячеек
    dayCells.forEach(cell => {
      cell.style.width = '28px';
      cell.style.height = '28px';
      cell.style.fontSize = '10px';
    });
    
    const habitLabels = grid.querySelectorAll('.calendar-habit-label');
    habitLabels.forEach(label => {
      label.style.fontSize = '12px';
      label.style.padding = '6px 4px';
    });
  } else if (containerWidth < 1024) {
    // Планшетный режим
    dayCells.forEach(cell => {
      cell.style.width = '32px';
      cell.style.height = '32px';
      cell.style.fontSize = '12px';
    });
  } else {
    // Десктопный режим
    dayCells.forEach(cell => {
      cell.style.width = '36px';
      cell.style.height = '36px';
      cell.style.fontSize = '14px';
    });
  }
}

// ==================== ДЕЙСТВИЯ ====================

/**
 * Обновляет все компоненты, связанные с привычками
 */
async function refreshAllHabitComponents() {
  console.log('🔄 Обновление всех компонентов привычек...');
  try {
    const activePage = getCurrentActivePage();
    const freshHabits = await API.loadHabits(true);

    switch (activePage) {
      case 'habits-list':
        renderHabitsList(freshHabits);
        break;
      case 'habits-tracker':
        renderTodayHabits(freshHabits);
        renderCalendar(freshHabits);
        break;
      case 'home':
        renderTodayHabits(freshHabits);
        break;
      default:
        const containers = [
          { id: 'calendar-container', fn: () => renderCalendar(freshHabits) },
          { id: 'today-habits', fn: () => renderTodayHabits(freshHabits) },
          { id: 'habits-list-container', fn: () => renderHabitsList(freshHabits) }
        ];
        containers.forEach(({ id, fn }) => {
          const el = document.getElementById(id);
          if (el && getComputedStyle(el).display !== 'none') fn();
        });
        break;
    }
    console.log('✅ Все компоненты привычек обновлены');
  } catch (error) {
    console.error('❌ Ошибка обновления компонентов:', error);
  }
}

async function toggleTodayHabit(habitId, habitTitle, isCurrentlyChecked) {
  // Используем локальную дату
  const todayStr = new Date().toLocaleDateString('en-CA');
  
  // НАЙТИ КНОПКУ И НЕМЕДЛЕННО ОБНОВИТЬ ЕЁ
  const button = document.querySelector(`.habit-card[data-habit-id="${habitId}"] .btn-toggle-today`);
  const newIsChecked = !isCurrentlyChecked;
  
  if (button) {
    // Мгновенный фидбэк
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

    // Очищаем кэш
    API.clearCache();

    // Обновляем ВСЁ
    await refreshAllHabitComponents();

  } catch (error) {
    console.error('Toggle habit error:', error);
    
    // ОТКАТ UI при ошибке
    if (button) {
      button.className = `btn-toggle-today ${isCurrentlyChecked ? 'button-secondary' : 'button-success'}`;
      button.textContent = isCurrentlyChecked ? 'Отменить' : 'Выполнить';
    }
    
    UI.showToast('Ошибка обновления привычки: ' + error.message, 'error');
    
    if (error.status === 401) {
      const authScreen = document.getElementById('auth-screen');
      const appContent = document.getElementById('app-content');
      if (authScreen && appContent) {
        authScreen.style.display = 'block';
        appContent.style.display = 'none';
      }
    }
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

async function toggleHabitCheckin(habitId, dateStr, shouldCheck) {
  if (!ensureAuthenticated()) return;

  // 🔒 ЗАПРЕТ НА БУДУЩИЕ ДНИ
  const todayStr = new Date().toISOString().slice(0, 10);
  if (dateStr > todayStr) {
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
    await refreshHabitViews();
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
    const d = new Date(currentPeriod);
    titleEl.textContent = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
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

// ==================== ЭКСПОРТ И СТИЛИ ====================

async function exportHabitData(habitId, habitTitle) {
  if (!ensureAuthenticated()) return;
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
  if (!ensureAuthenticated()) return;
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
        current_streak: calculateCurrentStreak(h.checkin_dates || []),
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

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function calculateCurrentStreak(checkins) {
  if (!checkins || !checkins.length) return 0;
  
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const checkinSet = new Set(checkins);
  
  // Если сегодня не отмечено — серия 0
  if (!checkinSet.has(todayStr)) return 0;
  
  let streak = 1;
  let currentDate = new Date(today);
  
  // Идём назад по дням
  for (let i = 1; i < 365; i++) {
    currentDate.setDate(currentDate.getDate() - 1);
    const dateStr = currentDate.toISOString().slice(0, 10);
    
    if (checkinSet.has(dateStr)) {
      streak++;
    } else {
      break; // серия прервана
    }
  }
  
  return streak;
}

function calculateMaxStreak(checkins) {
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

function addCalendarStyles() {
  if (document.getElementById('calendar-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'calendar-styles';
  style.textContent = `
    /* ==================== КАЛЕНДАРЬ ==================== */
    .calendar-responsive-wrapper {
      width: 100%;
      overflow-x: auto;
      overflow-y: hidden;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: rgba(15, 23, 42, 0.9);
      -webkit-overflow-scrolling: touch;
    }
    
    .calendar-responsive-grid {
      display: grid;
      grid-template-columns: minmax(120px, 180px) repeat(var(--days-count, 7), 1fr);
      min-width: fit-content;
      gap: 1px;
      background: var(--border);
    }
    
    /* Заголовок дней */
    .calendar-days-header {
      display: contents;
    }
    
    .calendar-day-header,
    .calendar-habit-label {
      background: rgba(15, 23, 42, 0.95);
      padding: 10px 6px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      border: none;
      position: sticky;
      left: 0;
      z-index: 2;
    }
    
    .calendar-habit-label {
      justify-content: flex-start;
      text-align: right;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-height: 44px;
    }
    
    .calendar-day-header {
      min-height: 44px;
      background: rgba(30, 41, 59, 0.95);
      z-index: 1;
    }
    
    .day-number {
      font-weight: 500;
      font-size: 14px;
    }
    
    .day-number.today {
      color: var(--accent);
      font-weight: bold;
    }
    
    .day-name {
      font-size: 11px;
      color: var(--muted);
      margin-top: 2px;
    }
    
    /* Строки привычек */
    .calendar-habit-row {
      display: contents;
    }
    
    .calendar-day-cell {
      background: rgba(30, 41, 59, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      border: none;
      aspect-ratio: 1;
      min-width: 28px;
      min-height: 28px;
      position: relative;
    }
    
    .calendar-day-cell:hover {
      background: rgba(56, 189, 248, 0.2);
      transform: scale(1.05);
      z-index: 1;
    }
    
    .calendar-day-cell.checked {
      background: rgba(56, 189, 248, 0.3);
      color: white;
    }
    
    .calendar-day-cell.checked .marker {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
    }
    
    .calendar-day-cell.today:not(.checked) {
      border: 2px solid var(--accent);
      font-weight: bold;
    }
    
    .calendar-day-cell.weekend:not(.checked) {
      color: var(--muted-dark);
    }
    
    /* Адаптивные стили */
    @media (max-width: 768px) {
      .calendar-responsive-grid {
        grid-template-columns: minmax(100px, 1fr) repeat(var(--days-count, 7), 1fr);
      }
      
      .calendar-habit-label {
        font-size: 12px;
        padding: 6px 4px;
      }
      
      .calendar-day-header {
        padding: 6px 4px;
      }
      
      .day-number {
        font-size: 12px;
      }
      
      .day-name {
        font-size: 10px;
      }
      
      .calendar-day-cell {
        min-width: 24px;
        min-height: 24px;
        font-size: 11px;
      }
      
      .calendar-day-cell.checked .marker {
        width: 16px;
        height: 16px;
        font-size: 10px;
      }
    }
    
    @media (max-width: 480px) {
      .calendar-responsive-wrapper {
        border-radius: 6px;
      }
      
      .calendar-responsive-grid {
        grid-template-columns: minmax(80px, 1fr) repeat(var(--days-count, 7), 1fr);
        gap: 0.5px;
      }
      
      .calendar-habit-label {
        font-size: 11px;
        padding: 4px;
        min-height: 36px;
      }
      
      .calendar-day-header {
        padding: 4px;
        min-height: 36px;
      }
      
      .day-number {
        font-size: 11px;
      }
      
      .day-name {
        font-size: 9px;
      }
      
      .calendar-day-cell {
        min-width: 20px;
        min-height: 20px;
        font-size: 10px;
      }
      
      .calendar-day-cell.checked .marker {
        width: 14px;
        height: 14px;
        font-size: 9px;
      }
    }
    
    /* Для очень узких экранов */
    @media (max-width: 360px) {
      .calendar-responsive-grid {
        grid-template-columns: minmax(70px, 1fr) repeat(var(--days-count, 7), 1fr);
      }
      
      .calendar-habit-label {
        font-size: 10px;
      }
      
      .calendar-day-cell {
        min-width: 18px;
        min-height: 18px;
        font-size: 9px;
      }
    }
    
    /* Прокрутка для календаря */
    .calendar-responsive-wrapper::-webkit-scrollbar {
      height: 8px;
    }
    
    .calendar-responsive-wrapper::-webkit-scrollbar-track {
      background: var(--border);
      border-radius: 4px;
    }
    
    .calendar-responsive-wrapper::-webkit-scrollbar-thumb {
      background: var(--accent);
      border-radius: 4px;
    }
    
    .calendar-responsive-wrapper::-webkit-scrollbar-thumb:hover {
      background: var(--accent-strong);
    }
  `;
  
  document.head.appendChild(style);
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
  // Инициализация
  initHabits,
  // Основные функции
  loadAndRenderHabitsList,
  refreshTracker,
  showHabitModal,
  setCalendarView,
  navigateCalendar,
  exportAllHabitsData
};