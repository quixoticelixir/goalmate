import * as Auth from './auth.js';
import * as UI from './ui.js';
import * as API from './api.js';
import * as Goals from './goals.js';
import * as Habits from './habits.js';

// ==================== СОСТОЯНИЕ ПРИЛОЖЕНИЯ ====================
let currentView = 'home';

// ==================== КОНФИГУРАЦИЯ НАВИГАЦИИ ====================
const PAGE_CONFIG = {
  home: { title: 'Главное меню', requiresAuth: false },
  goals: { title: 'Мои цели', requiresAuth: true, onLoad: () => Goals.loadAndRenderGoals('active') },
  'habits-list': { title: 'Мои привычки', requiresAuth: true, onLoad: () => Habits.loadAndRenderHabitsList() },
  'habits-tracker': { title: 'Трекер привычек', requiresAuth: true, onLoad: () => Habits.refreshTracker() }
};

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 GoalMate запускается...');
  
  initEventListeners();
  
  // Проверяем сессию на сервере
  const session = await Auth.checkSession();
  
  // Инициализация модулей
  Goals.initGoals();
  Habits.initHabits();

  // Отображение начального экрана
  if (session.success) {
    updateUserUI(session.user);
    showPage('home');
  } else {
    showAuthScreen();
  }
});

// ==================== НАВИГАЦИЯ ====================
function showPage(pageId) {
  updateStats();
  console.log(`📄 Переход на страницу: ${pageId}`);
  
  const config = PAGE_CONFIG[pageId];
  if (!config) {
    console.warn(`⚠️ Неизвестная страница: ${pageId}`);
    return;
  }

  // Требуется ли авторизация
  if (config.requiresAuth && !Auth.isAuthenticated()) {
    console.log('🔒 Доступ запрещён — требуется вход');
    showAuthScreen();
    return;
  }

  // Скрыть все страницы
  Object.keys(PAGE_CONFIG).forEach(id => {
    const el = document.getElementById(`page-${id}`);
    if (el) el.style.display = 'none';
  });

  // Показать целевую страницу
  const target = document.getElementById(`page-${pageId}`);
  if (target) {
    target.style.display = 'block';
    currentView = pageId;

    // Обновить заголовок
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = config.title;

    // Обновить активный пункт в сайдбаре
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.querySelector(`[data-page="${pageId}"]`);
    if (activeItem) activeItem.classList.add('active');

    // Загрузить данные, если нужно
    if (typeof config.onLoad === 'function') {
      config.onLoad();
    }
  }
}

// ==================== ОБРАБОТЧИКИ СОБЫТИЙ ====================
function initEventListeners() {
  console.log('⚙️ Инициализация обработчиков событий...');

  // Сайдбар
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      if (page === 'logout') {
        handleLogout();
      } else {
        showPage(page);
      }
    });
  });

  // Главное меню
  attachClickListener('btn-goals', () => showPage('goals'));
  attachClickListener('btn-habits', () => showPage('habits-list'));

  // Добавление привычки
  attachClickListener('btn-add-habit', () => {
    if (!Auth.isAuthenticated()) {
      UI.showToast('Для добавления привычки необходимо войти в систему', 'warning');
      showAuthScreen();
      return;
    }
    Habits.showHabitModal();
  });

  // Обновление списков
  attachClickListener('btn-refresh-habits', async () => {
    if (!Auth.isAuthenticated()) {
      UI.showToast('Необходима авторизация', 'warning');
      return;
    }
    await Habits.loadAndRenderHabitsList();
    UI.showToast('Список привычек обновлён', 'success');
  });

  attachClickListener('btn-refresh-goals', async () => {
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
      await Goals.loadAndRenderGoals(activeTab.dataset.tab);
      UI.showToast('Список целей обновлён', 'success');
    }
  });

  // Кнопки "назад"
  attachClickListener('btn-back-to-home', () => showPage('home'));
  attachClickListener('btn-back-to-home-from-goals', () => showPage('home'));

  // Календарь
  attachClickListener('btn-calendar-week', () => Habits.setCalendarView('week'));
  attachClickListener('btn-calendar-month', () => Habits.setCalendarView('month'));
  attachClickListener('btn-prev-period', () => Habits.navigateCalendar(-1));
  attachClickListener('btn-next-period', () => Habits.navigateCalendar(1));

  // Формы авторизации
  initAuthFormListeners();

  console.log('✅ Обработчики инициализированы');
}

function attachClickListener(id, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', handler);
}

// ==================== АВТОРИЗАЦИЯ: ФОРМЫ ====================
function initAuthFormListeners() {
  attachClickListener('btn-show-register', () => toggleAuthForm('register'));
  attachClickListener('btn-show-login', () => toggleAuthForm('login'));

  attachClickListener('btn-login', handleLogin);
  attachClickListener('btn-register', handleRegister);
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
    showPage('home');
    UI.showToast('Вход выполнен успешно!', 'success');
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
    showPage('home');
    UI.showToast('Регистрация успешна!', 'success');
  } catch (error) {
    UI.showToast(error.message || 'Ошибка регистрации', 'error');
  } finally {
    UI.setButtonLoading(btn, false);
  }
}

// ==================== ВЫХОД ====================
async function handleLogout() {
  try {
    await Auth.logout();
    // showAuthScreen();
  } catch (error) {
    console.error('Ошибка при выходе:', error);
    UI.showToast('Не удалось выйти из системы', 'error');
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

  // Показать основное приложение
  toggleDisplay('auth-screen', 'none');
  toggleDisplay('app-content', 'block');
}

function showAuthScreen() {
  console.log('🔐 Показываем экран авторизации');
  toggleDisplay('auth-screen', 'block');
  toggleDisplay('app-content', 'none');
  toggleAuthForm('login');
}

// Утилиты для безопасной работы с DOM
function setTextContent(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function toggleDisplay(id, display) {
  const el = document.getElementById(id);
  if (el) el.style.display = display;
}

async function updateStats() {
  try {
    const [goals, habits] = await Promise.all([
      API.loadGoals(true, 'all'),
      API.loadHabits(true)
    ]);

    // Цели
    const totalGoals = goals.length;
    const completedGoals = goals.filter(g => g.completed).length;

    // Привычки
    const activeHabits = habits.length;

    // Максимальная серия среди всех привычек
    let maxStreak = 0;
    if (habits.length > 0) {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      
      for (const habit of habits) {
        if (!habit.checkin_dates?.length) continue;
        
        // Сортируем даты по убыванию
        const sortedDates = [...habit.checkin_dates]
          .sort((a, b) => new Date(b) - new Date(a));
        
        // Ищем текущую серию в прошлом и сегодня
        let currentStreak = 0;
        let currentDate = new Date(todayStr);
        
        for (let i = 0; i < 365; i++) { // максимум год назад
          const dateStr = currentDate.toISOString().slice(0, 10);
          
          // Пропускаем будущие даты
          // if (dateStr > todayStr) {
          //   currentDate.setDate(currentDate.getDate() - 1);
          //   continue;
          // }
          
          if (sortedDates.includes(dateStr)) {
            currentStreak++;
            currentDate.setDate(currentDate.getDate() - 1);
          } else {
            break; // серия прервана
          }
        }
        
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      }
    }

    // Обновляем DOM
    document.getElementById('stat-total-goals').textContent = totalGoals;
    document.getElementById('stat-completed-goals').textContent = completedGoals;
    document.getElementById('stat-active-habits').textContent = activeHabits;
    
    const streakEl = document.getElementById('stat-streak');
    const fireEl = document.getElementById('streak-fire');
    
    if (maxStreak > 0) {
      streakEl.textContent = `${maxStreak} дн.`;
      fireEl.style.display = 'inline';
    } else {
      streakEl.textContent = '—';
      fireEl.style.display = 'none';
    }
    
  } catch (error) {
    console.error('Ошибка загрузки статистики:', error);
  }
}

// ==================== ЭКСПОРТ ====================
export { 
  showPage, 
  showAuthScreen,
  updateUserUI
};

// Глобальные функции
window.showAuthScreen = showAuthScreen;
window.showPage = showPage;