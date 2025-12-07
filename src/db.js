const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'goals.db');

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

CREATE TABLE IF NOT EXISTS goal_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  goal TEXT NOT NULL,
  meta_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS subgoals (
  id TEXT PRIMARY KEY,
  goal_session_id TEXT NOT NULL,
  title TEXT NOT NULL,
  original_title TEXT,
  deadline TEXT,
  is_completed BOOLEAN DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (goal_session_id) REFERENCES goal_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subgoals_session ON subgoals(goal_session_id);
`);

// === ФУНКЦИИ ===
function createUser(email, passwordHash) {
  const id = randomUUID();
  const stmt = db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)');
  stmt.run(id, email, passwordHash);
  return { id, email };
}

function findUserByEmail(email) {
  return db.prepare('SELECT id, email, password_hash, created_at FROM users WHERE email = ?').get(email);
}

function findUserById(id) {
  return db.prepare('SELECT id, email, password_hash, created_at FROM users WHERE id = ?').get(id);
}

function insertGoalSessionWithSubgoals(userId, goal, rawSubgoals, meta) {
  const sessionId = randomUUID();
  const sessionStmt = db.prepare(`
    INSERT INTO goal_sessions (id, user_id, goal, meta_json)
    VALUES (?, ?, ?, ?)
  `);
  sessionStmt.run(sessionId, userId || null, goal, JSON.stringify(meta));

  const subgoalStmt = db.prepare(`
    INSERT INTO subgoals (id, goal_session_id, title, original_title)
    VALUES (?, ?, ?, ?)
  `);

  const subgoalRecords = [];
  for (const title of rawSubgoals) {
    const id = randomUUID();
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) continue;

    subgoalStmt.run(id, sessionId, cleanTitle, cleanTitle);
    subgoalRecords.push({
      id,
      title: cleanTitle,
      deadline: null,
      is_completed: false,
      created_at: new Date().toISOString()
    });
  }

  return { sessionId, subgoals: subgoalRecords };
}

function getGoalHistoryForUser(userId, limit = 50) {
  const rows = db
    .prepare(`
      SELECT id, goal, meta_json, created_at
      FROM goal_sessions
      WHERE user_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT ?
    `)
    .all(userId, limit);

  return rows.map(row => {
    let meta = {};
    try { meta = JSON.parse(row.meta_json); } catch (_) {}

    const subgoals = db
      .prepare(`
        SELECT id, title, deadline, is_completed, created_at, updated_at
        FROM subgoals
        WHERE goal_session_id = ?
        ORDER BY created_at ASC
      `)
      .all(row.id);

    return {
      id: row.id,
      goal: row.goal,
      meta,
      created_at: row.created_at,
      subgoals
    };
  });
}

module.exports = {
  db,
  createUser,
  findUserByEmail,
  findUserById,
  insertGoalSessionWithSubgoals,
  getGoalHistoryForUser
};