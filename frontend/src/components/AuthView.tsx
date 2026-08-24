import { useState, type FormEvent } from 'react';
import { Lock, Mail, User, ArrowRight, ShieldCheck, KeyRound, Check, Circle, Smartphone } from 'lucide-react';
import { authService } from '@/services/authService';
import MindoraMark from './MindoraMark';
import TurnstileWidget from './TurnstileWidget';

interface AuthViewProps {
  onLoginSuccess: () => void;
  onNavigateToDownload?: () => void;
}

interface AuthFormData {
  username: string;
  email: string;
  password: string;
  fullName: string;
}

type AuthStep = 'credentials' | 'mfa-challenge' | 'forgot-password' | 'reset-password';

const LABEL_CLASS = 'block text-[0.85rem] text-[var(--text-secondary)] mb-[0.4rem] font-medium';
const ICON_CLASS = 'absolute left-[0.85rem] top-1/2 -translate-y-1/2';

// Mirrors auth-service's PasswordPolicy.REGEX exactly (8-12 chars, one
// uppercase, one number, one special character) so the live checklist can
// never drift from what the backend actually enforces.
function getPasswordChecks(password: string) {
  return [
    { label: '8-12 characters', met: password.length >= 8 && password.length <= 12 },
    { label: 'At least 1 uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'At least 1 number', met: /[0-9]/.test(password) },
    { label: 'At least 1 special character', met: /[^A-Za-z0-9]/.test(password) },
  ];
}

interface PasswordStrengthMeterProps {
  password: string;
}

function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const checks = getPasswordChecks(password);
  const metCount = checks.filter((c) => c.met).length;
  const strengthPercent = Math.round((metCount / checks.length) * 100);
  const strengthColor = strengthPercent === 100 ? '#4ade80' : strengthPercent >= 50 ? '#fbbf24' : '#f87171';

  return (
    <div className="mt-2 p-3 rounded-lg bg-[var(--text-primary)]/[0.04] border border-[var(--text-primary)]/[0.08] flex flex-col gap-2 animate-fade-in">
      <div className="flex items-center justify-between text-[0.75rem]">
        <span className="text-[var(--text-secondary)]">Password strength</span>
        <span style={{ color: strengthColor }} className="font-semibold">{strengthPercent}%</span>
      </div>
      <div className="h-[5px] rounded-full bg-[var(--text-primary)]/[0.08] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${strengthPercent}%`, backgroundColor: strengthColor }}
        />
      </div>
      <ul className="flex flex-col gap-1 mt-1">
        {checks.map((check) => (
          <li key={check.label} className="flex items-center gap-2 text-[0.75rem]">
            {check.met ? <Check size={13} color="#4ade80" /> : <Circle size={13} color="#64748b" />}
            <span className={check.met ? 'text-[#4ade80]' : 'text-[var(--text-muted)]'}>{check.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AuthView({ onLoginSuccess, onNavigateToDownload }: AuthViewProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState<AuthFormData>({
    username: '',
    email: '',
    password: '',
    fullName: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [authStep, setAuthStep] = useState<AuthStep>('credentials');
  const [challengeToken, setChallengeToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const [registerPasswordFocused, setRegisterPasswordFocused] = useState(false);
  const [resetPasswordFocused, setResetPasswordFocused] = useState(false);

  // Turnstile tokens are single-use - resetKey is bumped after every submit
  // attempt (success or failure) and on the login/register toggle, forcing
  // TurnstileWidget to remount and mint a fresh one before the next attempt.
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!turnstileToken) {
      setError('Please complete the CAPTCHA verification.');
      return;
    }

    setLoading(true);

    try {
      const res = isLogin
        ? await authService.login(formData.username, formData.password, turnstileToken)
        : await authService.register(formData.username, formData.email, formData.password, formData.fullName, turnstileToken);

      const data = res?.data?.data;
      if (data?.mfaRequired) {
        setChallengeToken(data.challengeToken);
        setAuthStep('mfa-challenge');
        return;
      }

      onLoginSuccess();
    } catch (err: any) {
      console.error('Auth Exception:', err);
      setError(err?.message || err?.error || 'Authentication failed. Please check credentials or gateway status.');
    } finally {
      setLoading(false);
      setTurnstileToken('');
      setTurnstileResetKey((k) => k + 1);
    }
  };

  const handleMfaSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authService.verifyMfa(
        challengeToken,
        useRecoveryCode ? undefined : mfaCode,
        useRecoveryCode ? mfaCode : undefined
      );
      onLoginSuccess();
    } catch (err: any) {
      console.error('MFA Verification Exception:', err);
      setError(err?.message || err?.error || 'Verification failed. Check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const backToCredentials = () => {
    setAuthStep('credentials');
    setChallengeToken('');
    setMfaCode('');
    setUseRecoveryCode(false);
    setForgotEmail('');
    setResetCode('');
    setNewPassword('');
    setConfirmNewPassword('');
    setError('');
    setInfoMessage('');
  };

  const handleForgotPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authService.forgotPassword(forgotEmail);
      setInfoMessage(res?.message || 'If that email is registered, a reset code has been sent.');
      setAuthStep('reset-password');
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await authService.resetPassword(resetCode, newPassword);
      backToCredentials();
      setInfoMessage('Password reset successfully. Sign in with your new password.');
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired reset code.');
    } finally {
      setLoading(false);
    }
  };

  if (authStep === 'mfa-challenge') {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute top-[15%] left-[20%] w-[350px] h-[350px] rounded-full bg-[rgba(99,102,241,0.15)] blur-[90px] pointer-events-none" />
        <div className="absolute bottom-[15%] right-[20%] w-[400px] h-[400px] rounded-full bg-[rgba(168,85,247,0.15)] blur-[100px] pointer-events-none" />

        <div className="glass-panel glass-panel-glow animate-fade-in w-full max-w-[460px] p-10">
          <div className="text-center mb-8">
            <div className="inline-flex p-3 rounded-2xl bg-[linear-gradient(135deg,#6366f1,#a855f7)] shadow-[0_8px_24px_rgba(99,102,241,0.4)] mb-4">
              <ShieldCheck size={32} color="#ffffff" />
            </div>
            <h1 className="text-[2rem] font-extrabold mb-2">Two-Factor Verification</h1>
            <p className="text-[var(--text-secondary)] text-[0.9rem]">
              {useRecoveryCode
                ? 'Enter one of your saved recovery codes'
                : 'Enter the 6-digit code from your authenticator app'}
            </p>
          </div>

          {error && (
            <div className="bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[#f87171] py-3 px-4 rounded-xl mb-6 text-[0.85rem] leading-[1.4]">
              {error}
            </div>
          )}

          <form onSubmit={handleMfaSubmit} className="flex flex-col gap-[1.2rem]">
            <div>
              <label className={LABEL_CLASS}>{useRecoveryCode ? 'Recovery Code' : 'Authenticator Code'}</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  autoFocus
                  className="glass-input pl-[2.6rem]"
                  placeholder={useRecoveryCode ? 'XXXXX-XXXXX' : '123456'}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                />
                <KeyRound size={18} color="#64748b" className={ICON_CLASS} />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2 p-[0.85rem]">
              {loading ? (
                <span>Verifying...</span>
              ) : (
                <>
                  <span>Verify</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="text-center mt-6 pt-[1.2rem] border-t border-t-[var(--text-primary)]/[0.08] flex flex-col gap-2">
            <button
              onClick={() => {
                setUseRecoveryCode(!useRecoveryCode);
                setMfaCode('');
                setError('');
              }}
              className="bg-transparent border-0 text-[var(--text-secondary)] cursor-pointer text-[0.9rem]"
            >
              {useRecoveryCode ? 'Use an authenticator code instead' : 'Use a recovery code instead'}
            </button>
            <button onClick={backToCredentials} className="bg-transparent border-0 text-[var(--text-muted)] cursor-pointer text-[0.85rem]">
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (authStep === 'forgot-password') {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute top-[15%] left-[20%] w-[350px] h-[350px] rounded-full bg-[rgba(99,102,241,0.15)] blur-[90px] pointer-events-none" />
        <div className="absolute bottom-[15%] right-[20%] w-[400px] h-[400px] rounded-full bg-[rgba(168,85,247,0.15)] blur-[100px] pointer-events-none" />

        <div className="glass-panel glass-panel-glow animate-fade-in w-full max-w-[460px] p-10">
          <div className="text-center mb-8">
            <div className="inline-flex p-3 rounded-2xl bg-[linear-gradient(135deg,#6366f1,#a855f7)] shadow-[0_8px_24px_rgba(99,102,241,0.4)] mb-4">
              <KeyRound size={32} color="#ffffff" />
            </div>
            <h1 className="text-[2rem] font-extrabold mb-2">Reset Your Password</h1>
            <p className="text-[var(--text-secondary)] text-[0.9rem]">Enter your account email and we'll send you a reset code</p>
          </div>

          {error && (
            <div className="bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[#f87171] py-3 px-4 rounded-xl mb-6 text-[0.85rem] leading-[1.4]">
              {error}
            </div>
          )}

          <form onSubmit={handleForgotPasswordSubmit} className="flex flex-col gap-[1.2rem]">
            <div>
              <label className={LABEL_CLASS}>Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  autoFocus
                  className="glass-input pl-[2.6rem]"
                  placeholder="Enter your email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                />
                <Mail size={18} color="#64748b" className={ICON_CLASS} />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2 p-[0.85rem]">
              {loading ? <span>Sending...</span> : <><span>Send Reset Code</span><ArrowRight size={18} /></>}
            </button>
          </form>

          <div className="text-center mt-6 pt-[1.2rem] border-t border-t-[var(--text-primary)]/[0.08] flex flex-col gap-2">
            <button
              onClick={() => setAuthStep('reset-password')}
              className="bg-transparent border-0 text-[var(--text-secondary)] cursor-pointer text-[0.9rem]"
            >
              Already have a code?
            </button>
            <button onClick={backToCredentials} className="bg-transparent border-0 text-[var(--text-muted)] cursor-pointer text-[0.85rem]">
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (authStep === 'reset-password') {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute top-[15%] left-[20%] w-[350px] h-[350px] rounded-full bg-[rgba(99,102,241,0.15)] blur-[90px] pointer-events-none" />
        <div className="absolute bottom-[15%] right-[20%] w-[400px] h-[400px] rounded-full bg-[rgba(168,85,247,0.15)] blur-[100px] pointer-events-none" />

        <div className="glass-panel glass-panel-glow animate-fade-in w-full max-w-[460px] p-10">
          <div className="text-center mb-8">
            <div className="inline-flex p-3 rounded-2xl bg-[linear-gradient(135deg,#6366f1,#a855f7)] shadow-[0_8px_24px_rgba(99,102,241,0.4)] mb-4">
              <KeyRound size={32} color="#ffffff" />
            </div>
            <h1 className="text-[2rem] font-extrabold mb-2">Enter Reset Code</h1>
            <p className="text-[var(--text-secondary)] text-[0.9rem]">Check your email for the code, then choose a new password</p>
          </div>

          {infoMessage && (
            <div className="bg-[rgba(34,197,94,0.15)] border border-[rgba(34,197,94,0.3)] text-[#4ade80] py-3 px-4 rounded-xl mb-6 text-[0.85rem] leading-[1.4]">
              {infoMessage}
            </div>
          )}
          {error && (
            <div className="bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[#f87171] py-3 px-4 rounded-xl mb-6 text-[0.85rem] leading-[1.4]">
              {error}
            </div>
          )}

          <form onSubmit={handleResetPasswordSubmit} className="flex flex-col gap-[1.2rem]">
            <div>
              <label className={LABEL_CLASS}>Reset Code</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  autoFocus
                  className="glass-input pl-[2.6rem]"
                  placeholder="XXXXX-XXXXX"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                />
                <KeyRound size={18} color="#64748b" className={ICON_CLASS} />
              </div>
            </div>

            <div>
              <label className={LABEL_CLASS}>New Password</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  minLength={8}
                  maxLength={12}
                  pattern="(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,12}"
                  title="8-12 characters, including one uppercase letter, one number, and one special character"
                  className="glass-input pl-[2.6rem]"
                  placeholder="••••••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onFocus={() => setResetPasswordFocused(true)}
                  onBlur={() => setResetPasswordFocused(false)}
                />
                <Lock size={18} color="#64748b" className={ICON_CLASS} />
              </div>
              {resetPasswordFocused && <PasswordStrengthMeter password={newPassword} />}
            </div>

            <div>
              <label className={LABEL_CLASS}>Confirm New Password</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  className="glass-input pl-[2.6rem]"
                  placeholder="••••••••••••"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                />
                <Lock size={18} color="#64748b" className={ICON_CLASS} />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2 p-[0.85rem]">
              {loading ? <span>Resetting...</span> : <><span>Reset Password</span><ArrowRight size={18} /></>}
            </button>
          </form>

          <div className="text-center mt-6 pt-[1.2rem] border-t border-t-[var(--text-primary)]/[0.08]">
            <button onClick={backToCredentials} className="bg-transparent border-0 text-[var(--text-muted)] cursor-pointer text-[0.85rem]">
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 relative overflow-hidden">
      {/* Background Glow Spheres */}
      <div className="absolute top-[15%] left-[20%] w-[350px] h-[350px] rounded-full bg-[rgba(99,102,241,0.15)] blur-[90px] pointer-events-none" />
      <div className="absolute bottom-[15%] right-[20%] w-[400px] h-[400px] rounded-full bg-[rgba(168,85,247,0.15)] blur-[100px] pointer-events-none" />

      <div className="glass-panel glass-panel-glow animate-fade-in w-full max-w-[460px] p-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-2xl bg-[linear-gradient(135deg,#6366f1,#a855f7)] shadow-[0_8px_24px_rgba(99,102,241,0.4)] mb-4">
            <MindoraMark size={34} />
          </div>
          <h1 className="text-[2rem] font-extrabold mb-2">
            {isLogin ? 'Welcome Back to Mindora' : 'Create Your Mindora Account'}
          </h1>
          <p className="text-[var(--text-secondary)] text-[0.9rem]">
            {isLogin ? 'Sign in to access your AI-powered journals & insights' : 'Join the next-generation intelligent journaling platform'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] text-[#f87171] py-3 px-4 rounded-xl mb-6 text-[0.85rem] leading-[1.4]">
            {error}
          </div>
        )}
        {infoMessage && (
          <div className="bg-[rgba(34,197,94,0.15)] border border-[rgba(34,197,94,0.3)] text-[#4ade80] py-3 px-4 rounded-xl mb-6 text-[0.85rem] leading-[1.4]">
            {infoMessage}
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-[1.2rem]">
          {!isLogin && (
            <div>
              <label className={LABEL_CLASS}>Full Name</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  className="glass-input pl-[2.6rem]"
                  placeholder="Enter your full name"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                />
                <User size={18} color="#64748b" className={ICON_CLASS} />
              </div>
            </div>
          )}

          <div>
            <label className={LABEL_CLASS}>{isLogin ? 'Username or Email' : 'Username'}</label>
            <div className="relative">
              <input
                type="text"
                required
                className="glass-input pl-[2.6rem]"
                placeholder={isLogin ? 'Username or email' : 'Choose a username'}
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              />
              <User size={18} color="#64748b" className={ICON_CLASS} />
            </div>
          </div>

          {!isLogin && (
            <div>
              <label className={LABEL_CLASS}>Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  className="glass-input pl-[2.6rem]"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
                <Mail size={18} color="#64748b" className={ICON_CLASS} />
              </div>
            </div>
          )}

          <div>
            <label className={LABEL_CLASS}>Password</label>
            <div className="relative">
              <input
                type="password"
                required
                {...(!isLogin && {
                  minLength: 8,
                  maxLength: 12,
                  pattern: '(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,12}',
                  title: '8-12 characters, including one uppercase letter, one number, and one special character',
                })}
                className="glass-input pl-[2.6rem]"
                placeholder="••••••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                onFocus={() => setRegisterPasswordFocused(true)}
                onBlur={() => setRegisterPasswordFocused(false)}
              />
              <Lock size={18} color="#64748b" className={ICON_CLASS} />
            </div>
            {!isLogin && registerPasswordFocused && <PasswordStrengthMeter password={formData.password} />}
            {isLogin && (
              <button
                type="button"
                onClick={() => {
                  setAuthStep('forgot-password');
                  setError('');
                  setInfoMessage('');
                }}
                className="bg-transparent border-0 text-[#818cf8] cursor-pointer text-[0.8rem] mt-2"
              >
                Forgot password?
              </button>
            )}
          </div>

          <TurnstileWidget
            action={isLogin ? 'login' : 'register'}
            onVerify={setTurnstileToken}
            resetKey={turnstileResetKey}
          />

          <button type="submit" disabled={loading || !turnstileToken} className="btn-primary w-full mt-2 p-[0.85rem]">
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        {/* Tab Toggle Footer */}
        <div className="text-center mt-6 pt-[1.2rem] border-t border-t-[var(--text-primary)]/[0.08]">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setTurnstileToken('');
              setTurnstileResetKey((k) => k + 1);
            }}
            className="bg-transparent border-0 text-[var(--text-secondary)] cursor-pointer text-[0.9rem]"
          >
            {isLogin ? (
              <span>
                Don't have an account? <strong className="text-[#6366f1]">Sign Up</strong>
              </span>
            ) : (
              <span>
                Already have an account? <strong className="text-[#6366f1]">Sign In</strong>
              </span>
            )}
          </button>
        </div>

        {onNavigateToDownload && (
          <button
            type="button"
            onClick={onNavigateToDownload}
            className="flex items-center justify-center gap-2 mt-4 w-full text-[0.8rem] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors bg-transparent border-0 cursor-pointer"
          >
            <Smartphone size={14} />
            Get the Mindora mobile app
          </button>
        )}
      </div>
    </div>
  );
}
