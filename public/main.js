document.addEventListener('DOMContentLoaded', () => {
  // === КОНСТАНТЫ И ПЕРЕМЕННЫЕ ===
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 минут
  const CACHE_TTL = 30000; // 30 секунд
  const AI_API_KEY = 'sk-your-openai-api-key-here'; // Заменить на ваш ключ
  
  let currentUser = null;
  let currentView = 'home';
  let calendarView = 'month';
  let currentPeriod = new Date();
  let habitsCache = null;
  let goalsCache = null;
  let cacheTime = 0;
  let abortController = new AbortController();
  let currentGoalData = null;
  let isAIProcessing = false;
  let currentAIPlan = null;
  
  // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
  
  // Хеширование пароля
  async function hashPassword(password) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(password + 'goalMateSalt');
      const hash = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (error) {
      console.error('Password hashing error:', error);
      throw error;
    }
  }
  
  // Валидация email
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
  
  // Toast уведомления
  function showToast(message, type = 'info', duration = 5000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, duration);
    
    toast.addEventListener('click', () => {
      toast.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    });
  }
  
  // Управление состоянием кнопок
  function setButtonLoading(button, isLoading, spinnerId = null) {
    const textSpan = button.querySelector('span:not(.spinner)') || 
                     button.querySelector(`#${button.id}-text`);
    const spinner = spinnerId ? 
                    document.getElementById(spinnerId) : 
                    button.querySelector('.spinner');
    
    if (isLoading) {
      button.disabled = true;
      if (textSpan) textSpan.style.display = 'none';
      if (spinner) spinner.style.display = 'inline-block';
    } else {
      button.disabled = false;
      if (textSpan) textSpan.style.display = 'inline';
      if (spinner) spinner.style.display = 'none';
    }
  }
  
  // Безопасный fetch
  async function safeFetch(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        credentials: 'same-origin'
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Таймаут запроса');
      }
      
      console.error('Fetch error:', error);
      showToast('Ошибка соединения с сервером', 'error');
      throw error;
    }
  }
  
  // Debounce
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  // Управление модалками
  function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.style.display = 'flex';
    
    const closeHandler = (e) => {
      if (e.key === 'Escape') hideModal(modalId);
    };
    
    modal._closeHandler = closeHandler;
    document.addEventListener('keydown', closeHandler);
  }
  
  function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.style.display = 'none';
    
    if (modal._closeHandler) {
      document.removeEventListener('keydown', modal._closeHandler);
      delete modal._closeHandler;
    }
  }
  
  // Обновление UI пользователя
  function updateUserUI(user) {
    currentUser = user || null;
    
    if (currentUser) {
      if (user.token) {
        localStorage.setItem('authToken', user.token);
        localStorage.setItem('authTime', Date.now().toString());
      }
      
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('app-content').style.display = 'block';
      document.getElementById('user-email').textContent = user.email;
      document.getElementById('user-initial').textContent = user.email.charAt(0).toUpperCase();
      
      habitsCache = null;
      goalsCache = null;
      cacheTime = 0;
      
      showPage('home');
      refreshQuickStats();
    } else {
      localStorage.removeItem('authToken');
      localStorage.removeItem('authTime');
      document.getElementById('auth-screen').style.display = 'block';
      document.getElementById('app-content').style.display = 'none';
    }
  }
  
  // Показать страницу
  function showPage(pageId) {
    ['home', 'goals', 'habits-list', 'habits-tracker'].forEach(id => {
      const page = document.getElementById(`page-${id}`);
      if (page) page.style.display = 'none';
    });
    
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) targetPage.style.display = 'block';
    
    const titles = {
      'home': 'Главное меню',
      'goals': 'Мои цели',
      'habits-list': 'Мои привычки',
      'habits-tracker': 'Трекер привычек'
    };
    
    document.getElementById('page-title').textContent = titles[pageId] || pageId;
    currentView = pageId;
    
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.querySelector(`[data-page="${pageId}"]`);
    if (activeItem) activeItem.classList.add('active');
    
    if (pageId === 'habits-tracker') {
      refreshTracker();
    } else if (pageId === 'habits-list') {
      loadAndRenderHabitsList();
    } else if (pageId === 'goals') {
      loadAndRenderGoals('active');
    }
  }
  
  // === ВАЛИДАЦИЯ ФОРМЫ ЦЕЛИ ===
  
  function validateGoalForm() {
    const title = document.getElementById('goal-title').value.trim();
    const description = document.getElementById('goal-description').value.trim();
    
    let isValid = true;
    
    // Валидация названия
    const titleError = document.getElementById('goal-title-error');
    if (!title) {
      titleError.textContent = 'Введите название цели';
      titleError.style.display = 'block';
      isValid = false;
    } else if (title.length < 3) {
      titleError.textContent = 'Название должно содержать минимум 3 символа';
      titleError.style.display = 'block';
      isValid = false;
    } else {
      titleError.style.display = 'none';
    }
    
    // Валидация описания
    const descriptionError = document.getElementById('goal-description-error');
    if (!description) {
      descriptionError.textContent = 'Введите описание цели';
      descriptionError.style.display = 'block';
      isValid = false;
    } else if (description.length < 10) {
      descriptionError.textContent = 'Описание должно содержать минимум 10 символов';
      descriptionError.style.display = 'block';
      isValid = false;
    } else {
      descriptionError.style.display = 'none';
    }
    
    // Проверяем состояние кнопки сохранения
    const saveBtn = document.getElementById('goal-save');
    if (isValid && !isAIProcessing) {
      saveBtn.disabled = false;
      saveBtn.classList.remove('button-secondary');
      saveBtn.classList.add('button-goal');
    } else {
      saveBtn.disabled = true;
      saveBtn.classList.remove('button-goal');
      saveBtn.classList.add('button-secondary');
    }
    
    return isValid;
  }
  
  // === AI ДЕКОМПОЗИЦИЯ ЦЕЛИ ===
  
  async function decomposeGoalWithAI() {
    const title = document.getElementById('goal-title').value.trim();
    const description = document.getElementById('goal-description').value.trim();
    
    // Проверяем обязательные поля
    if (!title || !description) {
      showToast('Заполните название и описание цели для декомпозиции', 'error');
      return;
    }
    
    // Получаем элементы UI
    const aiSection = document.getElementById('ai-decomposition-section');
    const aiSuggestions = document.getElementById('ai-suggestions');
    const aiStatusText = document.getElementById('ai-status-text');
    const aiError = document.getElementById('ai-error');
    const spinner = document.querySelector('.decompose-spinner');
    const decomposeBtn = document.getElementById('btn-ai-decompose');
    const saveBtn = document.getElementById('goal-save');
    
    // Начинаем процесс
    isAIProcessing = true;
    currentAIPlan = null;
    aiSection.style.display = 'block';
    aiSuggestions.style.display = 'none';
    aiError.style.display = 'none';
    spinner.style.display = 'inline-block';
    decomposeBtn.disabled = true;
    decomposeBtn.textContent = 'Идет анализ...';
    aiStatusText.textContent = 'AI анализирует цель...';
    saveBtn.disabled = true;
    
    try {
      const response = await fetch('/api/goals/decompose', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ 
          goal: `${title}. ${description}`.trim()
        })
      });

      if (!response.ok) {
        throw new Error(`Ошибка сервера: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      if (!result.subgoals || result.subgoals.length === 0) {
        throw new Error('AI не смог сгенерировать план');
      }

      // Сохраняем план
      currentAIPlan = {
        subgoals: result.subgoals,
        meta: result.meta || {}
      };

      // Показываем результат
      spinner.style.display = 'none';
      decomposeBtn.style.display = 'none';
      aiStatusText.textContent = '✅ Декомпозиция завершена!';
      
      // Показываем предложения
      aiSuggestions.innerHTML = `
        <div class="ai-plan">
          <div class="ai-plan-header">
            <div class="ai-plan-title">🎯 План достижения цели:</div>
            <span style="font-size:11px;color:var(--muted);">
              ${result.meta?.model || 'AI модель'}
            </span>
          </div>
          <div style="margin-top:12px;">
            ${currentAIPlan.subgoals.map((sg, index) => `
              <div class="subgoal-step">
                <div class="subgoal-step-number">${index + 1}</div>
                <div class="subgoal-step-content">
                  <div class="subgoal-step-title">${sg.title || sg}</div>
                  ${sg.description ? `<div style="font-size:12px;color:var(--muted);margin-top:2px;">${sg.description}</div>` : ''}
                  <div class="subgoal-step-meta">
                    <span>⏱ ~${sg.estimated_days || 7} дн.</span>
                    <span>${sg.priority === 'high' ? '🔴 Высокий' : sg.priority === 'low' ? '🟢 Низкий' : '🟡 Средний'} приоритет</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:12px;text-align:center;">
            <button id="btn-use-plan" class="button-success" style="font-size:13px;padding:8px 16px;">
              ✅ Использовать этот план
            </button>
            <button id="btn-regenerate-plan" class="button-secondary" style="font-size:13px;padding:8px 16px;margin-left:8px;">
              🔄 Сгенерировать заново
            </button>
          </div>
        </div>
      `;
      aiSuggestions.style.display = 'block';
      
      // Обработчики для новых кнопок
      document.getElementById('btn-use-plan').addEventListener('click', () => {
        // Активируем кнопку сохранения
        saveBtn.disabled = false;
        saveBtn.classList.remove('button-secondary');
        saveBtn.classList.add('button-goal');
        showToast('План готов к сохранению', 'success');
      });
      
      document.getElementById('btn-regenerate-plan').addEventListener('click', () => {
        decomposeGoalWithAI(); // Запускаем заново
      });

    } catch (error) {
      console.error('❌ AI decomposition error:', error);
      spinner.style.display = 'none';
      decomposeBtn.disabled = false;
      decomposeBtn.textContent = 'Повторить декомпозицию';
      aiStatusText.textContent = 'Ошибка декомпозиции';
      aiError.textContent = error.message || 'Неизвестная ошибка';
      aiError.style.display = 'block';
      currentAIPlan = null;
    } finally {
      isAIProcessing = false;
      validateGoalForm(); // Обновляем состояние кнопки сохранения
    }
  }
  
  // === ФУНКЦИИ ДЛЯ ПРИВЫЧЕК ===
  
  async function loadHabits(forceRefresh = false) {
    if (!currentUser) return [];
    
    const now = Date.now();
    if (!forceRefresh && habitsCache && (now - cacheTime < CACHE_TTL)) {
      return habitsCache;
    }
    
    try {
      const data = await safeFetch('/api/habits');
      habitsCache = data.habits || [];
      cacheTime = now;
      return habitsCache;
    } catch (error) {
      console.error('Ошибка загрузки привычек:', error);
      return [];
    }
  }
  
  async function loadAndRenderHabitsList() {
    const habits = await loadHabits(true);
    renderHabitsList(habits);
  }
  
  function renderHabitsList(habits) {
    const container = document.getElementById('habits-list-container');
    if (!container) return;
    
    if (!habits || habits.length === 0) {
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
      const today = new Date().toISOString().slice(0, 10);
      
      let currentStreak = 0;
      let date = new Date();
      while (true) {
        const day = date.toISOString().slice(0, 10);
        if (checkins.has(day)) {
          currentStreak++;
          date.setDate(date.getDate() - 1);
        } else {
          break;
        }
      }
      
      let maxStreak = 0;
      let tempStreak = 0;
      const sortedDates = [...checkins].sort();
      
      for (let i = 0; i < sortedDates.length; i++) {
        if (i === 0 || new Date(sortedDates[i]) - new Date(sortedDates[i-1]) === 86400000) {
          tempStreak++;
        } else {
          maxStreak = Math.max(maxStreak, tempStreak);
          tempStreak = 1;
        }
      }
      maxStreak = Math.max(maxStreak, tempStreak);
      
      const isTodayChecked = checkins.has(today);
      const todayText = isTodayChecked ? '✅ Сегодня выполнено' : '⏳ Сегодня не выполнено';
      
      const card = document.createElement('div');
      card.className = 'habit-card fade-in';
      card.innerHTML = `
        <div class="habit-title">${habit.title}</div>
        <div class="habit-stats">${todayText}</div>
        <div class="habit-stats">🔥 Текущая цепочка: ${currentStreak} дн.</div>
        <div class="habit-stats">🥇 Рекорд: ${maxStreak} дн.</div>
        <div class="habit-stats">📅 Всего дней: ${checkins.size}</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${Math.min((currentStreak / Math.max(maxStreak, 1)) * 100, 100)}%"></div>
        </div>
      `;
      
      fragment.appendChild(card);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
  }
  
  function renderTodayHabits(habits) {
    const container = document.getElementById('today-habits');
    if (!container) return;
    
    const today = new Date().toISOString().slice(0, 10);
    
    if (!habits || habits.length === 0) {
      container.innerHTML = '<p class="empty-state">Нет активных привычек</p>';
      return;
    }
    
    const fragment = document.createDocumentFragment();
    
    habits.forEach(habit => {
      const checkins = new Set(habit.checkin_dates || []);
      const isChecked = checkins.has(today);
      
      const wrapper = document.createElement('div');
      wrapper.className = 'slide-down';
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '12px';
      wrapper.style.marginBottom = '10px';
      wrapper.style.padding = '10px';
      wrapper.style.backgroundColor = 'rgba(30, 41, 59, 0.5)';
      wrapper.style.borderRadius = '8px';
      
      const btn = document.createElement('button');
      btn.style.fontSize = '13px';
      btn.style.padding = '6px 12px';
      btn.style.borderRadius = '6px';
      
      if (isChecked) {
        btn.textContent = '✅ Выполнено';
        btn.style.backgroundColor = 'var(--success)';
      } else {
        btn.textContent = '☑ Выполнить';
        btn.style.backgroundColor = 'var(--accent)';
      }
      
      btn.onclick = debounce(async () => {
        const method = isChecked ? 'DELETE' : 'POST';
        setButtonLoading(btn, true);
        
        try {
          await safeFetch(`/api/habits/${habit.id}/checkin`, { method });
          showToast(isChecked ? 'День отмечен как невыполненный' : 'День выполнен!', 'success');
          await refreshTracker();
        } catch (error) {
          showToast('Ошибка обновления', 'error');
        } finally {
          setButtonLoading(btn, false);
        }
      }, 300);
      
      wrapper.innerHTML = `<span style="flex:1;">${habit.title}</span>`;
      wrapper.appendChild(btn);
      fragment.appendChild(wrapper);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
  }
  
  function getDaysForView() {
    const date = new Date(currentPeriod);
    const year = date.getFullYear();
    const month = date.getMonth();
    
    if (calendarView === 'week') {
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay() + 1);
      if (date.getDay() === 0) startOfWeek.setDate(startOfWeek.getDate() - 7);
      
      const days = [];
      for (let i = 0; i < 7; i++) {
        const day = new Date(startOfWeek);
        day.setDate(startOfWeek.getDate() + i);
        days.push(day);
      }
      return days;
    } else {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const days = [];
      for (let i = 1; i <= daysInMonth; i++) {
        days.push(new Date(year, month, i));
      }
      return days;
    }
  }
  
  async function renderCalendar(habits) {
    const container = document.getElementById('calendar-container');
    if (!container) return;
    
    const days = getDaysForView();
    const today = new Date().toISOString().slice(0, 10);
    const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    
    const periodTitle = document.getElementById('calendar-period-title');
    if (periodTitle) {
      if (calendarView === 'week') {
        const first = days[0];
        const last = days[days.length - 1];
        periodTitle.textContent = 
          `${first.getDate()} ${monthNames[first.getMonth()]} – ${last.getDate()} ${monthNames[last.getMonth()]}`;
      } else {
        periodTitle.textContent = 
          `${monthNames[currentPeriod.getMonth()]} ${currentPeriod.getFullYear()}`;
      }
    }
    
    if (!habits || habits.length === 0) {
      container.innerHTML = '<p class="empty-state">Добавьте привычки, чтобы увидеть календарь</p>';
      return;
    }
    
    const grid = document.createElement('div');
    grid.className = 'calendar-grid';
    grid.id = 'calendar-grid';
    
    const headerRow = document.createElement('div');
    headerRow.className = 'calendar-row header';
    
    const habitLabelCell = document.createElement('div');
    habitLabelCell.className = 'calendar-cell habit-label';
    habitLabelCell.textContent = 'Привычка';
    headerRow.appendChild(habitLabelCell);
    
    days.forEach(date => {
      const dayCell = document.createElement('div');
      dayCell.className = 'calendar-cell day-header';
      dayCell.innerHTML = `
        <div class="day-number">${date.getDate()}</div>
        <div class="day-name">${dayNames[date.getDay()]}</div>
      `;
      headerRow.appendChild(dayCell);
    });
    
    grid.appendChild(headerRow);
    
    habits.forEach(habit => {
      const habitRow = document.createElement('div');
      habitRow.className = 'calendar-row';
      
      const labelCell = document.createElement('div');
      labelCell.className = 'calendar-cell habit-label';
      labelCell.textContent = habit.title;
      habitRow.appendChild(labelCell);
      
      const checkins = new Set(habit.checkin_dates || []);
      
      days.forEach(date => {
        const dayStr = date.toISOString().slice(0, 10);
        const isChecked = checkins.has(dayStr);
        const isToday = dayStr === today;
        
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-cell day-cell';
        dayCell.dataset.habit = habit.id;
        dayCell.dataset.date = dayStr;
        dayCell.setAttribute('role', 'button');
        dayCell.tabIndex = 0;
        
        if (isChecked) {
          const marker = document.createElement('div');
          marker.className = 'marker checked';
          marker.style.background = isToday ? '#0ea5e9' : 'var(--accent)';
          dayCell.appendChild(marker);
        } else if (isToday) {
          const marker = document.createElement('div');
          marker.className = 'marker today';
          dayCell.appendChild(marker);
        }
        
        dayCell.addEventListener('click', debounce(async () => {
          const isCurrentlyChecked = checkins.has(dayStr);
          const method = isCurrentlyChecked ? 'DELETE' : 'POST';
          
          try {
            await safeFetch(`/api/habits/${habit.id}/checkin`, { 
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ date: dayStr })
            });
            
            showToast(isCurrentlyChecked ? 'День отменен' : 'День отмечен!', 'success');
            await refreshTracker();
          } catch (error) {
            showToast('Ошибка обновления', 'error');
          }
        }, 300));
        
        habitRow.appendChild(dayCell);
      });
      
      grid.appendChild(habitRow);
    });
    
    container.innerHTML = '';
    container.appendChild(grid);
  }
  
  async function refreshTracker() {
    const habits = await loadHabits(true);
    renderTodayHabits(habits);
    renderCalendar(habits);
  }
  
  // === ФУНКЦИИ ДЛЯ ЦЕЛЕЙ ===
  
  async function loadGoals(forceRefresh = false) {
    if (!currentUser) return [];
    
    const now = Date.now();
    if (!forceRefresh && goalsCache && (now - cacheTime < CACHE_TTL)) {
      return goalsCache;
    }
    
    try {
      const data = await safeFetch('/api/goals');
      goalsCache = data.goals || [];
      cacheTime = now;
      return goalsCache;
    } catch (error) {
      console.error('Ошибка загрузки целей:', error);
      return [];
    }
  }
  
  async function loadAndRenderGoals(filter = 'active') {
    const goals = await loadGoals(true);
    renderGoalsList(goals, filter);
  }
  
  function renderGoalsList(goals, filter = 'active') {
    const containerId = filter === 'completed' ? 'completed-goals-container' :
                       filter === 'archived' ? 'archived-goals-container' :
                       'goals-list-container';
    
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const filteredGoals = goals.filter(goal => {
      if (filter === 'active') return !goal.completed && !goal.archived;
      if (filter === 'completed') return goal.completed && !goal.archived;
      if (filter === 'archived') return goal.archived;
      return true;
    });
    
    if (!filteredGoals || filteredGoals.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>${filter === 'active' ? 'У вас пока нет активных целей' : 
               filter === 'completed' ? 'Нет завершенных целей' : 
               'Нет архивных целей'}</p>
          ${filter === 'active' ? '<p style="margin-top:10px;color:var(--goal-color);">Нажмите "Новая цель", чтобы начать!</p>' : ''}
        </div>
      `;
      return;
    }
    
    const fragment = document.createDocumentFragment();
    
    filteredGoals.forEach(goal => {
      const progress = calculateGoalProgress(goal);
      const deadlineText = goal.deadline ? formatDeadline(goal.deadline) : 'Без дедлайна';
      const priorityClass = `priority-${goal.priority || 'medium'}`;
      const complexityBadge = getComplexityBadge(goal.complexity);
      
      const card = document.createElement('div');
      card.className = 'goal-card fade-in';
      card.dataset.goalId = goal.id;
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div class="goal-title">${goal.title} ${complexityBadge}</div>
          <div style="display:flex;gap:8px;">
            <span class="deadline-badge">📅 ${deadlineText}</span>
            <span class="${priorityClass}">${getPriorityIcon(goal.priority)}</span>
          </div>
        </div>
        
        ${goal.description ? `<div style="font-size:13px;color:var(--muted);margin-bottom:12px;">${goal.description}</div>` : ''}
        
        <div class="progress-container">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
            <span>Прогресс: ${progress}%</span>
            <span>${goal.subgoals ? `${goal.subgoals.filter(sg => sg.completed).length}/${goal.subgoals.length} подцелей` : ''}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill goal" style="width:${progress}%"></div>
          </div>
        </div>
        
        ${goal.subgoals && goal.subgoals.length > 0 ? `
          <div style="margin-top:12px;">
            <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Подцели:</div>
            ${goal.subgoals.slice(0, 3).map(subgoal => `
              <div class="subgoal-card" style="margin-bottom:4px;">
                <div class="subgoal-title">${subgoal.completed ? '✅' : '⭕'} ${subgoal.title}</div>
              </div>
            `).join('')}
            ${goal.subgoals.length > 3 ? `<div style="font-size:11px;color:var(--muted);margin-top:4px;">... и еще ${goal.subgoals.length - 3} подцелей</div>` : ''}
          </div>
        ` : ''}
        
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="button-secondary" data-action="view" style="font-size:12px;padding:4px 8px;">Подробнее</button>
          <button class="button-secondary" data-action="complete" style="font-size:12px;padding:4px 8px;">
            ${goal.completed ? 'Вернуть' : 'Завершить'}
          </button>
          ${!goal.completed ? `<button class="button-secondary" data-action="add-subgoal" style="font-size:12px;padding:4px 8px;">+ Подцель</button>` : ''}
        </div>
      `;
      
      // Обработчики кнопок
      card.querySelector('[data-action="view"]').addEventListener('click', () => {
        showGoalDetails(goal);
      });
      
      card.querySelector('[data-action="complete"]').addEventListener('click', async () => {
        await toggleGoalCompletion(goal);
      });
      
      if (!goal.completed) {
        card.querySelector('[data-action="add-subgoal"]')?.addEventListener('click', () => {
          showAddSubgoalModal(goal.id);
        });
      }
      
      fragment.appendChild(card);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
  }
  
  function calculateGoalProgress(goal) {
    if (!goal.subgoals || goal.subgoals.length === 0) {
      return goal.completed ? 100 : 0;
    }
    
    const completedSubgoals = goal.subgoals.filter(sg => sg.completed).length;
    return Math.round((completedSubgoals / goal.subgoals.length) * 100);
  }
  
  function formatDeadline(deadlineString) {
    const deadline = new Date(deadlineString);
    const now = new Date();
    const diffTime = deadline - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return `Просрочено ${Math.abs(diffDays)} дн.`;
    } else if (diffDays === 0) {
      return 'Сегодня';
    } else if (diffDays === 1) {
      return 'Завтра';
    } else if (diffDays < 7) {
      return `Через ${diffDays} дн.`;
    } else if (diffDays < 30) {
      return `Через ${Math.floor(diffDays / 7)} нед.`;
    } else {
      return deadline.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }
  }
  
  function getComplexityBadge(complexity) {
    const text = complexity === 'easy' ? 'Легко' :
                 complexity === 'medium' ? 'Средне' :
                 complexity === 'hard' ? 'Сложно' : 'Средне';
    
    const className = complexity === 'easy' ? 'complexity-easy' :
                      complexity === 'medium' ? 'complexity-medium' :
                      complexity === 'hard' ? 'complexity-hard' : 'complexity-medium';
    
    return `<span class="complexity-badge ${className}">${text}</span>`;
  }
  
  function getPriorityIcon(priority) {
    return priority === 'high' ? '🔴' :
           priority === 'medium' ? '🟡' :
           priority === 'low' ? '🟢' : '🟡';
  }
  
  async function showGoalDetails(goal) {
    const progress = calculateGoalProgress(goal);
    const deadlineText = goal.deadline ? formatDeadline(goal.deadline) : 'Без дедлайна';
    const complexityBadge = getComplexityBadge(goal.complexity);
    
    const content = document.getElementById('goal-detail-content');
    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;">🎯 ${goal.title}</h3>
        <button id="close-goal-detail" style="background:none;border:none;color:var(--muted);font-size:24px;cursor:pointer;">×</button>
      </div>
      
      <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="deadline-badge">📅 ${deadlineText}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${getPriorityIcon(goal.priority)} Приоритет: ${goal.priority === 'high' ? 'Высокий' : goal.priority === 'medium' ? 'Средний' : 'Низкий'}
        </div>
        <div>${complexityBadge}</div>
        <div style="display:flex;align-items:center;gap:8px;">
          📊 Прогресс: ${progress}%
        </div>
      </div>
      
      ${goal.description ? `
        <div style="background:rgba(30,41,59,0.5);padding:16px;border-radius:8px;margin-bottom:20px;">
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">Описание цели:</div>
          <div>${goal.description}</div>
        </div>
      ` : ''}
      
      <div class="progress-container">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <div>Общий прогресс</div>
          <div>${progress}%</div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill goal" style="width:${progress}%"></div>
        </div>
      </div>
      
      <div style="margin:20px 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h4 style="margin:0;">Подцели</h4>
          <button id="btn-add-subgoal-detailed" class="button-secondary" style="font-size:12px;">+ Добавить подцель</button>
        </div>
        
        <div id="subgoals-list-detailed">
          ${goal.subgoals && goal.subgoals.length > 0 ? 
            goal.subgoals.map(subgoal => `
              <div class="subgoal-item" data-subgoal-id="${subgoal.id}">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" ${subgoal.completed ? 'checked' : ''} class="subgoal-checkbox" data-subgoal-id="${subgoal.id}">
                    <span class="subgoal-title" style="${subgoal.completed ? 'text-decoration: line-through; color: var(--muted);' : ''}">
                      ${subgoal.title}
                    </span>
                  </div>
                  <button class="button-secondary" data-action="delete-subgoal" data-subgoal-id="${subgoal.id}" style="font-size:11px;padding:2px 6px;">Удалить</button>
                </div>
                ${subgoal.description ? `<div style="font-size:12px;color:var(--muted);margin-top:4px;">${subgoal.description}</div>` : ''}
              </div>
            `).join('') :
            '<div class="empty-state" style="margin:10px 0;">Нет подцелей. Добавьте первую!</div>'
          }
        </div>
      </div>
      
      <div style="display:flex;gap:10px;margin-top:20px;">
        <button id="btn-complete-goal-detailed" class="button-goal" style="flex:1;">
          ${goal.completed ? 'Вернуть в работу' : 'Завершить цель'}
        </button>
        <button id="btn-archive-goal" class="button-secondary" style="flex:1;">
          ${goal.archived ? 'Восстановить' : 'В архив'}
        </button>
      </div>
    `;
    
    // Обработчики событий
    document.getElementById('close-goal-detail').addEventListener('click', () => {
      hideModal('goal-detail-modal');
    });
    
    document.getElementById('btn-complete-goal-detailed').addEventListener('click', async () => {
      await toggleGoalCompletion(goal);
      hideModal('goal-detail-modal');
    });
    
    document.getElementById('btn-archive-goal').addEventListener('click', async () => {
      await toggleGoalArchive(goal);
      hideModal('goal-detail-modal');
    });
    
    document.getElementById('btn-add-subgoal-detailed').addEventListener('click', () => {
      showAddSubgoalModal(goal.id);
    });
    
    // Обработчики для подцелей
    content.querySelectorAll('.subgoal-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', async (e) => {
        const subgoalId = e.target.dataset.subgoalId;
        await toggleSubgoalCompletion(goal.id, subgoalId);
      });
    });
    
    content.querySelectorAll('[data-action="delete-subgoal"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const subgoalId = e.target.dataset.subgoalId;
        await deleteSubgoal(goal.id, subgoalId);
      });
    });
    
    showModal('goal-detail-modal');
  }
  
  async function toggleGoalCompletion(goal) {
    try {
      const newStatus = !goal.completed;
      await safeFetch(`/api/goals/${goal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: newStatus })
      });
      
      showToast(newStatus ? 'Цель завершена! 🎉' : 'Цель возвращена в работу', 'success');
      await loadAndRenderGoals('active');
      refreshQuickStats();
    } catch (error) {
      showToast('Ошибка обновления цели', 'error');
    }
  }
  
  async function toggleGoalArchive(goal) {
    try {
      const newStatus = !goal.archived;
      await safeFetch(`/api/goals/${goal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: newStatus })
      });
      
      showToast(newStatus ? 'Цель отправлена в архив' : 'Цель восстановлена', 'info');
      await loadAndRenderGoals('active');
    } catch (error) {
      showToast('Ошибка обновления цели', 'error');
    }
  }
  
  async function toggleSubgoalCompletion(goalId, subgoalId) {
    try {
      await safeFetch(`/api/goals/${goalId}/subgoals/${subgoalId}/toggle`, {
        method: 'POST',
        credentials: 'same-origin'
      });
      
      showToast('Подцель обновлена', 'success');
      // Обновляем отображение цели
      const goals = await loadGoals(true);
      const goal = goals.find(g => g.id === goalId);
      if (goal) {
        showGoalDetails(goal);
      }
      await loadAndRenderGoals('active');
      refreshQuickStats();
    } catch (error) {
      showToast('Ошибка обновления подцели', 'error');
    }
  }
  
  async function deleteSubgoal(goalId, subgoalId) {
    if (!confirm('Удалить подцель?')) return;
    
    try {
      await safeFetch(`/api/goals/${goalId}/subgoals/${subgoalId}`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
      
      showToast('Подцель удалена', 'success');
      const goals = await loadGoals(true);
      const goal = goals.find(g => g.id === goalId);
      if (goal) {
        showGoalDetails(goal);
      }
      await loadAndRenderGoals('active');
    } catch (error) {
      showToast('Ошибка удаления подцели', 'error');
    }
  }
  
  function showAddSubgoalModal(goalId) {
    // Создаем простую модалку для добавления подцели
    const modalContent = `
      <h3 style="margin-top:0;">Добавить подцель</h3>
      <input type="text" id="subgoal-title" placeholder="Название подцели" style="margin-bottom:10px;">
      <textarea id="subgoal-description" placeholder="Описание (опционально)" style="min-height:80px;margin-bottom:10px;"></textarea>
      <div style="display:flex;gap:10px;">
        <button id="save-subgoal" class="button-secondary" style="flex:1;">Сохранить</button>
        <button id="cancel-subgoal" style="flex:1;background:#1e293b;">Отмена</button>
      </div>
    `;
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:400px;">
        ${modalContent}
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeModal = () => {
      document.body.removeChild(modal);
    };
    
    modal.querySelector('#cancel-subgoal').addEventListener('click', closeModal);
    modal.querySelector('#save-subgoal').addEventListener('click', async () => {
      const title = modal.querySelector('#subgoal-title').value.trim();
      const description = modal.querySelector('#subgoal-description').value.trim();
      
      if (!title) {
        showToast('Введите название подцели', 'error');
        return;
      }
      
      try {
        await safeFetch(`/api/goals/${goalId}/subgoals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description })
        });
        
        closeModal();
        showToast('Подцель добавлена', 'success');
        
        // Обновляем детали цели если она открыта
        const goals = await loadGoals(true);
        const goal = goals.find(g => g.id === goalId);
        if (goal) {
          showGoalDetails(goal);
        }
        
        await loadAndRenderGoals('active');
        refreshQuickStats();
        
      } catch (error) {
        showToast('Ошибка добавления подцели', 'error');
      }
    });
    
    // Закрытие по клику вне модалки
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }
  
  // === ОБЩИЕ ФУНКЦИИ ===
  
  async function refreshQuickStats() {
    const container = document.getElementById('stats-content');
    if (!container || !currentUser) return;
    
    const habits = await loadHabits();
    const goals = await loadGoals();
    
    const today = new Date().toISOString().slice(0, 10);
    let completedHabitsToday = 0;
    let totalActiveHabits = 0;
    
    if (habits && habits.length > 0) {
      habits.forEach(habit => {
        const checkins = new Set(habit.checkin_dates || []);
        if (checkins.has(today)) completedHabitsToday++;
        totalActiveHabits++;
      });
    }
    
    const activeGoals = goals ? goals.filter(g => !g.completed && !g.archived).length : 0;
    const completedGoals = goals ? goals.filter(g => g.completed && !g.archived).length : 0;
    
    const habitsCompletion = totalActiveHabits > 0 ? Math.round((completedHabitsToday / totalActiveHabits) * 100) : 0;
    
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
        <div style="text-align:center;padding:12px;background:rgba(30,41,59,0.5);border-radius:8px;">
          <div style="font-size:24px;font-weight:bold;color:var(--accent);">${completedHabitsToday}/${totalActiveHabits}</div>
          <div style="font-size:12px;color:var(--muted);">Привычек сегодня</div>
        </div>
        <div style="text-align:center;padding:12px;background:rgba(30,41,59,0.5);border-radius:8px;">
          <div style="font-size:24px;font-weight:bold;color:var(--goal-color);">${activeGoals}</div>
          <div style="font-size:12px;color:var(--muted);">Активных целей</div>
        </div>
        <div style="text-align:center;padding:12px;background:rgba(30,41,59,0.5);border-radius:8px;grid-column:span 2;">
          <div style="font-size:16px;margin-bottom:6px;">Прогресс привычек: ${habitsCompletion}%</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${habitsCompletion}%"></div>
          </div>
        </div>
      </div>
      
      ${activeGoals > 0 ? `
        <div style="margin-top:16px;padding:12px;background:rgba(139,92,246,0.1);border-radius:8px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="font-size:14px;">🎯 Активных целей:</span>
            <span style="font-weight:bold;">${activeGoals}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="font-size:14px;">✅ Завершенных целей:</span>
            <span style="font-weight:bold;color:var(--success);">${completedGoals}</span>
          </div>
        </div>
      ` : ''}
    `;
  }
  
  async function handleAuth(action, email, password) {
    if (!isValidEmail(email)) {
      showToast('Введите корректный email', 'error');
      return;
    }
    
    if (password.length < 6) {
      showToast('Пароль должен содержать минимум 6 символов', 'error');
      return;
    }
    
    const loginBtn = document.getElementById('btn-login');
    const registerBtn = document.getElementById('btn-register');
    
    if (action === 'login') {
      setButtonLoading(loginBtn, true, 'login-spinner');
    } else {
      setButtonLoading(registerBtn, true, 'register-spinner');
    }
    
    try {
      const hashedPassword = await hashPassword(password);
      
      const response = await safeFetch(`/api/auth/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: hashedPassword })
      });
      
      if (response.user) {
        showToast(action === 'login' ? 'Вход выполнен!' : 'Регистрация успешна!', 'success');
        updateUserUI(response.user);
      }
    } catch (error) {
      showToast(
        action === 'login' ? 'Ошибка входа. Проверьте данные.' : 'Ошибка регистрации.',
        'error'
      );
    } finally {
      setButtonLoading(loginBtn, false, 'login-spinner');
      setButtonLoading(registerBtn, false, 'register-spinner');
    }
  }
  
  function checkSession() {
    const token = localStorage.getItem('authToken');
    const authTime = localStorage.getItem('authTime');
    
    if (token && authTime) {
      const timeSinceAuth = Date.now() - parseInt(authTime);
      if (timeSinceAuth < SESSION_TIMEOUT) {
        fetch('/api/auth/me', { 
          credentials: 'same-origin',
          headers: { 'Authorization': `Bearer ${token}` }
        })
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data && data.user) {
              updateUserUI(data.user);
            } else {
              localStorage.removeItem('authToken');
              localStorage.removeItem('authTime');
            }
          })
          .catch(() => {
            localStorage.removeItem('authToken');
            localStorage.removeItem('authTime');
          });
      } else {
        localStorage.removeItem('authToken');
        localStorage.removeItem('authTime');
      }
    }
  }
  
  // === ФУНКЦИЯ СБОРА ДАННЫХ ЦЕЛИ ===
  
  function collectGoalData() {
    return {
      title: document.getElementById('goal-title').value.trim(),
      description: document.getElementById('goal-description').value.trim(),
      category: document.getElementById('goal-category').value,
      priority: document.getElementById('goal-priority').value,
      complexity: document.getElementById('goal-complexity').value,
      deadline: document.getElementById('goal-deadline').value,
      duration: parseInt(document.getElementById('goal-duration').value) || 30,
      // AI план добавляется если есть
      ...(currentAIPlan ? { subgoals: currentAIPlan.subgoals } : {})
    };
  }
  
  // === ИНИЦИАЛИЗАЦИЯ СОБЫТИЙ ===
  
  // Авторизация
  document.getElementById('btn-login').addEventListener('click', debounce(() => {
    const email = document.getElementById('auth-email').value.trim().toLowerCase();
    const password = document.getElementById('auth-password').value;
    handleAuth('login', email, password);
  }, 300));
  
  document.getElementById('btn-register').addEventListener('click', debounce(() => {
    const email = document.getElementById('auth-email').value.trim().toLowerCase();
    const password = document.getElementById('auth-password').value;
    handleAuth('register', email, password);
  }, 300));
  
  document.getElementById('auth-password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const email = document.getElementById('auth-email').value.trim().toLowerCase();
      const password = document.getElementById('auth-password').value;
      handleAuth('login', email, password);
    }
  });
  
  // Навигация
  document.querySelectorAll('.sidebar-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const page = el.dataset.page;
      
      if (page === 'logout') {
        fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
          .finally(() => {
            updateUserUI(null);
            showToast('Вы вышли из системы', 'info');
          });
      } else {
        showPage(page);
      }
    });
  });
  
  // Главное меню
  document.getElementById('btn-goals').addEventListener('click', debounce(() => {
    showPage('goals');
  }, 300));
  
  document.getElementById('btn-habits').addEventListener('click', debounce(async () => {
    showPage('habits-list');
    await loadAndRenderHabitsList();
  }, 300));
  
  // Кнопки возврата
  document.getElementById('btn-back-to-home').addEventListener('click', () => {
    showPage('home');
  });
  
  document.getElementById('btn-back-to-home-from-goals').addEventListener('click', () => {
    showPage('home');
  });
  
  // Обновление данных
  document.getElementById('btn-refresh-habits').addEventListener('click', debounce(async () => {
    await loadAndRenderHabitsList();
    showToast('Список привычек обновлен', 'success');
  }, 300));
  
  document.getElementById('btn-refresh-goals').addEventListener('click', debounce(async () => {
    const activeTab = document.querySelector('.tab.active').dataset.tab;
    await loadAndRenderGoals(activeTab.replace('-goals', ''));
    showToast('Список целей обновлен', 'success');
  }, 300));
  
  // Табы целей
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
      
      tab.classList.add('active');
      const tabId = tab.dataset.tab;
      document.getElementById(tabId).style.display = 'block';
      
      const filter = tabId.replace('-goals', '');
      loadAndRenderGoals(filter);
    });
  });
  
  // Управление календарем
  document.getElementById('btn-calendar-week').addEventListener('click', () => {
    calendarView = 'week';
    currentPeriod = new Date();
    refreshTracker();
  });
  
  document.getElementById('btn-calendar-month').addEventListener('click', () => {
    calendarView = 'month';
    currentPeriod = new Date();
    refreshTracker();
  });
  
  document.getElementById('btn-prev-period').addEventListener('click', () => {
    if (calendarView === 'week') {
      currentPeriod.setDate(currentPeriod.getDate() - 7);
    } else {
      currentPeriod.setMonth(currentPeriod.getMonth() - 1);
    }
    refreshTracker();
  });
  
  document.getElementById('btn-next-period').addEventListener('click', () => {
    if (calendarView === 'week') {
      currentPeriod.setDate(currentPeriod.getDate() + 7);
    } else {
      currentPeriod.setMonth(currentPeriod.getMonth() + 1);
    }
    refreshTracker();
  });
  
  // Модалка привычек
  document.getElementById('btn-add-habit').addEventListener('click', () => {
    document.getElementById('habit-title').value = '';
    document.getElementById('habit-daily').checked = true;
    showModal('habit-modal');
  });
  
  document.getElementById('habit-cancel').addEventListener('click', () => {
    hideModal('habit-modal');
  });
  
  document.getElementById('habit-save').addEventListener('click', debounce(async () => {
    const title = document.getElementById('habit-title').value.trim();
    const isDaily = document.getElementById('habit-daily').checked;
    
    if (!title) {
      showToast('Введите название привычки', 'error');
      return;
    }
    
    setButtonLoading(document.getElementById('habit-save'), true, 'save-spinner');
    
    try {
      await safeFetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, daily: isDaily })
      });
      
      hideModal('habit-modal');
      showToast('Привычка добавлена!', 'success');
      
      if (currentView === 'habits-list') {
        await loadAndRenderHabitsList();
      } else if (currentView === 'habits-tracker') {
        await refreshTracker();
      }
      
      refreshQuickStats();
    } catch (error) {
      showToast('Ошибка добавления привычки', 'error');
    } finally {
      setButtonLoading(document.getElementById('habit-save'), false, 'save-spinner');
    }
  }, 300));
  
  // Модалка целей - обновленная инициализация
  document.getElementById('btn-add-goal').addEventListener('click', () => {
    // Сброс формы
    document.getElementById('goal-title').value = '';
    document.getElementById('goal-description').value = '';
    document.getElementById('goal-category').value = '';
    document.getElementById('goal-priority').value = 'medium';
    document.getElementById('goal-complexity').value = 'medium';
    document.getElementById('goal-deadline').value = '';
    document.getElementById('goal-duration').value = '30';
    
    // Сброс AI секции
    const aiSection = document.getElementById('ai-decomposition-section');
    const aiSuggestions = document.getElementById('ai-suggestions');
    const aiError = document.getElementById('ai-error');
    const decomposeBtn = document.getElementById('btn-ai-decompose');
    const aiStatusText = document.getElementById('ai-status-text');
    const spinner = document.querySelector('.decompose-spinner');
    
    aiSection.style.display = 'none';
    aiSuggestions.style.display = 'none';
    aiError.style.display = 'none';
    decomposeBtn.style.display = 'block';
    decomposeBtn.disabled = false;
    decomposeBtn.textContent = 'Запустить декомпозицию';
    spinner.style.display = 'none';
    aiStatusText.textContent = 'AI проанализирует вашу цель и предложит план';
    
    // Сброс переменных
    currentGoalData = null;
    isAIProcessing = false;
    currentAIPlan = null;
    
    // Сброс ошибок
    document.getElementById('goal-title-error').style.display = 'none';
    document.getElementById('goal-description-error').style.display = 'none';
    
    // Устанавливаем дедлайн на 30 дней вперед
    const defaultDeadline = new Date();
    defaultDeadline.setDate(defaultDeadline.getDate() + 30);
    document.getElementById('goal-deadline').value = defaultDeadline.toISOString().split('T')[0];
    
    // Отключаем кнопку сохранения
    const saveBtn = document.getElementById('goal-save');
    saveBtn.disabled = true;
    saveBtn.classList.remove('button-goal');
    saveBtn.classList.add('button-secondary');
    saveBtn.querySelector('#goal-save-text').textContent = 'Сохранить цель';
    
    showModal('goal-modal');
  });
  
  // Валидация при вводе
  document.getElementById('goal-title').addEventListener('input', debounce(validateGoalForm, 300));
  document.getElementById('goal-description').addEventListener('input', debounce(validateGoalForm, 300));
  
  // Кнопка декомпозиции
  document.getElementById('btn-ai-decompose').addEventListener('click', debounce(decomposeGoalWithAI, 300));
  
  // Сохранение цели
  document.getElementById('goal-save').addEventListener('click', debounce(async () => {
    // Проверяем обязательные поля
    if (!validateGoalForm()) {
      showToast('Заполните все обязательные поля', 'error');
      return;
    }
    
    // Проверяем, не идет ли AI обработка
    if (isAIProcessing) {
      showToast('Дождитесь завершения декомпозиции', 'warning');
      return;
    }
    
    const goalData = collectGoalData();
    const saveBtn = document.getElementById('goal-save');
    
    setButtonLoading(saveBtn, true, 'goal-save-spinner');
    
    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(goalData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ошибка ${response.status}: ${errorText || 'Неизвестная ошибка'}`);
      }

      const result = await response.json();
      
      hideModal('goal-modal');
      showToast(`Цель "${result.goal.title}" создана!` + (currentAIPlan ? ' (с AI-планом)' : ''), 'success');
      
      // Обновляем интерфейс если нужно
      if (currentView === 'goals') {
        await loadAndRenderGoals('active');
      }
      refreshQuickStats();
      
    } catch (error) {
      console.error('💥 Save goal error:', error);
      showToast('Ошибка создания цели: ' + (error.message || 'Неизвестная ошибка'), 'error');
    } finally {
      setButtonLoading(saveBtn, false, 'goal-save-spinner');
      // Сбрасываем состояние AI
      currentAIPlan = null;
      isAIProcessing = false;
    }
  }, 300));
  
  // Отмена
  document.getElementById('goal-cancel').addEventListener('click', () => {
    hideModal('goal-modal');
  });
  
  // Закрытие модалок по клику вне
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      hideModal(e.target.id);
    }
  });
  
  // Проверка сессии при загрузке
  checkSession();
  
  // Периодические обновления
  setInterval(checkSession, 60000);
  
  setInterval(() => {
    if (currentUser && currentView === 'home') {
      refreshQuickStats();
    }
  }, 300000);
  
  // Очистка
  window.addEventListener('beforeunload', () => {
    abortController.abort();
  });
  
  // Добавляем CSS для новых классов
  const style = document.createElement('style');
  style.textContent = `
    .button-success {
      background: var(--success) !important;
      color: white !important;
    }
    
    .button-success:hover:not(:disabled) {
      background: #059669 !important;
    }
    
    .ai-plan {
      background: rgba(139, 92, 246, 0.1);
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 8px;
      padding: 12px;
      margin: 10px 0;
    }
    
    .ai-plan-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    
    .ai-plan-title {
      font-weight: 500;
      color: var(--goal-color);
    }
    
    .subgoal-step {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 8px;
      padding: 8px;
      background: rgba(15, 23, 42, 0.5);
      border-radius: 6px;
    }
    
    .subgoal-step-number {
      width: 24px;
      height: 24px;
      background: var(--accent);
      color: #020617;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
      flex-shrink: 0;
    }
    
    .subgoal-step-content {
      flex: 1;
    }
    
    .subgoal-step-title {
      font-weight: 500;
      margin-bottom: 2px;
    }
    
    .subgoal-step-meta {
      font-size: 11px;
      color: var(--muted);
      display: flex;
      gap: 12px;
    }
    
    .form-group {
      margin-bottom: 16px;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 6px;
      font-size: 14px;
      color: var(--text);
      font-weight: 500;
    }
    
    .error-message {
      color: var(--error);
      font-size: 12px;
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .error-message::before {
      content: "⚠";
    }
  `;
  document.head.appendChild(style);
});