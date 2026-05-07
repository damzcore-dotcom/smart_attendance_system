const API_BASE = '/api';

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

  // Auto-refresh on 401, but NOT for login requests
  if (res.status === 401 && !endpoint.includes('/auth/login')) {
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

  const contentType = res.headers.get('content-type');
  let data;
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    throw new Error(text || `Server returned ${res.status}`);
  }

  if (!res.ok) throw new Error(data.message || 'API Error');
  return data;
};

let refreshPromise = null;

const refreshAccessToken = async () => {
  // If a refresh is already in progress, return the existing promise
  if (refreshPromise) return refreshPromise;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) throw new Error('Refresh failed');

      const data = await res.json();
      setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch (err) {
      console.error('Session refresh failed:', err.message);
      return false;
    } finally {
      refreshPromise = null; // Reset promise when done
    }
  })();

  return refreshPromise;
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

  verifyFace: async (descriptor) => {
    const data = await apiFetch('/auth/verify-face', {
      method: 'POST',
      body: JSON.stringify({ descriptor }),
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
  checkNikDuplicate: (nik) => apiFetch(`/employees/check-nik?nik=${nik}`),
  getMasterOptions: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/employees/master-options${q ? `?${q}` : ''}`);
  },
  batchUpdateShift: (data) => apiFetch('/employees/batch-shift', { method: 'PUT', body: JSON.stringify(data) }),
};

// ─── Attendance API ──────────────────────────────

export const attendanceAPI = {
  getAll: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/attendance${q ? `?${q}` : ''}`);
  },
  checkIn: (employeeId, mode, lat, lng, accuracy, timestamp) => apiFetch('/attendance/check-in', { method: 'POST', body: JSON.stringify({ employeeId, mode, lat, lng, accuracy, timestamp }) }),
  checkOut: (employeeId) => apiFetch('/attendance/check-out', { method: 'POST', body: JSON.stringify({ employeeId }) }),
  getSummary: () => apiFetch('/attendance/summary'),
  getHistory: (empId, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/attendance/history/${empId}${q ? `?${q}` : ''}`);
  },
  recalculate: (startDate, endDate) => apiFetch('/attendance/recalculate', { method: 'POST', body: JSON.stringify({ startDate, endDate }) }),
  getMasterOptions: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/attendance/master-options${q ? `?${q}` : ''}`);
  },
  importExcel: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`/api/attendance/import`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Import failed');
    return data;
  },
  recalculate: (startDate, endDate) => apiFetch('/attendance/recalculate', { method: 'POST', body: JSON.stringify({ startDate, endDate }) }),
};

// ─── Dashboard API ─────────────────────────────────
export const dashboardAPI = {
  getStats: () => apiFetch('/dashboard/stats'),
  getWeeklyTrends: () => apiFetch('/dashboard/weekly-trends'),
  getDeptLateness: () => apiFetch('/dashboard/dept-lateness'),
  getRecentLate: () => apiFetch('/dashboard/recent-late'),
  getAdminNotifications: () => apiFetch('/dashboard/notifications'),
};

// ─── Settings API ────────────────────────────────

export const settingsAPI = {
  getPublicInfo: () => apiFetch('/settings/public'),
  getAll: () => apiFetch('/settings'),
  update: (data) => apiFetch('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  getLocations: () => apiFetch('/settings/locations'),
  createLocation: (data) => apiFetch('/settings/locations', { method: 'POST', body: JSON.stringify(data) }),
  updateLocation: (id, data) => apiFetch(`/settings/locations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLocation: (id) => apiFetch(`/settings/locations/${id}`, { method: 'DELETE' }),
  getShifts: () => apiFetch('/shifts'),
  createShift: (data) => apiFetch('/shifts', { method: 'POST', body: JSON.stringify(data) }),
  updateShift: (id, data) => apiFetch(`/shifts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteShift: (id) => apiFetch(`/shifts/${id}`, { method: 'DELETE' }),
};

// ─── Users API ───────────────────────────────────

export const userAPI = {
  getAll: () => apiFetch('/users'),
  create: (data) => apiFetch('/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiFetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateBiometrics: (id, data) => apiFetch(`/users/${id}/biometrics`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => apiFetch(`/users/${id}`, { method: 'DELETE' }),
  getPermissions: (id) => apiFetch(`/users/${id}/permissions`),
  updatePermissions: (id, permissions) => apiFetch(`/users/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) }),
  getEmployeeOptions: () => apiFetch('/users/employee-options'),
  getDepartmentOptions: () => apiFetch('/users/department-options'),
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

// ─── Announcement API ────────────────────────────
export const announcementAPI = {
  getAll: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/announcements${q ? `?${q}` : ''}`);
  },
  create: (data) => apiFetch('/announcements', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiFetch(`/announcements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => apiFetch(`/announcements/${id}`, { method: 'DELETE' }),
};

// ─── Leave API ───────────────────────────────────
export const leaveAPI = {
  create: (data) => apiFetch('/leave', { method: 'POST', body: JSON.stringify(data) }),
  getAll: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/leave${q ? `?${q}` : ''}`);
  },
  getByEmployee: (empId) => apiFetch(`/leave/employee/${empId}`),
  review: (id, data) => apiFetch(`/leave/${id}/review`, { method: 'PUT', body: JSON.stringify(data) }),
  massApply: (data) => apiFetch('/leave/mass', { method: 'POST', body: JSON.stringify(data) }),
  getMassLeaves: () => apiFetch('/leave/mass'),
};

// ─── Backup API ──────────────────────────────────
export const backupAPI = {
  export: () => apiFetch('/backup/export'),
  restore: (backup) => apiFetch('/backup/restore', { method: 'POST', body: JSON.stringify({ backup }) }),
};

// ─── Manager API ─────────────────────────────────
export const managerAPI = {
  getDashboard: () => apiFetch('/manager/dashboard'),
  getAttendance: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/manager/attendance${q ? `?${q}` : ''}`);
  },
  getAttendanceOptions: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/manager/attendance-options${q ? `?${q}` : ''}`);
  },
  getLeaveRequests: () => apiFetch('/manager/leave-requests'),
  updateLeaveRequest: (id, status, reviewNote) => apiFetch(`/manager/leave-requests/${id}`, { method: 'PUT', body: JSON.stringify({ status, reviewNote }) }),
};

// ─── Direktur API ─────────────────────────────────
export const direkturAPI = {
  getStats: () => apiFetch('/direktur/stats'),
  getAttendance: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/direktur/attendance${q ? `?${q}` : ''}`);
  },
  getLeave: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/direktur/leave${q ? `?${q}` : ''}`);
  },
  getDepartments: () => apiFetch('/direktur/departments'),
  getAttendanceOptions: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/direktur/attendance-options${q ? `?${q}` : ''}`);
  },
};

// ─── Default API helper (axios-like interface) ────
// Used by director pages: api.get('/direktur/...')
const api = {
  get: (endpoint, options = {}) => {
    const { params, ...rest } = options;
    const q = params ? new URLSearchParams(params).toString() : '';
    return apiFetch(`${endpoint}${q ? `?${q}` : ''}`, rest).then(data => ({ data }));
  },
  post: (endpoint, body, options = {}) =>
    apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body), ...options }).then(data => ({ data })),
  put: (endpoint, body, options = {}) =>
    apiFetch(endpoint, { method: 'PUT', body: JSON.stringify(body), ...options }).then(data => ({ data })),
  delete: (endpoint, options = {}) =>
    apiFetch(endpoint, { method: 'DELETE', ...options }).then(data => ({ data })),
};

export default api;
