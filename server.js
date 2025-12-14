require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const { decomposeGoal } = require('./src/services/goalDecomposer');
const Database = require('better-sqlite3');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// === ИНИЦИАЛИЗАЦИЯ БД ===
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'goals.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// === СХЕМА БД ===
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  priority TEXT DEFAULT 'medium',
  complexity TEXT DEFAULT 'medium',
  deadline TEXT,
  duration INTEGER DEFAULT 30,
  completed BOOLEAN DEFAULT 0,
  archived BOOLEAN DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subgoals (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  estimated_days INTEGER,
  priority TEXT DEFAULT 'medium',
  completed BOOLEAN DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS habit_checkins (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
  UNIQUE(habit_id, date)
);

CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_subgoals_goal ON subgoals(goal_id);
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_habit_date ON habit_checkins(habit_id, date);
`);

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ БД ===
function createUser(email, passwordHash) {
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)')
    .run(id, email, passwordHash);
  return { id, email };
}

function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function createGoal(userId, goalData) {
  const id = randomUUID();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO goals (id, user_id, title, description, category, priority, 
                       complexity, deadline, duration, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, userId, goalData.title, goalData.description || '', goalData.category || '',
    goalData.priority || 'medium', goalData.complexity || 'medium', 
    goalData.deadline || null, goalData.duration || 30,
    now, now
  );
  
  // Добавляем подцели если есть
  if (goalData.subgoals && Array.isArray(goalData.subgoals)) {
    const subgoalStmt = db.prepare(`
      INSERT INTO subgoals (id, goal_id, title, description, estimated_days, priority)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    goalData.subgoals.forEach(subgoal => {
      subgoalStmt.run(
        randomUUID(),
        id,
        subgoal.title || subgoal,
        subgoal.description || '',
        subgoal.estimated_days || 7,
        subgoal.priority || 'medium'
      );
    });
  }
  
  return getGoalById(id);
}

function getGoalById(id) {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
  if (!goal) return null;
  
  const subgoals = db.prepare('SELECT * FROM subgoals WHERE goal_id = ? ORDER BY created_at ASC').all(id);
  return { ...goal, subgoals };
}

function getGoalsByUser(userId, filter = 'active') {
  let query = 'SELECT * FROM goals WHERE user_id = ?';
  const params = [userId];
  
  if (filter === 'active') {
    query += ' AND completed = 0 AND archived = 0';
  } else if (filter === 'completed') {
    query += ' AND completed = 1 AND archived = 0';
  } else if (filter === 'archived') {
    query += ' AND archived = 1';
  }
  
  query += ' ORDER BY created_at DESC';
  
  const goals = db.prepare(query).all(...params);
  
  return goals.map(goal => {
    const subgoals = db.prepare('SELECT * FROM subgoals WHERE goal_id = ?').all(goal.id);
    return { ...goal, subgoals };
  });
}

function updateGoal(id, updates) {
  const fields = [];
  const values = [];
  
  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.completed !== undefined) {
    fields.push('completed = ?');
    values.push(updates.completed ? 1 : 0);
  }
  if (updates.archived !== undefined) {
    fields.push('archived = ?');
    values.push(updates.archived ? 1 : 0);
  }
  
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  
  if (fields.length > 1) {
    values.push(id);
    db.prepare(`UPDATE goals SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  
  return getGoalById(id);
}

function createSubgoal(goalId, subgoalData) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO subgoals (id, goal_id, title, description, estimated_days, priority)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id, goalId, subgoalData.title, subgoalData.description || '',
    subgoalData.estimated_days || 7, subgoalData.priority || 'medium'
  );
  
  return db.prepare('SELECT * FROM subgoals WHERE id = ?').get(id);
}

function toggleSubgoalCompletion(subgoalId) {
  const subgoal = db.prepare('SELECT * FROM subgoals WHERE id = ?').get(subgoalId);
  if (!subgoal) return null;
  
  db.prepare('UPDATE subgoals SET completed = ? WHERE id = ?')
    .run(subgoal.completed ? 0 : 1, subgoalId);
  
  return db.prepare('SELECT * FROM subgoals WHERE id = ?').get(subgoalId);
}

function deleteSubgoal(subgoalId) {
  db.prepare('DELETE FROM subgoals WHERE id = ?').run(subgoalId);
  return { success: true };
}

// Функции для привычек
function getHabitsForUser(userId) {
  return db.prepare(`
    SELECT h.*, GROUP_CONCAT(c.date) as checkin_dates
    FROM habits h
    LEFT JOIN habit_checkins c ON h.id = c.habit_id
    WHERE h.user_id = ?
    GROUP BY h.id
    ORDER BY h.created_at DESC
  `).all(userId).map(h => ({
    ...h,
    checkin_dates: h.checkin_dates ? h.checkin_dates.split(',') : []
  }));
}

function createHabit(userId, title) {
  const id = randomUUID();
  db.prepare('INSERT INTO habits (id, user_id, title) VALUES (?, ?, ?)')
    .run(id, userId, title);
  return { id, title, user_id: userId, created_at: new Date().toISOString() };
}

function createHabitCheckin(habitId, date) {
  const id = randomUUID();
  try {
    db.prepare('INSERT OR IGNORE INTO habit_checkins (id, habit_id, date) VALUES (?, ?, ?)')
      .run(id, habitId, date);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function deleteHabitCheckin(habitId, date) {
  db.prepare('DELETE FROM habit_checkins WHERE habit_id = ? AND date = ?')
    .run(habitId, date);
  return { success: true };
}

// === НАСТРОЙКА EXPRESS ===
app.use(cors());
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'goal-mate-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    }
  })
);

app.use(express.static(path.join(__dirname, 'public')));

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// === АУТЕНТИФИКАЦИЯ ===
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: 'Email and password (min 6 chars) required' });
    }
    
    const normalizedEmail = email.trim().toLowerCase();
    const existing = findUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    const user = createUser(normalizedEmail, passwordHash);
    req.session.userId = user.id;
    
    res.json({ user: sanitizeUser(findUserById(user.id)) });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const normalizedEmail = email.trim().toLowerCase();
    const user = findUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    req.session.userId = user.id;
    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  const user = findUserById(req.session.userId);
  res.json({ user: sanitizeUser(user) });
});

// === ЦЕЛИ ===
app.get('/api/goals', requireAuth, (req, res) => {
  try {
    const filter = req.query.filter || 'active';
    const goals = getGoalsByUser(req.session.userId, filter);
    res.json({ goals });
  } catch (error) {
    console.error('Get goals error:', error);
    res.status(500).json({ error: 'Failed to load goals' });
  }
});

app.post('/api/goals', requireAuth, (req, res) => {
  try {
    const goalData = req.body;
    if (!goalData.title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const goal = createGoal(req.session.userId, goalData);
    res.json({ goal });
  } catch (error) {
    console.error('Create goal error:', error);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

app.patch('/api/goals/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const goal = getGoalById(id);
    
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    if (goal.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const updatedGoal = updateGoal(id, req.body);
    res.json({ goal: updatedGoal });
  } catch (error) {
    console.error('Update goal error:', error);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

// Подцели
app.post('/api/goals/:goalId/subgoals', requireAuth, (req, res) => {
  try {
    const { goalId } = req.params;
    const subgoalData = req.body;
    
    if (!subgoalData.title) {
      return res.status(400).json({ error: 'Subgoal title required' });
    }
    
    const goal = getGoalById(goalId);
    if (!goal || goal.user_id !== req.session.userId) {
      return res.status(404).json({ error: 'Goal not found or access denied' });
    }
    
    const subgoal = createSubgoal(goalId, subgoalData);
    res.json({ subgoal });
  } catch (error) {
    console.error('Create subgoal error:', error);
    res.status(500).json({ error: 'Failed to create subgoal' });
  }
});

app.post('/api/goals/:goalId/subgoals/:subgoalId/toggle', requireAuth, (req, res) => {
  try {
    const { goalId, subgoalId } = req.params;
    
    const goal = getGoalById(goalId);
    if (!goal || goal.user_id !== req.session.userId) {
      return res.status(404).json({ error: 'Goal not found or access denied' });
    }
    
    const subgoal = toggleSubgoalCompletion(subgoalId);
    if (!subgoal) {
      return res.status(404).json({ error: 'Subgoal not found' });
    }
    
    res.json({ subgoal });
  } catch (error) {
    console.error('Toggle subgoal error:', error);
    res.status(500).json({ error: 'Failed to toggle subgoal' });
  }
});

app.delete('/api/goals/:goalId/subgoals/:subgoalId', requireAuth, (req, res) => {
  try {
    const { goalId, subgoalId } = req.params;
    
    const goal = getGoalById(goalId);
    if (!goal || goal.user_id !== req.session.userId) {
      return res.status(404).json({ error: 'Goal not found or access denied' });
    }
    
    const result = deleteSubgoal(subgoalId);
    res.json(result);
  } catch (error) {
    console.error('Delete subgoal error:', error);
    res.status(500).json({ error: 'Failed to delete subgoal' });
  }
});

app.post('/api/goals/decompose', requireAuth, async (req, res) => {
  try {
    const { goal } = req.body || {};
    console.log('🔍 Received AI decompose request for goal:', goal);
    
    if (!goal || typeof goal !== 'string' || !goal.trim()) {
      return res.status(400).json({ 
        error: 'Goal is required and must be a non-empty string.' 
      });
    }

    const trimmedGoal = goal.trim();
    console.log('🤖 Starting AI decomposition for goal:', trimmedGoal);
    
    let result;
    try {
      result = await decomposeGoal(trimmedGoal);
      console.log('✅ AI decomposition result:', JSON.stringify(result, null, 2));
    } catch (aiError) {
      console.error('❌ AI decomposition failed:', aiError.message);
      // Используем эвристический метод как запасной вариант
      result = {
        subgoals: [
          {
            title: 'Определить конкретные метрики успеха',
            description: 'Четко сформулируйте критерии достижения цели',
            estimated_days: 3,
            priority: 'high'
          },
          {
            title: 'Составить пошаговый план',
            description: 'Разбейте цель на последовательные этапы',
            estimated_days: 7,
            priority: 'medium'
          },
          {
            title: 'Подготовить необходимые ресурсы',
            description: 'Соберите все необходимое для достижения цели',
            estimated_days: 5,
            priority: 'medium'
          }
        ],
        meta: {
          model: 'fallback-heuristic',
          source: 'fallback',
          note: 'AI service unavailable, using fallback'
        }
      };
    }

    // Форматируем ответ
    const response = {
      goal: trimmedGoal,
      subgoals: result.subgoals || [],
      meta: result.meta || {
        model: 'unknown',
        source: 'heuristic'
      }
    };

    console.log('📤 Sending response with', response.subgoals.length, 'subgoals');
    return res.json(response);

  } catch (error) {
    console.error('💥 FATAL Error in AI decomposition:', error.message);
    console.error('Stack:', error.stack);

    return res.status(500).json({ 
      error: 'Failed to decompose goal. Please try again.',
      details: 'Internal server error'
    });
  }
});

// === ПРИВЫЧКИ ===
app.get('/api/habits', requireAuth, (req, res) => {
  try {
    const habits = getHabitsForUser(req.session.userId);
    res.json({ habits });
  } catch (error) {
    console.error('Get habits error:', error);
    res.status(500).json({ error: 'Failed to load habits' });
  }
});

app.post('/api/habits', requireAuth, (req, res) => {
  try {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Habit title required' });
    }
    
    const habit = createHabit(req.session.userId, title.trim());
    res.json({ habit });
  } catch (error) {
    console.error('Create habit error:', error);
    res.status(500).json({ error: 'Failed to create habit' });
  }
});

app.post('/api/habits/:id/checkin', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.body;
    
    const checkDate = date || new Date().toISOString().slice(0, 10);
    const result = createHabitCheckin(id, checkDate);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Checkin failed' });
    }
    
    res.json({ success: true, date: checkDate });
  } catch (error) {
    console.error('Checkin error:', error);
    res.status(500).json({ error: 'Failed to check in' });
  }
});

app.delete('/api/habits/:id/checkin', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.body;
    
    const checkDate = date || new Date().toISOString().slice(0, 10);
    deleteHabitCheckin(id, checkDate);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete checkin error:', error);
    res.status(500).json({ error: 'Failed to delete checkin' });
  }
});

// === СТАТИЧЕСКИЕ ФАЙЛЫ И ЗАПУСК ===
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📁 Database: ${DB_PATH}`);
  console.log(`🤖 AI Features: ${process.env.USE_OPENAI === 'true' ? 'OpenAI' : process.env.USE_HF === 'true' ? 'HuggingFace' : 'Heuristic'}`);
});