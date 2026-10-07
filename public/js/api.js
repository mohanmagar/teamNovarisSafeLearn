// ============================================================
// SafeLearn — API client (Client Layer -> Application Layer)
// Thin fetch() wrapper. The auth token is kept in localStorage
// as `sl_token`; every authenticated call sends it as a Bearer
// header. (A production build would move this to an httpOnly
// cookie set by the server — noted in the B4 security report.)
// ============================================================

const API_BASE = ''; // same-origin: the Node server serves both the API and these static files

const SafeLearnAPI = (() => {
  function getToken() {
    return localStorage.getItem('sl_token');
  }
  function setToken(token) {
    if (token) localStorage.setItem('sl_token', token);
    else localStorage.removeItem('sl_token');
  }

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(API_BASE + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (networkErr) {
      throw new Error('Could not reach the SafeLearn server. Is `node server.js` running?');
    }

    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await res.json().catch(() => ({})) : await res.text();

    if (!res.ok) {
      const message = (data && data.error) || `Request failed (${res.status})`;
      throw new Error(message);
    }
    return data;
  }

  return {
    getToken, setToken,
    register: (payload) => request('POST', '/api/auth/register', payload),
    login: (payload) => request('POST', '/api/auth/login', payload),
    logout: () => request('POST', '/api/auth/logout'),
    me: () => request('GET', '/api/auth/me'),
    getProgress: () => request('GET', '/api/progress'),
    completeModule: (moduleId, extra = {}) => request('POST', '/api/progress', { moduleId, ...extra }),
    getLeaderboard: () => request('GET', '/api/leaderboard'),
    submitIncident: (payload) => request('POST', '/api/incidents', payload),
    getIncidents: () => request('GET', '/api/incidents'),
    updateIncidentStatus: (id, status) => request('PATCH', `/api/incidents/${id}`, { status }),
    getAdminUsers: () => request('GET', '/api/admin/users'),
    adminCreateUser: (payload) => request('POST', '/api/admin/users', payload),
    deleteAdminUser: (id) => request('DELETE', `/api/admin/users/${id}`),
    adminUpdateUser: (id, data) => request('PATCH', `/api/admin/users/${id}`, data),
    getAdminStats: () => request('GET', '/api/admin/stats')
  };
})();
