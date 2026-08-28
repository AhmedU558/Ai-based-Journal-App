import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, ShieldCheck, Palette, AlertCircle, Users, Camera, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';
import { authService } from '@/services/authService';
import { userService } from '@/services/userService';
import { adminService } from '@/services/adminService';
import { fileService } from '@/services/fileService';
import ThemeCustomizer from './ThemeCustomizer';
import AvatarCropModal from './AvatarCropModal';
import { useModalA11y } from '@/lib/useModalA11y';
import PasswordInput from './PasswordInput';

const MAX_AVATAR_SOURCE_BYTES = 10 * 1024 * 1024; // 10MB - generous for a phone photo, well under server limits

type SettingsTab = 'profile' | 'security' | 'appearance' | 'admin';

interface AdminUser {
  id: number;
  username: string;
  email: string;
  fullName?: string;
  roles: string[];
  enabled: boolean;
  mfaEnabled?: boolean;
  createdAt?: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEmailVerified?: () => void;
  onAvatarChanged?: () => void;
  onAccountDeleted?: () => void;
}

interface CurrentUser {
  username?: string;
  email?: string;
  fullName?: string;
}

interface ProfileData {
  bio?: string;
  avatarUrl?: string;
  phoneNumber?: string;
  country?: string;
  city?: string;
}

export default function SettingsModal({ isOpen, onClose, onEmailVerified, onAvatarChanged, onAccountDeleted }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const isAdmin = authService.isAdmin();
  const panelRef = useModalA11y(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/65 backdrop-blur-[8px] z-[9999] flex items-center justify-center p-6"
      >
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Account & System Settings"
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          onClick={(e) => e.stopPropagation()}
          className="glass-panel w-full max-w-[780px] max-h-[85vh] flex flex-col overflow-hidden shadow-[0_24px_48px_rgba(0,0,0,0.5)] outline-none"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between py-5 px-6 border-b border-b-[var(--text-primary)]/[0.08]">
            <h2 className="text-[1.3rem] font-bold">Account & System Settings</h2>
            <button onClick={onClose} className="bg-transparent border-0 text-[var(--text-muted)] cursor-pointer" aria-label="Close">
              <X size={20} />
            </button>
          </div>

          {/* Modal Body: Sidebar Tabs + Main View */}
          <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
            {/* Inner Settings Sidebar - horizontal scrollable tab row on mobile, vertical list from sm: up */}
            <div className="w-full sm:w-[220px] shrink-0 border-b sm:border-b-0 sm:border-r border-[var(--text-primary)]/[0.08] p-4 flex flex-row sm:flex-col gap-[0.35rem] overflow-x-auto sm:overflow-x-visible">
              <SettingsTabBtn icon={<User size={16} />} label="Profile & User" active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
              <SettingsTabBtn icon={<ShieldCheck size={16} />} label="Security & Sessions" active={activeTab === 'security'} onClick={() => setActiveTab('security')} />
              <SettingsTabBtn icon={<Palette size={16} />} label="Appearance & Themes" active={activeTab === 'appearance'} onClick={() => setActiveTab('appearance')} />
              {isAdmin && (
                <SettingsTabBtn icon={<Users size={16} />} label="Admin" active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} />
              )}
            </div>

            {/* Inner Tab Content */}
            <div className="flex-1 p-6 overflow-y-auto">
              {activeTab === 'profile' && <ProfileTab isOpen={isOpen} onAvatarChanged={onAvatarChanged} />}
              {activeTab === 'security' && <SecurityTab isOpen={isOpen} onEmailVerified={onEmailVerified} onAccountDeleted={onAccountDeleted} />}

              {activeTab === 'appearance' && (
                <div className="flex flex-col gap-5">
                  <h3 className="text-[1.1rem] font-bold">Appearance & Theme Palettes</h3>
                  <p className="text-[0.85rem] text-[var(--text-secondary)]">
                    Choose your preferred color accent palette for glassmorphism panels.
                  </p>
                  <ThemeCustomizer />
                </div>
              )}

              {activeTab === 'admin' && isAdmin && <AdminTab isOpen={isOpen} />}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function ProfileTab({ isOpen, onAvatarChanged }: { isOpen: boolean; onAvatarChanged?: () => void }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [profile, setProfile] = useState<ProfileData>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const avatarObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  // Fetches and displays the current avatar as an object URL - the download
  // endpoint requires a bearer token a plain <img src> can't attach. Revokes
  // the previous object URL before creating a new one so replacing/clearing
  // the avatar doesn't leak blob URLs.
  useEffect(() => {
    let cancelled = false;
    if (!profile.avatarUrl) {
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = null;
      }
      setAvatarPreviewUrl(null);
      return;
    }
    fileService
      .getBlobUrl(profile.avatarUrl)
      .then((url) => {
        if (cancelled) return;
        if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = url;
        setAvatarPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setAvatarPreviewUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [profile.avatarUrl]);

  useEffect(() => {
    return () => {
      if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
    };
  }, []);

  // Only picks the file and opens the crop step - the actual upload happens
  // in handleAvatarCropped once the user confirms a crop, matching the
  // familiar Facebook/Twitter "pick, then reposition, then save" flow rather
  // than uploading whatever crop the original photo happened to have.
  const handleAvatarSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarError('');
    if (file.size > MAX_AVATAR_SOURCE_BYTES) {
      setAvatarError('That photo is too large (max 10MB). Please choose a smaller one.');
      return;
    }
    setPendingAvatarFile(file);
  };

  // Persists immediately (not deferred until "Save Profile") so the header
  // and sidebar avatar pills pick up the new photo right away instead of
  // only after an unrelated Save click elsewhere in this form.
  const handleAvatarCropped = async (blob: Blob) => {
    setPendingAvatarFile(null);
    const croppedFile = new File([blob], 'avatar.png', { type: 'image/png' });
    setAvatarError('');
    setAvatarUploading(true);
    try {
      const uploaded = await fileService.upload(croppedFile);
      const newPath = uploaded?.filePath;
      if (!newPath) throw new Error('Upload did not return a file path.');
      const oldPath = profile.avatarUrl;
      const updated = await userService.updateProfile({ ...profile, avatarUrl: newPath });
      setProfile(updated || { ...profile, avatarUrl: newPath });
      if (oldPath) {
        // Best-effort - a failed cleanup of the old file must never block the
        // new avatar from taking effect.
        fileService.remove(oldPath).catch(() => {});
      }
      onAvatarChanged?.();
    } catch (err: any) {
      setAvatarError(err?.message || 'Failed to upload avatar.');
    } finally {
      setAvatarUploading(false);
    }
  };

  // Persists the removal immediately for the same reason - the photo must
  // actually be gone from the account (and the header/sidebar) the moment
  // the user asks for that, not silently reappear if the modal is closed
  // without an unrelated Save click. The old file is deleted from
  // file-service's storage best-effort, mirroring handleAvatarCropped above.
  const handleAvatarRemove = async () => {
    if (!profile.avatarUrl) return;
    setAvatarError('');
    setAvatarUploading(true);
    const oldPath = profile.avatarUrl;
    try {
      const updated = await userService.updateProfile({ ...profile, avatarUrl: undefined });
      setProfile(updated || { ...profile, avatarUrl: undefined });
      fileService.remove(oldPath).catch(() => {});
      onAvatarChanged?.();
    } catch (err: any) {
      setAvatarError(err?.message || 'Failed to remove avatar.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
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

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="skeleton-pulse h-6 w-40 rounded-lg" />
        <div className="skeleton-pulse h-10 rounded-lg" />
        <div className="skeleton-pulse h-10 rounded-lg" />
        <div className="skeleton-pulse h-20 rounded-lg" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[#f87171] py-3 px-4 rounded-xl flex items-center gap-2">
        <AlertCircle size={18} />
        <span>{loadError}</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5">
      <h3 className="text-[1.1rem] font-bold">User Profile</h3>

      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 shrink-0">
          {avatarPreviewUrl ? (
            <img src={avatarPreviewUrl} alt="Profile avatar" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[var(--text-primary)]/[0.06] flex items-center justify-center">
              <User size={28} className="text-[var(--text-muted)]" />
            </div>
          )}
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#6366f1] flex items-center justify-center border-2 border-[var(--panel-bg)]"
            title="Change avatar"
          >
            <Camera size={12} color="white" />
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarSelect}
          />
        </div>
        <div>
          <div className="text-[0.85rem] font-semibold">Profile Photo</div>
          <div className="text-xs text-[var(--text-muted)]">{avatarUploading ? 'Uploading...' : 'PNG or JPG, click the camera to change'}</div>
          {profile.avatarUrl && !avatarUploading && (
            <button
              type="button"
              onClick={handleAvatarRemove}
              className="text-xs text-[#f87171] underline hover:opacity-80 mt-1"
            >
              Remove photo
            </button>
          )}
          {avatarError && <div className="text-xs text-[#f87171] mt-1">{avatarError}</div>}
        </div>
      </div>

      {pendingAvatarFile && (
        <AvatarCropModal
          file={pendingAvatarFile}
          onCancel={() => setPendingAvatarFile(null)}
          onCropped={handleAvatarCropped}
        />
      )}

      <div>
        <label className="text-[0.8rem] text-[var(--text-secondary)] block mb-[0.35rem]">Username</label>
        <input type="text" className="glass-input" value={currentUser?.username || ''} readOnly />
      </div>
      <div>
        <label className="text-[0.8rem] text-[var(--text-secondary)] block mb-[0.35rem]">Primary Email</label>
        <input type="email" className="glass-input" value={currentUser?.email || ''} readOnly />
      </div>
      <div>
        <label className="text-[0.8rem] text-[var(--text-secondary)] block mb-[0.35rem]">Bio</label>
        <textarea
          className="glass-input"
          rows={3}
          value={profile.bio || ''}
          onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-[0.8rem] text-[var(--text-secondary)] block mb-[0.35rem]">Phone Number</label>
          <input
            type="text"
            className="glass-input"
            value={profile.phoneNumber || ''}
            onChange={(e) => setProfile({ ...profile, phoneNumber: e.target.value })}
          />
        </div>
        <div>
          <label className="text-[0.8rem] text-[var(--text-secondary)] block mb-[0.35rem]">Country</label>
          <input
            type="text"
            className="glass-input"
            value={profile.country || ''}
            onChange={(e) => setProfile({ ...profile, country: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="text-[0.8rem] text-[var(--text-secondary)] block mb-[0.35rem]">City</label>
        <input
          type="text"
          className="glass-input"
          value={profile.city || ''}
          onChange={(e) => setProfile({ ...profile, city: e.target.value })}
        />
      </div>

      {message && <p className="text-[0.8rem] text-[var(--text-secondary)]">{message}</p>}

      <button type="submit" disabled={saving} className="btn-primary self-start px-6">
        {saving ? 'Saving...' : 'Save Profile'}
      </button>
    </form>
  );
}

function SecurityTab({ isOpen, onEmailVerified, onAccountDeleted }: { isOpen: boolean; onEmailVerified?: () => void; onAccountDeleted?: () => void }) {
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [mfaLoadError, setMfaLoadError] = useState('');
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  const handleVerified = () => {
    setEmailVerified(true);
    onEmailVerified?.();
  };

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-[1.1rem] font-bold">Security & Sessions</h3>

      <PasswordChangeSection />

      {emailVerified === null ? (
        <div className="skeleton-pulse h-16 rounded-xl" />
      ) : (
        <EmailVerificationSection emailVerified={emailVerified} onVerified={handleVerified} />
      )}

      {mfaLoadError ? (
        <div className="bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[#f87171] py-3 px-4 rounded-xl flex items-center gap-2">
          <AlertCircle size={18} />
          <span>{mfaLoadError}</span>
        </div>
      ) : mfaEnabled === null ? (
        <div className="skeleton-pulse h-16 rounded-xl" />
      ) : (
        <TwoFactorSection mfaEnabled={mfaEnabled} onStatusChange={setMfaEnabled} />
      )}

      <LoginHistorySection isOpen={isOpen} />

      <DeleteAccountSection onAccountDeleted={onAccountDeleted} />
    </div>
  );
}

// Google Play requires any app offering account creation to provide a way to
// delete that account - both in-app and via a URL reachable without the app.
// userService.deleteAccount() and the backend behind it already existed and
// were complete (auth-service delete is mandatory and aborts the whole
// operation if it fails, so a user can never end up able to log in with their
// data gone); nothing had ever called them. This is that caller, and it
// doubles as the web deletion URL the Play listing points at.
function DeleteAccountSection({ onAccountDeleted }: { onAccountDeleted?: () => void }) {
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
      // The account is gone, so the session is meaningless - hand off to the
      // app shell, which clears local state and returns to the login view.
      onAccountDeleted?.();
    } catch (err: any) {
      setError(err?.message || 'Could not delete your account. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <div className="border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.06)] rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Trash2 size={18} className="text-[#f87171]" />
        <h4 className="text-[0.95rem] font-bold text-[#f87171]">Delete account</h4>
      </div>

      <p className="text-[0.85rem] text-[var(--text-secondary)] leading-[1.5]">
        Permanently deletes your account, journal entries, uploaded files, profile and
        preferences. This cannot be undone, and your entries cannot be recovered afterwards.
      </p>

      {error && (
        <div className="bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[#f87171] py-2 px-3 rounded-lg flex items-center gap-2 text-[0.85rem]">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="self-start border border-[rgba(239,68,68,0.5)] text-[#f87171] py-2 px-4 rounded-xl text-[0.85rem] font-semibold cursor-pointer hover:bg-[rgba(239,68,68,0.12)]"
        >
          Delete my account
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor="delete-confirm" className="text-[0.8rem] text-[var(--text-secondary)]">
            Type <strong className="text-[var(--text-primary)]">DELETE</strong> to confirm
          </label>
          <input
            id="delete-confirm"
            className="glass-input"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            disabled={deleting}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canDelete || deleting}
              className={cn(
                'py-2 px-4 rounded-xl text-[0.85rem] font-semibold',
                canDelete && !deleting
                  ? 'bg-[#dc2626] text-white cursor-pointer hover:bg-[#b91c1c]'
                  : 'bg-[rgba(239,68,68,0.2)] text-[rgba(248,113,113,0.6)] cursor-not-allowed'
              )}
            >
              {deleting ? 'Deleting...' : 'Permanently delete'}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setConfirmText('');
                setError('');
              }}
              disabled={deleting}
              className="py-2 px-4 rounded-xl text-[0.85rem] text-[var(--text-secondary)] border border-[var(--text-primary)]/10 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface LoginHistoryEntry {
  id: number;
  loginTime: string;
  ipAddress?: string;
  userAgent?: string;
  status: string;
}

function LoginHistorySection({ isOpen }: { isOpen: boolean }) {
  const [entries, setEntries] = useState<LoginHistoryEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  return (
    <div className="flex flex-col gap-3 p-[0.85rem] bg-[var(--text-primary)]/[0.03] rounded-xl">
      <div>
        <div className="text-[0.9rem] font-semibold">Recent Logins</div>
        <div className="text-xs text-[var(--text-muted)]">The last few times this account signed in, successful or not.</div>
      </div>

      {error ? (
        <div className="bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[#f87171] py-2 px-3 rounded-lg flex items-center gap-2 text-[0.8rem]">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      ) : entries === null ? (
        <div className="skeleton-pulse h-16 rounded-lg" />
      ) : entries.length === 0 ? (
        <div className="text-[0.8rem] text-[var(--text-muted)]">No login history yet.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 py-2 border-b border-[var(--text-primary)]/[0.05] last:border-b-0">
              <div className="min-w-0">
                <div className="text-[0.82rem] text-[var(--text-secondary)]">
                  {new Date(entry.loginTime).toLocaleString()}
                </div>
                <div className="text-xs text-[var(--text-muted)] truncate">
                  {entry.ipAddress || 'Unknown IP'}
                  {entry.userAgent ? ` · ${entry.userAgent}` : ''}
                </div>
              </div>
              <span
                className={cn(
                  'text-xs py-[0.2rem] px-2 rounded-md font-bold shrink-0',
                  entry.status === 'SUCCESS'
                    ? 'bg-[rgba(34,197,94,0.15)] text-[#4ade80]'
                    : 'bg-[rgba(239,68,68,0.15)] text-[#f87171]'
                )}
              >
                {entry.status === 'SUCCESS' ? 'Success' : 'Failed'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface EmailVerificationSectionProps {
  emailVerified: boolean;
  onVerified: () => void;
}

function EmailVerificationSection({ emailVerified, onVerified }: EmailVerificationSectionProps) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
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
    <div className="flex flex-col gap-3 p-[0.85rem] bg-[var(--text-primary)]/[0.03] rounded-xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[0.9rem] font-semibold">Email Verification</div>
          <div className="text-xs text-[var(--text-muted)]">Confirm you own the email address on this account.</div>
        </div>
        <span
          className={cn(
            'text-xs py-[0.2rem] px-2 rounded-md font-bold',
            emailVerified ? 'bg-[rgba(34,197,94,0.15)] text-[#4ade80]' : 'bg-[rgba(245,158,11,0.15)] text-[#fbbf24]'
          )}
        >
          {emailVerified ? 'Verified' : 'Not verified'}
        </span>
      </div>

      {!emailVerified && (
        <form onSubmit={handleVerify} className="flex flex-col gap-2">
          <input
            type="text"
            required
            inputMode="numeric"
            pattern="[0-9]{4,6}"
            maxLength={6}
            className="glass-input"
            placeholder="Enter the 6-digit code emailed to you"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          {message && <p className="text-[0.8rem] text-[var(--text-secondary)]">{message}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={verifying} className="btn-primary self-start px-5 text-[0.85rem]">
              {verifying ? 'Verifying...' : 'Verify'}
            </button>
            <button
              type="button"
              disabled={resending}
              onClick={handleResend}
              className="text-[0.8rem] text-[#818cf8] underline hover:opacity-80 disabled:opacity-50"
            >
              {resending ? 'Sending...' : 'Resend code'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function PasswordChangeSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-[0.85rem] bg-[var(--text-primary)]/[0.03] rounded-xl">
      <div className="text-[0.9rem] font-semibold">Change Password</div>
      <PasswordInput
        required
        withLockIcon={false}
        placeholder="Current password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
      />
      <PasswordInput
        required
        withLockIcon={false}
        minLength={8}
        maxLength={12}
        pattern="(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,12}"
        title="8-12 characters, including one uppercase letter, one number, and one special character"
        placeholder="New password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
      />
      <PasswordInput
        required
        withLockIcon={false}
        placeholder="Confirm new password"
        value={confirmNewPassword}
        onChange={(e) => setConfirmNewPassword(e.target.value)}
      />
      <p className="text-[0.75rem] text-[var(--text-muted)]">
        8-12 characters, with at least one uppercase letter, one number, and one special character.
      </p>
      {message && <p className="text-[0.8rem] text-[var(--text-secondary)]">{message}</p>}
      <button type="submit" disabled={saving} className="btn-secondary self-start px-5 text-[0.85rem]">
        {saving ? 'Updating...' : 'Update Password'}
      </button>
    </form>
  );
}

interface TwoFactorSectionProps {
  mfaEnabled: boolean;
  onStatusChange: (enabled: boolean) => void;
}

function TwoFactorSection({ mfaEnabled, onStatusChange }: TwoFactorSectionProps) {
  const [enrollStep, setEnrollStep] = useState<'idle' | 'setup' | 'recovery-codes'>('idle');
  const [setupData, setSetupData] = useState<{ secret: string; otpAuthUri: string } | null>(null);
  const [enrollCode, setEnrollCode] = useState('');
  const [enrollError, setEnrollError] = useState('');
  const [enrollSaving, setEnrollSaving] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [codesAcknowledged, setCodesAcknowledged] = useState(false);

  const [showDisableForm, setShowDisableForm] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableUseRecoveryCode, setDisableUseRecoveryCode] = useState(false);
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

  const confirmEnable = async (e: FormEvent) => {
    e.preventDefault();
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

  const handleDisable = async (e: FormEvent) => {
    e.preventDefault();
    setDisableError('');
    setDisableSaving(true);
    try {
      if (disableUseRecoveryCode) {
        await authService.disableMfa(disablePassword, undefined, disableCode);
      } else {
        await authService.disableMfa(disablePassword, disableCode);
      }
      onStatusChange(false);
      setShowDisableForm(false);
      setDisablePassword('');
      setDisableCode('');
      setDisableUseRecoveryCode(false);
    } catch (err: any) {
      setDisableError(err?.message || 'Failed to disable 2FA.');
    } finally {
      setDisableSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-[0.85rem] bg-[var(--text-primary)]/[0.03] rounded-xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[0.9rem] font-semibold">Two-Factor Authentication (2FA)</div>
          <div className="text-xs text-[var(--text-muted)]">Add an extra layer of security using TOTP apps.</div>
        </div>
        <span
          className={cn(
            'text-xs py-[0.2rem] px-2 rounded-md font-bold',
            mfaEnabled ? 'bg-[rgba(34,197,94,0.15)] text-[#4ade80]' : 'bg-[rgba(148,163,184,0.15)] text-[var(--text-secondary)]'
          )}
        >
          {mfaEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {!mfaEnabled && enrollStep === 'idle' && (
        <button type="button" onClick={startSetup} className="btn-primary self-start px-5 text-[0.85rem]">
          Set Up 2FA
        </button>
      )}

      {enrollStep === 'setup' && setupData && (
        <div className="flex flex-col gap-3">
          <p className="text-[0.8rem] text-[var(--text-secondary)]">Scan this QR code with your authenticator app:</p>
          <div className="bg-white p-3 rounded-xl self-start">
            <QRCodeSVG value={setupData.otpAuthUri} size={160} />
          </div>
          <p className="text-[0.75rem] text-[var(--text-muted)]">
            Or enter this code manually: <code className="text-[#c084fc]">{setupData.secret}</code>
          </p>
          <form onSubmit={confirmEnable} className="flex flex-col gap-2">
            <input
              type="text"
              required
              autoFocus
              className="glass-input"
              placeholder="Enter the 6-digit code to confirm"
              value={enrollCode}
              onChange={(e) => setEnrollCode(e.target.value)}
            />
            {enrollError && <p className="text-[0.8rem] text-[#f87171]">{enrollError}</p>}
            <button type="submit" disabled={enrollSaving} className="btn-primary self-start px-5 text-[0.85rem]">
              {enrollSaving ? 'Confirming...' : 'Confirm & Enable'}
            </button>
          </form>
        </div>
      )}

      {enrollStep === 'recovery-codes' && (
        <div className="flex flex-col gap-3">
          <p className="text-[0.85rem] font-semibold text-[#fde047]">
            Save these recovery codes now - they won't be shown again.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-black/30 p-3 rounded-xl font-mono text-[0.8rem]">
            {recoveryCodes.map((code) => (
              <span key={code}>{code}</span>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[0.8rem] text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={codesAcknowledged}
              onChange={(e) => setCodesAcknowledged(e.target.checked)}
            />
            I've saved these recovery codes
          </label>
          <button
            type="button"
            disabled={!codesAcknowledged}
            onClick={finishEnrollment}
            className="btn-primary self-start px-5 text-[0.85rem]"
          >
            Done
          </button>
        </div>
      )}

      {mfaEnabled && !showDisableForm && (
        <button
          type="button"
          onClick={() => setShowDisableForm(true)}
          className="btn-secondary self-start px-5 text-[0.85rem]"
        >
          Disable 2FA
        </button>
      )}

      {mfaEnabled && showDisableForm && (
        <form onSubmit={handleDisable} className="flex flex-col gap-2">
          <PasswordInput
            required
            withLockIcon={false}
            placeholder="Current password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
          />
          <input
            type="text"
            required
            className="glass-input"
            placeholder={disableUseRecoveryCode ? 'Recovery code' : '6-digit authenticator code'}
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              setDisableUseRecoveryCode((prev) => !prev);
              setDisableCode('');
            }}
            className="text-[0.75rem] text-[#818cf8] self-start underline"
          >
            {disableUseRecoveryCode ? 'Use my authenticator code instead' : "Lost your device? Use a recovery code instead"}
          </button>
          {disableError && <p className="text-[0.8rem] text-[#f87171]">{disableError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={disableSaving} className="btn-secondary px-5 text-[0.85rem]">
              {disableSaving ? 'Disabling...' : 'Confirm Disable'}
            </button>
            <button type="button" onClick={() => setShowDisableForm(false)} className="btn-secondary px-5 text-[0.85rem]">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function AdminTab({ isOpen }: { isOpen: boolean }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const currentUserId = authService.getCurrentUserId();

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    adminService
      .listUsers()
      .then((res: any) => {
        if (cancelled) return;
        setUsers(res?.data?.data?.content || []);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Failed to load users. Please try reopening Settings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const patchUser = (updated: AdminUser) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="skeleton-pulse h-6 w-40 rounded-lg" />
        <div className="skeleton-pulse h-16 rounded-xl" />
        <div className="skeleton-pulse h-16 rounded-xl" />
        <div className="skeleton-pulse h-16 rounded-xl" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[#f87171] py-3 px-4 rounded-xl flex items-center gap-2">
        <AlertCircle size={18} />
        <span>{loadError}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-[1.1rem] font-bold">User Administration</h3>
        <p className="text-[0.8rem] text-[var(--text-secondary)]">{users.length} account{users.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="flex flex-col gap-3">
        {users.map((user) => (
          <AdminUserRow key={user.id} user={user} isSelf={user.id === currentUserId} onUpdated={patchUser} />
        ))}
      </div>
    </div>
  );
}

interface AdminUserRowProps {
  user: AdminUser;
  isSelf: boolean;
  onUpdated: (user: AdminUser) => void;
}

function AdminUserRow({ user, isSelf, onUpdated }: AdminUserRowProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isUserAdmin = user.roles.includes('ROLE_ADMIN');

  const toggleAdminRole = async () => {
    setError('');
    setBusy(true);
    try {
      const nextRoles = isUserAdmin ? ['ROLE_USER'] : ['ROLE_USER', 'ROLE_ADMIN'];
      const res: any = await adminService.updateRoles(user.id, nextRoles);
      onUpdated(res?.data?.data || { ...user, roles: nextRoles });
    } catch (err: any) {
      setError(err?.message || 'Failed to update roles.');
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async () => {
    setError('');
    setBusy(true);
    try {
      const res: any = await adminService.updateStatus(user.id, !user.enabled);
      onUpdated(res?.data?.data || { ...user, enabled: !user.enabled });
    } catch (err: any) {
      setError(err?.message || 'Failed to update account status.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetMfa = async () => {
    setError('');
    setBusy(true);
    try {
      const res: any = await adminService.resetMfa(user.id);
      onUpdated(res?.data?.data || { ...user, mfaEnabled: false });
    } catch (err: any) {
      setError(err?.message || 'Failed to reset 2FA.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 py-3 px-4 bg-[var(--text-primary)]/[0.03] rounded-xl border border-[var(--text-primary)]/[0.06]">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[0.85rem] font-semibold text-[var(--text-primary)]">
            {user.username} <span className="text-[var(--text-muted)] font-normal">({user.email})</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {user.roles.map((role) => (
              <span key={role} className="text-[0.65rem] py-[0.15rem] px-2 rounded-md font-bold bg-[rgba(99,102,241,0.15)] text-[#818cf8]">
                {role}
              </span>
            ))}
            <span
              className={cn(
                'text-[0.65rem] py-[0.15rem] px-2 rounded-md font-bold',
                user.enabled ? 'bg-[rgba(34,197,94,0.15)] text-[#4ade80]' : 'bg-[rgba(239,68,68,0.15)] text-[#f87171]'
              )}
            >
              {user.enabled ? 'Active' : 'Disabled'}
            </span>
          </div>
        </div>
        {isSelf ? (
          <span className="text-[0.7rem] text-[var(--text-muted)] italic">This is your account</span>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={toggleAdminRole}
              className="btn-secondary py-[0.35rem] px-3 text-[0.75rem]"
            >
              {isUserAdmin ? 'Remove Admin' : 'Make Admin'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={toggleStatus}
              className="btn-secondary py-[0.35rem] px-3 text-[0.75rem]"
            >
              {user.enabled ? 'Disable' : 'Enable'}
            </button>
            {user.mfaEnabled && (
              <button
                type="button"
                disabled={busy}
                onClick={handleResetMfa}
                className="btn-secondary py-[0.35rem] px-3 text-[0.75rem]"
                title="Escape hatch for a lost authenticator with no usable recovery codes left"
              >
                Reset 2FA
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-[0.75rem] text-[#f87171]">{error}</p>}
    </div>
  );
}

interface SettingsTabBtnProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function SettingsTabBtn({ icon, label, active, onClick }: SettingsTabBtnProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-[0.65rem] py-[0.65rem] px-[0.85rem] rounded-[10px] border-0 text-[0.85rem] cursor-pointer text-left shrink-0 sm:w-full sm:shrink whitespace-nowrap',
        active
          ? 'bg-[linear-gradient(135deg,rgba(99,102,241,0.25),rgba(168,85,247,0.15))] text-[var(--text-primary)] font-semibold'
          : 'bg-transparent text-[var(--text-secondary)] font-medium'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

