import api from './api';
import type { ProfileData } from '@/types';

// Ported from frontend/src/services/userService.js. Preferences are still not
// surfaced anywhere in this app, so they remain unported; deleteAccount is here
// because Google Play requires any app offering account creation to provide an
// in-app way to delete that account.
export const userService = {
  async getProfile(): Promise<ProfileData> {
    const res = await api.get('/api/v1/users/profile');
    return res?.data?.data || {};
  },

  // Sends the full profile shape (bio/avatarUrl/phoneNumber/country/city) -
  // user-service overwrites all five unconditionally, so a partial object
  // would null out fields not included.
  async updateProfile(profile: ProfileData): Promise<ProfileData> {
    const res = await api.put('/api/v1/users/profile', profile);
    return res?.data?.data || profile;
  },

  // Irreversible. user-service deletes the auth account first and aborts the
  // whole operation if that fails, so this can never leave a user able to log
  // in with their data already gone; journals and uploaded files are then
  // removed best-effort.
  async deleteAccount(): Promise<void> {
    await api.delete('/api/v1/users/account');
  },
};
