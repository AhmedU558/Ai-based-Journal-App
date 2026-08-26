// Regression coverage for the single-flight refresh guard in authService.
//
// Refresh tokens are single-use and rotate server-side (AuthServiceImpl
// .refreshToken() does an atomic delete-and-check), so two concurrent
// /refresh calls carrying the same token means exactly one wins and the other
// gets a 401. Before the guard, any screen issuing two authenticated requests
// in parallel against an expired access token (SettingsScreen does) produced
// two simultaneous refreshes - the loser's 401 handler called logout() and
// kicked the user out of a valid session.

const mockPost = jest.fn();

jest.mock('axios', () => {
  const instance = () => ({
    post: (...args: unknown[]) => mockPost(...args),
    get: jest.fn(),
    put: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  });
  return { __esModule: true, default: { create: jest.fn(instance) } };
});

jest.mock('./session', () => ({
  session: {
    getRefreshToken: jest.fn(async () => 'refresh-token-1'),
    setSession: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
    isAuthenticated: jest.fn(async () => true),
    touchSession: jest.fn(async () => undefined),
  },
}));

jest.mock('@/lib/offlineQueue', () => ({ clearOfflineQueue: jest.fn(async () => undefined) }));
jest.mock('@/lib/offlineCache', () => ({ clearOfflineCache: jest.fn(async () => undefined) }));
jest.mock('@/lib/achievementTracking', () => ({ resetAiUsageTracking: jest.fn() }));

import { authService } from './authService';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mockPost.mockReset();
});

describe('authService.refreshAccessToken single-flight guard', () => {
  it('issues only one /refresh call when several callers race, and gives them all the same token', async () => {
    const pending = deferred<{ data: { data: { accessToken: string; refreshToken: string } } }>();
    mockPost.mockReturnValueOnce(pending.promise);

    // Three callers race, mirroring parallel 401s from one screen.
    const calls = [
      authService.refreshAccessToken(),
      authService.refreshAccessToken(),
      authService.refreshAccessToken(),
    ];

    pending.resolve({ data: { data: { accessToken: 'new-access', refreshToken: 'rotated' } } });
    const tokens = await Promise.all(calls);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(tokens).toEqual(['new-access', 'new-access', 'new-access']);
  });

  it('starts a fresh /refresh for a later call once the in-flight one has settled', async () => {
    mockPost
      .mockResolvedValueOnce({ data: { data: { accessToken: 'first', refreshToken: 'r1' } } })
      .mockResolvedValueOnce({ data: { data: { accessToken: 'second', refreshToken: 'r2' } } });

    await expect(authService.refreshAccessToken()).resolves.toBe('first');
    await expect(authService.refreshAccessToken()).resolves.toBe('second');
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('clears the guard after a failure so a later call can retry rather than replaying the rejection', async () => {
    mockPost
      .mockRejectedValueOnce(new Error('refresh token was already used'))
      .mockResolvedValueOnce({ data: { data: { accessToken: 'recovered', refreshToken: 'r2' } } });

    await expect(authService.refreshAccessToken()).rejects.toThrow('refresh token was already used');
    await expect(authService.refreshAccessToken()).resolves.toBe('recovered');
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('rejects every racing caller when the shared refresh fails', async () => {
    const pending = deferred<never>();
    mockPost.mockReturnValueOnce(pending.promise);

    const first = authService.refreshAccessToken();
    const second = authService.refreshAccessToken();
    // Attach handlers before rejecting so neither surfaces as an unhandled rejection.
    const settled = Promise.allSettled([first, second]);

    pending.reject(new Error('refresh token was already used'));

    expect((await settled).map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});
