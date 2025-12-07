const form = document.getElementById('goal-form');
const textarea = document.getElementById('goal-input');
const statusEl = document.getElementById('status');
const outputEmpty = document.getElementById('output-empty');
const outputGoalWrapper = document.getElementById('output-goal');
const outputGoalText = document.getElementById('goal-text');
const subgoalLabel = document.getElementById('subgoal-label');
const subgoalList = document.getElementById('subgoal-list');

const historySection = document.getElementById('history-section');
const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');

const authEmailInput = document.getElementById('auth-email');
const authPasswordInput = document.getElementById('auth-password');
const authStatusEl = document.getElementById('auth-status');
const currentUserEl = document.getElementById('current-user');
const btnRegister = document.getElementById('btn-register');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const submitButton = form.querySelector('button[type="submit"]');

let currentUser = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function setAuthStatus(message, isError = false) {
  authStatusEl.textContent = message;
  authStatusEl.classList.toggle('error', isError);
}

function updateUserUI(user) {
  currentUser = user || null;
  currentUserEl.textContent = currentUser ? currentUser.email : 'Guest';
  btnLogout.style.display = currentUser ? 'inline-flex' : 'none';
  if (!currentUser) {
    renderHistory([]);
    if (historySection) historySection.style.display = 'none';
    setStatus('Please log in to decompose goals.', true);
  } else if (historySection) {
    historySection.style.display = 'block';
    setStatus('');
  }

  if (submitButton) {
    submitButton.disabled = !currentUser;
    submitButton.textContent = currentUser ? 'Decompose goal' : 'Login required';
  }
  if (textarea) {
    textarea.disabled = !currentUser;
    if (!currentUser) textarea.value = '';
  }
}

function renderResult(data) {
  outputEmpty.style.display = 'none';
  outputGoalWrapper.style.display = 'block';
  subgoalLabel.style.display = 'block';

  outputGoalText.textContent = data.goal;
  subgoalList.innerHTML = '';

  (data.subgoals || []).forEach((sg) => {
    // Здесь предполагается, что sg — объект с полями id, title, deadline
    // Если на первом шаге у тебя нет id — временно используй индекс
    const subgoalId = sg.id || `temp-${Date.now()}-${Math.random()}`;
    const editableEl = makeEditableSubgoal(
      sg.id, // ← теперь всегда есть id, временных нет
      sg.title,
      sg.deadline,
      async (id, updates) => {
        const res = await fetch(`/api/subgoals/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(updates)
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to update subgoal');
        }
        // Опционально: можно обновить только этот элемент, но проще перезагрузить историю
      }
    );
    subgoalList.appendChild(editableEl);
  });
}

function makeEditableSubgoal(subgoalId, initialTitle, deadline, onSave) {
  const container = document.createElement('div');
  container.className = 'editable-subgoal';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.gap = '8px';
  container.style.padding = '4px 0';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = initialTitle;
  titleInput.style.flex = '1';
  titleInput.style.padding = '6px 8px';
  titleInput.style.borderRadius = '6px';
  titleInput.style.border = '1px solid #111827';
  titleInput.style.background = '#020617';
  titleInput.style.color = '#e5e7eb';
  titleInput.style.fontSize = '13px';

  const deadlineInput = document.createElement('input');
  deadlineInput.type = 'datetime-local';
  deadlineInput.style.width = '180px';
  deadlineInput.style.fontSize = '13px';
  deadlineInput.style.padding = '6px';
  deadlineInput.style.borderRadius = '6px';
  deadlineInput.style.border = '1px solid #111827';
  deadlineInput.style.background = '#020617';
  deadlineInput.style.color = '#e5e7eb';
  if (deadline) {
    const dt = new Date(deadline);
    if (!isNaN(dt.getTime())) {
      deadlineInput.value = dt.toISOString().slice(0, 16);
    }
  }

  const statusEl = document.createElement('span');
  statusEl.style.minWidth = '20px';
  statusEl.style.textAlign = 'center';
  statusEl.style.fontSize = '14px';
  statusEl.style.color = '#94a3b8';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = '💾';
  saveBtn.style.padding = '4px 8px';
  saveBtn.style.borderRadius = '6px';
  saveBtn.style.background = '#1e293b';
  saveBtn.style.color = '#94a3b8';
  saveBtn.style.border = '1px solid #1f2937';
  saveBtn.style.cursor = 'pointer';

  saveBtn.addEventListener('click', async () => {
    const newTitle = titleInput.value.trim();
    const newDeadline = deadlineInput.value
      ? new Date(deadlineInput.value).toISOString()
      : null;

    if (!newTitle) {
      alert('Title cannot be empty.');
      return;
    }

    statusEl.textContent = '⏳';
    statusEl.style.color = '#facc15';

    try {
      await onSave(subgoalId, { title: newTitle, deadline: newDeadline });
      statusEl.textContent = '✅';
      statusEl.style.color = '#34d399';
      setTimeout(() => {
        statusEl.textContent = '';
      }, 1500);
    } catch (err) {
      statusEl.textContent = '❌';
      statusEl.style.color = '#f87171';
      setTimeout(() => {
        statusEl.textContent = '💾';
      }, 2000);
      console.error('Save error:', err);
    }
  });

  container.appendChild(titleInput);
  container.appendChild(deadlineInput);
  container.appendChild(saveBtn);
  container.appendChild(statusEl);

  return container;
}

function renderHistory(items) {
  if (!historySection) return;
  historyList.innerHTML = '';

  if (!items || items.length === 0) {
    historyEmpty.style.display = 'block';
    historyList.style.display = 'none';
    return;
  }

  historyEmpty.style.display = 'none';
  historyList.style.display = 'grid';

  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'history-item';

    const heading = document.createElement('h3');
    heading.textContent = item.goal;
    li.appendChild(heading);

    if (item.created_at) {
      const timeEl = document.createElement('time');
      timeEl.textContent = new Date(item.created_at).toLocaleString();
      li.appendChild(timeEl);
    }

    if (Array.isArray(item.subgoals) && item.subgoals.length > 0) {
      const ul = document.createElement('ul');
      ul.style.listStyle = 'none';
      ul.style.paddingLeft = '0';
      ul.style.margin = '6px 0 0';

      item.subgoals.forEach((sg) => {
        const editableEl = makeEditableSubgoal(
          sg.id,
          sg.title,
          sg.deadline,
          async (id, updates) => {
            const res = await fetch(`/api/subgoals/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify(updates)
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || 'Failed to update subgoal');
            }
            await loadHistory(); // обязательно — чтобы обновить дедлайны и порядок
          }
        );
        const liSub = document.createElement('li');
        liSub.style.padding = '4px 0';
        liSub.appendChild(editableEl);
        ul.appendChild(liSub);
      });
      li.appendChild(ul);
    }

    historyList.appendChild(li);
  });
}

async function loadHistory() {
  if (!currentUser) return;
  try {
    const response = await fetch('/api/goals/history', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin'
    });
    if (!response.ok) {
      throw new Error('Failed to load history.');
    }
    const data = await response.json();
    renderHistory(data.history || []);
  } catch (error) {
    console.error(error);
    setAuthStatus('Failed to load history.', true);
  }
}

async function fetchCurrentUser() {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const data = await response.json();
    updateUserUI(data.user);
    if (data.user) {
      await loadHistory();
    }
  } catch (error) {
    console.error(error);
    setAuthStatus('Could not fetch current user.', true);
  }
}

async function handleAuth(action) {
  const email = authEmailInput.value.trim().toLowerCase();
  const password = authPasswordInput.value;

  if (!email || !password) {
    setAuthStatus('Email and password are required.', true);
    return;
  }

  setAuthStatus(action === 'register' ? 'Registering…' : 'Logging in…');

  try {
    const response = await fetch(`/api/auth/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      let message = 'Request failed.';
      try {
        const err = await response.json();
        if (err && err.error) message = err.error;
      } catch (_) {}
      throw new Error(message);
    }

    const data = await response.json();
    updateUserUI(data.user);
    setAuthStatus(`Signed in as ${data.user.email}`);
    await loadHistory();
  } catch (error) {
    console.error(error);
    setAuthStatus('Error: ' + (error.message || 'Something went wrong.'), true);
  }
}

btnRegister.addEventListener('click', () => handleAuth('register'));
btnLogin.addEventListener('click', () => handleAuth('login'));
btnLogout.addEventListener('click', async () => {
  try {
    setAuthStatus('Logging out…');
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch (error) {
    console.error(error);
  } finally {
    updateUserUI(null);
    setAuthStatus('Logged out.');
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const goal = textarea.value.trim();
  if (!goal) {
    setStatus('Please enter a goal first.', true);
    return;
  }
  if (!currentUser) {
    setStatus('Please log in to decompose goals.', true);
    return;
  }

  setStatus('Contacting backend and decomposing goal…');

  try {
    const response = await fetch('/api/goals/decompose', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin',
      body: JSON.stringify({ goal })
    });

    if (!response.ok) {
      let message = 'Request failed.';
      try {
        const err = await response.json();
        if (err && err.error) message = err.error;
      } catch (_) {}
      throw new Error(message);
    }

    const data = await response.json();
    renderResult(data);
    setStatus('Done. Edit the goal and run again if you like.');
    await loadHistory();
  } catch (error) {
    console.error(error);
    setStatus('Error: ' + (error.message || 'Something went wrong.'), true);
  }
});

fetchCurrentUser();
