// ============================================================
// SafeLearn — Client application logic
// Talks to the real backend (see js/api.js + server/server.js).
// A small localStorage cache (`sl_user`) is kept purely so nav
// bars can render a name/avatar instantly without waiting on a
// network round trip — it is never treated as the source of
// truth for access control. checkAuth() always re-verifies the
// session token against the server before granting access.
// ============================================================

// ---- Training module catalogue (rendering data; XP values are also enforced server-side) ----
const MODULES = [
  {
    id: 'hazard',
    title: 'Hazard Perception in the Warehouse',
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    description: 'Identify and respond to workplace hazards before incidents occur.',
    duration: '15 min', difficulty: 'Foundation', color: '#FF6B00', xpReward: 100
  },
  {
    id: 'manual',
    title: 'Manual Handling & Ergonomic Safety',
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 0l-3 3m3-3l3 3m-3 5v8m-4-4h8"></path></svg>',
    description: 'Safe lifting, carrying, and ergonomic practices to prevent injury.',
    duration: '12 min', difficulty: 'Foundation', color: '#3FB950', xpReward: 100
  },
  {
    id: 'unsafe',
    title: 'Unsafe Acts & Near-Miss Reporting',
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    description: 'Recognise unsafe behaviours and report near-misses to prevent accidents.',
    duration: '18 min', difficulty: 'Intermediate', color: '#E3B341', xpReward: 150
  },
  {
    id: 'height',
    title: 'Working at Height — Racking & Mezzanine',
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v20m12-20v20M6 6h12m-12 4h12m-12 4h12m-12 4h12"></path></svg>',
    description: 'Safe practices for working on racking systems, mezzanine floors, and elevated areas.',
    duration: '20 min', difficulty: 'Advanced', color: '#F85149', xpReward: 200
  }
];

// ---- Local session cache (display only — never used to grant access) ----
function cacheUser(user) { try { localStorage.setItem('sl_user', JSON.stringify(user)); } catch {} }
function getCurrentUser() {
  try { const raw = localStorage.getItem('sl_user'); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function clearSession() {
  localStorage.removeItem('sl_user');
  SafeLearnAPI.setToken(null);
}
function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : (parts[0] || '?').slice(0, 2).toUpperCase();
}

// ---- Auth actions (real API calls; passwords are hashed server-side, never compared in plain text) ----
async function registerUser(name, email, dept, password, role = 'employee') {
  try {
    const data = await SafeLearnAPI.register({ name, email, password, department: dept, role });
    SafeLearnAPI.setToken(data.token);
    cacheUser(data.user);
    return { success: true, user: data.user };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function authenticateUser(email, password, role) {
  try {
    const data = await SafeLearnAPI.login({ email, password, role });
    SafeLearnAPI.setToken(data.token);
    cacheUser(data.user);
    return data.user;
  } catch (err) {
    return null;
  }
}

async function logout() {
  try { await SafeLearnAPI.logout(); } catch {}
  clearSession();
  window.location.href = 'index.html';
}

// Verifies the session TOKEN against the server on every protected page —
// editing localStorage by hand can no longer fake a login, unlike a
// purely client-side check.
async function checkAuth(requireAdmin = false) {
  if (!SafeLearnAPI.getToken()) { window.location.href = 'index.html'; return null; }
  try {
    const data = await SafeLearnAPI.me();
    cacheUser(data.user);
    if (requireAdmin && data.user.role !== 'admin') { window.location.href = 'dashboard.html'; return null; }
    if (!requireAdmin && data.user.role === 'admin' && document.body.dataset.employeeOnly) { window.location.href = 'admin.html'; return null; }
    return data.user;
  } catch (err) {
    clearSession();
    window.location.href = 'index.html';
    return null;
  }
}

function calculateRank(xp) {
  if (xp >= 900) return 'Expert';
  if (xp >= 500) return 'Advanced';
  if (xp >= 200) return 'Certified';
  return 'Trainee';
}
function getRankColor(rank) {
  switch (rank) {
    case 'Expert': return 'purple';
    case 'Advanced': return 'blue';
    case 'Certified': return 'green';
    default: return 'grey';
  }
}

// ---- Progress / XP ----
async function completeModuleOnServer(moduleId, extra = {}) {
  const data = await SafeLearnAPI.completeModule(moduleId, extra);
  const user = getCurrentUser();
  if (user && data && typeof data.xp === 'number') { user.xp = data.xp; cacheUser(user); }
  return data; // { xp, awarded, streakBonus, compBonus, rank, modulesCompleted }
}

// ---- Incidents ----
async function submitIncidentReport(payload) {
  const data = await SafeLearnAPI.submitIncident(payload);
  return data.incident;
}

// ---- Utilities ----
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message; // innerText, never innerHTML — avoids reflecting unescaped input
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function getStreakBonus(streakCount) {
  return Math.min(streakCount * 5, 25);
}

function generateCertId() {
  return 'NSL-' + Math.random().toString(16).slice(2, 6).toUpperCase() + '-' + Math.random().toString(16).slice(2, 6).toUpperCase();
}

function formatDate(date) {
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  return new Date(date).toLocaleDateString('en-GB', options);
}

// Escapes text before it is ever inserted as HTML (defends against the
// stored-XSS risk of rendering free-text fields like incident descriptions).
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// ---- Populate nav bars from the cached session (fast) ----
document.addEventListener('DOMContentLoaded', () => {
  const user = getCurrentUser();
  if (user) {
    if (document.getElementById('user-avatar')) document.getElementById('user-avatar').innerText = initials(user.name);
    if (document.getElementById('user-name')) document.getElementById('user-name').innerText = user.name;
    if (document.getElementById('nav-user-name')) document.getElementById('nav-user-name').innerText = user.name;
    if (document.getElementById('user-xp')) document.getElementById('user-xp').innerText = `${user.xp || 0} XP`;
  }
});
