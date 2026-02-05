// statsCalculations.js
import { calculateCurrentStreak } from './habitUtils.js';

/**
 * Вычисляет основные показатели для обзора.
 */
export function calculateOverviewStats(goals, habits) {
  const totalGoals = goals.length;
  const completedGoals = goals.filter(g => g.completed).length;
  const activeGoals = goals.filter(g => !g.completed && !g.archived).length;

  const totalHabits = habits.length;
  const today = new Date().toISOString().slice(0, 10);
  const completedToday = habits.filter(h =>
    h.checkin_dates?.includes(today)
  ).length;

  const goalCompletionRate = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;
  const habitCompletionRate = totalHabits > 0 ? Math.round((completedToday / totalHabits) * 100) : 0;

  // Для целей, используем количество подцелей как "стрик"
  const maxGoalStreak = Math.max(...goals.map(goal => goal.subgoals?.length || 0), 0);
  const maxHabitStreak = Math.max(...habits.map(habit => calculateCurrentStreak(new Set(habit.checkin_dates || []))), 0);

  return {
    totalGoals,
    completedGoals,
    activeGoals,
    totalHabits,
    completedToday,
    goalCompletionRate,
    habitCompletionRate,
    maxGoalStreak,
    maxHabitStreak
  };
}

/**
 * Вычисляет статистику по целям.
 */
export function calculateGoalsStats(goals, period) {
  const filteredGoals = filterByPeriod(goals, period);
  const total = filteredGoals.length;
  const completed = filteredGoals.filter(g => g.completed).length;
  const active = filteredGoals.filter(g => !g.completed && !g.archived).length;
  const archived = filteredGoals.filter(g => g.archived).length;

  const priorities = {
    high: filteredGoals.filter(g => g.priority === 'high').length,
    medium: filteredGoals.filter(g => g.priority === 'medium').length,
    low: filteredGoals.filter(g => g.priority === 'low').length
  };

  const complexities = {
    hard: filteredGoals.filter(g => g.complexity === 'hard').length,
    medium: filteredGoals.filter(g => g.complexity === 'medium').length,
    easy: filteredGoals.filter(g => g.complexity === 'easy').length
  };

  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, active, archived, priorities, complexities, completionRate };
}

/**
 * Вычисляет статистику по привычкам.
 */
export function calculateHabitsStats(habits, period) {
  const filteredHabits = filterByPeriod(habits, period, 'checkin_dates');
  const total = filteredHabits.length;

  if (total === 0) {
    return { total, completedToday: 0, completionRate: 0, averageStreak: 0, totalCheckins: 0, topHabits: [] };
  }

  const today = new Date().toISOString().slice(0, 10);
  const completedToday = filteredHabits.filter(h => h.checkin_dates?.includes(today)).length;
  const completionRate = calculateHabitCompletionRate(filteredHabits, period);
  const averageStreak = calculateAverageStreak(filteredHabits);
  const totalCheckins = calculateTotalCheckins(filteredHabits);
  const topHabits = getTopHabitsByStreak(filteredHabits, 3);

  return { total, completedToday, completionRate, averageStreak, totalCheckins, topHabits };
}

/**
 * Вычисляет данные для диаграммы активности.
 */
export function calculateActivityData(habits, days) {
  return days.map(date => {
    const count = habits.reduce((sum, habit) => {
      return sum + (habit.checkin_dates?.includes(date) ? 1 : 0);
    }, 0);

    return { date, count };
  });
}

/**
 * Фильтрует элементы по периоду.
 */
export function filterByPeriod(items, period, dateField = 'created_at') {
  if (period === 'all') return items;

  const now = new Date();
  let startDate = new Date();

  switch (period) {
    case 'week':
      startDate.setDate(now.getDate() - 7);
      break;
    case 'month':
      startDate.setMonth(now.getMonth() - 1);
      break;
    case 'quarter':
      startDate.setMonth(now.getMonth() - 3);
      break;
    case 'year':
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      return items;
  }

  return items.filter(item => {
    const itemDate = new Date(item[dateField] || item.created_at);
    return itemDate >= startDate && itemDate <= now;
  });
}

// --- Внутренние функции расчета ---

function calculateHabitCompletionRate(habits, period) {
  if (!habits.length) return 0;

  const days = getDaysForPeriod(period); // Используется внутри модуля
  let totalPossible = habits.length * days.length;
  let totalCompleted = 0;

  habits.forEach(habit => {
    const checkins = new Set(habit.checkin_dates || []);
    days.forEach(day => {
      if (checkins.has(day)) totalCompleted++;
    });
  });

  return totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;
}

function calculateAverageStreak(habits) {
  if (!habits.length) return 0;

  const total = habits.reduce((sum, habit) => {
    return sum + calculateCurrentStreak(new Set(habit.checkin_dates || []));
  }, 0);

  return Math.round(total / habits.length);
}

function calculateTotalCheckins(habits) {
  return habits.reduce((sum, habit) => {
    return sum + (habit.checkin_dates?.length || 0);
  }, 0);
}

function getTopHabitsByStreak(habits, limit = 3) {
  return habits
    .map(habit => ({
      ...habit,
      streak: calculateCurrentStreak(new Set(habit.checkin_dates || []))
    }))
    .sort((a, b) => b.streak - a.streak)
    .slice(0, limit);
}

// ЭКСПОРТИРУЕМ ФУНКЦИЮ getDaysForPeriod
export function getDaysForPeriod(period) {
  const now = new Date();
  let days = [];

  switch (period) {
    case 'week':
      days = 7;
      break;
    case 'month':
      days = 30;
      break;
    case 'quarter':
      days = 90;
      break;
    case 'year':
      days = 365;
      break;
    default:
      days = 30;
  }

  return Array.from({ length: days }, (_, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (days - i - 1));
    return date.toISOString().slice(0, 10);
  });
}