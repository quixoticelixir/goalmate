const form = document.getElementById('goal-form');
const textarea = document.getElementById('goal-input');
const statusEl = document.getElementById('status');
const outputEmpty = document.getElementById('output-empty');
const outputGoalWrapper = document.getElementById('output-goal');
const outputGoalText = document.getElementById('goal-text');
const subgoalLabel = document.getElementById('subgoal-label');
const subgoalList = document.getElementById('subgoal-list');

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function renderResult(data) {
  outputEmpty.style.display = 'none';
  outputGoalWrapper.style.display = 'block';
  subgoalLabel.style.display = 'block';

  outputGoalText.textContent = data.goal;
  subgoalList.innerHTML = '';

  (data.subgoals || []).forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    subgoalList.appendChild(li);
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const goal = textarea.value.trim();
  if (!goal) {
    setStatus('Please enter a goal first.', true);
    return;
  }

  setStatus('Contacting backend and decomposing goal…');

  try {
    const response = await fetch('/api/goals/decompose', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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
  } catch (error) {
    console.error(error);
    setStatus('Error: ' + (error.message || 'Something went wrong.'), true);
  }
});

