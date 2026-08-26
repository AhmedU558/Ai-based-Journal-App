import axios from 'axios';
import { API_BASE_URL } from '@/config/env';
import { session } from './session';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach the JWT from SecureStore, if present - the RN
// equivalent of frontend/src/services/api.js reading the cookie/localStorage token.
api.interceptors.request.use(async (config) => {
  const token = await session.getToken();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: same silent refresh-and-retry-once-on-401 pattern as the
// web app's api.js, adapted to a dynamic import of authService to avoid the same
// circular-import evaluation-order issue (authService also imports this module).
const AUTH_ENDPOINTS_NO_REFRESH = ['/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/refresh'];

// A successful authenticated request is real app usage, so it should extend the
// 10-minute sliding session the same way a tap does (see RootNavigator's
// activity handler). This is the half that covers *typing*: a user composing a
// long entry drives debounced mood-detection/search calls without necessarily
// touching the screen again, and would otherwise be logged out mid-sentence.
// touchSession() only extends an unexpired session, so this can never resurrect
// one that has already lapsed. Throttled to match the web app's 30s.
let lastTouch = 0;
function touchSessionThrottled() {
  const now = Date.now();
  if (now - lastTouch < 30000) return;
  lastTouch = now;
  session.touchSession().catch(() => {});
}

api.interceptors.response.use(
  (response) => {
    touchSessionThrottled();
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const isAuthEndpoint = originalRequest?.url && AUTH_ENDPOINTS_NO_REFRESH.some((p: string) => originalRequest.url.includes(p));

    if (error.response?.status === 401 && !isAuthEndpoint && !originalRequest?._retry) {
      originalRequest._retry = true;
      try {
        const { authService } = await import('./authService');
        const newToken = await authService.refreshAccessToken();
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        const { authService } = await import('./authService');
        await authService.logout();
        return Promise.reject(new Error('Your session has expired. Please log in again.'));
      }
    }

    const serverMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      (typeof error.response?.data === 'string' ? error.response.data : null) ||
      error.message ||
      'Network error connecting to the Mindora gateway.';

    return Promise.reject(new Error(serverMessage));
  }
);

export default api;
