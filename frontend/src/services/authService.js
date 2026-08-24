import axios from 'axios';
import api from './api';
import Cookies from 'js-cookie';
import { decodeJwtPayload } from '@/lib/jwt';

const SESSION_DURATION_MS = 10 * 60 * 1000; // 10 Minutes in milliseconds
const COOKIE_EXPIRES_DAYS = 10 / (24 * 60); // 10 Minutes in days (10/1440)

// Dedicated axios instance for the refresh call - deliberately bypasses api.js's
// interceptors so a refresh failure can't recursively trigger another refresh attempt.
// withCredentials is required here too - the refresh token itself now lives
// only in an httpOnly cookie set by auth-service, not in anything this code
// can read, so the browser must be told to actually attach it.
const refreshClient = axios.create({
  baseURL: api.defaults.baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

export const authService = {
  // Login user and set 10-minute session expiry
  login: async (usernameOrEmail, password, turnstileToken) => {
    const res = await api.post('/api/v1/auth/login', { usernameOrEmail, password, turnstileToken });
    const authData = res?.data?.data;
    if (authData?.accessToken) {
      authService.setSession(authData.accessToken, authData.refreshToken, authData.userId, authData.username || usernameOrEmail);
    }
    return res;
  },

  // Register user with 10-minute session
  register: async (username, email, password, fullName, turnstileToken) => {
    const res = await api.post('/api/v1/auth/register', { username, email, password, fullName, turnstileToken });
    const authData = res?.data?.data;
    if (authData?.accessToken) {
      authService.setSession(authData.accessToken, authData.refreshToken, authData.userId, authData.username || username);
    }
    return res;
  },

  // Complete a login that returned an MFA challenge - send either a 6-digit
  // TOTP code or a recovery code, not both.
  verifyMfa: async (challengeToken, code, recoveryCode) => {
    const res = await api.post('/api/v1/auth/mfa/verify', { challengeToken, code, recoveryCode });
    const authData = res?.data?.data;
    if (authData?.accessToken) {
      authService.setSession(authData.accessToken, authData.refreshToken, authData.userId, authData.username);
    }
    return res;
  },

  // Exchanges the (single-use) refresh token for a new access/refresh pair.
  // The refresh token itself is never read here - it lives only in an
  // httpOnly cookie the browser attaches automatically (refreshClient has
  // withCredentials: true), invisible to this or any other page JS. Throws
  // if the cookie is missing, expired, or already revoked - callers should
  // treat a throw here as "the session is over, log out."
  refreshAccessToken: async () => {
    const res = await refreshClient.post('/api/v1/auth/refresh', {});
    const authData = res?.data?.data;
    if (!authData?.accessToken) {
      throw new Error('Refresh response missing an access token');
    }
    authService.setSession(authData.accessToken, authData.refreshToken, authData.userId, authData.username);
    return authData.accessToken;
  },

  // Get the authenticated user's real identity (username/email/fullName) -
  // the source of truth, since user-service's profile has no email field.
  getCurrentUser: async () => (await api.get('/api/v1/auth/me'))?.data?.data,

  changePassword: async (currentPassword, newPassword) =>
    (await api.put('/api/v1/auth/password', { currentPassword, newPassword }))?.data?.data,

  getMfaStatus: async () => (await api.get('/api/v1/auth/mfa/status'))?.data?.data,

  // Real login-attempt log (successes and failures against a resolvable
  // account) - returns a PagedResponse<{id,loginTime,ipAddress,userAgent,status}>.
  getLoginHistory: async (page = 0, size = 20) =>
    (await api.get(`/api/v1/auth/login-history?page=${page}&size=${size}`))?.data?.data,

  // Generates (and persists, but does not yet enable) a new TOTP secret -
  // returns {secret, otpAuthUri} for QR code rendering.
  setupMfa: async () => (await api.post('/api/v1/auth/mfa/setup'))?.data?.data,

  // Confirms enrollment with a 6-digit code - returns {mfaEnabled, recoveryCodes}.
  // recoveryCodes are plaintext and shown exactly once.
  enableMfa: async (code) => (await api.post('/api/v1/auth/mfa/enable', { code }))?.data?.data,

  disableMfa: async (password, code, recoveryCode) =>
    (await api.post('/api/v1/auth/mfa/disable', { password, code, recoveryCode }))?.data?.data,

  // Always resolves with the same generic message regardless of whether the
  // email is registered - the backend deliberately never reveals that.
  forgotPassword: async (email) =>
    (await api.post('/api/v1/auth/password/forgot', { email }))?.data,

  resetPassword: async (resetCode, newPassword) =>
    (await api.post('/api/v1/auth/password/reset', { resetCode, newPassword }))?.data,

  // Authenticated (not public like password reset) - the caller is always
  // logged in by the time they'd submit a code, since register() issues
  // tokens unconditionally (non-blocking email verification).
  verifyEmail: async (code) =>
    (await api.post('/api/v1/auth/verify-email', { code }))?.data,

  resendVerificationEmail: async () =>
    (await api.post('/api/v1/auth/verify-email/resend'))?.data,

  // Set active session tokens with strict 10-minute (client-side, activity-driven)
  // expiration. refreshToken is the single-use rotating token used by
  // refreshAccessToken() - the access token itself expires server-side after 15
  // minutes regardless of client activity, so a session that stays "valid" locally
  // for longer than that relies on the response interceptor in api.js calling
  // refreshAccessToken() transparently on a 401, not on this expiry alone.
  // refreshToken is accepted but deliberately never persisted here -
  // auth-service already set it as an httpOnly cookie in the same response
  // (invisible to this or any other page JS), so storing it a second time
  // in localStorage would just be a second, XSS-readable copy of the same
  // long-lived credential for no benefit.
  setSession: (token, _refreshToken, userId, username) => {
    const expiryTime = Date.now() + SESSION_DURATION_MS;
    Cookies.set('jwt_token', token, { expires: COOKIE_EXPIRES_DAYS, sameSite: 'Lax' });
    localStorage.setItem('jwt_token', token);
    localStorage.setItem('user_id', String(userId || '1'));
    localStorage.setItem('user_name', username || localStorage.getItem('user_name') || 'Journaler');
    localStorage.setItem('session_expiry', String(expiryTime));
  },

  // Refresh 10-minute activity timer on user interaction
  touchSession: () => {
    const expiry = localStorage.getItem('session_expiry');
    if (expiry && Date.now() < parseInt(expiry)) {
      const newExpiry = Date.now() + SESSION_DURATION_MS;
      localStorage.setItem('session_expiry', String(newExpiry));
      const token = localStorage.getItem('jwt_token');
      if (token) {
        Cookies.set('jwt_token', token, { expires: COOKIE_EXPIRES_DAYS, sameSite: 'Lax' });
      }
    }
  },

  // Logout user and clear tokens. Best-effort revokes the refresh token server-side
  // (fire-and-forget - local state is cleared regardless of whether this succeeds).
  // The browser attaches the httpOnly refresh-token cookie automatically; the
  // backend both revokes it server-side and clears the cookie in its response.
  logout: () => {
    refreshClient.post('/api/v1/auth/logout', {}).catch(() => {});
    Cookies.remove('jwt_token');
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_name');
    localStorage.removeItem('session_expiry');
  },

  // Get active JWT Token if not expired
  getToken: () => {
    if (!authService.isAuthenticated()) return null;
    return Cookies.get('jwt_token') || localStorage.getItem('jwt_token');
  },

  // Reads the ROLE_ADMIN claim already embedded in the stored JWT - a
  // synchronous, zero-network-call check purely for UI gating (hiding the
  // Admin tab from non-admins). The real enforcement is server-side
  // @PreAuthorize on auth-service's AdminController; this is not a security
  // boundary and never should be treated as one.
  isAdmin: () => {
    const token = Cookies.get('jwt_token') || localStorage.getItem('jwt_token');
    const payload = decodeJwtPayload(token);
    return Array.isArray(payload?.roles) && payload.roles.includes('ROLE_ADMIN');
  },

  // Same JWT-decode approach as isAdmin() - used by the Admin tab to disable
  // self-targeting actions client-side (a UX mirror of the backend's own
  // self-protection guards, not a replacement for them).
  getCurrentUserId: () => {
    const token = Cookies.get('jwt_token') || localStorage.getItem('jwt_token');
    const payload = decodeJwtPayload(token);
    return payload?.userId ?? null;
  },

  // Check if session is valid (must be within 10 minutes)
  isAuthenticated: () => {
    const token = Cookies.get('jwt_token') || localStorage.getItem('jwt_token');
    const expiry = localStorage.getItem('session_expiry');

    if (!token || !expiry) {
      return false;
    }

    // Check if 10 minutes have elapsed
    if (Date.now() > parseInt(expiry)) {
      authService.logout();
      return false;
    }

    return true;
  },
};
