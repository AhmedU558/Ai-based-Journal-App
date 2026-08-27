import type { ProfileData } from '@/types';

const ARTIFICIAL_DELAY_MS = 300;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ARTIFICIAL_DELAY_MS));
}

// Module-level mutable state, seeded with plausible defaults - mirrors
// mockJournalService's in-memory-array approach, just for one profile object.
let mockProfile: ProfileData = {
  bio: 'Journaling my way through the chaos, one entry at a time.',
  phoneNumber: '',
  country: 'United States',
  city: 'Austin',
};

export const mockUserService = {
  async getProfile(): Promise<ProfileData> {
    return delay({ ...mockProfile });
  },

  async updateProfile(profile: ProfileData): Promise<ProfileData> {
    mockProfile = { ...profile };
    return delay({ ...mockProfile });
  },

  // Resets the in-memory profile rather than pretending to delete an account
  // that never existed - Pass A has no backend, so the honest mock behaviour is
  // "the local fixture is gone", which is what the screen then reflects.
  async deleteAccount(): Promise<void> {
    mockProfile = { bio: '', phoneNumber: '', country: '', city: '' };
    return delay(undefined);
  },
};

// Exposed for tests so one case's deletion cannot leak into the next.
export function __resetMockProfileForTests() {
  mockProfile = {
    bio: 'Journaling my way through the chaos, one entry at a time.',
    phoneNumber: '',
    country: 'United States',
    city: 'Austin',
  };
}
