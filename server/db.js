// ============================================================
// SafeLearn — Data Layer (Task B1 / B6: real server-side database)
// Uses Node.js's built-in `node:sqlite` module — no external
// dependency install is required, which keeps the demo reliable
// on any machine with Node 22+.
// ============================================================
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./auth');

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'safelearn.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    department      TEXT NOT NULL DEFAULT 'Unassigned',
    role            TEXT NOT NULL DEFAULT 'employee', -- 'employee' | 'admin'
    password_hash   TEXT NOT NULL,
    password_salt   TEXT NOT NULL,
    xp              INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS progress (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_id    TEXT NOT NULL,
    xp_awarded   INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, module_id)
  );

  CREATE TABLE IF NOT EXISTS incidents (
    id           TEXT PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reporter     TEXT NOT NULL,
    department   TEXT,
    location     TEXT NOT NULL,
    category     TEXT NOT NULL,
    severity     TEXT NOT NULL DEFAULT 'Medium',
    description  TEXT NOT NULL,
    action_taken TEXT,
    incident_at  TEXT,
    status       TEXT NOT NULL DEFAULT 'Reported',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ---- Seed demo accounts + sample incidents on first run only ----
function seedIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (count > 0) return;

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, department, role, password_hash, password_salt, xp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const demoAccounts = [
    { name: 'Ram Sharma',    email: 'ram@novaris.com',   department: 'Loading Bay',  role: 'employee', password: 'staff123', xp: 0 },
    { name: 'Sarah Johnson', email: 'sarah@novaris.com', department: 'Racking Zone', role: 'employee', password: 'staff123', xp: 0 },
    { name: 'Mike Williams', email: 'mike@novaris.com',  department: 'Forklift Ops', role: 'employee', password: 'staff123', xp: 0 },
    { name: 'Emma Brown',    email: 'emma@novaris.com',  department: 'Dispatch',     role: 'employee', password: 'staff123', xp: 0 },
    { name: 'Admin User',    email: 'admin@novaris.com', department: 'Management',  role: 'admin',    password: 'admin123', xp: 0 }
  ];

  for (const acc of demoAccounts) {
    const { salt, hash } = hashPassword(acc.password);
    insertUser.run(acc.name, acc.email, acc.department, acc.role, hash, salt, acc.xp);
  }

  const insertIncident = db.prepare(`
    INSERT INTO incidents (id, user_id, reporter, department, location, category, severity, description, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertIncident.run('INC-0039', 3, 'Mike Williams', 'Forklift Ops', 'Dispatch Zone', 'Injury', 'Medium',
    'Operative suffered lumbar twinge attempting to lift 28kg unsecured tote box solo.', 'Reported', '2026-08-20T11:15:00.000Z');
  insertIncident.run('INC-0040', 2, 'Sarah Johnson', 'Racking Zone', 'Racking Zone C', 'Hazard Spotted', 'High',
    'Vertical upright column on aisle 4 beam showing 15mm deflection following pallet impact.', 'Resolved', '2026-08-21T14:20:00.000Z');
  insertIncident.run('INC-0041', 1, 'Ram Sharma', 'Loading Bay', 'Loading Bay A', 'Near-Miss', 'Medium',
    'Wet floor near bay 3 with no caution sign placed after floor cleaning cycle. Forklift tyre slipped slightly.', 'Under Review', '2026-08-22T09:35:00.000Z');
}

seedIfEmpty();

module.exports = { db };
