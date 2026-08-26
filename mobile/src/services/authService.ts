import axios from 'axios';
import api from './api';
import { session } from './session';
import { clearOfflineQueue } from '@/lib/offlineQueue';
import { clearOfflineCache } from '@/lib/offlineCache';
import { resetAiUsageTracking } from '@/lib/achievementTracking';
import { API_BASE_URL } from '@/config/env';
import type { AuthResult, CurrentUser, MfaSetupData, MfaEnableResult, LoginHistoryPage } from '@/types';

// Dedicated instance for the refresh call - bypasses api.ts's interceptors so a
// refresh failure can't recursively trigger another refresh attempt, matching
// frontend/src/services/authService.js's refreshClient.
const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Single-flight guard for refreshAccessToken(). Refresh tokens are single-use
// and rotate server-side: AuthServiceImpl.refreshToken() does an atomic
// delete-and-check, so of two concurrent /refresh calls carrying the same
// token exactly one wins and the other gets "Refresh token was already used".
// Without this guard, any screen firing two authenticated requests in parallel
// (SettingsScreen does exactly that) against an expired access token would
// produce two simultaneous refreshes - one succeeds, the loser's 401 handler
// calls logout(), and the user is kicked out of a perfectly valid session.
// Callers arriving while a refresh is in flight now await that same promise
// and all receive the one newly-issued access token.
let inFlightRefresh: Promise<string> | null = null;

async function persistIfIssued(data: AuthResult, fallbackUsername?: string) {
  if (data?.accessToken) {
    await session.setSession(data.accessToken, data.refreshToken, data.userId, data.username || fallbackUsername);
  }
}

export const authService = {
  async login(usernameOrEmail: string, password: string, turnstileToken?: string): Promise<AuthResult> {
    const res = await api.post('/api/v1/auth/login', { usernameOrEmail, password, turnstileToken });
    const data: AuthResult = res?.data?.data || {};
    await persistIfIssued(data, usernameOrEmail);
    return data;
  },

  async register(username: string, email: string, password: string, fullName: string, turnstileToken?: string): Promise<AuthResult> {
    const res = await api.post('/api/v1/auth/register', { username, email, password, fullName, turnstileToken });
    const data: AuthResult = res?.data?.data || {};
    await persistIfIssued(data, username);
    return data;
  },

  async verifyMfa(challengeToken: string, code?: string, recoveryCode?: string): Promise<AuthResult> {
    const res = await api.post('/api/v1/auth/mfa/verify', { challengeToken, code, recoveryCode });
    const data: AuthResult = res?.data?.data || {};
    await persistIfIssued(data);
    return data;
  },

  async refreshAccessToken(): Promise<string> {
    // Join an already-running refresh instead of starting a competing one -
    // see inFlightRefresh's comment above for why a second concurrent call
    // would otherwise log the user out.
    if (inFlightRefresh) return inFlightRefresh;

    inFlightRefresh = (async () => {
      const refreshToken = await session.getRefreshToken();
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }
      const res = await refreshClient.post('/api/v1/auth/refresh', { refreshToken });
      const data: AuthResult = res?.data?.data || {};
      if (!data.accessToken) {
        throw new Error('Refresh response missing an access token');
      }
      await session.setSession(data.accessToken, data.refreshToken, data.userId, data.username);
      return data.accessToken;
    })();

    try {
      return await inFlightRefresh;
    } finally {
      // Cleared on both success and failure so a later 401 can retry rather
      // than forever re-awaiting one settled (possibly rejected) promise.
      inFlightRefresh = null;
    }
  },

  async getCurrentUser(): Promise<CurrentUser> {
    const res = await api.get('/api/v1/auth/me');
    return res?.data?.data;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.put('/api/v1/auth/password', { currentPassword, newPassword });
  },

  async getMfaStatus(): Promise<{ mfaEnabled: boolean }> {
    const res = await api.get('/api/v1/auth/mfa/status');
    return res?.data?.data || { mfaEnabled: false };
  },

  async getLoginHistory(page = 0, size = 10): Promise<LoginHistoryPage> {
    const res = await api.get(`/api/v1/auth/login-history?page=${page}&size=${size}`);
    return res?.data?.data || { content: [] };
  },

  // Generates (and persists, but does not yet enable) a new TOTP secret -
  // returns {secret, otpAuthUri} for QR code rendering.
  async setupMfa(): Promise<MfaSetupData> {
    const res = await api.post('/api/v1/auth/mfa/setup');
    return res?.data?.data;
  },

  // Confirms enrollment with a 6-digit code - returns {mfaEnabled, recoveryCodes}.
  // recoveryCodes are plaintext and shown exactly once.
  async enableMfa(code: string): Promise<MfaEnableResult> {
    const res = await api.post('/api/v1/auth/mfa/enable', { code });
    return res?.data?.data;
  },

  async disableMfa(password: string, code: string): Promise<void> {
    await api.post('/api/v1/auth/mfa/disable', { password, code });
  },

  // Always resolves with the same generic message regardless of whether the
  // email is registered - the backend deliberately never reveals that.
  async forgotPassword(email: string): Promise<void> {
    await api.post('/api/v1/auth/password/forgot', { email });
  },

  async resetPassword(resetCode: string, newPassword: string): Promise<void> {
    await api.post('/api/v1/auth/password/reset', { resetCode, newPassword });
  },

  // Authenticated (not public like password reset) - the caller is always
  // logged in by the time they'd submit a code, since register() issues
  // tokens unconditionally (non-blocking email verification).
  async verifyEmail(code: string): Promise<void> {
    await api.post('/api/v1/auth/verify-email', { code });
  },

  async resendVerificationEmail(): Promise<void> {
    await api.post('/api/v1/auth/verify-email/resend');
  },

  async logout(): Promise<void> {
    const refreshToken = await session.getRefreshToken();
    if (refreshToken) {
      refreshClient.post('/api/v1/auth/logout', { refreshToken }).catch(() => {});
    }
    await session.clear();
    // Any still-unsynced offline journal edit belongs to the account that's
    // logging out - leaving it queued would replay it against whichever
    // account logs into this device next.
    await clearOfflineQueue();
    await clearOfflineCache();
    // Same cross-account-leak reasoning as the offline-queue/cache clear
    // above - a bare module-level flag, not session state, so it needs its
    // own explicit reset or the next account on this device sees "AI
    // Pioneer" already unlocked.
    resetAiUsageTracking();
  },

  isAuthenticated: () => session.isAuthenticated(),
  touchSession: () => session.touchSession(),
};
