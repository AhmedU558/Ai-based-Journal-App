function freshService() {
  return require('./mockUserService').mockUserService;
}

beforeEach(() => {
  jest.resetModules();
});

describe('mockUserService', () => {
  it('getProfile returns seeded defaults', async () => {
    const service = freshService();
    const profile = await service.getProfile();
    expect(profile.country).toBe('United States');
    expect(typeof profile.bio).toBe('string');
  });

  it('updateProfile replaces the stored profile and getProfile reflects it', async () => {
    const service = freshService();
    const updated = await service.updateProfile({ bio: 'New bio', country: 'Canada', city: 'Toronto' });
    expect(updated).toEqual({ bio: 'New bio', country: 'Canada', city: 'Toronto' });

    const fetched = await service.getProfile();
    expect(fetched).toEqual({ bio: 'New bio', country: 'Canada', city: 'Toronto' });
  });

  // Play requires an in-app account-deletion path, so the mock has to support
  // the same call the real service makes rather than the screen only working
  // in Pass B.
  it('deleteAccount clears the stored profile', async () => {
    const service = freshService();
    await service.updateProfile({ bio: 'Something personal', country: 'Canada', city: 'Toronto' });

    await service.deleteAccount();

    const fetched = await service.getProfile();
    expect(fetched.bio).toBe('');
    expect(fetched.country).toBe('');
    expect(fetched.city).toBe('');
  });

  it('deleteAccount resolves without throwing when nothing was ever saved', async () => {
    const service = freshService();
    await expect(service.deleteAccount()).resolves.toBeUndefined();
  });
});
