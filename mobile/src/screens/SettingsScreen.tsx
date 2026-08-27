import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, Image, ActivityIndicator } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import QRCode from 'react-native-qrcode-svg';
import { User, ShieldCheck, CheckCircle2, Camera, Trash2 } from 'lucide-react-native';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { GlassInput } from '@/components/ui/GlassInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SkeletonBlock } from '@/components/ui/SkeletonBlock';
import { ErrorBanner } from '@/components/ErrorBanner';
import { FadeInView } from '@/components/ui/FadeInView';
import { cn } from '@/lib/utils';
import { authService, userService, fileService } from '@/services';
import { useAuthContext } from '@/context/AuthContext';
import type { CurrentUser, ProfileData, MfaSetupData, LoginHistoryEntry } from '@/types';

type SettingsTab = 'profile' | 'security';

export default function SettingsScreen() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  return (
    <SafeAreaView className="flex-1 bg-bg-primary" edges={['top']}>
      <View className="px-5 pt-4 pb-2">
        <Text className="text-text-primary text-2xl font-extrabold">Settings</Text>
        <Text className="text-text-secondary text-xs">Profile, password, and two-factor authentication</Text>
      </View>

      <View className="flex-row px-5 mb-4 gap-2">
        <SettingsTabBtn icon={<User size={15} color={activeTab === 'profile' ? '#fff' : '#94a3b8'} />} label="Profile" active={activeTab === 'profile'} onPress={() => setActiveTab('profile')} />
        <SettingsTabBtn icon={<ShieldCheck size={15} color={activeTab === 'security' ? '#fff' : '#94a3b8'} />} label="Security" active={activeTab === 'security'} onPress={() => setActiveTab('security')} />
      </View>

      {activeTab === 'profile' ? <ProfileSection /> : <SecuritySection />}
    </SafeAreaView>
  );
}

function SettingsTabBtn({ icon, label, active, onPress }: { icon: ReactNode; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={cn('flex-row items-center gap-2 py-2 px-4 rounded-xl', active ? 'bg-accent-indigo/25 border border-accent-indigo' : 'bg-white/[0.04] border border-white/[0.08]')}
    >
      {icon}
      <Text className={cn('text-sm', active ? 'text-white font-bold' : 'text-text-secondary font-medium')}>{label}</Text>
    </Pressable>
  );
}

function ProfileSection() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [profile, setProfile] = useState<ProfileData>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [avatarSource, setAvatarSource] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    Promise.all([authService.getCurrentUser(), userService.getProfile()])
      .then(([user, profileData]) => {
        if (cancelled) return;
        setCurrentUser(user || null);
        setProfile(profileData || {});
      })
      .catch(() => {
        if (!cancelled) setLoadError('Failed to load profile. Please try reopening Settings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetches the current avatar as an authenticated source whenever avatarUrl
  // changes - RN's <Image> can carry a bearer token directly via source.headers,
  // unlike a web <img>, so there's no blob-URL fetch-and-revoke step needed here.
  useEffect(() => {
    let cancelled = false;
    if (!profile.avatarUrl) {
      setAvatarSource(null);
      return;
    }
    fileService
      .getAuthenticatedImageSource(profile.avatarUrl)
      .then((src) => {
        if (!cancelled) setAvatarSource(src);
      })
      .catch(() => {
        if (!cancelled) setAvatarSource(null);
      });
    return () => {
      cancelled = true;
    };
  }, [profile.avatarUrl]);

  const handlePickAvatar = async () => {
    setAvatarError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setAvatarError('Photo library access is needed to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const fileName = asset.fileName || `avatar-${Date.now()}.jpg`;
    const mimeType = asset.mimeType || 'image/jpeg';

    setAvatarUploading(true);
    try {
      const { filePath } = await fileService.upload(asset.uri, fileName, mimeType);
      const oldPath = profile.avatarUrl;
      const updated = await userService.updateProfile({ ...profile, avatarUrl: filePath });
      setProfile(updated || { ...profile, avatarUrl: filePath });
      if (oldPath) {
        fileService.remove(oldPath).catch(() => {});
      }
    } catch (err: any) {
      setAvatarError(err?.message || 'Failed to upload photo.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!profile.avatarUrl) return;
    setAvatarError('');
    setAvatarUploading(true);
    try {
      const oldPath = profile.avatarUrl;
      const updated = await userService.updateProfile({ ...profile, avatarUrl: '' });
      setProfile(updated || { ...profile, avatarUrl: '' });
      await fileService.remove(oldPath).catch(() => {});
    } catch (err: any) {
      setAvatarError(err?.message || 'Failed to remove photo.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const updated = await userService.updateProfile(profile);
      setProfile(updated || profile);
      setMessage('Profile saved.');
    } catch (err: any) {
      setMessage(err?.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <View className="px-5">
        <ErrorBanner message={loadError} />
      </View>
    );
  }

  if (loading) {
    return (
      <View className="px-5 gap-3">
        <SkeletonBlock className="h-10" />
        <SkeletonBlock className="h-10" />
        <SkeletonBlock className="h-20" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
      <FadeInView>
        <View className="gap-4">
          <View className="items-center gap-3 mb-2">
            <View className="w-24 h-24 rounded-full bg-white/5 border border-white/10 items-center justify-center overflow-hidden">
              {avatarUploading ? (
                <ActivityIndicator color="#818cf8" />
              ) : avatarSource ? (
                <Image source={avatarSource} style={{ width: 96, height: 96 }} resizeMode="cover" />
              ) : (
                <User size={36} color="#64748b" />
              )}
            </View>
            <View className="flex-row items-center gap-3">
              <Pressable
                onPress={handlePickAvatar}
                disabled={avatarUploading}
                className="flex-row items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl py-2 px-3"
                style={{ opacity: avatarUploading ? 0.5 : 1 }}
              >
                <Camera size={14} color="#818cf8" />
                <Text className="text-accent-indigo text-xs font-semibold">
                  {profile.avatarUrl ? 'Change Photo' : 'Set Photo'}
                </Text>
              </Pressable>
              {profile.avatarUrl ? (
                <Pressable
                  onPress={handleRemoveAvatar}
                  disabled={avatarUploading}
                  className="flex-row items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl py-2 px-3"
                  style={{ opacity: avatarUploading ? 0.5 : 1 }}
                >
                  <Trash2 size={14} color="#f87171" />
                  <Text className="text-[#f87171] text-xs font-semibold">Remove</Text>
                </Pressable>
              ) : null}
            </View>
            {avatarError ? <Text className="text-[#f87171] text-xs text-center">{avatarError}</Text> : null}
          </View>
          <View>
            <Text className="text-text-secondary text-xs mb-2">Username</Text>
            <GlassInput value={currentUser?.username || ''} editable={false} className="opacity-60" />
          </View>
          <View>
            <Text className="text-text-secondary text-xs mb-2">Primary Email</Text>
            <GlassInput value={currentUser?.email || ''} editable={false} className="opacity-60" />
          </View>
          <View>
            <Text className="text-text-secondary text-xs mb-2">Bio</Text>
            <GlassInput
              value={profile.bio || ''}
              onChangeText={(v) => setProfile((p) => ({ ...p, bio: v }))}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              className="min-h-[80px]"
            />
          </View>
          <View>
            <Text className="text-text-secondary text-xs mb-2">Phone Number</Text>
            <GlassInput value={profile.phoneNumber || ''} onChangeText={(v) => setProfile((p) => ({ ...p, phoneNumber: v }))} />
          </View>
          <View>
            <Text className="text-text-secondary text-xs mb-2">Country</Text>
            <GlassInput value={profile.country || ''} onChangeText={(v) => setProfile((p) => ({ ...p, country: v }))} />
          </View>
          <View>
            <Text className="text-text-secondary text-xs mb-2">City</Text>
            <GlassInput value={profile.city || ''} onChangeText={(v) => setProfile((p) => ({ ...p, city: v }))} />
          </View>

          {message ? <Text className="text-text-secondary text-xs">{message}</Text> : null}

          <PrimaryButton title={saving ? 'Saving...' : 'Save Profile'} onPress={handleSave} loading={saving} />
        </View>
      </FadeInView>
    </ScrollView>
  );
}

function SecuritySection() {
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [mfaLoadError, setMfaLoadError] = useState('');
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMfaLoadError('');
    Promise.all([authService.getMfaStatus(), authService.getCurrentUser()])
      .then(([status, user]) => {
        if (cancelled) return;
        setMfaEnabled(Boolean(status?.mfaEnabled));
        setEmailVerified(Boolean(user?.emailVerified));
      })
      .catch(() => {
        if (!cancelled) setMfaLoadError('Could not load 2FA status. Please try reopening Settings.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <KeyboardAvoidingView className="flex-1" behavior="padding">
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <FadeInView>
          <View className="gap-4">
            <PasswordChangeSection />

            {emailVerified === null ? (
              <SkeletonBlock className="h-16" />
            ) : (
              <EmailVerificationSection emailVerified={emailVerified} onVerified={() => setEmailVerified(true)} />
            )}

            {mfaLoadError ? (
              <ErrorBanner message={mfaLoadError} />
            ) : mfaEnabled === null ? (
              <SkeletonBlock className="h-16" />
            ) : (
              <TwoFactorSection mfaEnabled={mfaEnabled} onStatusChange={setMfaEnabled} />
            )}

            <LoginHistorySection />

            <DeleteAccountSection />
          </View>
        </FadeInView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Google Play requires any app offering account creation to provide an in-app
// way to delete that account. userService.deleteAccount() and the backend
// behind it were already complete - auth-service's delete runs first and
// aborts everything if it fails, so a user can never be left able to log in
// with their data gone - but nothing had ever called them from either client.
function DeleteAccountSection() {
  const { logout } = useAuthContext();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const canDelete = confirmText.trim().toUpperCase() === 'DELETE';

  const handleDelete = async () => {
    if (!canDelete || deleting) return;
    setDeleting(true);
    setError('');
    try {
      await userService.deleteAccount();
      // The account no longer exists, so the stored session is meaningless.
      // logout() also clears the offline queue and cache, which matters here:
      // leaving a deleted account's unsynced entries on the device would
      // replay them against whoever logs in next.
      await logout();
    } catch (err: any) {
      setError(err?.message || 'Could not delete your account. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <GlassPanel className="p-4 border border-[rgba(239,68,68,0.35)]">
      <View className="flex-row items-center gap-2 mb-2">
        <Trash2 size={16} color="#f87171" />
        <Text className="text-[#f87171] text-sm font-bold">Delete account</Text>
      </View>

      <Text className="text-text-secondary text-xs leading-5 mb-3">
        Permanently deletes your account, journal entries, uploaded files, profile and
        preferences. This cannot be undone.
      </Text>

      {error ? <ErrorBanner message={error} /> : null}

      {!confirming ? (
        <Pressable
          onPress={() => setConfirming(true)}
          className="self-start border border-[rgba(239,68,68,0.5)] py-2 px-4 rounded-xl"
        >
          <Text className="text-[#f87171] text-xs font-semibold">Delete my account</Text>
        </Pressable>
      ) : (
        <View className="gap-2">
          <Text className="text-text-secondary text-xs">
            Type <Text className="text-text-primary font-bold">DELETE</Text> to confirm
          </Text>
          <GlassInput
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder="DELETE"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!deleting}
          />
          <View className="flex-row gap-2">
            <Pressable
              onPress={handleDelete}
              disabled={!canDelete || deleting}
              className={cn(
                'py-2 px-4 rounded-xl',
                canDelete && !deleting ? 'bg-[#dc2626]' : 'bg-[rgba(239,68,68,0.2)]'
              )}
            >
              <Text
                className={cn(
                  'text-xs font-semibold',
                  canDelete && !deleting ? 'text-white' : 'text-[rgba(248,113,113,0.6)]'
                )}
              >
                {deleting ? 'Deleting...' : 'Permanently delete'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setConfirming(false);
                setConfirmText('');
                setError('');
              }}
              disabled={deleting}
              className="py-2 px-4 rounded-xl border border-white/10"
            >
              <Text className="text-text-secondary text-xs">Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </GlassPanel>
  );
}

function LoginHistorySection() {
  const [entries, setEntries] = useState<LoginHistoryEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    authService.getLoginHistory(0, 10)
      .then((res) => {
        if (!cancelled) setEntries(res?.content || []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load recent logins.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <GlassPanel className="p-4 gap-3">
      <View>
        <Text className="text-text-primary text-sm font-semibold">Recent Logins</Text>
        <Text className="text-text-muted text-xs">The last few times this account signed in, successful or not.</Text>
      </View>

      {error ? (
        <ErrorBanner message={error} />
      ) : entries === null ? (
        <SkeletonBlock className="h-16" />
      ) : entries.length === 0 ? (
        <Text className="text-text-muted text-xs">No login history yet.</Text>
      ) : (
        <View className="gap-2">
          {entries.map((entry) => (
            <View key={entry.id} className="flex-row items-center justify-between gap-3 py-2 border-b border-white/5">
              <View className="flex-1 pr-2">
                <Text className="text-text-secondary text-xs">{new Date(entry.loginTime).toLocaleString()}</Text>
                <Text className="text-text-muted text-xs" numberOfLines={1}>
                  {entry.ipAddress || 'Unknown IP'}{entry.userAgent ? ` · ${entry.userAgent}` : ''}
                </Text>
              </View>
              <View className={cn('py-1 px-2 rounded-md', entry.status === 'SUCCESS' ? 'bg-[rgba(34,197,94,0.15)]' : 'bg-[rgba(239,68,68,0.15)]')}>
                <Text className={cn('text-xs font-bold', entry.status === 'SUCCESS' ? 'text-[#4ade80]' : 'text-[#f87171]')}>
                  {entry.status === 'SUCCESS' ? 'Success' : 'Failed'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </GlassPanel>
  );
}

function EmailVerificationSection({ emailVerified, onVerified }: { emailVerified: boolean; onVerified: () => void }) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerify = async () => {
    setMessage('');
    setVerifying(true);
    try {
      await authService.verifyEmail(code);
      setCode('');
      onVerified();
    } catch (err: any) {
      setMessage(err?.message || 'Invalid or expired code.');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setMessage('');
    setResending(true);
    try {
      await authService.resendVerificationEmail();
      setMessage('A new verification code has been sent to your email.');
    } catch (err: any) {
      setMessage(err?.message || 'Failed to resend verification code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <GlassPanel className="p-4 gap-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-text-primary text-sm font-semibold">Email Verification</Text>
          <Text className="text-text-muted text-xs">Confirm you own the email address on this account.</Text>
        </View>
        <View className={cn('py-1 px-2 rounded-md', emailVerified ? 'bg-[rgba(34,197,94,0.15)]' : 'bg-[rgba(245,158,11,0.15)]')}>
          <Text className={cn('text-xs font-bold', emailVerified ? 'text-[#4ade80]' : 'text-[#fbbf24]')}>
            {emailVerified ? 'Verified' : 'Not verified'}
          </Text>
        </View>
      </View>

      {!emailVerified && (
        <View className="gap-2">
          <GlassInput placeholder="Enter the code emailed to you" value={code} onChangeText={setCode} autoCapitalize="characters" />
          {message ? <Text className="text-text-secondary text-xs">{message}</Text> : null}
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={handleVerify}
              disabled={verifying || !code.trim()}
              className="bg-accent-indigo/80 rounded-xl py-2 px-4"
              style={{ opacity: verifying || !code.trim() ? 0.5 : 1 }}
            >
              <Text className="text-white text-sm font-semibold">{verifying ? 'Verifying...' : 'Verify'}</Text>
            </Pressable>
            <Pressable onPress={handleResend} disabled={resending}>
              <Text className="text-accent-indigo text-xs font-semibold underline" style={{ opacity: resending ? 0.5 : 1 }}>
                {resending ? 'Sending...' : 'Resend code'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </GlassPanel>
  );
}

function PasswordChangeSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setMessage('');
    if (newPassword !== confirmNewPassword) {
      setMessage('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      setMessage('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      setMessage(err?.message || 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassPanel className="p-4 gap-3">
      <Text className="text-text-primary text-sm font-semibold mb-1">Change Password</Text>
      <GlassInput secureTextEntry placeholder="Current password" value={currentPassword} onChangeText={setCurrentPassword} />
      <GlassInput secureTextEntry placeholder="New password" value={newPassword} onChangeText={setNewPassword} />
      <GlassInput secureTextEntry placeholder="Confirm new password" value={confirmNewPassword} onChangeText={setConfirmNewPassword} />
      {message ? <Text className="text-text-secondary text-xs">{message}</Text> : null}
      <Pressable
        onPress={handleSubmit}
        disabled={saving || !currentPassword || !newPassword}
        className="self-start bg-white/10 border border-white/15 rounded-xl py-2 px-4 mt-1"
        style={{ opacity: saving || !currentPassword || !newPassword ? 0.5 : 1 }}
      >
        <Text className="text-text-primary text-sm font-semibold">{saving ? 'Updating...' : 'Update Password'}</Text>
      </Pressable>
    </GlassPanel>
  );
}

function TwoFactorSection({ mfaEnabled, onStatusChange }: { mfaEnabled: boolean; onStatusChange: (v: boolean) => void }) {
  const [enrollStep, setEnrollStep] = useState<'idle' | 'setup' | 'recovery-codes'>('idle');
  const [setupData, setSetupData] = useState<MfaSetupData | null>(null);
  const [enrollCode, setEnrollCode] = useState('');
  const [enrollError, setEnrollError] = useState('');
  const [enrollSaving, setEnrollSaving] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [codesAcknowledged, setCodesAcknowledged] = useState(false);

  const [showDisableForm, setShowDisableForm] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableError, setDisableError] = useState('');
  const [disableSaving, setDisableSaving] = useState(false);

  const startSetup = async () => {
    setEnrollError('');
    try {
      const data = await authService.setupMfa();
      setSetupData(data);
      setEnrollStep('setup');
    } catch (err: any) {
      setEnrollError(err?.message || 'Failed to start 2FA setup.');
    }
  };

  const confirmEnable = async () => {
    setEnrollError('');
    setEnrollSaving(true);
    try {
      const result = await authService.enableMfa(enrollCode);
      setRecoveryCodes(result?.recoveryCodes || []);
      setEnrollStep('recovery-codes');
    } catch (err: any) {
      setEnrollError(err?.message || 'Invalid code. Please try again.');
    } finally {
      setEnrollSaving(false);
    }
  };

  const finishEnrollment = () => {
    onStatusChange(true);
    setEnrollStep('idle');
    setSetupData(null);
    setEnrollCode('');
    setRecoveryCodes([]);
    setCodesAcknowledged(false);
  };

  const handleDisable = async () => {
    setDisableError('');
    setDisableSaving(true);
    try {
      await authService.disableMfa(disablePassword, disableCode);
      onStatusChange(false);
      setShowDisableForm(false);
      setDisablePassword('');
      setDisableCode('');
    } catch (err: any) {
      setDisableError(err?.message || 'Failed to disable 2FA.');
    } finally {
      setDisableSaving(false);
    }
  };

  return (
    <GlassPanel className="p-4 gap-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-text-primary text-sm font-semibold">Two-Factor Authentication (2FA)</Text>
          <Text className="text-text-muted text-xs">Add an extra layer of security using TOTP apps.</Text>
        </View>
        <View className={cn('py-1 px-2 rounded-md', mfaEnabled ? 'bg-[rgba(34,197,94,0.15)]' : 'bg-white/10')}>
          <Text className={cn('text-xs font-bold', mfaEnabled ? 'text-[#4ade80]' : 'text-text-secondary')}>
            {mfaEnabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
      </View>

      {!mfaEnabled && enrollStep === 'idle' && (
        <Pressable onPress={startSetup} className="self-start bg-accent-indigo/80 rounded-xl py-2 px-4">
          <Text className="text-white text-sm font-semibold">Set Up 2FA</Text>
        </Pressable>
      )}

      {enrollStep === 'setup' && setupData && (
        <View className="gap-3">
          <Text className="text-text-secondary text-xs">Scan this QR code with your authenticator app:</Text>
          <View className="bg-white p-3 rounded-xl self-start">
            <QRCode value={setupData.otpAuthUri} size={150} />
          </View>
          <Text className="text-text-muted text-xs">
            Or enter this code manually: <Text className="text-[#c084fc] font-mono">{setupData.secret}</Text>
          </Text>
          <GlassInput placeholder="Enter the 6-digit code to confirm" value={enrollCode} onChangeText={setEnrollCode} keyboardType="number-pad" />
          {enrollError ? <Text className="text-[#f87171] text-xs">{enrollError}</Text> : null}
          <Pressable
            onPress={confirmEnable}
            disabled={enrollSaving || !enrollCode.trim()}
            className="self-start bg-accent-indigo/80 rounded-xl py-2 px-4"
            style={{ opacity: enrollSaving || !enrollCode.trim() ? 0.5 : 1 }}
          >
            <Text className="text-white text-sm font-semibold">{enrollSaving ? 'Confirming...' : 'Confirm & Enable'}</Text>
          </Pressable>
        </View>
      )}

      {enrollStep === 'recovery-codes' && (
        <View className="gap-3">
          <Text className="text-[#fde047] text-sm font-semibold">Save these recovery codes now - they won't be shown again.</Text>
          <View className="bg-black/30 p-3 rounded-xl flex-row flex-wrap gap-2">
            {recoveryCodes.map((code) => (
              <Text key={code} className="text-text-primary text-xs font-mono w-1/2">
                {code}
              </Text>
            ))}
          </View>
          <Pressable onPress={() => setCodesAcknowledged((v) => !v)} className="flex-row items-center gap-2">
            <View className={cn('w-5 h-5 rounded items-center justify-center border', codesAcknowledged ? 'bg-accent-indigo border-accent-indigo' : 'border-white/20')}>
              {codesAcknowledged ? <CheckCircle2 size={14} color="#fff" /> : null}
            </View>
            <Text className="text-text-secondary text-xs">I've saved these recovery codes</Text>
          </Pressable>
          <Pressable
            onPress={finishEnrollment}
            disabled={!codesAcknowledged}
            className="self-start bg-accent-indigo/80 rounded-xl py-2 px-4"
            style={{ opacity: codesAcknowledged ? 1 : 0.5 }}
          >
            <Text className="text-white text-sm font-semibold">Done</Text>
          </Pressable>
        </View>
      )}

      {mfaEnabled && !showDisableForm && (
        <Pressable onPress={() => setShowDisableForm(true)} className="self-start bg-white/10 border border-white/15 rounded-xl py-2 px-4">
          <Text className="text-text-primary text-sm font-semibold">Disable 2FA</Text>
        </Pressable>
      )}

      {mfaEnabled && showDisableForm && (
        <View className="gap-2">
          <GlassInput secureTextEntry placeholder="Current password" value={disablePassword} onChangeText={setDisablePassword} />
          <GlassInput placeholder="6-digit authenticator code" value={disableCode} onChangeText={setDisableCode} keyboardType="number-pad" />
          {disableError ? <Text className="text-[#f87171] text-xs">{disableError}</Text> : null}
          <View className="flex-row gap-2">
            <Pressable
              onPress={handleDisable}
              disabled={disableSaving || !disablePassword || !disableCode}
              className="bg-white/10 border border-white/15 rounded-xl py-2 px-4"
              style={{ opacity: disableSaving || !disablePassword || !disableCode ? 0.5 : 1 }}
            >
              <Text className="text-text-primary text-sm font-semibold">{disableSaving ? 'Disabling...' : 'Confirm Disable'}</Text>
            </Pressable>
            <Pressable onPress={() => setShowDisableForm(false)} className="bg-white/10 border border-white/15 rounded-xl py-2 px-4">
              <Text className="text-text-primary text-sm font-semibold">Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </GlassPanel>
  );
}
