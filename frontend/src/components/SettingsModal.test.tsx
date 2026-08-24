import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsModal from './SettingsModal';
import { authService } from '@/services/authService';
import { userService } from '@/services/userService';
import { adminService } from '@/services/adminService';
import { fileService } from '@/services/fileService';

vi.mock('@/services/authService', async () => {
  const actual = await vi.importActual<typeof import('@/services/authService')>('@/services/authService');
  return {
    authService: {
      ...actual.authService,
      getCurrentUser: vi.fn(),
      changePassword: vi.fn(),
      getMfaStatus: vi.fn(),
      setupMfa: vi.fn(),
      enableMfa: vi.fn(),
      disableMfa: vi.fn(),
      verifyEmail: vi.fn(),
      resendVerificationEmail: vi.fn(),
    },
  };
});

vi.mock('@/services/userService', () => ({
  userService: {
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
  },
}));

vi.mock('@/services/adminService', () => ({
  adminService: {
    listUsers: vi.fn(),
    updateRoles: vi.fn(),
    updateStatus: vi.fn(),
    resetMfa: vi.fn(),
  },
}));

vi.mock('@/services/fileService', () => ({
  fileService: {
    upload: vi.fn(),
    getBlobUrl: vi.fn(),
    remove: vi.fn(),
  },
}));

// jsdom doesn't decode real images or support canvas pixel operations, so the
// real crop UI's drag/zoom/canvas-export can't be driven in this environment
// - stub it down to its two callback props, which is what this test suite
// actually needs to verify (that picking a file opens the crop step, and
// that confirming a crop uploads the result).
vi.mock('./AvatarCropModal', () => ({
  default: ({ onCancel, onCropped }: { onCancel: () => void; onCropped: (blob: Blob) => void }) => (
    <div>
      {/* type="button" matters: this renders inside ProfileTab's <form>, and
          a plain <button> without an explicit type defaults to type="submit"
          in HTML - would otherwise submit the profile form instead of
          confirming the crop. */}
      <button type="button" onClick={() => onCropped(new Blob(['cropped-bytes'], { type: 'image/png' }))}>Use Photo</button>
      <button type="button" onClick={onCancel}>Cancel Crop</button>
    </div>
  ),
}));

const mockedGetCurrentUser = vi.mocked(authService.getCurrentUser);
const mockedChangePassword = vi.mocked(authService.changePassword);
const mockedGetMfaStatus = vi.mocked(authService.getMfaStatus);
const mockedSetupMfa = vi.mocked(authService.setupMfa);
const mockedEnableMfa = vi.mocked(authService.enableMfa);
const mockedDisableMfa = vi.mocked(authService.disableMfa);
const mockedVerifyEmail = vi.mocked(authService.verifyEmail);
const mockedResendVerificationEmail = vi.mocked(authService.resendVerificationEmail);
const mockedGetProfile = vi.mocked(userService.getProfile);
const mockedUpdateProfile = vi.mocked(userService.updateProfile);
const mockedListUsers = vi.mocked(adminService.listUsers);
const mockedUpdateRoles = vi.mocked(adminService.updateRoles);
const mockedUpdateStatus = vi.mocked(adminService.updateStatus);
const mockedResetMfa = vi.mocked(adminService.resetMfa);
const mockedUpload = vi.mocked(fileService.upload);
const mockedGetBlobUrl = vi.mocked(fileService.getBlobUrl);
const mockedRemove = vi.mocked(fileService.remove);

// authService.isAdmin()/getCurrentUserId() decode the real stored JWT
// (isAdmin/getCurrentUserId are NOT mocked above via `...actual.authService` -
// only the network-calling methods are) - build an unsigned test token with
// the desired claims rather than mocking those two functions directly.
function seedFakeJwt(payload: Record<string, unknown>) {
  const base64url = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const token = `${base64url({ alg: 'none' })}.${base64url(payload)}.fakesignature`;
  localStorage.setItem('jwt_token', token);
}

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCurrentUser.mockResolvedValue({ username: 'Alex', email: 'alex@example.com', fullName: 'Alex Example', emailVerified: false } as any);
    mockedGetProfile.mockResolvedValue({ bio: '', phoneNumber: '', country: '', city: '' } as any);
    mockedGetMfaStatus.mockResolvedValue({ mfaEnabled: false } as any);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<SettingsModal isOpen={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('loads and shows the real username and email on the profile tab', async () => {
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    expect(await screen.findByDisplayValue('Alex')).toBeInTheDocument();
    expect(screen.getByDisplayValue('alex@example.com')).toBeInTheDocument();
    expect(mockedGetCurrentUser).toHaveBeenCalledTimes(1);
    expect(mockedGetProfile).toHaveBeenCalledTimes(1);
  });

  it('saves profile edits via updateProfile', async () => {
    mockedUpdateProfile.mockResolvedValue({ bio: 'Hello world', phoneNumber: '', country: '', city: '' } as any);
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await screen.findByDisplayValue('Alex');
    const bioInput = document.querySelector('textarea')!;
    await user.type(bioInput, 'Hello world');
    await user.click(screen.getByRole('button', { name: /Save Profile/ }));

    await waitFor(() => expect(mockedUpdateProfile).toHaveBeenCalledWith(expect.objectContaining({ bio: 'Hello world' })));
  });

  it('switches to the security tab and shows disabled 2FA status', async () => {
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await user.click(screen.getByText('Security & Sessions'));

    expect(await screen.findByText('Disabled')).toBeInTheDocument();
    expect(mockedGetMfaStatus).toHaveBeenCalledTimes(1);
  });

  it('runs the full 2FA enrollment flow', async () => {
    mockedSetupMfa.mockResolvedValue({ secret: 'SECRET123', otpAuthUri: 'otpauth://totp/test' } as any);
    mockedEnableMfa.mockResolvedValue({ mfaEnabled: true, recoveryCodes: ['AAAAA-11111', 'BBBBB-22222'] } as any);
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await user.click(screen.getByText('Security & Sessions'));
    await screen.findByText('Disabled');

    await user.click(screen.getByRole('button', { name: 'Set Up 2FA' }));
    expect(await screen.findByText(/SECRET123/)).toBeInTheDocument();
    expect(mockedSetupMfa).toHaveBeenCalledTimes(1);

    await user.type(screen.getByPlaceholderText('Enter the 6-digit code to confirm'), '123456');
    await user.click(screen.getByRole('button', { name: /Confirm & Enable/ }));

    expect(await screen.findByText('AAAAA-11111')).toBeInTheDocument();
    expect(mockedEnableMfa).toHaveBeenCalledWith('123456');

    const ackCheckbox = screen.getByRole('checkbox');
    await user.click(ackCheckbox);
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByText('Enabled')).toBeInTheDocument();
  });

  it('runs the 2FA disable flow when already enabled', async () => {
    mockedGetMfaStatus.mockResolvedValue({ mfaEnabled: true } as any);
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await user.click(screen.getByText('Security & Sessions'));
    await screen.findByText('Enabled');

    await user.click(screen.getByRole('button', { name: 'Disable 2FA' }));
    // "Current password" also appears in the password-change form above -
    // the disable form's copy is the second one in document order.
    const currentPasswordInputs = screen.getAllByPlaceholderText('Current password');
    await user.type(currentPasswordInputs[currentPasswordInputs.length - 1], 'password123');
    await user.type(screen.getByPlaceholderText('6-digit authenticator code'), '123456');
    await user.click(screen.getByRole('button', { name: /Confirm Disable/ }));

    await waitFor(() => expect(mockedDisableMfa).toHaveBeenCalledWith('password123', '123456'));
    expect(await screen.findByText('Disabled')).toBeInTheDocument();
  });

  it('disables 2FA using a recovery code instead of a TOTP code', async () => {
    mockedGetMfaStatus.mockResolvedValue({ mfaEnabled: true } as any);
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await user.click(screen.getByText('Security & Sessions'));
    await screen.findByText('Enabled');

    await user.click(screen.getByRole('button', { name: 'Disable 2FA' }));
    await user.click(screen.getByRole('button', { name: /Use a recovery code instead/ }));

    const currentPasswordInputs = screen.getAllByPlaceholderText('Current password');
    await user.type(currentPasswordInputs[currentPasswordInputs.length - 1], 'password123');
    await user.type(screen.getByPlaceholderText('Recovery code'), 'AAAAA-11111');
    await user.click(screen.getByRole('button', { name: /Confirm Disable/ }));

    await waitFor(() => expect(mockedDisableMfa).toHaveBeenCalledWith('password123', undefined, 'AAAAA-11111'));
    expect(await screen.findByText('Disabled')).toBeInTheDocument();
  });

  it('changes the password via the security tab form', async () => {
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await user.click(screen.getByText('Security & Sessions'));
    await screen.findByText('Disabled');

    await user.type(screen.getByPlaceholderText('Current password'), 'oldpass123');
    await user.type(screen.getByPlaceholderText('New password'), 'NewPass1!');
    await user.type(screen.getByPlaceholderText('Confirm new password'), 'NewPass1!');
    await user.click(screen.getByRole('button', { name: /Update Password/ }));

    await waitFor(() => expect(mockedChangePassword).toHaveBeenCalledWith('oldpass123', 'NewPass1!'));
  });

  it('shows a mismatch error without calling changePassword when passwords differ', async () => {
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await user.click(screen.getByText('Security & Sessions'));
    await screen.findByText('Disabled');

    await user.type(screen.getByPlaceholderText('Current password'), 'oldpass123');
    await user.type(screen.getByPlaceholderText('New password'), 'NewPass1!');
    await user.type(screen.getByPlaceholderText('Confirm new password'), 'Different1!');
    await user.click(screen.getByRole('button', { name: /Update Password/ }));

    expect(await screen.findByText('New passwords do not match.')).toBeInTheDocument();
    expect(mockedChangePassword).not.toHaveBeenCalled();
  });

  it('shows the code input and resend link when the email is unverified', async () => {
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await user.click(screen.getByText('Security & Sessions'));

    expect(await screen.findByText('Not verified')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter the 6-digit code emailed to you')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeInTheDocument();
  });

  it('verifies the email with a valid code and updates the badge', async () => {
    mockedVerifyEmail.mockResolvedValue({} as any);
    const onEmailVerified = vi.fn();
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} onEmailVerified={onEmailVerified} />);

    await user.click(screen.getByText('Security & Sessions'));
    await screen.findByText('Not verified');

    await user.type(screen.getByPlaceholderText('Enter the 6-digit code emailed to you'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(mockedVerifyEmail).toHaveBeenCalledWith('123456'));
    expect(await screen.findByText('Verified')).toBeInTheDocument();
    expect(onEmailVerified).toHaveBeenCalledTimes(1);
    // Once verified, the code input/resend link disappear - nothing left to do.
    expect(screen.queryByPlaceholderText('Enter the 6-digit code emailed to you')).not.toBeInTheDocument();
  });

  it('shows an inline error and does not update the badge on an invalid code', async () => {
    mockedVerifyEmail.mockRejectedValue(new Error('Invalid or expired verification code'));
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await user.click(screen.getByText('Security & Sessions'));
    await screen.findByText('Not verified');

    await user.type(screen.getByPlaceholderText('Enter the 6-digit code emailed to you'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByText('Invalid or expired verification code')).toBeInTheDocument();
    expect(screen.getByText('Not verified')).toBeInTheDocument();
  });

  it('resends the verification code', async () => {
    mockedResendVerificationEmail.mockResolvedValue({} as any);
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await user.click(screen.getByText('Security & Sessions'));
    await screen.findByText('Not verified');

    await user.click(screen.getByRole('button', { name: 'Resend code' }));

    await waitFor(() => expect(mockedResendVerificationEmail).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/new verification code has been sent/)).toBeInTheDocument();
  });

  it('shows a verified badge with no code input when the email is already verified', async () => {
    mockedGetCurrentUser.mockResolvedValue({ username: 'Alex', email: 'alex@example.com', fullName: 'Alex Example', emailVerified: true } as any);
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await user.click(screen.getByText('Security & Sessions'));

    expect(await screen.findByText('Verified')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Enter the 6-digit code emailed to you')).not.toBeInTheDocument();
  });

  it('switches to the appearance tab and renders the theme customizer', async () => {
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await user.click(screen.getByText('Appearance & Themes'));

    expect(screen.getByText('Appearance & Theme Palettes')).toBeInTheDocument();
    expect(screen.getByTitle('Customize Theme Palette')).toBeInTheDocument();
  });

  it('hides the Admin tab entirely for a non-admin token', async () => {
    seedFakeJwt({ userId: 1, roles: ['ROLE_USER'] });
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await screen.findByDisplayValue('Alex');
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('shows the Admin tab and lists real users for an admin token', async () => {
    seedFakeJwt({ userId: 1, roles: ['ROLE_USER', 'ROLE_ADMIN'] });
    mockedListUsers.mockResolvedValue({
      data: {
        data: {
          content: [
            { id: 1, username: 'admin', email: 'admin@example.com', roles: ['ROLE_USER', 'ROLE_ADMIN'], enabled: true },
            { id: 2, username: 'bob', email: 'bob@example.com', roles: ['ROLE_USER'], enabled: true },
          ],
        },
      },
    } as any);
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await screen.findByDisplayValue('Alex');
    await user.click(screen.getByText('Admin'));

    expect(await screen.findByText(/bob@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/admin@example.com/)).toBeInTheDocument();
    expect(mockedListUsers).toHaveBeenCalledTimes(1);
  });

  it("disables both actions on the caller's own row", async () => {
    seedFakeJwt({ userId: 1, roles: ['ROLE_USER', 'ROLE_ADMIN'] });
    mockedListUsers.mockResolvedValue({
      data: {
        data: {
          content: [
            { id: 1, username: 'admin', email: 'admin@example.com', roles: ['ROLE_USER', 'ROLE_ADMIN'], enabled: true },
            { id: 2, username: 'bob', email: 'bob@example.com', roles: ['ROLE_USER'], enabled: true },
          ],
        },
      },
    } as any);
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await screen.findByDisplayValue('Alex');
    await user.click(screen.getByText('Admin'));
    await screen.findByText(/bob@example.com/);

    expect(screen.getByText('This is your account')).toBeInTheDocument();
    // Only bob's (id 2, non-self) row gets an actionable "Make Admin" button -
    // the admin's own row (id 1) shows "This is your account" instead of buttons.
    expect(screen.getAllByRole('button', { name: 'Make Admin' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Remove Admin' })).not.toBeInTheDocument();
  });

  it('promotes a user to admin and updates their badge', async () => {
    seedFakeJwt({ userId: 1, roles: ['ROLE_USER', 'ROLE_ADMIN'] });
    mockedListUsers.mockResolvedValue({
      data: { data: { content: [{ id: 2, username: 'bob', email: 'bob@example.com', roles: ['ROLE_USER'], enabled: true }] } },
    } as any);
    mockedUpdateRoles.mockResolvedValue({
      data: { data: { id: 2, username: 'bob', email: 'bob@example.com', roles: ['ROLE_USER', 'ROLE_ADMIN'], enabled: true } },
    } as any);
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await screen.findByDisplayValue('Alex');
    await user.click(screen.getByText('Admin'));
    await user.click(await screen.findByRole('button', { name: 'Make Admin' }));

    expect(await screen.findByRole('button', { name: 'Remove Admin' })).toBeInTheDocument();
    expect(mockedUpdateRoles).toHaveBeenCalledWith(2, ['ROLE_USER', 'ROLE_ADMIN']);
  });

  it('disables a user account and updates their badge', async () => {
    seedFakeJwt({ userId: 1, roles: ['ROLE_USER', 'ROLE_ADMIN'] });
    mockedListUsers.mockResolvedValue({
      data: { data: { content: [{ id: 2, username: 'bob', email: 'bob@example.com', roles: ['ROLE_USER'], enabled: true }] } },
    } as any);
    mockedUpdateStatus.mockResolvedValue({
      data: { data: { id: 2, username: 'bob', email: 'bob@example.com', roles: ['ROLE_USER'], enabled: false } },
    } as any);
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await screen.findByDisplayValue('Alex');
    await user.click(screen.getByText('Admin'));
    await user.click(await screen.findByRole('button', { name: 'Disable' }));

    expect(await screen.findByRole('button', { name: 'Enable' })).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(mockedUpdateStatus).toHaveBeenCalledWith(2, false);
  });

  it('shows a Reset 2FA button only for a user with MFA enabled, and lets an admin reset it', async () => {
    seedFakeJwt({ userId: 1, roles: ['ROLE_USER', 'ROLE_ADMIN'] });
    mockedListUsers.mockResolvedValue({
      data: {
        data: {
          content: [
            { id: 2, username: 'bob', email: 'bob@example.com', roles: ['ROLE_USER'], enabled: true, mfaEnabled: true },
            { id: 3, username: 'carol', email: 'carol@example.com', roles: ['ROLE_USER'], enabled: true, mfaEnabled: false },
          ],
        },
      },
    } as any);
    mockedResetMfa.mockResolvedValue({
      data: { data: { id: 2, username: 'bob', email: 'bob@example.com', roles: ['ROLE_USER'], enabled: true, mfaEnabled: false } },
    } as any);
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await screen.findByDisplayValue('Alex');
    await user.click(screen.getByText('Admin'));
    await screen.findByText(/bob@example.com/);

    // Only bob (mfaEnabled) gets a Reset 2FA button - carol doesn't have one.
    expect(screen.getAllByRole('button', { name: 'Reset 2FA' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Reset 2FA' }));

    expect(mockedResetMfa).toHaveBeenCalledWith(2);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reset 2FA' })).not.toBeInTheDocument());
  });

  it('uploads a new avatar, persists it immediately, and best-effort deletes the old one', async () => {
    mockedGetProfile.mockResolvedValue({ bio: '', phoneNumber: '', country: '', city: '', avatarUrl: 'user-1/old.png' } as any);
    mockedGetBlobUrl.mockResolvedValue('blob:old-preview');
    mockedUpload.mockResolvedValue({ filePath: 'user-1/new.png' } as any);
    mockedUpdateProfile.mockResolvedValue({ bio: '', phoneNumber: '', country: '', city: '', avatarUrl: 'user-1/new.png' } as any);
    mockedRemove.mockResolvedValue({} as any);
    const user = userEvent.setup();
    const onAvatarChanged = vi.fn();
    render(<SettingsModal isOpen onClose={vi.fn()} onAvatarChanged={onAvatarChanged} />);

    await screen.findByDisplayValue('Alex');
    await waitFor(() => expect(mockedGetBlobUrl).toHaveBeenCalledWith('user-1/old.png'));

    mockedGetBlobUrl.mockResolvedValue('blob:new-preview');
    const file = new File(['avatar-bytes'], 'avatar.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]')!;
    await user.upload(fileInput as HTMLInputElement, file);

    // Picking a file opens the crop step rather than uploading immediately.
    await user.click(await screen.findByRole('button', { name: 'Use Photo' }));

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledWith(expect.any(File)));
    expect(mockedUpload.mock.calls[0][0].type).toBe('image/png');
    await waitFor(() => expect(mockedUpdateProfile).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: 'user-1/new.png' })));
    await waitFor(() => expect(mockedRemove).toHaveBeenCalledWith('user-1/old.png'));
    await waitFor(() => expect(mockedGetBlobUrl).toHaveBeenCalledWith('user-1/new.png'));
    expect(onAvatarChanged).toHaveBeenCalled();
  });

  it('removes the avatar, persisting it immediately and deleting the old file', async () => {
    mockedGetProfile.mockResolvedValue({ bio: '', phoneNumber: '', country: '', city: '', avatarUrl: 'user-1/old.png' } as any);
    mockedGetBlobUrl.mockResolvedValue('blob:old-preview');
    mockedUpdateProfile.mockResolvedValue({ bio: '', phoneNumber: '', country: '', city: '', avatarUrl: undefined } as any);
    mockedRemove.mockResolvedValue({} as any);
    const user = userEvent.setup();
    const onAvatarChanged = vi.fn();
    render(<SettingsModal isOpen onClose={vi.fn()} onAvatarChanged={onAvatarChanged} />);

    await screen.findByDisplayValue('Alex');
    await waitFor(() => expect(mockedGetBlobUrl).toHaveBeenCalledWith('user-1/old.png'));

    await user.click(screen.getByRole('button', { name: 'Remove photo' }));

    await waitFor(() => expect(mockedUpdateProfile).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: undefined })));
    await waitFor(() => expect(mockedRemove).toHaveBeenCalledWith('user-1/old.png'));
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument();
    expect(onAvatarChanged).toHaveBeenCalled();
  });

  it('cancelling the crop step does not upload anything', async () => {
    mockedGetProfile.mockResolvedValue({ bio: '', phoneNumber: '', country: '', city: '' } as any);
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await screen.findByDisplayValue('Alex');
    const file = new File(['avatar-bytes'], 'avatar.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]')!;
    await user.upload(fileInput as HTMLInputElement, file);

    await user.click(await screen.findByRole('button', { name: 'Cancel Crop' }));

    expect(screen.queryByRole('button', { name: 'Use Photo' })).not.toBeInTheDocument();
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('rejects an oversized avatar photo before opening the crop step', async () => {
    mockedGetProfile.mockResolvedValue({ bio: '', phoneNumber: '', country: '', city: '' } as any);
    const user = userEvent.setup();
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    await screen.findByDisplayValue('Alex');
    const oversizedFile = new File([new Uint8Array(11 * 1024 * 1024)], 'huge.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]')!;
    await user.upload(fileInput as HTMLInputElement, oversizedFile);

    expect(await screen.findByText(/too large/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use Photo' })).not.toBeInTheDocument();
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SettingsModal isOpen onClose={onClose} />);

    // The close button now has a real accessible name (aria-label="Close")
    // instead of being an unlabeled icon-only button.
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SettingsModal isOpen onClose={onClose} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes the dialog panel with role="dialog" and aria-modal', () => {
    render(<SettingsModal isOpen onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Account & System Settings' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('calls onClose on backdrop click but not on panel content click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SettingsModal isOpen onClose={onClose} />);

    await user.click(screen.getByText('Account & System Settings'));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByText('Account & System Settings').closest('.glass-panel')!.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
