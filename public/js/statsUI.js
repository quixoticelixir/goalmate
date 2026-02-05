// statsUI.js
// УБРАЛ import { getDaysForPeriod } from './statsCalculations.js'; - теперь она не нужна здесь
import { calculateActivityData } from './statsCalculations.js'; // Импортируем только calculateActivityData

// Константы цветов
export const COLORS = {
  primary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  goal: '#8b5cf6',
  habit: '#06b6d4'
};

// Функции рендеринга UI
export function renderOverviewStatsUI(stats) {
  const { totalGoals, completedGoals, goalCompletionRate, totalHabits, completedToday, habitCompletionRate, maxGoalStreak, maxHabitStreak } = stats;
  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${totalGoals}</div>
        <div class="stat-label">Всего целей</div>
        <div class="stat-subtext">${completedGoals} завершено</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalHabits}</div>
        <div class="stat-label">Привычек</div>
        <div class="stat-subtext">${completedToday} сегодня</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${goalCompletionRate}%</div>
        <div class="stat-label">Цели</div>
        <div class="stat-subtext">Успешность</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${habitCompletionRate}%</div>
        <div class="stat-label">Привычки</div>
        <div class="stat-subtext">Сегодня</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${maxGoalStreak}</div>
        <div class="stat-label">Цель</div>
        <div class="stat-subtext">Рекорд (дней)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${maxHabitStreak}</div>
        <div class="stat-label">Привычка</div>
        <div class="stat-subtext">Рекорд (дней)</div>
      </div>
    </div>
  `;
}

export function renderGoalsStatsUI(stats) {
  const { total, completed, active, archived, priorities, complexities, completionRate } = stats;

  return `
    <div style="display:flex;flex-direction:column;gap:1rem;">
      <div class="progress-container">
        <div class="progress-label">
          <span>Прогресс</span>
          <span>${completionRate}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill goal" style="width:${completionRate}%"></div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
        <div class="stat-mini">
          <div class="stat-value-mini">${active}</div>
          <div class="stat-label-mini">Активные</div>
        </div>
        <div class="stat-mini">
          <div class="stat-value-mini">${completed}</div>
          <div class="stat-label-mini">Завершены</div>
        </div>
        <div class="stat-mini">
          <div class="stat-value-mini">${archived}</div>
          <div class="stat-label-mini">Архив</div>
        </div>
        <div class="stat-mini">
          <div class="stat-value-mini">${total}</div>
          <div class="stat-label-mini">Всего</div>
        </div>
      </div>

      <div>
        <h4 style="font-size:0.875rem;margin-bottom:0.5rem;color:var(--text-secondary);">Приоритеты:</h4>
        <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem;">
          <span class="badge badge-error" style="font-size:0.75rem;">Высокий: ${priorities.high}</span>
          <span class="badge badge-warning" style="font-size:0.75rem;">Средний: ${priorities.medium}</span>
          <span class="badge badge-success" style="font-size:0.75rem;">Низкий: ${priorities.low}</span>
        </div>

        <h4 style="font-size:0.875rem;margin-bottom:0.5rem;color:var(--text-secondary);">Сложность:</h4>
        <div style="display:flex;gap:0.5rem;">
          <span class="badge" style="background:rgba(239,68,68,0.15);color:var(--error);font-size:0.75rem;">Сложные: ${complexities.hard}</span>
          <span class="badge" style="background:rgba(245,158,11,0.15);color:var(--warning);font-size:0.75rem;">Средние: ${complexities.medium}</span>
          <span class="badge" style="background:rgba(16,185,129,0.15);color:var(--success);font-size:0.75rem;">Легкие: ${complexities.easy}</span>
        </div>
      </div>
    </div>
  `;
}

export function renderHabitsStatsUI(stats) {
  const { total, completedToday, completionRate, averageStreak, totalCheckins, topHabits } = stats;

  if (total === 0) {
    return `<p style="color:var(--text-muted);">Нет данных за выбранный период</p>`;
  }

  return `
    <div style="display:flex;flex-direction:column;gap:1rem;">
      <div class="progress-container">
        <div class="progress-label">
          <span>Сегодня</span>
          <span>${completedToday}/${total}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill habit" style="width:${total > 0 ? (completedToday / total) * 100 : 0}%"></div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
        <div class="stat-mini">
          <div class="stat-value-mini">${completionRate}%</div>
          <div class="stat-label-mini">Выполнено</div>
        </div>
        <div class="stat-mini">
          <div class="stat-value-mini">${total}</div>
          <div class="stat-label-mini">Всего</div>
        </div>
        <div class="stat-mini">
          <div class="stat-value-mini">${averageStreak}</div>
          <div class="stat-label-mini">Средний стрик</div>
        </div>
        <div class="stat-mini">
          <div class="stat-value-mini">${totalCheckins}</div>
          <div class="stat-label-mini">Всего отметок</div>
        </div>
      </div>

      <div>
        <h4 style="font-size:0.875rem;margin-bottom:0.5rem;color:var(--text-secondary);">Топ привычек:</h4>
        <div style="display:flex;flex-direction:column;gap:0.5rem;">
          ${topHabits.map(habit => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem;background:rgba(255,255,255,0.03);border-radius:6px;">
              <span style="font-size:0.875rem;">${escapeHtml(habit.title)}</span>
              <span class="badge badge-habit" style="font-size:0.75rem;">${habit.streak} дн.</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

// Функция рендеринга диаграммы активности (UI)
// ПРИНИМАЕТ period как аргумент, чтобы самой вызвать getDaysForPeriod
export function renderActivityChartUI(habits, period) {
  // Импортируем getDaysForPeriod из statsCalculations.js
  import('./statsCalculations.js').then(module => {
      const getDaysForPeriod = module.getDaysForPeriod;
      const days = getDaysForPeriod(period);
      const activityData = calculateActivityData(habits, days); // Вызов вычисления данных из statsCalculations.js

      return `
        <div style="background:rgba(30,41,59,0.5);border-radius:8px;padding:1rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <span style="font-size:0.875rem;color:var(--text-secondary);">Активность по дням</span>
            <span style="font-size:0.75rem;color:var(--text-muted);">${days.length} дней</span>
          </div>

          <div style="display:flex;align-items:flex-end;gap:2px;height:100px;margin-bottom:0.5rem;">
            ${activityData.map((data, i) => `
              <div style="
                flex:1;
                height:${Math.max(10, (data.count / Math.max(...activityData.map(d => d.count), 1)) * 100)}%;
                background:${data.count > 0 ? COLORS.habit : 'rgba(255,255,255,0.1)'};
                border-radius:2px;
                position:relative;
                cursor:help;
              " title="${data.date}: ${data.count} привычек">
                <div style="
                  position:absolute;
                  bottom:-20px;
                  left:0;
                  right:0;
                  text-align:center;
                  font-size:10px;
                  color:var(--text-muted);
                ">${new Date(data.date).getDate()}</div>
              </div>
            `).join('')}
          </div>

          <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted);">
            <span>Меньше</span>
            <span>Активность</span>
            <span>Больше</span>
          </div>
        </div>
      `;
  }).catch(err => {
      console.error("Ошибка импорта getDaysForPeriod:", err);
      return '<p style="color: var(--error);">Ошибка загрузки диаграммы активности</p>';
  });
}

// Экранирование HTML для безопасности
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Примечание: renderActivityChartUI теперь возвращает Promise, так как использует динамический import.
// Это нужно учитывать при вызове этой функции в stats.js