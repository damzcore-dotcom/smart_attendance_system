const API_BASE = import.meta.env.VITE_API_URL || 'https://smart-attendance-api.onrender.com/api';

/**
 * Smart Attendance Pro - API Service
 * Handles all HTTP requests with JWT token management
 */

// ─── Token Management ────────────────────────────

const getAccessToken = () => localStorage.getItem('accessToken');
const getRefreshToken = () => localStorage.getItem('refreshToken');

const setTokens = (accessToken, refreshToken) => {
  localStorage.setItem('accessToken', accessToken);
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
};

const clearTokens = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
};

const getStoredUser = () => {
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
};

const setStoredUser = (user) => {
  localStorage.setItem('user', JSON.stringify(user));
};

// ─── Core Fetch Wrapper ──────────────────────────

const apiFetch = async (endpoint, options = {}) => {
  const url = `${API_BASE}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };

  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(url, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${getAccessToken()}`;
      res = await fetch(url, { ...options, headers });
    } else {
      clearTokens();
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'API Error');
  return data;
};

const refreshAccessToken = async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
};

// ─── Auth API ────────────────────────────────────

export const authAPI = {
  login: async (username, password) => {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setTokens(data.accessToken, data.refreshToken);
    setStoredUser(data.user);
    return data;
  },

  verifyFace: async (imageSrc) => {
    const data = await apiFetch('/auth/verify-face', {
      method: 'POST',
      body: JSON.stringify({ image: imageSrc }),
    });
    setTokens(data.accessToken, data.refreshToken);
    setStoredUser(data.user);
    return data;
  },

  getMe: () => apiFetch('/auth/me'),

  logout: async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    clearTokens();
  },

  getStoredUser,
  isLoggedIn: () => !!getAccessToken(),
};

// ─── Employee API ────────────────────────────────

export const employeeAPI = {
  getAll: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/employees${q ? `?${q}` : ''}`);
  },
  getById: (id) => apiFetch(`/employees/${id}`),
  create: (data) => apiFetch('/employees', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiFetch(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => apiFetch(`/employees/${id}`, { method: 'DELETE' }),
  importExcel: async (file, jobId) => {
    const formData = new FormData();
    formData.append('file', file);
    
    // We can't use standard apiFetch because it forces Content-Type: application/json
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`/api/employees/import?jobId=${jobId || ''}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'API Error');
    return data;
  },
  getImportProgress: async (jobId) => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`/api/employees/import-progress?jobId=${jobId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return await res.json();
  },
  getMasterOptions: async () => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch('/api/employees/master-options', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    return data;
  }
};

// ─── Attendance API ──────────────────────────────

export const attendanceAPI = {
  getAll: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/attendance${q ? `?${q}` : ''}`);
  },
  checkIn: (employeeId, mode) => apiFetch('/attendance/check-in', { method: 'POST', body: JSON.stringify({ employeeId, mode }) }),
  checkOut: (employeeId) => apiFetch('/attendance/check-out', { method: 'POST', body: JSON.stringify({ employeeId }) }),
  getSummary: () => apiFetch('/attendance/summary'),
  getHistory: (empId, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/attendance/history/${empId}${q ? `?${q}` : ''}`);
  },
};

// ─── Dashboard API ───────────────────────────────

export const dashboardAPI = {
  getStats: () => apiFetch('/dashboard/stats'),
  getWeeklyTrends: () => apiFetch('/dashboard/weekly-trends'),
  getDeptLateness: () => apiFetch('/dashboard/dept-lateness'),
  getRecentLate: () => apiFetch('/dashboard/recent-late'),
};

// ─── Settings API ────────────────────────────────

export const settingsAPI = {
  getAll: () => apiFetch('/settings'),
  update: (data) => apiFetch('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  getLocations: () => apiFetch('/settings/locations'),
  createLocation: (data) => apiFetch('/settings/locations', { method: 'POST', body: JSON.stringify(data) }),
  updateLocation: (id, data) => apiFetch(`/settings/locations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLocation: (id) => apiFetch(`/settings/locations/${id}`, { method: 'DELETE' }),
};

// ─── Users API ───────────────────────────────────

export const userAPI = {
  getAll: () => apiFetch('/users'),
  update: (id, data) => apiFetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => apiFetch(`/users/${id}`, { method: 'DELETE' }),
};

// ─── Correction API ──────────────────────────────

export const correctionAPI = {
  create: (data) => apiFetch('/corrections', { method: 'POST', body: JSON.stringify(data) }),
  getAll: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/corrections${q ? `?${q}` : ''}`);
  },
  review: (id, data) => apiFetch(`/corrections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// ─── Schedule API ────────────────────────────────

export const scheduleAPI = {
  getAll: () => apiFetch('/shifts'),
  create: (data) => apiFetch('/shifts', { method: 'POST', body: JSON.stringify(data) }),
  getEmployeeShift: (empId) => apiFetch(`/shifts/employee/${empId}`),
};

// ─── Notification API ────────────────────────────

export const notificationAPI = {
  getByEmployee: (empId) => apiFetch(`/notifications/${empId}`),
  markAsRead: (id) => apiFetch(`/notifications/${id}/read`, { method: 'PUT' }),
};
