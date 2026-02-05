import * as Auth from './auth.js';
import * as UI from './ui.js';
import * as API from './api.js';
import * as Goals from './goals.js';
import * as Habits from './habits.js';
import * as Stats from './stats.js';

// ==================== СОСТОЯНИЕ ====================
let currentView = 'ai-chat';

// ==================== КОНФИГУРАЦИЯ НАВИГАЦИИ ====================
const PAGE_CONFIG = {
  'ai-chat': { 
    title: 'AI Ассистент', 
    requiresAuth: true, 
    onLoad: initAIChat 
  },
  'goals': { 
    title: 'Мои цели', 
    requiresAuth: true, 
    onLoad: () => Goals.loadAndRenderGoals('active') 
  },
  'habits-tracker': { 
    title: 'Трекер привычек', 
    requiresAuth: true, 
    onLoad: () => Habits.refreshTracker() 
  },
  'stats': {
    title: 'Статистика',
    requiresAuth: true,
    onLoad: Stats.loadStatistics
  },
  'habits-list': {
    title: 'Мои привычки',
    requiresAuth: true,
    onLoad: () => Habits.loadAndRenderHabitsList()
  }
};

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 GoalMate AI Edition запускается...');
  initEventListeners();
  initModalCloseHandlers();
  const session = await Auth.checkSession();
  Goals.initGoals();
  Habits.initHabits();

  if (session.success) {
    UI.updateUserUI(session.user);
    showPage('ai-chat'); // Показываем стартовую страницу
    // Вызываем updateDashboardStats только на подходящих страницах, например, в initAIChat или showPage('home')
    // await updateDashboardStats(); // Убираем из инициализации
  } else {
    UI.updateUserUI(null); // Передаем null, если не авторизован
    showAuthScreen();
  }
  // Вызываем обновление счетчиков при старте, если пользователь авторизован
  if (session.success) {
    updateAllCounters();
  }
});

// ==================== НАВИГАЦИЯ ====================
function showPage(pageId) {
  console.log(`📄 Переход: ${pageId}`);
  const config = PAGE_CONFIG[pageId];

  if (!config) {
    console.warn(`⚠️ Страница ${pageId} не найдена`);
    return;
  }

  if (config.requiresAuth && !Auth.isAuthenticated()) {
    showAuthScreen();
    return;
  }

  // Скрыть все страницы с классом page-content
  document.querySelectorAll('.page-content').forEach(el => {
    el.style.display = 'none';
  });

  // Показать целевую страницу (например, page-ai-chat)
  const target = document.getElementById(`page-${pageId}`);
  if (target) {
    target.style.display = 'block';
    currentView = pageId; // Обновляем текущий вид
  } else {
    console.error(`❌ Элемент #page-${pageId} не найден в DOM.`);
    return; // Прерываем, если целевой элемент не найден
  }

  // Обновляем заголовок страницы
  // const pageTitle = document.getElementById('page-title');
  // if (pageTitle) pageTitle.textContent = config.title;

  // Обновляем активный пункт в сайдбаре
  document.querySelectorAll('.mini-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageId);
  });

  // Вызов onLoad, если он определен
  if (typeof config.onLoad === 'function') {
    try {
      // НЕ ВЫЗЫВАЕМ updateDashboardStats здесь, если страница не предполагает её
      // Если onLoad вызывает функции, которые зависят от updateDashboardStats,
      // нужно проверять, нужна ли статистика для текущей страницы.
      config.onLoad();
    } catch (error) {
      console.error(`Ошибка при загрузке страницы ${pageId}:`, error);
      UI.showToast(`Ошибка при загрузке страницы: ${error.message}`, 'error');
    }
  }

  // ОБНОВЛЕНИЕ СЧЕТЧИКОВ В САЙДБАРЕ (всегда вызываем)
  updateAllCounters();
}

function updateNavigationState(pageId) {
  // Только мини-сайдбар
  document.querySelectorAll('.mini-nav-item').forEach(el => {
    el.classList.remove('active');
    if (el.dataset.page === pageId) {
      el.classList.add('active');
    }
  });
}

// ==================== AI ЧАТ ====================
function initAIChat() {
  console.log('🤖 AI чат инициализирован');
  updateDashboardStats();
  attachAIChatListeners();
  updateTodayTasks();
}

async function chatWithGiga(message) {
  const res = await fetch('/api/ai-chat', {  // <-- правильный путь
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }) // <-- сервер ждёт "text", а не "message"
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ошибка запроса: ${res.status} - ${text}`);
  }

  const data = await res.json();
  return data; // вернётся объект вида { type, payload }
}



async function updateDashboardStats() {

  try {
    const [goals, habits] = await Promise.all([
      API.loadGoals(true, 'all'), // Загружаем все цели для общей статистики
      API.loadHabits(true)       // Загружаем все привычки для общей статистики
    ]);

    // Теперь безопасно пытаемся обновить элементы
    // Пример: обновление счетчиков целей
    const activeGoalsCount = goals.filter(g => !g.completed && !g.archived).length;
    const completedGoalsCount = goals.filter(g => g.completed).length;
    const totalGoalsCount = goals.length;

    // Обновляем элементы, если они существуют
    const activeGoalsEl = document.getElementById('active-goals-count'); // Убедитесь, что такой ID есть в index.html, если вы хотите отображать счетчики
    if (activeGoalsEl) activeGoalsEl.textContent = activeGoalsCount;
    const completedGoalsEl = document.getElementById('completed-goals-count');
    if (completedGoalsEl) completedGoalsEl.textContent = completedGoalsCount;
    const totalGoalsEl = document.getElementById('total-goals-count');
    if (totalGoalsEl) totalGoalsEl.textContent = totalGoalsCount;

    // Пример: обновление счетчиков привычек
    const totalHabitsCount = habits.length;
    const today = new Date().toISOString().slice(0, 10);
    const completedTodayCount = habits.filter(h => h.checkin_dates?.includes(today)).length;

    const totalHabitsEl = document.getElementById('total-habits-count');
    if (totalHabitsEl) totalHabitsEl.textContent = totalHabitsCount;
    const completedTodayEl = document.getElementById('completed-today-count');
    if (completedTodayEl) completedTodayEl.textContent = completedTodayCount;

    console.log('📊 Статистика обновлена', { active: activeGoalsCount, completed: completedGoalsCount, totalGoals: totalGoalsCount, totalHabits: totalHabitsCount, completedToday: completedTodayCount });

  } catch (error) {
    console.error('Ошибка статистики:', error);
    // Не показываем тост ошибки здесь, так как это может происходить часто и раздражать
    // Но можно логировать или показывать в UI, если есть место для статистики
    // UI.showToast('Не удалось обновить статистику', 'error');
  }
}

// Новая функция для обновления счетчиков в сайдбаре
async function updateAllCounters() {
  try {
    const [activeGoals, allHabits] = await Promise.all([
      API.loadGoals(true, 'active'), // только активные цели
      API.loadHabits(true)           // все привычки
    ]);

    const activeGoalsCount = activeGoals.length;
    const totalHabitsCount = allHabits.length;
    const today = new Date().toISOString().slice(0, 10);
    const completedTodayCount = allHabits.filter(h => 
      h.checkin_dates?.includes(today)
    ).length;

    // Обновляем ВСЕ счётчики целей
    document.querySelectorAll('.goals-counter').forEach(el => {
      el.textContent = activeGoalsCount;
    });

    // Обновляем ВСЕ счётчики привычек
    document.querySelectorAll('.habits-counter').forEach(el => {
      // Сохраняем формат "выполнено/всего"
      el.textContent = `${completedTodayCount}/${totalHabitsCount}`;
    });

  } catch (error) {
    console.error('Ошибка обновления счётчиков:', error);
  }
}

function isHabitCheckedToday(habit) {
  if (!habit.checkin_dates) return false;
  const today = new Date().toISOString().slice(0, 10);
  return habit.checkin_dates.includes(today);
}

function calculateWeekProgress(habits) {
  if (!habits.length) return 0;
  
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  
  let totalPossible = habits.length * 7;
  let totalCompleted = 0;
  
  habits.forEach(habit => {
    const completedDays = habit.checkin_dates?.filter(dateStr => {
      const date = new Date(dateStr);
      return date >= weekStart && date <= today;
    }).length || 0;
    
    totalCompleted += completedDays;
  });
  
  return totalPossible > 0 ? (totalCompleted / totalPossible) * 100 : 0;
}

async function updateTodayTasks() {
  const tasksList = document.getElementById('today-tasks-list');
  if (!tasksList) return;
  
  try {
    const habits = await API.loadHabits(true);
    const todayStr = new Date().toISOString().slice(0, 10);
    
    const todayTasks = habits.map(habit => ({
      id: habit.id,
      title: habit.title,
      type: 'habit',
      completed: new Set(habit.checkin_dates || []).has(todayStr)
    }));
    
    const completedCount = todayTasks.filter(t => t.completed).length;
    const totalCount = todayTasks.length;
    
    const progressText = document.getElementById('today-progress-text');
    const progressBar = document.getElementById('today-progress-bar');
    
    if (progressText) progressText.textContent = `${completedCount}/${totalCount} выполнено`;
    if (progressBar) {
      const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
      progressBar.style.width = `${progressPercent}%`;
    }
    
    tasksList.innerHTML = todayTasks.map(task => `
      <div class="today-task-item" data-task-id="${task.id}">
        <button class="today-task-checkbox ${task.completed ? 'checked' : ''}" 
                data-habit-id="${task.id}" 
                data-completed="${task.completed}">
          ${task.completed ? '✓' : ''}
        </button>
        <div class="today-task-content">
          <div class="today-task-title">${task.title}</div>
          <div class="today-task-meta">Привычка • ${task.completed ? 'Выполнено' : 'Не выполнено'}</div>
        </div>
      </div>
    `).join('');
    
    // ИСПРАВЛЕННЫЙ ОБРАБОТЧИК - используем существующий метод toggleTodayHabit
  
    tasksList.addEventListener('click', async (e) => {
      const checkbox = e.target.closest('.today-task-checkbox');
      if (!checkbox) return;
      
      const habitId = checkbox.dataset.habitId;
      const isCompleted = checkbox.dataset.completed === 'true';
      const habitTitle = checkbox.closest('.today-task-item')
        .querySelector('.today-task-title').textContent;
      
      try {
        // Визуальный фидбэк сразу
        const newIsCompleted = !isCompleted;
        checkbox.dataset.completed = newIsCompleted;
        checkbox.classList.toggle('checked', newIsCompleted);
        checkbox.innerHTML = newIsCompleted ? '✓' : '';
        
        // Обновляем текст статуса
        const meta = checkbox.closest('.today-task-item')
          .querySelector('.today-task-meta');
        if (meta) {
          meta.textContent = `Привычка • ${newIsCompleted ? 'Выполнено' : 'Не выполнено'}`;
        }
        
        // Обновляем счетчик прогресса
        const currentCompleted = tasksList.querySelectorAll('.today-task-checkbox.checked').length;
        const total = tasksList.querySelectorAll('.today-task-checkbox').length;
        
        if (progressText) progressText.textContent = `${currentCompleted}/${total} выполнено`;
        if (progressBar) {
          const progressPercent = total > 0 ? (currentCompleted / total) * 100 : 0;
          progressBar.style.width = `${progressPercent}%`;
        }
        
        // ВАЖНО: Обновляем счетчик в сайдбаре СРАЗУ
        updateAllCounters();
        
        // Выполняем API запрос
        await Habits.toggleTodayHabit(habitId, habitTitle, isCompleted);
        
        // Обновляем всю статистику через 500мс
        setTimeout(() => {
          updateDashboardStats(); // Эта функция пересчитает все правильно
        }, 500);
        
      } catch (error) {
        console.error('Ошибка переключения привычки:', error);
        UI.showToast('Не удалось отметить привычку', 'error');
        
        // Откат UI
        checkbox.dataset.completed = isCompleted;
        checkbox.classList.toggle('checked', isCompleted);
        checkbox.innerHTML = isCompleted ? '✓' : '';
        
        const meta = checkbox.closest('.today-task-item')
          .querySelector('.today-task-meta');
        if (meta) {
          meta.textContent = `Привычка • ${isCompleted ? 'Выполнено' : 'Не выполнено'}`;
        }
      }
    });
    
  } catch (error) {
    console.error('Ошибка загрузки задач:', error);
    tasksList.innerHTML = `
      <div style="color:var(--text-muted);text-align:center;padding:1rem;">
        Не удалось загрузить задачи
      </div>
    `;
  }
}

function attachAIChatListeners() {
  // Главная кнопка отправки
  const sendBtn = document.getElementById('ai-send-btn');
  const inputField = document.getElementById('ai-main-input');
  
  if (sendBtn && inputField) {
    const sendHandler = async () => {
      const text = inputField.value.trim();
      if (!text) {
        UI.showToast('Введите запрос', 'warning');
        return;
      }
      
      const originalHTML = sendBtn.innerHTML;
      sendBtn.innerHTML = '<span class="spinner"></span> Анализ...';
      sendBtn.disabled = true;
      
      try {
        // Отправляем текст в GigaChat
        const aiResult = await chatWithGiga(text);
        await executeAIResult(aiResult);
        inputField.value = '';
        
      } catch (error) {
        console.error('Ошибка AI:', error);
        UI.showToast('Не удалось обработать запрос', 'error');
      } finally {
        sendBtn.innerHTML = originalHTML;
        sendBtn.disabled = false;
      }
    };
    
    sendBtn.addEventListener('click', sendHandler);
    
    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendHandler();
      }
    });
  }
  
  // Быстрые кнопки
  document.querySelectorAll('.quick-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      switch (action) {
        case 'goals': showPage('goals'); break;
        case 'habits': showPage('habits-tracker'); break;
        case 'analytics': showPage('habits-list'); break;
        case 'settings': showPage('habits-list'); break; // временно
      }
    });
  });
  
  // Подсказки
  setTimeout(() => {
    document.querySelectorAll('.hint-item').forEach(hint => {
      hint.addEventListener('click', () => {
        if (inputField) {
          inputField.value = hint.textContent;
          inputField.focus();
        }
      });
    });
  }, 100);
}

// ==================== AI АНАЛИЗАТОР ====================

const AI_ACTIONS = {
  create_habit: async (ai) => {
    Habits.showHabitModal();
    setTimeout(() => {
      const titleInput = document.getElementById('habit-title');
      const descInput = document.getElementById('habit-description'); // ← должно быть
      
      if (titleInput) titleInput.value = ai.payload.title || '';
      if (descInput) descInput.value = ai.payload.description || ''; // ← новое поле
      
      if (titleInput) titleInput.focus();
    }, 100);
  },

  create_goal: async (ai) => {
    // Открываем модалку
    Goals.showGoalModal(); // ← убедись, что эта функция показывает #goal-modal
    
    setTimeout(() => {
      // Находим поля ПО ID
      const titleInput = document.getElementById('goal-title');
      const descInput = document.getElementById('goal-description');
      const deadlineInput = document.getElementById('goal-deadline');

      console.log("🎯 Заполняем модалку:", ai.payload); // ← для отладки

      if (titleInput) titleInput.value = ai.payload.title || '';
      if (descInput) descInput.value = ai.payload.description || '';
      if (deadlineInput && ai.payload.deadline) {
        deadlineInput.value = ai.payload.deadline; // ← формат YYYY-MM-DD
      }

      if (titleInput) titleInput.focus();
    }, 100);
  },

  complete_habit: async (ai) => {
    try {
      // 1. Загружаем все привычки пользователя
      const habits = await API.loadHabits(true);
      
      // 2. Ищем привычку по названию (регистронезависимо)
      const matchedHabit = habits.find(h => 
        h.title.toLowerCase().includes(ai.payload.title.toLowerCase()) ||
        ai.payload.title.toLowerCase().includes(h.title.toLowerCase())
      );

      if (!matchedHabit) {
        // Если не найдена — предлагаем создать
        UI.showToast(`Привычка "${ai.payload.title}" не найдена. Создайте её?`, 'warning');
        return;
      }

      // 3. Отмечаем найденную привычку
      await Habits.toggleTodayHabit(
        matchedHabit.id,
        matchedHabit.title,
        false // всегда false, потому что toggleTodayHabit инвертирует состояние
      );
      
      UI.showToast(`Привычка "${matchedHabit.title}" отмечена`, 'success');
      
    } catch (error) {
      console.error('Ошибка трекинга привычки:', error);
      UI.showToast('Не удалось отметить привычку', 'error');
    }
  },

  show_stats: async () => {
    showPage('habits-list');
  },

  clarify: async (ai) => {
    UI.showToast(ai.payload.question, 'info');
  }
};

async function executeAIResult(ai) {
  const handler = AI_ACTIONS[ai.type];
  if (!handler) {
    UI.showToast('Я не понял запрос 🤔', 'warning');
    return;
  }
  await handler(ai);
}

// ==================== ОБРАБОТЧИКИ ====================
function initEventListeners() {
  console.log('⚙️ Инициализация обработчиков...');

  // Мини-сайдбар
  document.querySelectorAll('.mini-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      
      if (page === 'profile') {
        showProfileModal();
      } else if (page === 'ai-assistant') {
        showPage('ai-chat');
      } else if (page === 'logout') {
        handleLogout();
      } else {
        showPage(page);
      }
    });
  });

  // Кнопки в хедере (если остались)
  const btnGoals = document.getElementById('btn-goals');
  const btnHabits = document.getElementById('btn-habits');
  
  if (btnGoals) btnGoals.addEventListener('click', () => showPage('goals'));
  if (btnHabits) btnHabits.addEventListener('click', () => showPage('habits-list'));

  // Авторизация
  initAuthFormListeners();

  console.log('✅ Обработчики готовы');
}

function initModalCloseHandlers() {
  console.log('⚙️ Инициализация обработчиков закрытия модалок (упрощённо)...');

  // Обработчик для всех кнопок "Закрыть" (крестиков) с определёнными ID
  // Предполагаем, что ID модального окна совпадает с ID кнопки, но без суффикса "-close"
  document.querySelectorAll('.modal-close').forEach(button => {
    button.addEventListener('click', () => {
      // Находим родительское .modal
      const modal = button.closest('.modal');
      if (modal && modal.id && typeof UI.hideModal === 'function') {
        UI.hideModal(modal.id);
      } else {
        console.error(`Не удалось закрыть модалку для крестика: ${button.id}`);
      }
    });
  });

  // Обработчик для всех кнопок "Отмена" внутри .modal-content
  // Предполагаем, что они просто закрывают своё родительское .modal
  document.querySelectorAll('.modal-content .btn-secondary, .modal-content button').forEach(button => {
    // Добавляем проверку, чтобы не ловить другие кнопки, кроме "Отмена"
    // Можно уточнить селектор, если у кнопки "Отмена" есть уникальный ID или класс
    // Например, если у всех кнопок "Отмена" есть ID, заканчивающийся на "-cancel":
    if (button.id && button.id.endsWith('-cancel')) {
      button.addEventListener('click', () => {
        const modal = button.closest('.modal');
        if (modal && modal.id && typeof UI.hideModal === 'function') {
          UI.hideModal(modal.id);
        } else {
          console.error(`Не удалось закрыть модалку для кнопки "Отмена": ${button.id}`);
        }
      });
    }
  });
}

function initAuthFormListeners() {
  const btnShowRegister = document.getElementById('btn-show-register');
  const btnShowLogin = document.getElementById('btn-show-login');
  const btnLogin = document.getElementById('btn-login');
  const btnRegister = document.getElementById('btn-register');
  
  if (btnShowRegister) btnShowRegister.addEventListener('click', () => toggleAuthForm('register'));
  if (btnShowLogin) btnShowLogin.addEventListener('click', () => toggleAuthForm('login'));
  if (btnLogin) btnLogin.addEventListener('click', handleLogin);
  if (btnRegister) btnRegister.addEventListener('click', handleRegister);
}

function toggleAuthForm(mode) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  if (loginForm) loginForm.style.display = mode === 'login' ? 'block' : 'none';
  if (registerForm) registerForm.style.display = mode === 'register' ? 'block' : 'none';
}

async function handleLogin() {
  const email = document.getElementById('login-email')?.value.trim();
  const password = document.getElementById('login-password')?.value;

  if (!email || !password) {
    UI.showToast('Заполните все поля', 'error');
    return;
  }

  const btn = document.getElementById('btn-login');
  try {
    UI.setButtonLoading(btn, true);
    const result = await Auth.login(email, password);
    updateUserUI(result.user);
    showPage('ai-chat');
    UI.showToast('Вход выполнен!', 'success');
  } catch (error) {
    UI.showToast(error.message || 'Ошибка входа', 'error');
  } finally {
    UI.setButtonLoading(btn, false);
  }
}

async function handleRegister() {
  const name = document.getElementById('register-name')?.value.trim();
  const email = document.getElementById('register-email')?.value.trim();
  const password = document.getElementById('register-password')?.value;
  const passwordConfirm = document.getElementById('register-password-confirm')?.value;

  if (!name || !email || !password || !passwordConfirm) {
    UI.showToast('Заполните все поля', 'error');
    return;
  }
  if (password !== passwordConfirm) {
    UI.showToast('Пароли не совпадают', 'error');
    return;
  }

  const btn = document.getElementById('btn-register');
  try {
    UI.setButtonLoading(btn, true);
    const result = await Auth.register(name, email, password);
    updateUserUI(result.user);
    showPage('ai-chat');
    UI.showToast('Регистрация успешна!', 'success');
  } catch (error) {
    UI.showToast(error.message || 'Ошибка регистрации', 'error');
  } finally {
    UI.setButtonLoading(btn, false);
  }
}

async function handleLogout() {
  try {
    await Auth.logout();
    showAuthScreen();
    UI.showToast('Вы вышли из системы', 'info');
  } catch (error) {
    console.error('Ошибка выхода:', error);
    UI.showToast('Не удалось выйти', 'error');
  }
}

// ==================== UI ====================
function updateUserUI(user) {
  if (!user) return;

  const name = user.name || user.email.split('@')[0];
  const initial = name.charAt(0).toUpperCase();

  setTextContent('user-name', name);
  setTextContent('user-email', user.email);
  setTextContent('user-initial', initial);
  setTextContent('user-initial-mini', initial);
  setTextContent('user-initial-micro', initial);

  toggleDisplay('auth-screen', 'none');
  toggleDisplay('app-content', 'block');
  toggleDisplay('mini-sidebar', 'block');
}

function showAuthScreen() {
  console.log('🔐 Экран авторизации');
  toggleDisplay('auth-screen', 'block');
  toggleDisplay('app-content', 'none');
  toggleDisplay('mini-sidebar', 'none');
  toggleAuthForm('login');
}

function showHelpModal() {
  const modal = document.getElementById('help-modal');
  if (modal && UI.showModal) {
    UI.showModal('help-modal');
  } else {
    alert('🤖 Примеры команд:\n\n• "Хочу бегать" - создаст привычку\n• "Цель: выучить Python" - создаст цель\n• "Отметь тренировку" - отметит выполнение\n• "Покажи мои привычки" - откроет список');
  }
}

function showProfileModal() {
  const user = Auth.getCurrentUser();
  if (user) {
    alert(`👤 ${user.name}\n📧 ${user.email}\n\nПрофиль в разработке...`);
  }
}

function setTextContent(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function toggleDisplay(id, display) {
  const el = document.getElementById(id);
  if (el) el.style.display = display;
}

// ==================== ЭКСПОРТ ====================
export { 
  showPage, 
  showAuthScreen,
  updateUserUI,
  updateDashboardStats
};

// Глобальные функции
window.showAuthScreen = showAuthScreen;
window.showPage = showPage;
window.showHelpModal = showHelpModal;