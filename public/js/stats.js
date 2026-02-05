// stats.js
import * as API from './api.js';
import * as UI from './ui.js'; // Импортируем только нужные функции
import * as Auth from './auth.js';
import { calculateOverviewStats, calculateGoalsStats, calculateHabitsStats, filterByPeriod, getDaysForPeriod } from './statsCalculations.js'; // ИМПОРТИРУЕМ getDaysForPeriod
import { renderOverviewStatsUI, renderGoalsStatsUI, renderHabitsStatsUI, renderActivityChartUI, COLORS } from './statsUI.js'; // renderActivityChartUI импортируется, но теперь она возвращает Promise

const STATS_PERIODS = {
  'week': 'Неделя',
  'month': 'Месяц',
  'quarter': 'Квартал',
  'year': 'Год',
  'all': 'Все время'
};

async function loadStatistics() {
  console.log('📊 Загрузка статистики...');

  const container = UI.getElement('page-stats'); // Используем обертку
  if (!container) return;

  // Показываем загрузку
  container.innerHTML = `
    <div class="content-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2 style="margin:0;">📊 Статистика</h2>
        <select id="stats-period" class="btn btn-secondary">
          ${Object.entries(STATS_PERIODS).map(([value, label]) =>
            `<option value="${value}">${label}</option>`
          ).join('')}
        </select>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;">
        <div class="spinner" style="width:40px;height:40px;border-width:4px;margin-bottom:16px;"></div>
        <div style="color:var(--text-muted);font-size:14px;">Загрузка статистики...</div>
      </div>
    </div>
  `;

  try {
    const [goals, habits] = await Promise.all([
      API.loadGoals(true, 'all'),
      API.loadHabits(true)
    ]);

    renderStatistics(goals, habits);

  } catch (error) {
    console.error('Ошибка загрузки статистики:', error);
    container.innerHTML = `
      <div class="content-card">
        <h2 style="margin:0 0 1rem 0;">📊 Статистика</h2>
        <div class="empty-state">
          <div style="color:var(--error);font-size:48px;margin-bottom:16px;">⚠</div>
          <h3>Ошибка загрузки</h3>
          <p style="color:var(--text-muted);margin-bottom:16px;">${error.message || 'Неизвестная ошибка'}</p>
          <button id="retry-stats" class="btn btn-secondary">Повторить попытку</button>
        </div>
      </div>
    `;
    UI.getElement('retry-stats')?.addEventListener('click', loadStatistics);
  }
}

// ИСПРАВЛЕНО: renderStatistics теперь асинхронная функция
async function renderStatistics(goals, habits) {
  const container = UI.getElement('page-stats');
  if (!container) return;

  const period = UI.getElement('stats-period')?.value || 'month';

  // Рассчитываем данные
  const overviewStats = calculateOverviewStats(goals, habits);
  const goalsStats = calculateGoalsStats(goals, period);
  const habitsStats = calculateHabitsStats(habits, period);

  // РЕНДЕРИМ остальные части синхронно
  const overviewHTML = renderOverviewStatsUI(overviewStats);
  const goalsHTML = renderGoalsStatsUI(goalsStats);
  const habitsHTML = renderHabitsStatsUI(habitsStats);

  // РЕНДЕРИМ диаграмму активности асинхронно
  const activityChartHTMLPromise = renderActivityChartUI(habits, period); // Это Promise

  // Собираем основную часть HTML
  const html = `
    <div class="content-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2 style="margin:0;">📊 Статистика</h2>
        <select id="stats-period" class="btn btn-secondary">
          ${Object.entries(STATS_PERIODS).map(([value, label]) =>
            `<option value="${value}" ${value === period ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </div>

      <div style="margin-bottom:2rem;">
        <h3 style="margin-bottom:1rem;">📈 Обзор</h3>
        ${overviewHTML}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:2rem;">
        <div>
          <h3 style="margin-bottom:1rem;">🎯 Цели</h3>
          ${goalsHTML}
        </div>
        <div>
          <h3 style="margin-bottom:1rem;">🔁 Привычки</h3>
          ${habitsHTML}
        </div>
      </div>

      <div>
        <h3 style="margin-bottom:1rem;">📅 Активность</h3>
        <div id="activity-chart-placeholder">Загрузка диаграммы...</div> <!-- Временный плейсхолдер -->
      </div>
    </div>
  `;

  container.innerHTML = html;

  // ЖДЕМ, пока диаграмма будет готова, и вставляем её
  try {
    const activityChartHTML = await activityChartHTMLPromise;
    const placeholder = document.getElementById('activity-chart-placeholder');
    if (placeholder) {
      placeholder.outerHTML = activityChartHTML; // Заменяем плейсхолдер на готовый HTML
    }
  } catch (err) {
    console.error("Ошибка рендеринга диаграммы активности:", err);
    const placeholder = document.getElementById('activity-chart-placeholder');
    if (placeholder) {
      placeholder.innerHTML = '<p style="color: var(--error);">Ошибка загрузки диаграммы активности</p>';
    }
  }

  // Добавляем обработчик смены периода
  UI.getElement('stats-period')?.addEventListener('change', () => {
    renderStatistics(goals, habits); // Рекурсивный вызов, теперь асинхронный
  });
}

// Экспорт основной функции
export { loadStatistics };