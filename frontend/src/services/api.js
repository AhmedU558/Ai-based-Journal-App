import axios from 'axios';
import Cookies from 'js-cookie';

// Axios client — always uses a relative base URL. Both the Vite dev server
// (vite.config.js's server.proxy) and the production nginx container
// (nginx.conf's /api/ location) forward /api/* to the gateway on the same
// origin the frontend is served from, so there's never a reason to hardcode
// an absolute host here - doing so previously broke every non-localhost
// deployment (it pointed at http://localhost:8080 regardless of the real
// deployed host/IP/domain).
const api = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true
});

// Request Interceptor: Attach JWT Token from Cookie or localStorage, if present
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get('jwt_token') || localStorage.getItem('jwt_token');

    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: on a 401, the access token has expired or was rejected
// (the gateway rejects with an empty body, so error.response.data is empty and
// the message would otherwise fall through to axios's generic "Request failed
// with status code 401") - try a silent refresh-and-retry once before giving up,
// since a refresh token is issued at login specifically for this. Auth endpoints
// themselves are excluded so a failed login/refresh doesn't recurse into itself.
const AUTH_ENDPOINTS_NO_REFRESH = ['/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/refresh'];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthEndpoint = originalRequest?.url && AUTH_ENDPOINTS_NO_REFRESH.some((p) => originalRequest.url.includes(p));

    if (error.response?.status === 401 && !isAuthEndpoint && !originalRequest?._retry) {
      originalRequest._retry = true;
      try {
        // Lazy import avoids a circular-import evaluation-order issue at module load time.
        const { authService } = await import('./authService');
        const newToken = await authService.refreshAccessToken();
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        const { authService } = await import('./authService');
        authService.logout();
        return Promise.reject(new Error('Your session has expired. Please log in again.'));
      }
    }

    // A raw HTML error page (e.g. nginx's own 413/502, not the app's JSON
    // envelope) must never be shown to the user as-is - substitute a clean
    // status-based message instead of dumping markup into a toast/banner.
    const rawStringBody = typeof error.response?.data === 'string' ? error.response.data : null;
    const isHtmlBody = rawStringBody?.trim().startsWith('<');

    const serverMessage = error.response?.data?.message ||
                          error.response?.data?.error ||
                          (rawStringBody && !isHtmlBody ? rawStringBody : null) ||
                          (isHtmlBody && error.response?.status === 413 ? 'That file is too large. Please choose a smaller one.' : null) ||
                          (isHtmlBody ? `Request failed (${error.response?.status}). Please try again.` : null) ||
                          error.message ||
                          'Network error connecting to Gateway.';

    // Rejecting with a bare `new Error(serverMessage)` used to drop
    // error.response entirely - callers could read a message but never
    // branch on the real status code or field-validation payload (e.g. a
    // 409 Conflict vs. a 404 Not Found needing different UI treatment).
    // Attaching the original response/status onto the new Error preserves
    // that without changing what every existing `err.message` caller sees.
    const enrichedError = new Error(serverMessage);
    enrichedError.response = error.response;
    enrichedError.status = error.response?.status;
    return Promise.reject(enrichedError);
  }
);

export default api;
