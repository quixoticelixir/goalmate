// habitUI.js
import * as UI from './ui.js';
// Импортируем константы
import { formatLocalDate, formatDate, DAY_NAMES, FULL_DAY_NAMES, MONTH_NAMES, SHORT_MONTH_NAMES, calculateCurrentStreak, calculateMaxStreak } from './habitUtils.js';

// ==================== РЕНДЕР ИНТЕРФЕЙСА ====================

/**
 * Рендерит список привычек.
 * @param {Array<Object>} habits - Массив объектов привычек.
 * @param {Function} onToggleToday - Callback для обработки отметки "сегодня".
 * @param {Function} onDelete - Callback для обработки удаления.
 * @param {Function} onExport - Callback для экспорта данных привычки.
 */
function renderHabitsList(habits, onToggleToday, onDelete, onExport) {
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
        <div class="habit-title">${escapeHtml(habit.title)}</div>
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

    // Инициализация обработчиков для карточки
    const toggleBtn = card.querySelector('.btn-toggle-today');
    const deleteBtn = card.querySelector('.btn-delete-habit');
    const exportBtn = card.querySelector('.btn-export-habit');
    const detailBtn = card.querySelector('.btn-toggle-habit');

    if (toggleBtn) toggleBtn.addEventListener('click', () => onToggleToday(habit.id, habit.title, isTodayChecked));
    if (deleteBtn) deleteBtn.addEventListener('click', () => onDelete(habit.id, habit.title));
    if (exportBtn) exportBtn.addEventListener('click', () => onExport(habit.id, habit.title));
    if (detailBtn) detailBtn.addEventListener('click', () => toggleHabitDetails(card)); // Предполагаем наличие этой функции

    // Рендерим дни недели (асинхронно для производительности)
    setTimeout(() => renderHabitWeekDays(habit.id, checkins, onToggleToday), 0);
  });

  container.innerHTML = '';
  container.appendChild(fragment);
}

/**
 * Переключает видимость деталей привычки.
 */
function toggleHabitDetails(card) {
  const details = card.querySelector('.habit-details');
  if (details) {
    details.style.display = details.style.display === 'none' ? 'block' : 'none';
  }
}

/**
 * Рендерит дни недели для одной привычки.
 */
function renderHabitWeekDays(habitId, checkins, onToggleDay) {
  const container = document.getElementById(`habit-week-${habitId}`);
  if (!container) return;

  const now = new Date();
  container.innerHTML = '';
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dateStr = formatLocalDate(date);
    const dayName = DAY_NAMES[date.getDay()];
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
    el.addEventListener('click', () => onToggleDay(habitId, dateStr, !isChecked, `Привычка ${habitId}`));
    container.appendChild(el);
  }
}

/**
 * Рендерит привычки "на сегодня".
 * @param {Array<Object>} habits - Массив объектов привычек.
 * @param {Function} onToggleToday - Callback для обработки отметки "сегодня".
 */
function renderTodayHabits(habits, onToggleToday) {
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
    btn.addEventListener('click', UI.debounce(() => onToggleToday(habit.id, habit.title, isChecked), 300));
    wrapper.innerHTML = `<span style="flex:1;">${escapeHtml(habit.title)}</span>`;
    wrapper.appendChild(btn);
    fragment.appendChild(wrapper);
  });

  container.innerHTML = '';
  container.appendChild(fragment);
}

/**
 * Рендерит календарь привычек.
 * @param {Array<Object>} habits - Массив объектов привычек.
 * @param {Array<Date>} days - Массив дат для отображения.
 * @param {string} view - Тип вида ('week', 'month').
 * @param {Date} currentPeriod - Текущий период (месяц/неделя).
 * @param {Function} onToggleDay - Callback для обработки отметки на день.
 */
function renderCalendar(habits, days, view, currentPeriod, onToggleDay) {
  const container = document.getElementById('calendar-container');
  if (!container) return;

  const todayStr = formatLocalDate(new Date());

  // Обновляем заголовок периода
  const periodTitle = document.getElementById('calendar-period-title');
  if (periodTitle) {
    if (view === 'week') {
      const first = days[0], last = days[days.length - 1];
      if (first.getMonth() === last.getMonth()) {
        periodTitle.textContent = `${first.getDate()}-${last.getDate()} ${SHORT_MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`;
      } else {
        periodTitle.textContent = `${first.getDate()} ${SHORT_MONTH_NAMES[first.getMonth()]} – ${last.getDate()} ${SHORT_MONTH_NAMES[last.getMonth()]} ${first.getFullYear()}`;
      }
    } else {
      // ИСПРАВЛЕНО: используем currentPeriod.getMonth()
      periodTitle.textContent = `${MONTH_NAMES[currentPeriod.getMonth()]} ${currentPeriod.getFullYear()}`;
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
    habitLabel.textContent = escapeHtml(habit.title);
    habitLabel.title = escapeHtml(habit.title);
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
      dayCell.title = `${FULL_DAY_NAMES[date.getDay()]}, ${date.getDate()} ${MONTH_NAMES[date.getMonth()].toLowerCase()} ${date.getFullYear()} — ${escapeHtml(habit.title)}`;

      if (isChecked) {
        dayCell.innerHTML = '<div class="marker">✓</div>';
      } else if (isToday) {
        dayCell.textContent = date.getDate();
      } else {
        dayCell.textContent = date.getDate();
        dayCell.style.opacity = '0.6';
      }

      dayCell.addEventListener('click', UI.debounce(() =>
        onToggleDay(habit.id, dayStr, !isChecked, escapeHtml(habit.title)), 300));

      row.appendChild(dayCell);
    });

    grid.appendChild(row);
  });

  container.innerHTML = '';
  calendarWrapper.appendChild(grid);
  container.appendChild(calendarWrapper);

  // Добавляем стили и делаем адаптивным
  addCalendarStyles();
  updateCalendarResponsiveWidth(container, grid);
}

/**
 * Обновляет ширину ячеек календаря в зависимости от ширины контейнера.
 */
function updateCalendarResponsiveWidth(container, grid) {
  if (!container || !grid) return;

  const containerWidth = container.clientWidth;
  const dayCells = grid.querySelectorAll('.calendar-day-cell, .calendar-day-header');
  const habitLabels = grid.querySelectorAll('.calendar-habit-label');

  if (containerWidth < 768) {
    dayCells.forEach(cell => {
      cell.style.width = '28px';
      cell.style.height = '28px';
      cell.style.fontSize = '10px';
    });
    habitLabels.forEach(label => {
      label.style.fontSize = '12px';
      label.style.padding = '6px 4px';
    });
  } else if (containerWidth < 1024) {
    dayCells.forEach(cell => {
      cell.style.width = '32px';
      cell.style.height = '32px';
      cell.style.fontSize = '12px';
    });
  } else {
    dayCells.forEach(cell => {
      cell.style.width = '36px';
      cell.style.height = '36px';
      cell.style.fontSize = '14px';
    });
  }
}

/**
 * Рендерит компактные карточки привычек над календарём
 * @param {Array} habits — список привычек
 * @param {Function} onToggleToday — (habitId, title, isCurrentlyChecked)
 * @param {Function} onDelete — (habitId, title)
 */
function renderHabitsCardsAboveCalendar(habits, onToggleToday, onDelete) {
  const container = document.getElementById('habits-cards-above-calendar');
  if (!container) return;

  if (!habits?.length) {
    container.innerHTML = '<div class="empty-state">Нет привычек</div>';
    return;
  }

  const todayStr = formatLocalDate(new Date());
  const fragment = document.createDocumentFragment();

  habits.forEach(habit => {
    const checkins = new Set(habit.checkin_dates || []);
    const isTodayChecked = checkins.has(todayStr);
    const currentStreak = calculateCurrentStreak(checkins);

    const card = document.createElement('div');
    card.className = 'habit-card-above';
    card.dataset.habitId = habit.id;

    // Определяем текст и стиль кнопки в зависимости от состояния
    const toggleText = isTodayChecked ? '✓' : '☑';
    const toggleTitle = isTodayChecked ? 'Отменить сегодня' : 'Выполнить сегодня';

    card.innerHTML = `
      <div class="habit-card-title">${escapeHtml(habit.title)}</div>
      <div class="habit-card-streak">🔥 ${currentStreak} дн.</div>
      <div class="habit-card-actions">
        <button class="btn-toggle-today ${isTodayChecked ? 'button-secondary' : 'button-success'}" 
                title="${toggleTitle}">
          ${toggleText}
        </button>
        <button class="btn-edit-habit button-secondary" title="Редактировать">✏️</button>
        <button class="btn-delete-habit button-warning" title="Удалить">🗑️</button>
      </div>
    `;

    fragment.appendChild(card);

    // Навешиваем обработчики
    const toggleBtn = card.querySelector('.btn-toggle-today');
    const editBtn = card.querySelector('.btn-edit-habit');
    const deleteBtn = card.querySelector('.btn-delete-habit');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => 
        onToggleToday(habit.id, habit.title, isTodayChecked)
      );
    }

    if (editBtn) {
      editBtn.addEventListener('click', () => 
        onEdit(habit.id, habit.title)
      );
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => 
        onDelete(habit.id, habit.title)
      );
    }
  });

  container.innerHTML = '';
  container.appendChild(fragment);
}

/**
 * Добавляет CSS-стили для календаря.
 */
function addCalendarStyles() {
  if (document.getElementById('calendar-styles')) return;

  const style = document.createElement('style');
  style.id = 'calendar-styles';
  style.textContent = `
    /* Вставьте сюда CSS из оригинального файла habits.js */
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

/**
 * Экранирует HTML-символы для предотвращения XSS.
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

// ==================== ЭКСПОРТ ====================
export {
  renderHabitsList,
  renderTodayHabits,
  renderCalendar,
  updateCalendarResponsiveWidth,
  escapeHtml,
  renderHabitsCardsAboveCalendar
};