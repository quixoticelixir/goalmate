import * as API from './api.js';
import * as UI from './ui.js';
import * as Auth from './auth.js';

// ==================== КОНСТАНТЫ ====================
const COMPLEXITY_LABELS = { easy: 'Легко', medium: 'Средне', hard: 'Сложно' };
const PRIORITY_ICONS = { low: '🟢', medium: '🟡', high: '🔴' };
const PRIORITY_LABELS = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

function initGoals() {
  console.log('🎯 Инициализация модуля целей...');

  const btnAddGoal = document.getElementById('btn-add-goal');
  if (btnAddGoal) {
    btnAddGoal.addEventListener('click', showGoalModal);
    console.log('✅ Кнопка "Новая цель" инициализирована');
  }

  initGoalTabs();
  initGoalModalHandlers();
  
  // Инициализация кнопок навигации
  const btnBackFromGoals = document.getElementById('btn-back-to-home-from-goals');
  if (btnBackFromGoals) {
    btnBackFromGoals.addEventListener('click', () => UI.navigateToPage('home'));
  }
  
  const btnRefreshGoals = document.getElementById('btn-refresh-goals');
  if (btnRefreshGoals) {
    btnRefreshGoals.addEventListener('click', async () => {
      const activeTab = document.querySelector('.tab.active');
      if (activeTab) {
        await loadAndRenderGoals(activeTab.dataset.tab); // ← уже передаёт filter
        UI.showToast('Цели обновлены', 'success');
      }
    });
  }
}

function initGoalTabs() {
  console.log('📑 Инициализация вкладок целей...');
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', handleTabClick);
  });
}

async function handleTabClick(event) {
  const tab = event.currentTarget;
  const tabId = tab.dataset.tab;

  // Обновляем UI вкладок
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(pane => pane.style.display = 'none');

  tab.classList.add('active');
  const pane = document.getElementById(tabId === 'active' ? 'active' : tabId);
  if (pane) pane.style.display = 'block';

  await loadAndRenderGoals(tabId);
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

/**
 * Показывает подтверждающее окно
 */
async function confirmAction(message, confirmText = 'Подтвердить') {
  return new Promise(resolve => {
    if (UI.showConfirmModal) {
      // Используем кастомное модальное окно если оно доступно
      UI.showConfirmModal(message, confirmText, (confirmed) => {
        resolve(confirmed);
      });
    } else {
      // Используем стандартный confirm
      const confirmed = confirm(`${message}\n\nНажмите OK для подтверждения или Отмена для отмены.`);
      resolve(confirmed);
    }
  });
}

/**
 * Обновляет цели на активной вкладке
 */
async function refreshGoalsOnActiveTab() {
  const activeTab = document.querySelector('.tab.active');
  if (activeTab) {
    await loadAndRenderGoals(activeTab.dataset.tab);
  }
}

/**
 * Форматирует дедлайн
 */
function formatDeadline(deadlineString) {
  if (!deadlineString) return 'Без дедлайна';
  const deadline = new Date(deadlineString);
  const now = new Date();
  const diffDays = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `Просрочено ${Math.abs(diffDays)} дн.`;
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Завтра';
  if (diffDays < 7) return `Через ${diffDays} дн.`;
  if (diffDays < 30) return `Через ${Math.floor(diffDays / 7)} нед.`;
  return deadline.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/**
 * Рассчитывает прогресс цели
 */
function calculateGoalProgress(goal) {
  if (!goal.subgoals?.length) return goal.completed ? 100 : 0;
  const completed = goal.subgoals.filter(sg => sg.completed).length;
  return Math.round((completed / goal.subgoals.length) * 100);
}

// ==================== МОДАЛКА ЦЕЛИ ====================

function showGoalModal() {
  console.log('🎯 Открываем модалку создания цели');
  resetGoalForm();
  UI.showModal('goal-modal');
}

function resetGoalForm() {
  const fields = {
    'goal-title': '',
    'goal-description': '',
    'goal-category': '',
    'goal-priority': 'medium',
    'goal-complexity': 'medium',
    'goal-duration': '30'
  };

  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });

  // Устанавливаем дедлайн +30 дней
  const deadlineEl = document.getElementById('goal-deadline');
  if (deadlineEl) {
    const defaultDeadline = new Date();
    defaultDeadline.setDate(defaultDeadline.getDate() + 30);
    deadlineEl.value = defaultDeadline.toISOString().split('T')[0];
  }

  isAIProcessing = false;

  // Скрыть AI-секцию
  const aiSection = document.getElementById('ai-decomposition-section');
  if (aiSection) aiSection.style.display = 'none';

  const decomposeBtn = document.getElementById('btn-ai-decompose');
  if (decomposeBtn) {
    decomposeBtn.textContent = 'Сгенерировать план';
    decomposeBtn.disabled = false;
  }

  updateSaveButtonState(false);
  updateDecomposeButtonState();
}

function initGoalModalHandlers() {
  console.log('🔧 Инициализация обработчиков модалки цели...');

  const titleInput = document.getElementById('goal-title');
  const descInput = document.getElementById('goal-description');
  const handleInputChange = () => {
    validateGoalForm();
    updateDecomposeButtonState();
  };

  if (titleInput) titleInput.addEventListener('input', UI.debounce(handleInputChange, 300));
  if (descInput) descInput.addEventListener('input', UI.debounce(handleInputChange, 300));

  const decomposeBtn = document.getElementById('btn-ai-decompose');
  if (decomposeBtn) {
    decomposeBtn.addEventListener('click', UI.debounce(decomposeGoalWithAI, 300));
  }
  const saveBtn = document.getElementById('goal-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', UI.debounce(saveGoalHandler, 300));
  }
}

function updateDecomposeButtonState() {
  const title = document.getElementById('goal-title')?.value.trim() || '';
  const description = document.getElementById('goal-description')?.value.trim() || '';
  const btn = document.getElementById('btn-ai-decompose');
  if (btn) {
    btn.disabled = !(title && description);
  }
}

function validateGoalForm() {
  const title = document.getElementById('goal-title')?.value.trim() || '';
  const description = document.getElementById('goal-description')?.value.trim() || '';

  let isValid = true;

  updateFieldError('goal-title', !title ? 'Введите название цели' :
    title.length < 3 ? 'Минимум 3 символа' : null);

  updateFieldError('goal-description', !description ? 'Введите описание цели' :
    description.length < 10 ? 'Минимум 10 символов' : null);

  updateSaveButtonState(title && description && title.length >= 3 && description.length >= 10);
  
  return isValid;
}

function updateFieldError(fieldId, message) {
  const errorEl = document.getElementById(`${fieldId}-error`);
  if (errorEl) {
    if (message) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    } else {
      errorEl.style.display = 'none';
    }
  }
}

function updateSaveButtonState(isValid) {
  const saveBtn = document.getElementById('goal-save');
  if (!saveBtn) return;

  saveBtn.disabled = !isValid;
  saveBtn.classList.toggle('button-goal', isValid);
  saveBtn.classList.toggle('button-secondary', !isValid);
}

// ==================== AI ДЕКОМПОЗИЦИЯ ====================

let currentAIPlan = null;
let isAIProcessing = false;

async function decomposeGoalWithAI() {
  if (isAIProcessing) return;

  const title = document.getElementById('goal-title')?.value.trim();
  const description = document.getElementById('goal-description')?.value.trim();

  if (!title || !description) {
    UI.showToast('Заполните название и описание для декомпозиции', 'error');
    return;
  }

  const aiSuggestions = document.getElementById('ai-suggestions');
  if (aiSuggestions) {
    aiSuggestions.innerHTML = '';
    aiSuggestions.style.display = 'none';
  }

  isAIProcessing = true;
  updateAISection('processing');

  try {
    const result = await API.decomposeGoalAI(`${title}. ${description}`);
    
    // 🔧 ПРЕОБРАЗОВАНИЕ СТРОК В ОБЪЕКТЫ
    let subgoals = [];
    if (typeof result.subgoals[0] === 'string') {
      subgoals = result.subgoals.map(title => ({
        title: title.trim(),
        description: ''
      }));
    } else {
      // Убираем estimated_days и priority из ответа AI
      subgoals = result.subgoals.map(sg => {
        const { estimated_days, priority, ...rest } = sg;
        return rest;
      });
    }

    currentAIPlan = { subgoals, meta: result.meta || {} };
    renderAISuggestions({ subgoals, meta: result.meta });
    UI.showToast('План успешно сгенерирован!', 'success');
  } catch (error) {
    console.error('AI decomposition error:', error);
    updateAISection('error', error.message || 'Неизвестная ошибка');
    currentAIPlan = null;
  } finally {
    isAIProcessing = false;
    
    const decomposeBtn = document.getElementById('btn-ai-decompose');
    if (decomposeBtn) {
      decomposeBtn.disabled = false;
      decomposeBtn.textContent = 'Сгенерировать заново';
    }

    // Скрываем спиннер
    const spinner = document.querySelector('.decompose-spinner');
    const statusText = document.getElementById('ai-status-text');
    if (spinner) spinner.style.display = 'none';
    if (statusText) statusText.textContent = '';
  }
}

function updateAISection(state, message = '') {
  const aiSection = document.getElementById('ai-decomposition-section');
  const spinner = document.querySelector('.decompose-spinner');
  const statusText = document.getElementById('ai-status-text');
  const decomposeBtn = document.getElementById('btn-ai-decompose');

  if (!aiSection || !spinner || !statusText || !decomposeBtn) return;

  switch (state) {
    case 'processing':
      aiSection.style.display = 'block';
      spinner.style.display = 'inline-block';
      statusText.textContent = 'AI анализирует цель...';
      decomposeBtn.disabled = true;
      break;
    case 'error':
      spinner.style.display = 'none';
      statusText.textContent = 'Ошибка декомпозиции';
      document.getElementById('ai-error').textContent = message;
      document.getElementById('ai-error').style.display = 'block';
      decomposeBtn.textContent = 'Повторить';
      decomposeBtn.disabled = false;
      break;
  }
}

function renderAISuggestions(result) {
  const aiSuggestions = document.getElementById('ai-suggestions');
  if (!aiSuggestions) return;

  // Очищаем и показываем контейнер
  aiSuggestions.innerHTML = `
    <div class="ai-plan">
      <div class="ai-plan-header">
        <div class="ai-plan-title">🎯 План достижения цели:</div>
        <span style="font-size:11px;color:var(--text-muted);">${result.meta?.model || 'AI модель'}</span>
      </div>
      <div id="subgoals-editor" style="margin-top:12px;">
        ${(result.subgoals || []).map((sg, i) => createEditableSubgoalItem(sg, i)).join('')}
      </div>
      <div style="margin-top:16px;text-align:center;">
        <button id="btn-add-subgoal" class="btn btn-secondary" style="font-size:13px;padding:8px 16px;">
          + Добавить подцель
        </button>
      </div>
    </div>
  `;
  aiSuggestions.style.display = 'block';

  // Инициализация обработчиков
  initSubgoalEditorHandlers();
}

function createEditableSubgoalItem(subgoal, index) {
  return `
    <div class="subgoal-editable-item" data-index="${index}" draggable="true"
      style="background: #1e1b26; border: 1px solid #373445; border-radius: 10px; padding: 14px; margin-bottom: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); transition: box-shadow 0.2s, opacity 0.2s; cursor: move;">
      
      <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px;">
        <div class="subgoal-number" style="
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #8b5cf6;
          color: white;
          border-radius: 50%;
          font-weight: bold;
          font-size: 12px;
          flex-shrink: 0;
        ">${index + 1}</div>
        
        <input type="text" class="subgoal-title-input"
               value="${subgoal.title.replace(/"/g, '&quot;')}"
               placeholder="Название подцели"
               style="flex:1; font-size:15px; font-weight:600; border:none; outline:none; background:transparent; color:#e2e0f7; min-height:24px; padding:2px 0;"/>
               
        <button type="button" class="subgoal-delete"
                style="width:28px; height:28px; display:flex; align-items:center; justify-content:center; background:#3f3a53; color:#f87171; border:none; border-radius:6px; cursor:pointer; font-size:14px; opacity:0.8; transition:opacity 0.2s;"
                onmouseenter="this.style.opacity='1'"
                onmouseleave="this.style.opacity='0.8'">
          🗑
        </button>
      </div>

      <div style="display: flex; gap: 16px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 120px;">
          <label style="
            display: block;
            font-size: 12px;
            color: #a7a2c3;
            margin-bottom: 4px;
            font-weight: 500;
          ">Срок (дней)</label>
          <input type="number" class="subgoal-days-input" min="1" value=""
                 style="
                   width: 100%;
                   padding: 8px 10px;
                   border: 1px solid #373445;
                   border-radius: 6px;
                   font-size: 14px;
                   background: #252231;
                   color: #e2e0f7;
                   transition: border-color 0.2s;
                 "
                 onfocus="this.style.borderColor='#8b5cf6'"
                 onblur="this.style.borderColor='#373445'"/>
        </div>

        <div style="flex: 1; min-width: 120px;">
          <label style="
            display: block;
            font-size: 12px;
            color: #a7a2c3;
            margin-bottom: 4px;
            font-weight: 500;
          ">Приоритет</label>
          <select class="subgoal-priority-input"
                  style="
                    width: 100%;
                    padding: 8px 10px;
                    border: 1px solid #373445;
                    border-radius: 6px;
                    font-size: 14px;
                    background: #252231;
                    color: #e2e0f7;
                    cursor: pointer;
                    transition: border-color 0.2s;
                  "
                  onfocus="this.style.borderColor='#8b5cf6'"
                  onblur="this.style.borderColor='#373445'">
            <option value="low">Низкий</option>
            <option value="medium" selected>Средний</option>
            <option value="high">Высокий</option>
          </select>
        </div>
      </div>
    </div>
  `;
}

function renumberSubgoals(container) {
  const items = container.querySelectorAll('.subgoal-editable-item');
  items.forEach((item, index) => {
    const numberEl = item.querySelector('.subgoal-number');
    if (numberEl) {
      numberEl.textContent = index + 1;
    }
  });
}

let draggedItem = null;

function initSingleSubgoalHandlers(item) {
  // Удаление
  const deleteBtn = item.querySelector('.subgoal-delete');
  if (deleteBtn) {
    deleteBtn.onclick = (e) => {
      const item = e.target.closest('.subgoal-editable-item');
      if (item) {
        item.remove();
        renumberSubgoals(document.getElementById('subgoals-editor'));
      }
    };
  }

  // Drag & Drop
  item.ondragstart = () => {
    item.classList.add('dragging');
    item.style.opacity = '0.6';
  };

  item.ondragend = () => {
    item.classList.remove('dragging');
    item.style.opacity = '1';
    renumberSubgoals(document.getElementById('subgoals-editor'));
  };
}

function initSubgoalEditorHandlers() {
  const editor = document.getElementById('subgoals-editor');
  if (!editor) return;

  // Инициализация существующих подцелей
  editor.querySelectorAll('.subgoal-editable-item').forEach(initSingleSubgoalHandlers);

  // Drag-over для всего контейнера
  editor.ondragover = (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(editor, e.clientY);
    const draggedEl = document.querySelector('.subgoal-editable-item.dragging');
    if (draggedEl) {
      if (afterElement == null) {
        editor.appendChild(draggedEl);
      } else {
        editor.insertBefore(draggedEl, afterElement);
      }
    }
  };

  // Кнопка "Добавить подцель"
  const addBtn = document.getElementById('btn-add-subgoal');
  if (addBtn) {
    addBtn.onclick = () => {
      const newIndex = editor.querySelectorAll('.subgoal-editable-item').length;
      const emptySubgoal = { title: '' };
      editor.insertAdjacentHTML('beforeend', createEditableSubgoalItem(emptySubgoal, newIndex));
      initSingleSubgoalHandlers(editor.lastElementChild);
      renumberSubgoals(editor);
    };
  }
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.subgoal-editable-item:not(.dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ==================== СОХРАНЕНИЕ ЦЕЛИ ====================

async function saveGoalHandler() {
  const goalId = document.getElementById('goal-save').dataset.goalId;
  const isEdit = !!goalId;
  
  if (!validateGoalForm() || isAIProcessing) return;

  const goalData = collectGoalData();
  const saveBtn = document.getElementById('goal-save');
  UI.setButtonLoading(saveBtn, true);

  try {
    let response;
    if (isEdit) {
      // Обновление
      response = await API.updateGoal(goalId, goalData);
      UI.showToast(`Цель "${response.goal.title}" обновлена!`, 'success');
    } else {
      // Создание
      response = await API.saveGoal(goalData);
      UI.showToast(`Цель "${response.goal.title}" создана!`, 'success');
    }
    
    UI.hideModal('goal-modal');
    await refreshGoalsOnActiveTab();
  } catch (error) {
    UI.showToast('Ошибка: ' + (error.message || 'Неизвестная ошибка'), 'error');
  } finally {
    UI.setButtonLoading(saveBtn, false);
    // Сброс ID после сохранения
    saveBtn.dataset.goalId = '';
    saveBtn.textContent = 'Создать цель';
  }
}

function collectGoalData() {
  const data = {
    title: document.getElementById('goal-title')?.value.trim(),
    description: document.getElementById('goal-description')?.value.trim(),
    category: document.getElementById('goal-category')?.value,
    priority: document.getElementById('goal-priority')?.value || 'medium',
    complexity: document.getElementById('goal-complexity')?.value || 'medium',
    deadline: document.getElementById('goal-deadline')?.value,
    duration: parseInt(document.getElementById('goal-duration')?.value) || 30
  };

  // 🔥 Собираем подцели из редактора
  const subgoalItems = document.querySelectorAll('.subgoal-editable-item');
  if (subgoalItems.length > 0) {
    data.subgoals = Array.from(subgoalItems).map(item => {
      const title = item.querySelector('.subgoal-title-input').value.trim();
      const days = parseInt(item.querySelector('.subgoal-days-input').value) || null;
      const priority = item.querySelector('.subgoal-priority-input').value || 'medium';
      return { title, estimated_days: days, priority };
    }).filter(sg => sg.title); // убираем пустые
  }

  return data;
}

// ==================== ЗАГРУЗКА И РЕНДЕР ЦЕЛЕЙ ====================

async function loadAndRenderGoals(filter = 'active') {
  console.log(`📋 Загрузка целей с фильтром: ${filter}`);

  const containerId = getContainerIdByFilter(filter);
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:200px;">
      <div class="spinner" style="width:40px;height:40px;border-width:4px;margin-bottom:16px;"></div>
      <div style="color:var(--text-muted);font-size:14px;">Загрузка целей...</div>
    </div>
  `;

  try {
    const goals = await API.loadGoals(true, filter);
    
    // ИСПРАВЛЕННАЯ ФИЛЬТРАЦИЯ:
    const filteredGoals = goals.filter(goal => {
      if (filter === 'active') {
        return !goal.completed && !goal.archived;
      }
      if (filter === 'completed') {
        // ИСПРАВЛЕНИЕ: показываем ТОЛЬКО завершенные и неархивированные цели
        return goal.completed && !goal.archived;
      }
      if (filter === 'archived') {
        return goal.archived;
      }
      return true;
    });

    console.log(`📊 Загружено целей: ${goals.length}, отфильтровано: ${filteredGoals.length} для вкладки "${filter}"`);
    
    container.innerHTML = '';
    
    if (filteredGoals.length === 0) {
      container.innerHTML = renderEmptyState(filter);
      return;
    }

    const fragment = document.createDocumentFragment();
    filteredGoals.forEach((goal, i) => {
      fragment.appendChild(createGoalCard(goal, i));
    });
    container.appendChild(fragment);
    
    // Инициализируем обработчики для карточек
    initGoalCardsHandlers();
    
  } catch (error) {
    console.error('Load goals error:', error);
    container.innerHTML = renderErrorState(filter, () => loadAndRenderGoals(filter));
    UI.showToast('Ошибка загрузки целей', 'error');
  }
}

function getContainerIdByFilter(filter) {
  return filter === 'active' ? 'active-goals-container' :
         filter === 'completed' ? 'completed-goals-container' :
         filter === 'archived' ? 'archived-goals-container' : 'goals-list-container';
}

function renderEmptyState(filter) {
  const icons = { active: '🎯', completed: '✅', archived: '📁' };
  const messages = {
    active: 'Нет активных целей. Создайте новую цель!',
    completed: 'Нет завершенных целей',
    archived: 'Нет архивных целей'
  };
  const titles = {
    active: 'Активных целей нет',
    completed: 'Завершенных целей нет',
    archived: 'Архив пуст'
  };

  return `
    <div class="empty-state" style="padding:40px;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px;color:var(--text-muted);">${icons[filter]}</div>
      <h3 style="margin:0 0 8px 0;color:var(--text-primary);">${titles[filter]}</h3>
      <p style="color:var(--text-muted);margin:0;">${messages[filter]}</p>
    </div>
  `;
}

function renderErrorState(filter, retryFn) {
  const errorCard = document.createElement('div');
  errorCard.className = 'empty-state';
  errorCard.style.padding = '40px';
  errorCard.style.textAlign = 'center';
  
  errorCard.innerHTML = `
    <div style="font-size:48px;margin-bottom:16px;color:var(--error);">⚠</div>
    <h3 style="margin:0 0 8px 0;color:var(--text-primary);">Ошибка загрузки</h3>
    <p style="color:var(--text-muted);margin:0 0 16px 0;">Не удалось загрузить цели</p>
    <button class="btn btn-secondary retry-load-goals">Повторить попытку</button>
  `;
  
  // Добавляем обработчик для кнопки повтора
  setTimeout(() => {
    const retryBtn = errorCard.querySelector('.retry-load-goals');
    if (retryBtn) {
      retryBtn.addEventListener('click', retryFn);
    }
  }, 0);
  
  return errorCard.outerHTML;
}

// ==================== КАРТОЧКА ЦЕЛИ ====================

function createGoalCard(goal, index) {
  const card = document.createElement('div');
  card.className = `goal-card fade-in ${goal.completed ? 'completed' : ''} ${goal.archived ? 'archived' : ''}`;
  card.dataset.goalId = goal.id;
  card.dataset.index = index;
  card.style.animationDelay = `${index * 0.05}s`;

  const progress = calculateGoalProgress(goal);
  const deadlineText = formatDeadline(goal.deadline);
  const complexityClass = `complexity-${goal.complexity}`;
  const priorityIcon = PRIORITY_ICONS[goal.priority];

  card.innerHTML = `
    <div class="goal-header">
      <div style="flex:1;">
        <h3 class="goal-title">
          ${goal.title}${goal.completed ? ' ✅' : ''}
        </h3>
        <div class="goal-meta">
          <span class="badge badge-goal">📅 ${deadlineText}</span>
          <span class="badge badge-primary">
            ${priorityIcon} ${PRIORITY_LABELS[goal.priority]}
          </span>
          <span class="badge ${complexityClass}">
            ${COMPLEXITY_LABELS[goal.complexity]}
          </span>
          ${goal.completed ? '<span class="badge badge-success">Завершено</span>' : ''}
          ${goal.archived ? '<span class="badge" style="background:rgba(148,163,184,0.15);color:var(--text-muted);">Архив</span>' : ''}
        </div>
      </div>
      <div class="goal-actions">
        <button class="btn btn-secondary btn-sm btn-view-details" title="Просмотр деталей">
          👁
        </button>
        <button class="btn ${goal.completed ? 'btn-secondary' : 'btn-success'} btn-sm btn-complete-goal"
                title="${goal.completed ? 'Вернуть в работу' : 'Завершить цель'}">
          ${goal.completed ? '↩' : '✓'}
        </button>
        <button class="btn btn-error btn-sm btn-delete-goal" title="Удалить цель">
          🗑
        </button>
      </div>
    </div>
    ${goal.description ? `
      <div class="goal-description">
        ${goal.description.substring(0, 150)}${goal.description.length > 150 ? '...' : ''}
      </div>
    ` : ''}
    <div class="progress-container">
      <div class="progress-label">
        <span>Прогресс</span>
        <span>${progress}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill goal" style="width:${progress}%;"></div>
      </div>
    </div>
    <div style="font-size:12px;color:var(--text-muted);">
      📊 Подцелей: ${goal.subgoals?.length || 0}
      ${goal.subgoals?.length > 0 ? ` (${goal.subgoals.filter(sg => sg.completed).length} завершено)` : ''}
    </div>
  `;

  return card;
}

function initGoalCardsHandlers() {
  // Просмотр деталей
  document.querySelectorAll('.btn-view-details').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const button = e.currentTarget;
      const card = button.closest('.goal-card');
      const goalId = card?.dataset.goalId;
      
      if (goalId) {
        try {
          const goals = await API.loadGoals(true); 
          const goal = goals.find(g => g.id === goalId);
          if (goal) {
            showGoalDetails(goal);
          }
        } catch (error) {
          console.error('Error loading goal details:', error);
          UI.showToast('Ошибка загрузки деталей цели', 'error');
        }
      }
    });
  });
  
  // Завершение цели
  document.querySelectorAll('.btn-complete-goal').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const button = e.currentTarget;
      const card = button.closest('.goal-card');
      const goalId = card?.dataset.goalId;
      const goalTitle = card?.querySelector('.goal-title')?.textContent.trim() || 'Цель';
      const isCompleted = card?.classList.contains('completed');
      
      if (!goalId) {
        console.error('Goal ID not found');
        return;
      }
      
      const confirmed = await confirmAction(
        `Вы уверены, что хотите ${isCompleted ? 'вернуть в работу' : 'завершить'} цель "${goalTitle}"?`,
        isCompleted ? 'Вернуть в работу' : 'Завершить цель'
      );
      
      if (confirmed) {
        // Сохраняем исходное состояние кнопки
        const originalHTML = button.innerHTML;
        const originalDisabled = button.disabled;
        
        // Показываем индикатор загрузки
        button.innerHTML = '<span class="spinner" style="display:inline-block;width:12px;height:12px;margin-right:4px;"></span> Обработка...';
        button.disabled = true;
        
        try {
          // Используем новую функцию с PATCH
          await API.toggleGoalCompletion(goalId, !isCompleted);
          UI.showToast(isCompleted ? 'Цель возвращена в работу!' : 'Цель успешно завершена! 🎉', 'success');
          await refreshGoalsOnActiveTab();
        } catch (error) {
          console.error('Error toggling goal completion:', error);
          UI.showToast(`Ошибка: ${error.message || 'Неизвестная ошибка'}`, 'error');
          
          // Восстанавливаем исходное состояние кнопки при ошибке
          button.innerHTML = originalHTML;
          button.disabled = originalDisabled;
        }
      }
    });
  });
  
  // Удаление цели
  document.querySelectorAll('.btn-delete-goal').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const button = e.currentTarget;
      const card = button.closest('.goal-card');
      const goalId = card?.dataset.goalId;
      const goalTitle = card?.querySelector('.goal-title')?.textContent.trim() || 'Цель';
      
      if (!goalId) {
        console.error('Goal ID not found');
        return;
      }
      
      const confirmed = await confirmAction(
        `Вы уверены, что хотите удалить цель "${goalTitle}"?\nЭто действие нельзя отменить.`,
        'Удалить цель'
      );
      
      if (confirmed) {
        // Сохраняем исходное состояние кнопки
        const originalHTML = button.innerHTML;
        const originalDisabled = button.disabled;
        
        // Показываем индикатор загрузки
        button.innerHTML = '<span class="spinner" style="display:inline-block;width:12px;height:12px;margin-right:4px;"></span> Удаление...';
        button.disabled = true;
        
        try {
          await API.deleteGoal(goalId);
          UI.showToast('Цель успешно удалена', 'success');
          await refreshGoalsOnActiveTab();
        } catch (error) {
          console.error('Error deleting goal:', error);
          UI.showToast('Ошибка удаления цели', 'error');
          
          // Восстанавливаем исходное состояние кнопки при ошибке
          button.innerHTML = originalHTML;
          button.disabled = originalDisabled;
        }
      }
    });
  });
}

// ==================== МОДАЛКА ДЕТАЛЕЙ ЦЕЛИ ====================

function showGoalDetails(goal) {
  const modal = document.getElementById('goal-detail-modal');
  if (!modal) return;

  // Формируем HTML содержимого
  let subgoalsHtml = '';
  if (goal.subgoals && goal.subgoals.length > 0) {
    subgoalsHtml = `
      <h3 style="margin:20px 0 10px 0;">Подцели (${goal.subgoals.filter(sg => sg.completed).length}/${goal.subgoals.length} завершено)</h3>
      <div id="detailed-subgoals-list">
        ${goal.subgoals.map((sg, index) => `
          <div class="subgoal-card ${sg.completed ? 'completed' : ''}" data-subgoal-id="${sg.id}" style="margin-bottom:10px;padding:12px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
              <div style="flex:1;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                  <input type="checkbox" 
                        class="subgoal-completed" 
                        ${sg.completed ? 'checked' : ''} 
                        data-subgoal-id="${sg.id}"
                        style="width:16px;height:16px;">
                  <span class="subgoal-title-text" style="font-weight:${sg.completed ? 'normal' : 'bold'};">
                    ${sg.title}
                  </span>
                  ${sg.completed ? '<span class="badge badge-success" style="margin-left:8px;">✅ Завершено</span>' : ''}
                </div>
                ${sg.description ? `<div style="font-size:13px;color:var(--text-muted);margin-bottom:6px;">${sg.description}</div>` : ''}
                <div style="font-size:12px;color:var(--text-muted);">
                  📅 Срок: ${sg.estimated_days ? `${sg.estimated_days} дн.` : 'Не указан'} |
                  ⚠ Приоритет: ${PRIORITY_LABELS[sg.priority] || sg.priority}
                </div>
              </div>
              <button class="btn btn-error btn-sm btn-delete-subgoal" 
                      data-subgoal-id="${sg.id}"
                      style="padding:4px 8px;" 
                      title="Удалить подцель">🗑</button>
            </div>
          </div>
        `).join('')}
      </div>
      <button id="btn-add-subgoal-detail" class="btn btn-secondary" style="margin-top:10px;">
        + Добавить подцель
      </button>
    `;
  } else {
    subgoalsHtml = '<p style="color:var(--text-muted);margin:20px 0;">Нет подцелей</p>';
  }

  const progress = calculateGoalProgress(goal);
  const deadlineText = formatDeadline(goal.deadline);

  modal.querySelector('#goal-detail-content').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
      <div>
        <h2 style="margin:0;color:var(--goal-color);">${goal.title}${goal.completed ? ' ✅' : ''}</h2>
        <div class="goal-meta" style="margin:10px 0;">
          <span class="badge badge-goal">📅 ${deadlineText}</span>
          <span class="badge ${`complexity-${goal.complexity}`}">${COMPLEXITY_LABELS[goal.complexity]}</span>
          <span class="badge badge-primary">
            ${PRIORITY_ICONS[goal.priority]} ${PRIORITY_LABELS[goal.priority]}
          </span>
          ${goal.completed ? '<span class="badge badge-success">Завершено</span>' : ''}
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="btn-edit-goal" class="btn btn-secondary">✏️ Редактировать</button>
        <button id="btn-complete-goal-detail" class="btn ${goal.completed ? 'btn-secondary' : 'btn-success'}">
          ${goal.completed ? '↩ Вернуть' : '✓ Завершить'}
        </button>
      </div>
    </div>
    
    ${goal.description ? `
      <div class="goal-description">
        ${goal.description}
      </div>
    ` : ''}
    
    <div class="progress-container" style="margin:20px 0;">
      <div class="progress-label">
        <span>Прогресс</span>
        <span>${progress}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill goal" style="width:${progress}%;"></div>
      </div>
    </div>
    
    ${subgoalsHtml}
    
    <div style="margin-top:20px;display:flex;gap:10px;">
      <button id="btn-close-detail" class="btn btn-secondary" style="flex:1;">Закрыть</button>
    </div>
  `;

  // Показываем модалку
  UI.showModal('goal-detail-modal');

  // Навешиваем обработчики
  initGoalDetailHandlers(goal);
}

function initGoalDetailHandlers(goal) {
  // Закрытие
  document.getElementById('btn-close-detail')?.addEventListener('click', () => {
    UI.hideModal('goal-detail-modal');
  });

  // Завершение цели
  const completeBtn = document.getElementById('btn-complete-goal-detail');
  if (completeBtn) {
    completeBtn.addEventListener('click', async () => {
      console.log('Завершение цели из модалки:', goal.id);
      const isCompleted = goal.completed;
      
      try {
        await API.toggleGoalCompletion(goal.id, !isCompleted);
        UI.showToast(isCompleted ? 'Цель возвращена в работу' : 'Цель завершена!', 'success');
        UI.hideModal('goal-detail-modal');
        
        // Перезагружаем цели на активной вкладке
        const activeTab = document.querySelector('.tab.active');
        if (activeTab) {
          await loadAndRenderGoals(activeTab.dataset.tab);
        }
      } catch (error) {
        console.error('Ошибка при изменении статуса цели:', error);
        UI.showToast('Ошибка при изменении статуса цели', 'error');
      }
    });
  }

  // Редактирование цели
  document.getElementById('btn-edit-goal')?.addEventListener('click', () => {
    fillGoalForm(goal); // goal — текущая цель из замыкания
    UI.hideModal('goal-detail-modal');
    UI.showModal('goal-modal');
  });
  
  function fillGoalForm(goal) {
    const fields = {
      'goal-title': goal.title,
      'goal-description': goal.description || '',
      'goal-category': goal.category || '',
      'goal-priority': goal.priority || 'medium',
      'goal-complexity': goal.complexity || 'medium',
      'goal-duration': goal.duration || 30,
      'goal-deadline': goal.deadline ? goal.deadline.split('T')[0] : ''
    };

    for (const [id, value] of Object.entries(fields)) {
      const el = document.getElementById(id);
      if (el) el.value = value;
    }

    // Скрыть AI-секцию
    const aiSection = document.getElementById('ai-decomposition-section');
    if (aiSection) aiSection.style.display = 'none';

    // Сохранить ID цели
    const saveBtn = document.getElementById('goal-save');
    if (saveBtn) saveBtn.dataset.goalId = goal.id;

    // Обновить текст кнопки
    if (saveBtn) saveBtn.textContent = 'Сохранить изменения';
  }

  // Переключение подцели
  document.querySelectorAll('.subgoal-completed').forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      const subgoalId = e.target.dataset.subgoalId;
      const completed = e.target.checked;
      try {
        await API.updateSubgoal(subgoalId, { completed });
        UI.showToast('Статус подцели обновлён', 'success');
        // Обновляем цель
        const updatedGoal = await API.loadGoals().then(goals => 
          goals.find(g => g.id === goal.id)
        );
        if (updatedGoal) showGoalDetails(updatedGoal);
      } catch (error) {
        UI.showToast('Ошибка обновления подцели', 'error');
        e.target.checked = !completed; // откат
      }
    });
  });

  // Удаление подцели
  document.querySelectorAll('.btn-delete-subgoal').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const subgoalId = e.currentTarget.dataset.subgoalId;
      if (!confirm('Удалить подцель?')) return;
      try {
        await API.deleteSubgoal(subgoalId);
        UI.showToast('Подцель удалена', 'success');
        // Обновляем детали
        const updatedGoal = await API.loadGoals().then(goals => 
          goals.find(g => g.id === goal.id)
        );
        if (updatedGoal) showGoalDetails(updatedGoal);
      } catch (error) {
        UI.showToast('Ошибка удаления подцели', 'error');
      }
    });
  });

  // Добавление подцели
  document.getElementById('btn-add-subgoal-detail')?.addEventListener('click', () => {
    UI.showToast('Добавление подцелей пока доступно только при создании цели', 'info');
  });
}

// ==================== ЭКСПОРТ ====================

export {
  initGoals,
  loadAndRenderGoals,
  showGoalModal
};