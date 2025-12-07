require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { decomposeGoal } = require('./services/goalDecomposer');
const {
  db,
  createUser,
  findUserByEmail,
  findUserById,
  insertGoalSessionWithSubgoals,
  getGoalHistoryForUser
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    }
  })
);

app.use(express.static(path.join(__dirname, '..', 'public')));

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    created_at: user.created_at
  };
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!normalizedEmail || !password || typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: 'Email and password are required. Password must be at least 4 characters.' });
    }

    const existing = findUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = createUser(normalizedEmail, passwordHash);
    req.session.userId = user.id;

    const fullUser = findUserById(user.id);
    return res.json({ user: sanitizeUser(fullUser) });
  } catch (error) {
    console.error('Error in /api/auth/register:', error);
    return res.status(500).json({ error: 'Failed to register user.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!normalizedEmail || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = findUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    req.session.userId = user.id;
    return res.json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error('Error in /api/auth/login:', error);
    return res.status(500).json({ error: 'Failed to login.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  if (!req.session) {
    return res.json({ success: true });
  }
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.json({ user: null });
  }
  const user = findUserById(req.session.userId);
  return res.json({ user: sanitizeUser(user) });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

// Валидация ISO 8601 даты (упрощённо)
function isValidISODate(str) {
  if (!str) return true;
  const date = new Date(str);
  return !isNaN(date.getTime()) && str === date.toISOString();
}

app.patch('/api/subgoals/:id', async (req, res) => {
  console.log('📥 PATCH /api/subgoals/:id — входящий запрос');
  console.log('  User ID from session:', req.session?.userId);
  console.log('  Subgoal ID:', req.params.id);
  console.log('  Request body:', req.body);

  if (!req.session?.userId) {
    console.log('  ❌ Отклонено: пользователь не авторизован');
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const { id } = req.params;
  const { title, deadline } = req.body;

  if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
    console.log('  ❌ Отклонено: некорректный title');
    return res.status(400).json({ error: 'Title must be a non-empty string.' });
  }

  if (deadline !== undefined && !isValidISODate(deadline)) {
    console.log('  ❌ Отклонено: некорректный deadline');
    return res.status(400).json({ error: 'Deadline must be a valid ISO 8601 datetime or null.' });
  }

  const subgoal = db
    .prepare(`
      SELECT s.id, gs.user_id
      FROM subgoals s
      JOIN goal_sessions gs ON s.goal_session_id = gs.id
      WHERE s.id = ? AND (gs.user_id = ? OR gs.user_id IS NULL)
    `)
    .get(id, req.session.userId);

  if (!subgoal) {
    console.log('  ❌ Отклонено: подзадача не найдена или доступ запрещён');
    return res.status(404).json({ error: 'Subgoal not found or access denied.' });
  }

  console.log('  ✅ Найдена подзадача, обновляем...');
  const stmt = db.prepare(`
    UPDATE subgoals
    SET title = COALESCE(?, title),
        deadline = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const updatedTitle = title?.trim() ?? null;
  const result = stmt.run(updatedTitle, deadline || null, id);

  console.log('  ✅ Обновлено строк:', result.changes);

  const updated = db
    .prepare('SELECT id, goal_session_id, title, deadline, is_completed, created_at, updated_at FROM subgoals WHERE id = ?')
    .get(id);

  console.log('  📤 Отправляем обновлённую подзадачу:', updated);
  return res.json({ subgoal: updated });
});

// === ОБНОВЛЁННЫЙ РОУТ: декомпозиция ===
app.post('/api/goals/decompose', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }

    const { goal } = req.body || {};
    if (!goal || typeof goal !== 'string' || !goal.trim()) {
      return res.status(400).json({ error: 'Goal is required and must be a non-empty string.' });
    }

    const trimmedGoal = goal.trim();
    const result = await decomposeGoal(trimmedGoal);

    if (!Array.isArray(result.subgoals) || result.subgoals.length === 0) {
      return res.status(400).json({ error: 'No subgoals generated.' });
    }

    const { sessionId, subgoals } = insertGoalSessionWithSubgoals(
      req.session.userId,
      trimmedGoal,
      result.subgoals,
      result.meta
    );

    return res.json({
      id: sessionId,
      goal: trimmedGoal,
      subgoals,
      meta: result.meta
    });
  } catch (error) {
    console.error('Error in /api/goals/decompose:', error);
    return res.status(500).json({ error: 'Unexpected server error.' });
  }
});

// === ОБНОВЛЁННЫЙ РОУТ: история ===
app.get('/api/goals/history', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  try {
    const history = getGoalHistoryForUser(req.session.userId, 50);
    return res.json({ history });
  } catch (error) {
    console.error('Error in /api/goals/history:', error);
    return res.status(500).json({ error: 'Failed to load history.' });
  }
});