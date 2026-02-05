// profile.js
import * as Auth from './auth.js';
import * as API from './api.js';
import * as UI from './ui.js';

/**
 * Форматирует дату в читаемый формат
 */
function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  const options = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  
  if (diffDays === 0) {
    return `Сегодня в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffDays === 1) {
    return `Вчера в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffDays < 7) {
    return `${diffDays} дней назад`;
  } else {
    return date.toLocaleDateString('ru-RU', options);
  }
}

/**
 * Форматирует короткую дату
 */
function formatShortDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

/**
 * Загружает и отображает данные профиля
 */
export async function loadProfile() {
  try {
    const user = Auth.getCurrentUser();
    if (!user) {
      UI.showToast('Требуется авторизация', 'warning');
      return;
    }

    // Обновляем основную информацию
    const name = user.name || user.email.split('@')[0];
    const initial = name.charAt(0).toUpperCase();
    
    const profileInitialEl = document.getElementById('profile-initial');
    const profileNameEl = document.getElementById('profile-name');
    const profileEmailEl = document.getElementById('profile-email');
    const profileUserIdEl = document.getElementById('profile-user-id');
    const profileCreatedAtEl = document.getElementById('profile-created-at');
    const profileLastLoginEl = document.getElementById('profile-last-login');
    const profileLoginCountEl = document.getElementById('profile-login-count');

    if (profileInitialEl) profileInitialEl.textContent = initial;
    if (profileNameEl) profileNameEl.textContent = name;
    if (profileEmailEl) profileEmailEl.textContent = user.email;
    if (profileUserIdEl) profileUserIdEl.textContent = user.id || '—';
    if (profileCreatedAtEl) profileCreatedAtEl.textContent = formatShortDate(user.created_at);
    if (profileLastLoginEl) profileLastLoginEl.textContent = formatDate(user.last_login);
    if (profileLoginCountEl) profileLoginCountEl.textContent = user.login_count || 0;

    // Загружаем статистику целей и привычек
    const [allGoals, allHabits] = await Promise.all([
      API.loadGoals(true, 'all'),
      API.loadHabits(true)
    ]);

    // Подсчитываем статистику целей
    const totalGoals = allGoals.length;
    const activeGoals = allGoals.filter(g => !g.completed && !g.archived).length;
    const completedGoals = allGoals.filter(g => g.completed).length;
    const totalHabits = allHabits.length;

    // Обновляем статистику
    const totalGoalsEl = document.getElementById('profile-total-goals');
    const activeGoalsEl = document.getElementById('profile-active-goals');
    const completedGoalsEl = document.getElementById('profile-completed-goals');
    const totalHabitsEl = document.getElementById('profile-total-habits');

    if (totalGoalsEl) totalGoalsEl.textContent = totalGoals;
    if (activeGoalsEl) activeGoalsEl.textContent = activeGoals;
    if (completedGoalsEl) completedGoalsEl.textContent = completedGoals;
    if (totalHabitsEl) totalHabitsEl.textContent = totalHabits;

    // Инициализируем обработчики кнопок
    initProfileButtons();

  } catch (error) {
    console.error('Ошибка загрузки профиля:', error);
    UI.showToast('Не удалось загрузить данные профиля', 'error');
  }
}

/**
 * Инициализирует обработчики кнопок профиля
 */
function initProfileButtons() {
  const editBtn = document.getElementById('btn-edit-profile');
  const changePasswordBtn = document.getElementById('btn-change-password');
  const exportBtn = document.getElementById('btn-export-data-profile');

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      UI.showToast('Редактирование профиля в разработке', 'info');
    });
  }

  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', () => {
      UI.showToast('Изменение пароля в разработке', 'info');
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      try {
        const [goals, habits] = await Promise.all([
          API.loadGoals(true, 'all'),
          API.loadHabits(true)
        ]);

        const data = {
          user: Auth.getCurrentUser(),
          goals,
          habits,
          exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `goalmate-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        UI.showToast('Данные экспортированы', 'success');
      } catch (error) {
        console.error('Ошибка экспорта:', error);
        UI.showToast('Не удалось экспортировать данные', 'error');
      }
    });
  }
}
