import { Download, ShieldCheck, FolderOpen, ArrowLeft } from 'lucide-react';
import MindoraMark from './MindoraMark';
import { AppStoreLogo, GooglePlayLogo } from './StoreIcons';

interface DownloadAppViewProps {
  isAuthenticated: boolean;
  onBack: () => void;
  showToast?: (message: string, type?: string) => void;
}

const APK_URL = '/downloads/Mindora.apk';

const INSTALL_STEPS = [
  'Tap "Download APK" below and wait for the download to finish.',
  'Open the downloaded file from your notifications bar or Downloads folder.',
  'If Android blocks the install, tap "Settings" in the prompt and allow your browser to install unknown apps - you only need to do this once.',
  'Tap Install, then Open once it finishes - you\'re ready to journal.',
];

export default function DownloadAppView({ isAuthenticated, onBack, showToast }: DownloadAppViewProps) {
  const notifyComingSoon = (store: string) => {
    if (showToast) {
      showToast(`${store} listing is coming soon - use the Android APK for now.`, 'info');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 relative overflow-hidden">
      <div className="absolute top-[15%] left-[20%] w-[350px] h-[350px] rounded-full bg-[rgba(99,102,241,0.15)] blur-[90px] pointer-events-none" />
      <div className="absolute bottom-[15%] right-[20%] w-[400px] h-[400px] rounded-full bg-[rgba(168,85,247,0.15)] blur-[100px] pointer-events-none" />

      <div className="glass-panel glass-panel-glow animate-fade-in w-full max-w-[520px] p-10 relative">
        <button
          onClick={onBack}
          className="absolute top-6 left-6 flex items-center gap-1 text-[0.8rem] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft size={14} />
          {isAuthenticated ? 'Back to Dashboard' : 'Back to Sign In'}
        </button>

        <div className="text-center mb-8 mt-6">
          <div className="inline-flex p-3 rounded-2xl bg-[linear-gradient(135deg,#6366f1,#a855f7)] shadow-[0_8px_24px_rgba(99,102,241,0.4)] mb-4">
            <MindoraMark size={40} />
          </div>
          <h1 className="text-[1.6rem] font-extrabold bg-[linear-gradient(135deg,var(--text-primary),var(--text-secondary))] bg-clip-text text-transparent">
            Get the Mindora App
          </h1>
          <p className="text-[var(--text-secondary)] text-[0.9rem] mt-2">
            Your thoughts. Your story. Your AI companion - now in your pocket.
          </p>
        </div>

        {/* Download Buttons */}
        <div className="flex flex-col gap-3 mb-8">
          <a
            href={APK_URL}
            download
            className="btn-primary w-full justify-center py-4 text-[1rem]"
          >
            <Download size={20} />
            Download APK
            <span className="text-[0.75rem] font-normal opacity-80 ml-1">for Android</span>
          </a>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => notifyComingSoon('Google Play')}
              className="flex-1 flex items-center gap-2 justify-center py-3 px-4 rounded-[14px] bg-black/40 border border-[var(--text-primary)]/[0.12] text-[var(--text-primary)] cursor-pointer opacity-70 hover:opacity-90 transition-opacity"
              title="Coming soon"
            >
              <GooglePlayLogo size={22} />
              <span className="flex flex-col items-start leading-tight">
                <span className="text-[0.6rem] text-[var(--text-secondary)]">Coming soon on</span>
                <span className="text-[0.85rem] font-semibold">Google Play</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => notifyComingSoon('The App Store')}
              className="flex-1 flex items-center gap-2 justify-center py-3 px-4 rounded-[14px] bg-black/40 border border-[var(--text-primary)]/[0.12] text-[var(--text-primary)] cursor-pointer opacity-70 hover:opacity-90 transition-opacity"
              title="Coming soon"
            >
              <AppStoreLogo size={22} />
              <span className="flex flex-col items-start leading-tight">
                <span className="text-[0.6rem] text-[var(--text-secondary)]">Coming soon on the</span>
                <span className="text-[0.85rem] font-semibold">App Store</span>
              </span>
            </button>
          </div>
        </div>

        {/* Install Instructions */}
        <div className="bg-[var(--text-primary)]/[0.03] border border-[var(--text-primary)]/[0.08] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <FolderOpen size={16} color="#38bdf8" />
            <h2 className="text-[0.9rem] font-semibold text-[var(--text-primary)]">How to install the APK</h2>
          </div>
          <ol className="flex flex-col gap-2">
            {INSTALL_STEPS.map((step, idx) => (
              <li key={idx} className="flex items-start gap-3 text-[0.82rem] text-[var(--text-secondary)] leading-relaxed">
                <span className="shrink-0 w-5 h-5 rounded-full bg-[rgba(99,102,241,0.2)] text-[#818cf8] text-[0.7rem] font-bold flex items-center justify-center mt-0.5">
                  {idx + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <div className="flex items-start gap-2 mt-4 pt-4 border-t border-[var(--text-primary)]/[0.08] text-[0.75rem] text-[var(--text-muted)]">
            <ShieldCheck size={14} className="shrink-0 mt-0.5" />
            <span>
              This APK is built and distributed directly by Mindora - Android shows a warning for any app installed
              outside the Play Store, which is expected and safe to proceed through.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
