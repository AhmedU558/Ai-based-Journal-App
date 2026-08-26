import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression coverage for the single-flight refresh guard.
//
// Refresh tokens are single-use and rotate server-side (AuthServiceImpl
// .refreshToken() does an atomic delete-and-check), so two concurrent
// /refresh calls means one wins and the other 401s. The httpOnly refresh
// cookie does not save us: both requests carry the same cookie value, because
// the second is sent before the first response's rotated Set-Cookie arrives.
//
// Before the guard, any view firing two authenticated requests in parallel
// against an expired access token produced two refreshes, and api.js's 401
// handler logged the user out on the loser. SettingsModal does this twice,
// and App.jsx's auth-mount effect fires refreshEmailVerified() and
// refreshNotifications() back to back.

const mockPost = vi.fn();

vi.mock('axios', () => {
  const instance = () => ({
    post: (...args) => mockPost(...args),
    get: vi.fn(),
    put: vi.fn(),
    defaults: { baseURL: '' },
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  });
  return { default: { create: vi.fn(instance) } };
});

vi.mock('./api', () => ({
  default: {
    defaults: { baseURL: '' },
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

vi.mock('js-cookie', () => ({
  default: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
}));

const { authService } = await import('./authService');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const okResponse = (accessToken) => ({
  data: { data: { accessToken, refreshToken: 'rotated', userId: 1, username: 'tester' } },
});

beforeEach(() => {
  mockPost.mockReset();
});

describe('authService.refreshAccessToken single-flight guard', () => {
  it('issues one /refresh for several racing callers and gives them all the same token', async () => {
    const pending = deferred();
    mockPost.mockReturnValueOnce(pending.promise);

    // Three callers race, mirroring parallel 401s from one view.
    const calls = [
      authService.refreshAccessToken(),
      authService.refreshAccessToken(),
      authService.refreshAccessToken(),
    ];

    pending.resolve(okResponse('new-access'));
    const tokens = await Promise.all(calls);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(tokens).toEqual(['new-access', 'new-access', 'new-access']);
  });

  it('starts a fresh /refresh once the in-flight one has settled', async () => {
    mockPost
      .mockResolvedValueOnce(okResponse('first'))
      .mockResolvedValueOnce(okResponse('second'));

    await expect(authService.refreshAccessToken()).resolves.toBe('first');
    await expect(authService.refreshAccessToken()).resolves.toBe('second');
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('clears the guard after a failure so a later call can retry', async () => {
    mockPost
      .mockRejectedValueOnce(new Error('Refresh token was already used'))
      .mockResolvedValueOnce(okResponse('recovered'));

    await expect(authService.refreshAccessToken()).rejects.toThrow('already used');
    await expect(authService.refreshAccessToken()).resolves.toBe('recovered');
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('rejects every racing caller when the shared refresh fails', async () => {
    const pending = deferred();
    mockPost.mockReturnValueOnce(pending.promise);

    const first = authService.refreshAccessToken();
    const second = authService.refreshAccessToken();
    // Attach handlers before rejecting so neither surfaces as unhandled.
    const settled = Promise.allSettled([first, second]);

    pending.reject(new Error('Refresh token was already used'));

    expect((await settled).map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});
