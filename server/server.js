// ============================================================
// SafeLearn — Application server (Task B1/B6: real 3-tier system)
//
//   Client Layer  -> public/ (browser: HTML/CSS/JS)
//   Application Layer -> this file (Node.js HTTP API)
//   Data Layer    -> server/data/safelearn.db (SQLite)
//
// Deliberately dependency-free (Node core only: http, node:sqlite,
// crypto). No internet connection or `npm install` step is needed
// to run this, which keeps a live client demo low-risk.
//
// Run:  node server.js          then open http://localhost:3000
// ============================================================
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const { db } = require('./db');
const { hashPassword, verifyPassword, createToken, newExpiry } = require('./auth');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// ---- Canonical module + activity catalogue (mirrors public/js/app.js MODULES) ----
// XP amounts live only here so the client can never award itself arbitrary XP.
const TRAINING_MODULE_IDS = ['hazard', 'manual', 'unsafe', 'height'];
const MODULE_XP = {
  hazard: 100, manual: 100, unsafe: 150, height: 200,
  // Mini-games (Task B6 interactive activities) — one XP award per game, matching
  // "best result is retained" behaviour from the original prototype.
  game1_hazardhunt: 150, game2_safeorunsafe: 100, game3_beattheclock: 120, game4_scenario: 200
};

// ---------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------
function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    ...headers
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) req.destroy(); // guard against oversized payloads
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function currentUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return db.prepare('SELECT id, name, email, department, role, xp FROM users WHERE id = ?').get(session.user_id);
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, department: u.department, role: u.role, xp: u.xp };
}

function moduleCount(userId) {
  return db.prepare('SELECT COUNT(*) AS c FROM progress WHERE user_id = ?').get(userId).c;
}

function rankFor(xp) {
  if (xp >= 900) return 'Expert';
  if (xp >= 500) return 'Advanced';
  if (xp >= 200) return 'Certified';
  return 'Trainee';
}

function validateStrongPassword(password) {
  if (!password || typeof password !== 'string') {
    return 'Password is required.';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter (A-Z).';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter (a-z).';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number (0-9).';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must contain at least one special symbol (e.g. !@#$%^&*).';
  }
  return null;
}

// ---------------------------------------------------------------
// API route handlers
// ---------------------------------------------------------------
const routes = [];
function route(method, pattern, handler) { routes.push({ method, pattern, handler }); }

// -- Auth --
route('POST', '/api/auth/register', async (req, res) => {
  const body = await readJsonBody(req);
  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const department = (body.department || 'Unassigned').trim();
  const password = body.password || '';
  const role = body.role === 'admin' ? 'admin' : 'employee';

  if (!name || !email) {
    return send(res, 400, { error: 'Name and work email are required.' });
  }
  const pwdErr = validateStrongPassword(password);
  if (pwdErr) {
    return send(res, 400, { error: pwdErr });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return send(res, 409, { error: 'This email is already registered. Please sign in instead.' });
  }

  const { salt, hash } = hashPassword(password);
  const info = db.prepare(`
    INSERT INTO users (name, email, department, role, password_hash, password_salt, xp)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(name, email, department, role, hash, salt);

  const user = db.prepare('SELECT id, name, email, department, role, xp FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = createToken();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, newExpiry());

  send(res, 201, { token, user: publicUser(user) });
});

route('POST', '/api/auth/login', async (req, res) => {
  const body = await readJsonBody(req);
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  const wantRole = body.role; // optional: 'admin' tab vs 'employee' tab on the login screen

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    return send(res, 401, { error: 'Incorrect email or password.' });
  }
  if (wantRole && user.role !== wantRole) {
    return send(res, 403, { error: `That account is not registered as ${wantRole}.` });
  }

  const token = createToken();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, newExpiry());
  send(res, 200, { token, user: publicUser(user) });
});

route('POST', '/api/auth/logout', async (req, res) => {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  send(res, 200, { success: true });
});

route('GET', '/api/auth/me', async (req, res) => {
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'Not signed in.' });
  send(res, 200, { user: { ...publicUser(user), rank: rankFor(user.xp), modulesCompleted: moduleCount(user.id) } });
});

// -- Progress / XP --
route('GET', '/api/progress', async (req, res) => {
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'Not signed in.' });
  const rows = db.prepare('SELECT module_id, xp_awarded, completed_at FROM progress WHERE user_id = ?').all(user.id);
  send(res, 200, { completed: rows.map(r => r.module_id), xp: user.xp, rank: rankFor(user.xp) });
});

route('POST', '/api/progress', async (req, res) => {
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'Not signed in.' });
  const body = await readJsonBody(req);
  const moduleId = body.moduleId;
  if (!moduleId || !(moduleId in MODULE_XP)) return send(res, 400, { error: 'Unknown module.' });

  // Optional bonuses (validated and capped server-side)
  const streakBonus = Math.min(Math.max(0, parseInt(body.streakBonus, 10) || 0), 25);
  const compBonus   = Math.min(Math.max(0, parseInt(body.compBonus, 10) || 0), 25);
  const totalAward  = MODULE_XP[moduleId] + streakBonus + compBonus;

  const already = db.prepare('SELECT id, xp_awarded FROM progress WHERE user_id = ? AND module_id = ?').get(user.id, moduleId);
  if (!already) {
    db.prepare('INSERT INTO progress (user_id, module_id, xp_awarded) VALUES (?, ?, ?)').run(user.id, moduleId, totalAward);
    db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(totalAward, user.id);
  } else if (totalAward > already.xp_awarded) {
    const delta = totalAward - already.xp_awarded;
    db.prepare('UPDATE progress SET xp_awarded = ?, completed_at = datetime(\'now\') WHERE id = ?').run(totalAward, already.id);
    db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(delta, user.id);
  }
  const fresh = db.prepare('SELECT xp FROM users WHERE id = ?').get(user.id);
  send(res, 200, {
    xp: fresh.xp,
    awarded: totalAward,
    streakBonus,
    compBonus,
    rank: rankFor(fresh.xp),
    modulesCompleted: moduleCount(user.id)
  });
});

// -- Leaderboard (public within the org — no auth required to view) --
route('GET', '/api/leaderboard', async (req, res) => {
  const users = db.prepare(`
    SELECT id, name, department, xp FROM users WHERE role = 'employee' ORDER BY xp DESC LIMIT 20
  `).all();
  const board = users.map((u, i) => ({
    rank: i + 1,
    id: u.id,
    name: u.name,
    department: u.department,
    xp: u.xp,
    modulesCompleted: moduleCount(u.id),
    badge: rankFor(u.xp)
  }));
  send(res, 200, { leaderboard: board });
});

// -- Incidents --
route('POST', '/api/incidents', async (req, res) => {
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'Not signed in.' });
  const body = await readJsonBody(req);
  const location = (body.location || '').trim();
  const description = (body.description || '').trim();
  const category = (body.category || 'Near Miss (Avoided Incident)').trim();
  const severity = ['Low', 'Medium', 'High'].includes(body.severity) ? body.severity : 'Medium';
  const actionTaken = (body.actionTaken || '').trim() || null;
  const incidentAt = (body.incidentAt || '').trim() || null;
  if (!location || !description) return send(res, 400, { error: 'Location and description are required.' });

  const id = 'INC-' + String(Date.now()).slice(-6);
  db.prepare(`
    INSERT INTO incidents (id, user_id, reporter, department, location, category, severity, description, action_taken, incident_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Reported')
  `).run(id, user.id, user.name, user.department, location, category, severity, description, actionTaken, incidentAt);

  const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
  send(res, 201, { incident });
});

route('GET', '/api/incidents', async (req, res) => {
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'Not signed in.' });
  const rows = user.role === 'admin'
    ? db.prepare('SELECT * FROM incidents ORDER BY created_at DESC').all()
    : db.prepare('SELECT * FROM incidents WHERE user_id = ? ORDER BY created_at DESC').all(user.id);
  send(res, 200, { incidents: rows });
});

route('PATCH', '/api/incidents/:id', async (req, res, params) => {
  const user = currentUser(req);
  if (!user || user.role !== 'admin') return send(res, 403, { error: 'Admin access required.' });
  const body = await readJsonBody(req);
  const status = body.status;
  if (!['Reported', 'Under Review', 'Resolved'].includes(status)) return send(res, 400, { error: 'Invalid status.' });
  const info = db.prepare('UPDATE incidents SET status = ? WHERE id = ?').run(status, params.id);
  if (info.changes === 0) return send(res, 404, { error: 'Incident not found.' });
  send(res, 200, { success: true });
});

// -- Admin: staff management --
route('GET', '/api/admin/users', async (req, res) => {
  const user = currentUser(req);
  if (!user || user.role !== 'admin') return send(res, 403, { error: 'Admin access required.' });
  const rows = db.prepare(`SELECT id, name, email, department, role, xp, created_at FROM users ORDER BY name`).all();
  const withProgress = rows.map(u => ({
    ...u,
    rank: rankFor(u.xp),
    completedModules: db.prepare('SELECT module_id FROM progress WHERE user_id = ?').all(u.id).map(r => r.module_id)
  }));
  send(res, 200, { users: withProgress });
});

route('POST', '/api/admin/users', async (req, res) => {
  const admin = currentUser(req);
  if (!admin || admin.role !== 'admin') return send(res, 403, { error: 'Admin access required.' });
  const body = await readJsonBody(req);
  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const department = (body.department || 'Unassigned').trim();
  const password = body.password || '';
  const role = body.role === 'admin' ? 'admin' : 'employee';

  if (!name || !email) {
    return send(res, 400, { error: 'Name and a work email are required.' });
  }
  const pwdErr = validateStrongPassword(password);
  if (pwdErr) {
    return send(res, 400, { error: pwdErr });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return send(res, 409, { error: 'This email is already registered.' });

  const { salt, hash } = hashPassword(password);
  const info = db.prepare(`
    INSERT INTO users (name, email, department, role, password_hash, password_salt, xp)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(name, email, department, role, hash, salt);

  const user = db.prepare('SELECT id, name, email, department, role, xp FROM users WHERE id = ?').get(info.lastInsertRowid);
  send(res, 201, { user: { ...publicUser(user), rank: rankFor(0), completedModules: [] } });
});

route('DELETE', '/api/admin/users/:id', async (req, res, params) => {
  const user = currentUser(req);
  if (!user || user.role !== 'admin') return send(res, 403, { error: 'Admin access required.' });
  const target = db.prepare('SELECT role FROM users WHERE id = ?').get(params.id);
  if (!target) return send(res, 404, { error: 'User not found.' });
  if (target.role === 'admin') return send(res, 400, { error: 'Admin accounts cannot be deleted from this panel.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(params.id);
  send(res, 200, { success: true });
});

route('PATCH', '/api/admin/users/:id', async (req, res, params) => {
  const admin = currentUser(req);
  if (!admin || admin.role !== 'admin') return send(res, 403, { error: 'Admin access required.' });
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(params.id);
  if (!target) return send(res, 404, { error: 'User not found.' });
  if (target.role === 'admin') return send(res, 400, { error: 'Admin accounts cannot be edited from this panel.' });

  const body = await readJsonBody(req);
  const name       = (body.name       || target.name).trim();
  const department = (body.department || target.department || 'Unassigned').trim();
  const email      = (body.email      || target.email).trim().toLowerCase();

  // Check email uniqueness only if it changed
  if (email !== target.email) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, params.id);
    if (existing) return send(res, 409, { error: 'That email is already in use by another account.' });
  }

  if (body.password) {
    const pwdErr = validateStrongPassword(body.password);
    if (pwdErr) {
      return send(res, 400, { error: pwdErr });
    }
    const { salt, hash } = hashPassword(body.password);
    db.prepare('UPDATE users SET name=?, department=?, email=?, password_hash=?, password_salt=? WHERE id=?')
      .run(name, department, email, hash, salt, params.id);
  } else {
    db.prepare('UPDATE users SET name=?, department=?, email=? WHERE id=?')
      .run(name, department, email, params.id);
  }

  const updated = db.prepare('SELECT id, name, email, department, role, xp FROM users WHERE id = ?').get(params.id);
  send(res, 200, { user: { ...publicUser(updated), rank: rankFor(updated.xp) } });
});

route('GET', '/api/admin/stats', async (req, res) => {
  const user = currentUser(req);
  if (!user || user.role !== 'admin') return send(res, 403, { error: 'Admin access required.' });

  const totalStaff = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'employee'`).get().c;
  const employees = db.prepare(`SELECT id, xp FROM users WHERE role = 'employee'`).all();
  const totalModules = TRAINING_MODULE_IDS.length;
  const fullyCertified = employees.filter(e => {
    const done = db.prepare('SELECT module_id FROM progress WHERE user_id = ?').all(e.id).map(r => r.module_id);
    return TRAINING_MODULE_IDS.every(id => done.includes(id));
  }).length;
  const incidentCount = db.prepare('SELECT COUNT(*) AS c FROM incidents').get().c;
  const underReview = db.prepare(`SELECT COUNT(*) AS c FROM incidents WHERE status != 'Resolved'`).get().c;

  const topicRows = db.prepare(`
    SELECT module_id, COUNT(*) AS c FROM progress GROUP BY module_id
  `).all();
  const topicCompletion = {};
  for (const id of TRAINING_MODULE_IDS) {
    const row = topicRows.find(r => r.module_id === id);
    topicCompletion[id] = totalStaff ? Math.round(((row ? row.c : 0) / totalStaff) * 100) : 0;
  }

  send(res, 200, {
    totalStaff,
    fullyCertified,
    fullyCertifiedPct: totalStaff ? Math.round((fullyCertified / totalStaff) * 100) : 0,
    incidentCount,
    underReview,
    topicCompletion
  });
});

// ---------------------------------------------------------------
// Static file serving (Client Layer)
// ---------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, decodeURIComponent(pathname));
  if (pathname === '/') filePath = path.join(PUBLIC_DIR, 'index.html');
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');

  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------------------------------------------------------
// Router
// ---------------------------------------------------------------
function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const parts = r.pattern.split('/');
    const given = pathname.split('/');
    if (parts.length !== given.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(':')) params[parts[i].slice(1)] = given[i];
      else if (parts[i] !== given[i]) { ok = false; break; }
    }
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    return send(res, 204, '', {
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    });
  }

  if (url.pathname.startsWith('/api/')) {
    const matched = matchRoute(req.method, url.pathname);
    if (!matched) return send(res, 404, { error: 'Not found' });
    try {
      await matched.handler(req, res, matched.params);
    } catch (err) {
      console.error(err);
      send(res, 500, { error: 'Server error', detail: String(err.message || err) });
    }
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`SafeLearn server running at http://localhost:${PORT}`);
  console.log(`Database file: ${path.join(__dirname, 'data', 'safelearn.db')}`);
});
