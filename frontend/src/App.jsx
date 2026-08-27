import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import Navbar from './components/Navbar';
import Header from './components/Header';
import AuthView from './components/AuthView';
import Toast from './components/Toast';
// Lazy-loaded, not eager - none of these render for an unauthenticated
// visitor (they're either behind the isAuthenticated gate or, for
// DownloadAppView, a standalone route) - a static import here bundled all
// five into the same entry chunk AuthView ships in, inflating the JS every
// fresh visitor to the login page has to download+parse+execute before the
// login heading can even paint (a real, measured 8.55s "poor" LCP).
const DownloadAppView = lazy(() => import('./components/DownloadAppView'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));
const NotificationsDrawer = lazy(() => import('./components/NotificationsDrawer'));
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const AchievementsModal = lazy(() => import('./components/AchievementsModal'));
import { authService } from './services/authService';
import { journalService } from './services/journalService';
import { notificationService } from './services/notificationService';
import { userService } from './services/userService';
import { fileService } from './services/fileService';
import { resetAiUsageTracking } from './lib/achievementTracking';

function EditJournalRoute({ onSaveSuccess, showToast }) {
  const { journalId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [initialData, setInitialData] = useState(location.state?.journal ?? null);
  const [loading, setLoading] = useState(!location.state?.journal);

  useEffect(() => {
    if (location.state?.journal) return;
    let cancelled = false;
    journalService.getJournalById(journalId)
      .then((res) => {
        if (!cancelled) setInitialData(res?.data?.data ?? null);
      })
      .catch(() => {
        showToast('Could not load that journal entry.', 'error');
        navigate('/journals', { replace: true });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalId]);

  if (loading) return null;
  return (
    <JournalEditor
      initialData={initialData}
      onClose={() => navigate('/journals')}
      onSaveSuccess={onSaveSuccess}
      showToast={showToast}
    />
  );
}

// Lazy Loaded View Components for Dynamic Code Splitting & Performance
const DashboardView = lazy(() => import('./components/DashboardView'));
const JournalEditor = lazy(() => import('./components/JournalEditor'));
const JournalFeed = lazy(() => import('./components/JournalFeed'));
const CalendarView = lazy(() => import('./components/CalendarView'));
const AIChatView = lazy(() => import('./components/AIChatView'));
const SearchView = lazy(() => import('./components/SearchView'));
const AnalyticsView = lazy(() => import('./components/AnalyticsView'));

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => authService.isAuthenticated());
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Modals & Drawers state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAchievementsOpen, setIsAchievementsOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [notifications, setNotifications] = useState([]);
  const [emailVerified, setEmailVerified] = useState(true);
  const [verificationBannerDismissed, setVerificationBannerDismissed] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const avatarObjectUrlRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Reconciles the localStorage-seeded initial theme (no flash-of-wrong-theme
  // on load) with the real cross-device preference once it's fetched - the
  // server value wins if they differ. userService.getPreferences already
  // get-or-creates a row server-side, so this never 404s for a first-time user.
  useEffect(() => {
    if (!isAuthenticated) return;
    userService.getPreferences()
      .then((preferences) => {
        const serverTheme = preferences?.darkMode === false ? 'light' : 'dark';
        setTheme((prev) => (prev === serverTheme ? prev : serverTheme));
      })
      .catch(() => {
        // Fail soft - localStorage's value keeps driving the theme.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Fetches notifications, guarded against a stale response landing after a
  // fresher one (request-id-ref pattern, same shape as AnalyticsView's own
  // guard) - reused both on auth (so the unread badge is correct immediately
  // on login, not just after the drawer has already been opened once) and
  // on drawer-open (to pick up anything new while it was closed).
  const notificationsRequestId = useRef(0);
  const refreshNotifications = () => {
    const requestId = ++notificationsRequestId.current;
    notificationService.list()
      .then((res) => {
        if (requestId === notificationsRequestId.current) {
          setNotifications(res?.data?.data?.content || []);
        }
      })
      .catch(() => {
        // Fail soft - the drawer just shows its empty state.
      });
  };

  useEffect(() => {
    if (!isNotificationsOpen) return;
    refreshNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNotificationsOpen]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Fetch once whenever the app becomes authenticated (fresh login, or an
  // already-authenticated page reload) to drive the non-blocking email
  // verification banner - never gates access, purely a nag. Also exposed to
  // SettingsModal so a successful verify clears the banner without a reload.
  // Same request-id-ref stale-response guard as refreshNotifications above.
  const emailVerifiedRequestId = useRef(0);
  const refreshEmailVerified = () => {
    const requestId = ++emailVerifiedRequestId.current;
    authService.getCurrentUser()
      .then((user) => {
        if (requestId === emailVerifiedRequestId.current) {
          setEmailVerified(Boolean(user?.emailVerified));
        }
      })
      .catch(() => {
        // Fail soft - no banner shown rather than a broken one.
      });
  };

  // Same pattern as refreshEmailVerified above - fetched once on auth so the
  // header/sidebar avatar pill shows the user's real photo immediately
  // instead of only the letter fallback, and exposed to SettingsModal so a
  // successful upload/removal updates both without a full reload. Revokes
  // the previous object URL before creating a new one so uploading a
  // replacement (or removing the photo) doesn't leak blob URLs.
  const avatarRequestId = useRef(0);
  const refreshAvatar = () => {
    const requestId = ++avatarRequestId.current;
    userService.getProfile()
      .then((profile) => {
        if (requestId !== avatarRequestId.current) return;
        if (!profile?.avatarUrl) {
          if (avatarObjectUrlRef.current) {
            URL.revokeObjectURL(avatarObjectUrlRef.current);
            avatarObjectUrlRef.current = null;
          }
          setAvatarUrl(null);
          return;
        }
        fileService.getBlobUrl(profile.avatarUrl)
          .then((url) => {
            if (requestId !== avatarRequestId.current) return;
            if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
            avatarObjectUrlRef.current = url;
            setAvatarUrl(url);
          })
          .catch(() => {
            if (requestId === avatarRequestId.current) setAvatarUrl(null);
          });
      })
      .catch(() => {
        // Fail soft - the letter-fallback avatar keeps showing.
      });
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshEmailVerified();
    refreshNotifications();
    refreshAvatar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      showToast('All notifications marked as read', 'info');
    } catch {
      showToast('Could not mark notifications as read.', 'error');
    }
  };

  // Global Keyboard Shortcuts (Cmd+K, Cmd+N, Cmd+A, Cmd+J)
  useEffect(() => {
    const handleGlobalShortcuts = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, []);

  // Active 10-Minute Session Expiry Watcher - only meaningful once actually
  // logged in. Without this guard, the interval ran unconditionally from
  // app load, so an unauthenticated visitor (e.g. still sitting on the
  // login page) got authService.isAuthenticated() evaluating to false every
  // 10s forever, showing "Session expired. Please log in again." on a
  // repeating loop despite never having had a session to expire.
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const checkInterval = setInterval(() => {
      const valid = authService.isAuthenticated();
      if (!valid) {
        setIsAuthenticated(false);
        showToast('Session expired. Please log in again.', 'warning');
      }
    }, 10000);

    return () => clearInterval(checkInterval);
  }, [isAuthenticated]);

  // Real user activity extends the session; authService.touchSession()
  // existed but was never wired to anything, so the session was actually a
  // flat 10-minute countdown from login regardless of activity - contrary to
  // the app's own "expires after 10 minutes of inactivity" copy in Settings.
  // Throttled to at most once every 30s so this isn't a localStorage write on
  // every pixel of mouse movement.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let lastTouch = 0;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastTouch < 30000) return;
      lastTouch = now;
      authService.touchSession();
    };
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));
    return () => {
      activityEvents.forEach((event) => window.removeEventListener(event, handleActivity));
    };
  }, [isAuthenticated]);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      // Best-effort, fire-and-forget - a failed sync must never block the
      // toggle itself; localStorage (already updated by the effect above)
      // keeps this tab correct regardless.
      userService.updatePreferences({ darkMode: next === 'dark' }).catch(() => {});
      return next;
    });
  };

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    navigate('/dashboard');
    showToast('Logged in successfully!', 'success');
  };

  const handleLogout = () => {
    authService.logout();
    setIsAuthenticated(false);
    // App never unmounts across a login -> logout -> different-login cycle
    // in the same tab, so per-account UI state must be reset explicitly here
    // - otherwise a dismissed banner or a stale notification list/badge from
    // the previous account would leak into the next one that logs in.
    setEmailVerified(true);
    setVerificationBannerDismissed(false);
    setNotifications([]);
    if (avatarObjectUrlRef.current) {
      URL.revokeObjectURL(avatarObjectUrlRef.current);
      avatarObjectUrlRef.current = null;
    }
    setAvatarUrl(null);
    // Same cross-account-leak reasoning as the state resets above - this is
    // a bare module-level flag (not React state), so it needs its own
    // explicit reset here too, or the next account to log in in this same
    // tab would see "AI Pioneer" already unlocked.
    resetAiUsageTracking();
    showToast('Logged out.', 'info');
  };

  // Account deletion leaves the same local state behind as a logout - the
  // session, cached per-account UI flags, the avatar object URL - so it reuses
  // handleLogout's teardown rather than duplicating it. Only the modal dismissal
  // and the message differ: there is no account to come back to.
  const handleAccountDeleted = () => {
    setIsSettingsOpen(false);
    handleLogout();
    showToast('Your account and all its data have been deleted.', 'info');
  };

  const handleNewJournal = () => {
    navigate('/journals/new');
  };

  const handleEditJournal = (journal) => {
    navigate(`/journals/${journal.id}/edit`, { state: { journal } });
  };

  const handleSaveSuccess = () => {
    navigate('/journals');
  };

  const handleCommandPaletteAction = (actionId) => {
    if (actionId === 'new-journal') {
      handleNewJournal();
    } else if (actionId === 'ai-chat') {
      navigate('/ai-chat');
    } else if (actionId === 'journals') {
      navigate('/journals');
    } else if (actionId === 'calendar') {
      navigate('/calendar');
    } else if (actionId === 'search') {
      navigate('/search');
    } else if (actionId === 'analytics') {
      navigate('/analytics');
    } else if (actionId === 'toggle-theme') {
      toggleTheme();
    } else if (actionId === 'voice-dictation') {
      handleNewJournal();
    }
  };

  const activeTab = location.pathname.startsWith('/journals') ? 'journals' : location.pathname.slice(1) || 'dashboard';

  // Public standalone page - reachable whether logged in or not, so it's
  // checked before the auth gate below rather than living inside either
  // branch's routing.
  if (location.pathname === '/download') {
    return (
      <>
        <Suspense fallback={null}>
          <DownloadAppView
            isAuthenticated={isAuthenticated}
            onBack={() => navigate(isAuthenticated ? '/dashboard' : '/')}
            showToast={showToast}
          />
        </Suspense>
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <AuthView onLoginSuccess={handleLoginSuccess} onNavigateToDownload={() => navigate('/download')} />
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    );
  }

  return (
    <div className="app-container">
      {/* Global Modals & Drawers - lazy, so a null fallback while each
          chunk loads is invisible (they're all closed/isOpen=false until
          the user explicitly opens one). */}
      <Toast toast={toast} onClose={() => setToast(null)} />
      <Suspense fallback={null}>
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onSelectAction={handleCommandPaletteAction}
        />
        <NotificationsDrawer
          isOpen={isNotificationsOpen}
          onClose={() => setIsNotificationsOpen(false)}
          notifications={notifications}
          onMarkAllRead={handleMarkAllRead}
        />
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onEmailVerified={refreshEmailVerified}
          onAvatarChanged={refreshAvatar}
          onAccountDeleted={handleAccountDeleted}
        />
        <AchievementsModal
          isOpen={isAchievementsOpen}
          onClose={() => setIsAchievementsOpen(false)}
        />
      </Suspense>

      {/* Sidebar Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => navigate(`/${tab}`)}
        onLogout={handleLogout}
        onOpenAchievements={() => setIsAchievementsOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        avatarUrl={avatarUrl}
      />

      {/* Main App Section */}
      <div className="main-wrapper">
        {/* Top Header */}
        <Header
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onToggleTheme={toggleTheme}
          theme={theme}
          onOpenNotifications={() => setIsNotificationsOpen(true)}
          unreadCount={unreadCount}
          onOpenSettings={() => setIsSettingsOpen(true)}
          avatarUrl={avatarUrl}
        />

        {/* Non-blocking email verification nag - dismissible, never gates access */}
        {!emailVerified && !verificationBannerDismissed && (
          <div className="mx-6 mt-4 bg-[rgba(245,158,11,0.15)] border border-[rgba(245,158,11,0.3)] text-[#fbbf24] py-3 px-4 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle size={18} />
              <span>Verify your email to secure your account.</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="underline font-medium hover:opacity-80"
              >
                Verify Now
              </button>
              <button
                onClick={() => setVerificationBannerDismissed(true)}
                className="hover:opacity-80"
                aria-label="Dismiss"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Route Content with Lazy Loading Suspense */}
        <main className="main-content">
          <Suspense fallback={
            <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="glass-panel skeleton-pulse" style={{ height: '180px', borderRadius: '20px' }}></div>
              <div className="glass-panel skeleton-pulse" style={{ height: '300px', borderRadius: '20px' }}></div>
            </div>
          }>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/dashboard"
                element={
                  <DashboardView
                    onNewJournal={handleNewJournal}
                    onSelectJournal={(journal) => handleEditJournal(journal)}
                    showToast={showToast}
                  />
                }
              />
              <Route
                path="/journals"
                element={
                  <JournalFeed
                    onNewJournal={handleNewJournal}
                    onEditJournal={(journal) => handleEditJournal(journal)}
                    showToast={showToast}
                  />
                }
              />
              <Route
                path="/journals/new"
                element={
                  <JournalEditor
                    initialData={null}
                    onClose={() => navigate('/journals')}
                    onSaveSuccess={handleSaveSuccess}
                    showToast={showToast}
                  />
                }
              />
              <Route
                path="/journals/:journalId/edit"
                element={<EditJournalRoute onSaveSuccess={handleSaveSuccess} showToast={showToast} />}
              />
              <Route
                path="/calendar"
                element={<CalendarView onSelectJournal={(journal) => handleEditJournal(journal)} />}
              />
              <Route path="/ai-chat" element={<AIChatView />} />
              <Route path="/search" element={<SearchView />} />
              <Route path="/analytics" element={<AnalyticsView />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
