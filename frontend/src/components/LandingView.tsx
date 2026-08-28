import { Sparkles, LineChart, CalendarDays, Search, MessageSquare, ShieldCheck, WifiOff, Lock, ArrowRight, Smartphone } from 'lucide-react';
import MindoraMark from './MindoraMark';

interface LandingViewProps {
  onSignIn: () => void;
  onGetStarted: () => void;
  onNavigateToDownload: () => void;
}

// Every claim on this page maps to something that actually ships. That is not a
// style note - this project's own history is a list of features that looked
// real in the UI with nothing behind them, and a marketing page is the easiest
// place in the codebase to reintroduce that. Where a capability is Android-only
// (offline), it says so rather than implying parity.
const FEATURES = [
  {
    icon: Sparkles,
    title: 'Mood detection as you write',
    body: 'Your entry is classified while you type - no button to press, no form to fill in. The detected mood is what drives your streaks, calendar colours and trends.',
  },
  {
    icon: MessageSquare,
    title: 'An editor that writes with you',
    body: 'Rephrase a clumsy sentence, fix the grammar, continue a thought you have run out of road on, summarise a long entry, or pull tags out of it automatically.',
  },
  {
    icon: LineChart,
    title: 'Patterns you would not spot alone',
    body: 'Dominant mood, positivity rate, a rolling trend, your current and longest streak, the days you write most, and the topics you keep returning to.',
  },
  {
    icon: CalendarDays,
    title: 'Your year on one screen',
    body: 'Every entry laid out on a calendar and colour-coded by how you felt that day. The gaps turn out to be as informative as the entries.',
  },
  {
    icon: Search,
    title: 'Find the entry you half-remember',
    body: 'Full-text search across everything you have written, filtered by mood or tag, with typo-tolerant matching for when you only recall the gist of it.',
  },
  {
    icon: ShieldCheck,
    title: 'Ask your own journal',
    body: 'Put a question to an assistant that has read your entries and your mood history, and can answer from what you actually wrote rather than guesswork.',
  },
];

const TRUST = [
  { icon: Lock, title: 'Encrypted at rest', body: 'New entries are encrypted before they ever reach the database.' },
  { icon: ShieldCheck, title: 'Two-factor authentication', body: 'Real TOTP with any authenticator app, plus one-time recovery codes.' },
  { icon: WifiOff, title: 'Works offline on Android', body: 'Write with no signal. Your edits sync themselves once you reconnect.' },
];

const SHOTS = [
  { src: '/screens/01-dashboard.webp', alt: 'Mindora dashboard showing a journaling streak, entry count and recent entries' },
  { src: '/screens/02-editor-ai.webp', alt: 'The Mindora editor with the AI assistant toolbar open' },
  { src: '/screens/03-analytics.webp', alt: 'Mood analytics showing a trend chart and mood breakdown' },
  { src: '/screens/04-calendar.webp', alt: 'Calendar view with entries colour-coded by mood' },
];

// Shared bezel so the captures read as screenshots of a real app rather than
// floating rectangles, without pulling in a mockup image asset.
function PhoneFrame({ src, alt, className = '', priority = false }: { src: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <div className={`rounded-[2rem] border border-[var(--text-primary)]/[0.12] bg-[var(--bg-secondary)] p-2 shadow-[0_24px_60px_rgba(0,0,0,0.45)] ${className}`}>
      <img
        src={src}
        alt={alt}
        width={540}
        height={960}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className="w-full h-auto rounded-[1.6rem] block"
      />
    </div>
  );
}

export default function LandingView({ onSignIn, onGetStarted, onNavigateToDownload }: LandingViewProps) {
  return (
    <div className="min-h-screen animate-fade-in">
      {/* Nav */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-[var(--bg-primary)]/80 border-b border-[var(--text-primary)]/[0.06]">
        <nav className="max-w-[1100px] mx-auto flex items-center justify-between gap-4 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="inline-flex p-1.5 rounded-xl bg-[linear-gradient(135deg,#6366f1,#a855f7)]">
              <MindoraMark size={20} />
            </div>
            <span className="font-extrabold text-[1.05rem] tracking-tight">Mindora</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onSignIn}
              className="bg-transparent border-0 cursor-pointer text-[0.85rem] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-2 py-1.5"
            >
              Sign in
            </button>
            <button type="button" onClick={onGetStarted} className="btn-primary text-[0.85rem] px-4 py-2">
              Get started
            </button>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute top-[-10%] left-[10%] w-[420px] h-[420px] rounded-full bg-[rgba(99,102,241,0.16)] blur-[110px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[5%] w-[460px] h-[460px] rounded-full bg-[rgba(168,85,247,0.14)] blur-[120px] pointer-events-none" />

        <div className="relative max-w-[1100px] mx-auto px-5 pt-14 pb-16 lg:pt-20 lg:pb-24 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-10 items-center">
          <div>
            <p className="text-[0.8rem] uppercase tracking-[0.14em] text-[#a5b4fc] font-semibold mb-4">
              Your thoughts. Your story. Your AI companion.
            </p>
            <h1 className="text-[2.25rem] sm:text-[3rem] lg:text-[3.4rem] font-extrabold leading-[1.08] tracking-[-0.02em] mb-5 text-balance">
              A journal that notices
              <span className="bg-[linear-gradient(135deg,#818cf8,#c084fc)] bg-clip-text text-transparent"> what you missed</span>
            </h1>
            <p className="text-[1.02rem] leading-[1.65] text-[var(--text-secondary)] max-w-[46ch] mb-8">
              Write the way you normally would. Mindora reads the mood behind it, helps you find the
              words when they run out, and shows you the patterns that only appear across weeks.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={onGetStarted} className="btn-primary px-6 py-[0.8rem] text-[0.95rem]">
                <span>Start journaling free</span>
                <ArrowRight size={18} />
              </button>
              <button
                type="button"
                onClick={onNavigateToDownload}
                className="btn-secondary px-5 py-[0.8rem] text-[0.9rem] inline-flex items-center gap-2"
              >
                <Smartphone size={17} />
                <span>Get the Android app</span>
              </button>
            </div>
            <p className="text-[0.8rem] text-[var(--text-muted)] mt-4">
              Free to use. No ads, no trackers, and you can delete everything yourself in two taps.
            </p>
          </div>

          <div className="mx-auto w-full max-w-[300px] lg:max-w-[330px]">
            <PhoneFrame src={SHOTS[0].src} alt={SHOTS[0].alt} priority />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-[1100px] mx-auto px-5 py-16 lg:py-20">
        <h2 className="text-[1.7rem] sm:text-[2.1rem] font-extrabold tracking-[-0.015em] mb-3 text-balance">
          Everything here already works
        </h2>
        <p className="text-[var(--text-secondary)] max-w-[58ch] mb-10 leading-[1.6]">
          Not a roadmap. Every capability below is in the app you can sign into right now.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="glass-panel p-6 flex flex-col gap-3">
              <div className="inline-flex self-start p-2.5 rounded-xl bg-[rgba(99,102,241,0.14)] border border-[rgba(99,102,241,0.25)]">
                <Icon size={19} color="#a5b4fc" />
              </div>
              <h3 className="font-bold text-[1.02rem] leading-snug">{title}</h3>
              <p className="text-[0.88rem] leading-[1.6] text-[var(--text-secondary)]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Screenshots */}
      <section className="max-w-[1100px] mx-auto px-5 py-8 lg:py-12">
        <h2 className="text-[1.7rem] sm:text-[2.1rem] font-extrabold tracking-[-0.015em] mb-10 text-balance">
          A look inside
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {SHOTS.map((shot) => (
            <PhoneFrame key={shot.src} src={shot.src} alt={shot.alt} />
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="max-w-[1100px] mx-auto px-5 py-16 lg:py-20">
        <div className="glass-panel glass-panel-glow p-8 sm:p-10">
          <h2 className="text-[1.55rem] sm:text-[1.9rem] font-extrabold tracking-[-0.015em] mb-3 text-balance">
            A journal is only useful if it is private
          </h2>
          <p className="text-[var(--text-secondary)] max-w-[62ch] leading-[1.65] mb-8">
            Your entries belong to your account and are not read, sold, or shared. There are no ads
            and no third-party trackers, and deleting your account removes your entries, files and
            profile straight away - you never have to ask us to do it for you.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {TRUST.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex flex-col gap-2">
                <div className="inline-flex self-start p-2 rounded-lg bg-[rgba(74,222,128,0.12)] border border-[rgba(74,222,128,0.22)]">
                  <Icon size={17} color="#4ade80" />
                </div>
                <h3 className="font-semibold text-[0.95rem]">{title}</h3>
                <p className="text-[0.84rem] leading-[1.55] text-[var(--text-secondary)]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="max-w-[1100px] mx-auto px-5 pb-20 text-center">
        <h2 className="text-[1.8rem] sm:text-[2.2rem] font-extrabold tracking-[-0.015em] mb-4 text-balance">
          Write one entry. See what it notices.
        </h2>
        <p className="text-[var(--text-secondary)] max-w-[48ch] mx-auto mb-7 leading-[1.6]">
          Signing up takes about a minute, and the mood detection starts working on your first
          paragraph.
        </p>
        <button type="button" onClick={onGetStarted} className="btn-primary px-7 py-[0.85rem] text-[0.95rem]">
          <span>Create your account</span>
          <ArrowRight size={18} />
        </button>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--text-primary)]/[0.07]">
        <div className="max-w-[1100px] mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-[0.85rem]">
            <MindoraMark size={16} />
            <span>Mindora</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[0.83rem]">
            <button type="button" onClick={onSignIn} className="bg-transparent border-0 cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
              Sign in
            </button>
            <button type="button" onClick={onNavigateToDownload} className="bg-transparent border-0 cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
              Android app
            </button>
            <a href="/privacy.html" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors no-underline">
              Privacy
            </a>
            <a href="/delete-data.html" className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors no-underline">
              Delete your data
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
