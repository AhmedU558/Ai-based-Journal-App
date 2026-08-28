import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthView from './AuthView';
import { authService } from '@/services/authService';

vi.mock('@/services/authService', () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    verifyMfa: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

// The real widget loads Cloudflare's script over the network, which jsdom
// can't do - stub it to immediately report a solved CAPTCHA (post-mount, via
// useEffect, to avoid updating AuthView's state mid-render) so every
// submit-flow test below exercises the same behavior a real user's
// completed widget would, without needing network access.
vi.mock('./TurnstileWidget', async () => {
  const { useEffect } = await import('react');
  function MockTurnstileWidget({ onVerify, resetKey }: { onVerify: (token: string) => void; resetKey: number }) {
    useEffect(() => {
      onVerify('test-turnstile-token');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);
    return null;
  }
  return {
    default: MockTurnstileWidget,
  };
});

const mockedLogin = vi.mocked(authService.login);
const mockedRegister = vi.mocked(authService.register);
const mockedVerifyMfa = vi.mocked(authService.verifyMfa);
const mockedForgotPassword = vi.mocked(authService.forgotPassword);
const mockedResetPassword = vi.mocked(authService.resetPassword);

describe('AuthView', () => {
  beforeEach(() => {
    mockedLogin.mockReset();
    mockedRegister.mockReset();
    mockedVerifyMfa.mockReset();
    mockedForgotPassword.mockReset();
    mockedResetPassword.mockReset();
  });

  it('shows the login form by default', () => {
    render(<AuthView onLoginSuccess={vi.fn()} />);
    expect(screen.getByText('Welcome Back to Mindora')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Username or email')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Enter your full name')).not.toBeInTheDocument();
  });

  it('switches to the register form, revealing full name and email fields', async () => {
    const user = userEvent.setup();
    render(<AuthView onLoginSuccess={vi.fn()} />);

    await user.click(screen.getByText(/Don't have an account\?/));

    expect(screen.getByText('Create Your Mindora Account')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your full name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument();
  });

  it('logs in with the entered credentials and calls onLoginSuccess', async () => {
    mockedLogin.mockResolvedValue({ data: { data: { accessToken: 'tok', mfaRequired: false } } } as any);
    const user = userEvent.setup();
    const onLoginSuccess = vi.fn();
    render(<AuthView onLoginSuccess={onLoginSuccess} />);

    await user.type(screen.getByPlaceholderText('Username or email'), 'alex_dev');
    await user.type(screen.getByPlaceholderText('••••••••••••'), 'hunter2');
    await user.click(screen.getByRole('button', { name: /Sign In/ }));

    expect(mockedLogin).toHaveBeenCalledWith('alex_dev', 'hunter2', 'test-turnstile-token');
    expect(onLoginSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows an error message and does not call onLoginSuccess when login fails', async () => {
    mockedLogin.mockRejectedValue(new Error('Invalid credentials'));
    const user = userEvent.setup();
    const onLoginSuccess = vi.fn();
    render(<AuthView onLoginSuccess={onLoginSuccess} />);

    await user.type(screen.getByPlaceholderText('Username or email'), 'alex_dev');
    await user.type(screen.getByPlaceholderText('••••••••••••'), 'wrong');
    await user.click(screen.getByRole('button', { name: /Sign In/ }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });

  it('registers with all four fields when in register mode', async () => {
    mockedRegister.mockResolvedValue({ data: { data: { accessToken: 'tok', mfaRequired: false } } } as any);
    const user = userEvent.setup();
    const onLoginSuccess = vi.fn();
    render(<AuthView onLoginSuccess={onLoginSuccess} />);

    await user.click(screen.getByText(/Don't have an account\?/));
    await user.type(screen.getByPlaceholderText('Enter your full name'), 'Alex Example');
    await user.type(screen.getByPlaceholderText('Choose a username'), 'alex_dev');
    await user.type(screen.getByPlaceholderText('Enter your email'), 'alex@example.com');
    await user.type(screen.getByPlaceholderText('••••••••••••'), 'Hunter2!');
    await user.type(screen.getByPlaceholderText('Re-enter your password'), 'Hunter2!');
    await user.click(screen.getByRole('button', { name: /Create Account/ }));

    expect(mockedRegister).toHaveBeenCalledWith('alex_dev', 'alex@example.com', 'Hunter2!', 'Alex Example', 'test-turnstile-token');
    expect(onLoginSuccess).toHaveBeenCalledTimes(1);
  });

  it('blocks registration when the confirm-password field does not match, without calling register', async () => {
    const user = userEvent.setup();
    const onLoginSuccess = vi.fn();
    render(<AuthView onLoginSuccess={onLoginSuccess} />);

    await user.click(screen.getByText(/Don't have an account\?/));
    await user.type(screen.getByPlaceholderText('Enter your full name'), 'Alex Example');
    await user.type(screen.getByPlaceholderText('Choose a username'), 'alex_dev');
    await user.type(screen.getByPlaceholderText('Enter your email'), 'alex@example.com');
    await user.type(screen.getByPlaceholderText('••••••••••••'), 'Hunter2!');
    await user.type(screen.getByPlaceholderText('Re-enter your password'), 'Hunter3!');
    await user.click(screen.getByRole('button', { name: /Create Account/ }));

    expect(mockedRegister).not.toHaveBeenCalled();
    expect(onLoginSuccess).not.toHaveBeenCalled();
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
  });

  it('reveals and re-hides the password when the show-password toggle is clicked', async () => {
    const user = userEvent.setup();
    render(<AuthView onLoginSuccess={vi.fn()} />);

    const field = screen.getByPlaceholderText('••••••••••••');
    expect(field).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(field).toHaveAttribute('type', 'password');
  });

  it('switches to the MFA challenge step when login requires it, without calling onLoginSuccess', async () => {
    mockedLogin.mockResolvedValue({
      data: { data: { mfaRequired: true, challengeToken: 'challenge-123' } },
    } as any);
    const user = userEvent.setup();
    const onLoginSuccess = vi.fn();
    render(<AuthView onLoginSuccess={onLoginSuccess} />);

    await user.type(screen.getByPlaceholderText('Username or email'), 'alex_dev');
    await user.type(screen.getByPlaceholderText('••••••••••••'), 'hunter2');
    await user.click(screen.getByRole('button', { name: /Sign In/ }));

    expect(await screen.findByText('Two-Factor Verification')).toBeInTheDocument();
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });

  it('verifies a TOTP code and calls onLoginSuccess', async () => {
    mockedLogin.mockResolvedValue({
      data: { data: { mfaRequired: true, challengeToken: 'challenge-123' } },
    } as any);
    mockedVerifyMfa.mockResolvedValue({ data: { data: { accessToken: 'tok' } } } as any);
    const user = userEvent.setup();
    const onLoginSuccess = vi.fn();
    render(<AuthView onLoginSuccess={onLoginSuccess} />);

    await user.type(screen.getByPlaceholderText('Username or email'), 'alex_dev');
    await user.type(screen.getByPlaceholderText('••••••••••••'), 'hunter2');
    await user.click(screen.getByRole('button', { name: /Sign In/ }));
    await screen.findByText('Two-Factor Verification');

    await user.type(screen.getByPlaceholderText('123456'), '654321');
    await user.click(screen.getByRole('button', { name: /Verify/ }));

    expect(mockedVerifyMfa).toHaveBeenCalledWith('challenge-123', '654321', undefined);
    expect(onLoginSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows an error and stays on the MFA step when the code is invalid', async () => {
    mockedLogin.mockResolvedValue({
      data: { data: { mfaRequired: true, challengeToken: 'challenge-123' } },
    } as any);
    mockedVerifyMfa.mockRejectedValue(new Error('Invalid verification code'));
    const user = userEvent.setup();
    const onLoginSuccess = vi.fn();
    render(<AuthView onLoginSuccess={onLoginSuccess} />);

    await user.type(screen.getByPlaceholderText('Username or email'), 'alex_dev');
    await user.type(screen.getByPlaceholderText('••••••••••••'), 'hunter2');
    await user.click(screen.getByRole('button', { name: /Sign In/ }));
    await screen.findByText('Two-Factor Verification');

    await user.type(screen.getByPlaceholderText('123456'), '000000');
    await user.click(screen.getByRole('button', { name: /Verify/ }));

    expect(await screen.findByText('Invalid verification code')).toBeInTheDocument();
    expect(onLoginSuccess).not.toHaveBeenCalled();
    expect(screen.getByText('Two-Factor Verification')).toBeInTheDocument();
  });

  it('switches to recovery-code entry and sends it as recoveryCode', async () => {
    mockedLogin.mockResolvedValue({
      data: { data: { mfaRequired: true, challengeToken: 'challenge-123' } },
    } as any);
    mockedVerifyMfa.mockResolvedValue({ data: { data: { accessToken: 'tok' } } } as any);
    const user = userEvent.setup();
    render(<AuthView onLoginSuccess={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Username or email'), 'alex_dev');
    await user.type(screen.getByPlaceholderText('••••••••••••'), 'hunter2');
    await user.click(screen.getByRole('button', { name: /Sign In/ }));
    await screen.findByText('Two-Factor Verification');

    await user.click(screen.getByText('Use a recovery code instead'));
    await user.type(screen.getByPlaceholderText('XXXXX-XXXXX'), 'ABCDE-12345');
    await user.click(screen.getByRole('button', { name: /Verify/ }));

    expect(mockedVerifyMfa).toHaveBeenCalledWith('challenge-123', undefined, 'ABCDE-12345');
  });

  it('returns to the credentials step from the MFA challenge', async () => {
    mockedLogin.mockResolvedValue({
      data: { data: { mfaRequired: true, challengeToken: 'challenge-123' } },
    } as any);
    const user = userEvent.setup();
    render(<AuthView onLoginSuccess={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Username or email'), 'alex_dev');
    await user.type(screen.getByPlaceholderText('••••••••••••'), 'hunter2');
    await user.click(screen.getByRole('button', { name: /Sign In/ }));
    await screen.findByText('Two-Factor Verification');

    await user.click(screen.getByText('Back to Sign In'));

    expect(screen.getByText('Welcome Back to Mindora')).toBeInTheDocument();
  });

  it('switches to the forgot-password step via the link on the login form', async () => {
    const user = userEvent.setup();
    render(<AuthView onLoginSuccess={vi.fn()} />);

    await user.click(screen.getByText('Forgot password?'));

    expect(screen.getByText('Reset Your Password')).toBeInTheDocument();
  });

  it('submitting the forgot-password form shows the generic message and advances to reset-password', async () => {
    mockedForgotPassword.mockResolvedValue({ message: 'If that email is registered, a reset code has been sent.' } as any);
    const user = userEvent.setup();
    render(<AuthView onLoginSuccess={vi.fn()} />);

    await user.click(screen.getByText('Forgot password?'));
    await user.type(screen.getByPlaceholderText('Enter your email'), 'alex@example.com');
    await user.click(screen.getByRole('button', { name: /Send Reset Code/ }));

    expect(mockedForgotPassword).toHaveBeenCalledWith('alex@example.com');
    expect(await screen.findByText('Enter Reset Code')).toBeInTheDocument();
    expect(screen.getByText('If that email is registered, a reset code has been sent.')).toBeInTheDocument();
  });

  it('shows a mismatch error without calling resetPassword when new passwords differ', async () => {
    mockedForgotPassword.mockResolvedValue({ message: 'sent' } as any);
    const user = userEvent.setup();
    render(<AuthView onLoginSuccess={vi.fn()} />);

    await user.click(screen.getByText('Forgot password?'));
    await user.type(screen.getByPlaceholderText('Enter your email'), 'alex@example.com');
    await user.click(screen.getByRole('button', { name: /Send Reset Code/ }));
    await screen.findByText('Enter Reset Code');

    await user.type(screen.getByPlaceholderText('XXXXX-XXXXX'), 'ABCDE-12345');
    const passwordInputs = [
      screen.getByPlaceholderText('••••••••••••'),
      screen.getByPlaceholderText('Re-enter your new password'),
    ];
    await user.type(passwordInputs[0], 'NewPass1!');
    await user.type(passwordInputs[1], 'Different1!');
    await user.click(screen.getByRole('button', { name: /Reset Password/ }));

    expect(screen.getByText('New passwords do not match.')).toBeInTheDocument();
    expect(mockedResetPassword).not.toHaveBeenCalled();
  });

  it('resets the password with a valid code and returns to the credentials step', async () => {
    mockedForgotPassword.mockResolvedValue({ message: 'sent' } as any);
    mockedResetPassword.mockResolvedValue({ message: 'Password reset successfully' } as any);
    const user = userEvent.setup();
    render(<AuthView onLoginSuccess={vi.fn()} />);

    await user.click(screen.getByText('Forgot password?'));
    await user.type(screen.getByPlaceholderText('Enter your email'), 'alex@example.com');
    await user.click(screen.getByRole('button', { name: /Send Reset Code/ }));
    await screen.findByText('Enter Reset Code');

    await user.type(screen.getByPlaceholderText('XXXXX-XXXXX'), 'ABCDE-12345');
    const passwordInputs = [
      screen.getByPlaceholderText('••••••••••••'),
      screen.getByPlaceholderText('Re-enter your new password'),
    ];
    await user.type(passwordInputs[0], 'NewPass1!');
    await user.type(passwordInputs[1], 'NewPass1!');
    await user.click(screen.getByRole('button', { name: /Reset Password/ }));

    expect(mockedResetPassword).toHaveBeenCalledWith('ABCDE-12345', 'NewPass1!');
    expect(await screen.findByText('Welcome Back to Mindora')).toBeInTheDocument();
    expect(screen.getByText(/Password reset successfully/)).toBeInTheDocument();
  });

  it('shows an error and stays on reset-password when the code is invalid', async () => {
    mockedForgotPassword.mockResolvedValue({ message: 'sent' } as any);
    mockedResetPassword.mockRejectedValue(new Error('Invalid or expired reset code'));
    const user = userEvent.setup();
    render(<AuthView onLoginSuccess={vi.fn()} />);

    await user.click(screen.getByText('Forgot password?'));
    await user.type(screen.getByPlaceholderText('Enter your email'), 'alex@example.com');
    await user.click(screen.getByRole('button', { name: /Send Reset Code/ }));
    await screen.findByText('Enter Reset Code');

    await user.type(screen.getByPlaceholderText('XXXXX-XXXXX'), 'BADCODE');
    const passwordInputs = [
      screen.getByPlaceholderText('••••••••••••'),
      screen.getByPlaceholderText('Re-enter your new password'),
    ];
    await user.type(passwordInputs[0], 'NewPass1!');
    await user.type(passwordInputs[1], 'NewPass1!');
    await user.click(screen.getByRole('button', { name: /Reset Password/ }));

    expect(await screen.findByText('Invalid or expired reset code')).toBeInTheDocument();
    expect(screen.getByText('Enter Reset Code')).toBeInTheDocument();
  });
});
