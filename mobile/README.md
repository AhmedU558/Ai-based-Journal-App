# mobile (Mindora)

**Mindora** - "Your thoughts. Your story. Your AI companion." - is the native Android/iOS client for the AI Journaling Platform, built with Expo/React Native. It is v2 of the platform: a second, independent frontend that talks to the same `gateway-service` (port 8080) the web app (`frontend/`) uses, not a replacement for it.

This phase (Phase 11) ships one complete vertical slice - auth through core journal CRUD - built and demoable in two passes:

- **Pass A (default today)**: runs entirely against a local mock service layer (`src/mocks/`) with realistic canned data. No backend needs to be running.
- **Pass B**: flips one env var to swap in the real axios-backed services (`src/services/`). Screens are identical between the two passes - only `src/services/index.ts` changes which module it re-exports.

Calendar, Search, AI Chat, Settings/2FA management, Analytics, Achievements, Notifications, Command Palette, a confetti moment in the journal editor, offline support for journal CRUD, real push notifications, and a real AI Wellness Suggestion on the Dashboard were added after the initial slice. Voice dictation is the one item still intentionally not in this app - see below and the Phase 11 plan for the full deferral list.

The Dashboard's "AI Wellness Suggestion" card (`src/services/recommendationService.ts`) calls `recommendation-service`'s `GET /api/v1/recommendations`, which computes a real dominant mood from the user's recent journals server-side and returns genuinely mood-differentiated content - this app never had any recommendation integration at all before (the card was a fully static hardcoded string), so this is new ground, not a bug fix like the equivalent web-app card had (`frontend/`'s version called a different endpoint - `ai-service`'s - and had three real bugs of its own, fixed separately).

**Push notifications are real, not a stub - and the one Phase 11 feature that needs more than plain Expo Go.** `notification-service` now has its own MySQL database (`notification_db`, `device_tokens` table) and actually calls Expo's push API (`https://exp.host/--/api/v2/push/send`) instead of just logging; a `ReminderScheduler` sends a real daily reminder (fixed UTC time, no per-user personalization - documented simplification, not a fake feature) to every registered device. On the mobile side, `useAuth.ts` registers a real Expo push token whenever a session becomes active and unregisters it on logout, via `services/notificationService.ts` + new `lib/pushRegistration.ts`. Tapping a delivered reminder navigates straight into a new journal entry (`navigation/RootNavigator.tsx`).

The catch: `Notifications.getExpoPushTokenAsync()` only returns a real token from a **custom Expo dev client** (`expo-dev-client` + `expo-notifications`), not plain Expo Go - Expo dropped remote push support from Expo Go on Android as of SDK 53 (still works in Expo Go on iOS, but Android is the platform this app has actually been tested on all session). Rather than switch the whole project off Expo Go for this one feature, `pushRegistration.ts` fails soft (returns `null`) everywhere a dev client or an EAS project ID isn't available, so **every other screen keeps working in plain Expo Go exactly as before** - only testing push itself needs the dev client. To actually test it yourself:
```bash
eas login                                     # your own Expo account
eas build:configure                            # links this project, creates the EAS project ID getExpoPushTokenAsync() needs
eas build --profile development --platform android
# install the resulting dev-client APK on your device, then:
npx expo start --dev-client
```
(Small aside: `package.json`'s `"start"` script has said `expo start --dev-client` since the original Phase 11 scaffold, even before anything actually needed it - harmless, since this session's actual workflow always called `npx expo start --port ... --clear` directly rather than via `npm start`, but worth flagging so it doesn't look like an unexplained leftover.) None of this - `eas login`/`eas build:configure`/`eas build` - was run by the agent building this feature; same policy boundary as the EAS Build phase (account login and cloud-billable actions need you directly in the loop). Real push delivery end-to-end was not verified on a physical device for the same reason; the device-token register/unregister/reminder endpoints themselves *were* verified live against a real running backend (see `notification-service/README.md`).

**Voice dictation was deliberately skipped, not faked.** The web app's mic button uses the browser's Web Speech API, which has no equivalent on native. The only real on-device speech-to-text option for Expo (`expo-speech-recognition`) is a native module that requires a **custom dev client** (`expo-dev-client` + EAS/local prebuild) - it does not run in the standard Expo Go app. Every other native module this app uses today (`expo-secure-store`, `react-native-svg`, `expo-linear-gradient`, etc.) is one Expo Go already bundles for SDK 54, which is the whole reason this app can be demoed by just scanning a QR code into Expo Go with no build step. Adding real voice dictation would mean switching the entire project's dev workflow off Expo Go for one button - a bigger architectural change than this feature is worth, so there's no mic button here at all rather than one that's disabled or fakes a transcript.

Confetti (in `JournalEditorScreen`, via new `components/ui/ConfettiBurst.tsx`) ports the web app's actual trigger exactly: it fires when the debounced AI mood-detection call returns `HAPPY` or `EXCITED`, and only there - `frontend/src/components/JournalEditor.tsx` doesn't fire it on save or on an achievement unlocking either, so this doesn't invent a new trigger point beyond what's real on the web side. It's a small dependency-free particle-burst built on RN's `Animated` API rather than a `canvas-confetti`-equivalent package, for the same reason Analytics skipped a charting library - avoiding another native-adjacent dependency for one visual effect.

Notifications (reached from a bell-icon button on the Dashboard header, same modal pattern as Achievements) keeps the same static/decorative three-item list as `frontend/src/components/NotificationsDrawer.tsx` - there's no notifications backend anywhere in this platform, on either client. One thing it doesn't copy: the web version's "Mark all as read" is a complete no-op (fires a toast, touches no state at all); this one actually tracks read/unread locally and dims read items, since a fake backend and a fake button press are different kinds of dishonest.

Achievements is reached from an award-icon button on the Dashboard header (a modal-presented screen, like `JournalEditor`) rather than an 8th bottom tab - matches how the web app treats it (a modal triggered from the sidebar, not a permanent nav destination) and avoids crowding the tab bar further. Its four badges are computed from real journal data (`journalService`/`journalStats.calculateStreak`/distinct mood count) and real AI-chat usage this session (`lib/achievementTracking.ts`) - **not** ported from the web version's logic, because the web `AchievementsModal.tsx` has a real bug: `App.jsx` never passes it a `journalCount` prop, so it silently falls back to a hardcoded default of 5, meaning 3 of its 4 badges always show "unlocked" regardless of the user's actual progress. Also fixes a second logic bug in the same file while at it: "Emotional Master" is described as "5 distinct mood categories" but the web code checks `journalCount >= 5` (total entries, not distinct moods) - this port checks the actual distinct-mood count.

**Offline support** (journal CRUD only) is the first Phase 11 feature with no web-app equivalent to port - `frontend/` has zero offline handling, so this is genuinely new ground rather than a port. Scope is deliberately limited: `journalService.getAllJournals()` (real, Pass B only - `mockJournalService.ts` is untouched, mocks have no backend to be offline *from*) caches the last-fetched list (`lib/offlineCache.ts`) and falls back to it when a live fetch fails while the device is actually offline (checked via `@react-native-community/netinfo`, not inferred from the error itself - a real server error, like a rejected 400 or an expired session, still surfaces normally rather than being silently treated as "offline"). Creates/updates/deletes made while offline are queued (`lib/offlineQueue.ts`) and applied optimistically to the cached list so they're visible immediately, then replayed against the real backend in order on reconnect (or on the next screen focus as a fallback) - both halves of that were fixed by a later audit: the reconnect listener only fired on a `false→true` connectivity transition, so a cold app launch while already online never triggered a sync at all (pending edits from a previous offline session sat stuck until airplane mode was toggled), and the screen-focus fallback was documented here but didn't actually exist in code. A locally-created entry gets a temporary `local-...` id that's reconciled to the server-assigned id once its create syncs, and editing or deleting that same never-synced entry folds into (or cancels) the pending create rather than queuing a separate operation. `DashboardScreen` and `JournalListScreen` show an `OfflineBanner` when offline or when changes are still pending sync.

Explicitly out of scope, not silently dropped: offline support for AI Chat, mood detection, search, or analytics (these need the backend and already degrade gracefully via existing error handling); real conflict resolution for edits made on two devices while both were offline (last-write-wins on sync, no merge UI - reasonable for a single-user demo app); and background sync (sync only happens while the app is open).

Command Palette (reached from a command-icon button on the Dashboard header, another modal-presented screen) is a mobile port of `frontend/src/components/CommandPalette.tsx` - type-ahead filtering over the same set of navigation/action commands, tap a row to execute. Two of the web version's actions are deliberately dropped rather than faked: voice dictation (never built for Mindora at all - see the deferral list) and the light/dark theme toggle (`app.json` pins `userInterfaceStyle` to `dark`, there's nothing to toggle). Keyboard shortcuts and arrow-key row selection are dropped too since this is a touch UI - tapping a row is the only way to select one. Selecting a navigation command dismisses the palette and switches tabs in the same action (`navigation.goBack()` followed by `navigation.navigate('Tabs', { screen: ... })`, rather than stacking a second modal on top of the palette).

Analytics deliberately doesn't pull in a charting library - the web app's recharts-based radar/area charts are replaced with plain `View`-based bar visualizations (mood-frequency bars, a 7-day entry-count mini-chart). Given how much friction this phase already hit from native-module/Expo-SDK version mismatches, adding another native-adjacent dependency for one screen wasn't worth the risk; the metric cards and mood-breakdown bars carry the same information as the radar wheel/positivity-stream charts, just not as a literal radar/line chart.

## Tech stack

- **Expo** (managed workflow, SDK 54 - runs directly in the published Expo Go app, no custom dev client needed; every native module used here - `expo-secure-store`, `react-native-svg`, `expo-linear-gradient`, etc. - is one Expo Go already bundles for this SDK version)
- **React Navigation** (`native-stack` + `bottom-tabs`) - `AuthStack` (Login/Register/MfaChallenge/ForgotPassword) and `MainTabs` (Dashboard/Journals/Calendar/Search/Chat/Analytics/Settings, icon-only past 6 tabs), plus modal `JournalEditor`/`Achievements`/`Notifications`/`CommandPalette` screens on the stack above the tabs
- **expo-clipboard** for the AI Chat "copy message" button
- **react-native-qrcode-svg** for the 2FA setup QR code (pure JS, built on the already-installed `react-native-svg`)
- **@react-native-community/netinfo** for offline detection - listed on Expo's own SDK reference (`docs.expo.dev/versions/latest/sdk/netinfo/`), which means Expo Go bundles it for SDK 54; needs no config plugin
- **expo-notifications** + **expo-dev-client** for real push notifications - unlike every other dependency in this app, real push token retrieval needs a custom dev client build, not plain Expo Go (see the push notifications section above)
- **NativeWind v4** (Tailwind classNames on native components) - theme tokens in `tailwind.config.js` are ported from `frontend/src/index.css`'s `:root` block, same dark glassmorphism palette as the web app
- **axios**, with the same request/response-interceptor pattern as `frontend/src/services/api.js` (attach bearer token, silent refresh-and-retry-once on 401)
- **expo-secure-store** (Keystore-backed, for the two JWTs) + **@react-native-async-storage/async-storage** (non-sensitive session fields) - see `src/services/session.ts`
- **lucide-react-native** for icons (same component names as the web app's `lucide-react`)
- **Jest** + **jest-expo** + **@testing-library/react-native** for tests

## Scripts

```bash
npm install
npm start                 # expo start --dev-client
npm run android            # expo start --android
npm run ios                 # expo start --ios
npm test                     # jest
npm run typecheck             # tsc --noEmit
```

## Environment

Two env vars (read via `src/config/env.ts`, `EXPO_PUBLIC_*` prefix required by Expo to expose them client-side):

- `EXPO_PUBLIC_USE_MOCKS` - `"true"` (default) for Pass A, `"false"` for Pass B.
- `EXPO_PUBLIC_API_BASE_URL` - the gateway's reachable address for Pass B (e.g. your machine's LAN IP on port 8080 - `localhost` does not resolve to your dev machine from a physical device or most emulators).
- `EXPO_PUBLIC_WEB_BASE_URL` - the web frontend's own reachable address (not the gateway - port 3000 by default in local dev). `TurnstileGate.tsx`'s CAPTCHA widget loads `frontend/public/turnstile-embed.html` from here, since that's a static file the frontend's container serves, not something the gateway can route to. In production both this and `EXPO_PUBLIC_API_BASE_URL` typically point at the same public domain, since the host nginx there routes `/api/**` to the gateway and everything else to the frontend from one origin.

## Structure

```
src/
  screens/       Login, Register, MfaChallenge, ForgotPassword, Dashboard, JournalList,
                   JournalEditor, Calendar, Search, Chat, Analytics, Settings, Achievements,
                   Notifications, CommandPalette
  navigation/     RootNavigator.tsx (AuthStack / MainTabs / modal JournalEditor), types.ts
  context/         AuthContext.tsx - wraps hooks/useAuth.ts's 10s session-poll (RN port of
                   App.jsx's session-expiry watcher) so screens can reach login()/logout()
  services/        real axios-backed authService/journalService/aiService/searchService/
                   userService/notificationService/recommendationService/api/session,
                   plus index.ts - the one file that switches between real and mocks/
  mocks/           fixtures.ts (seed users + journals), mock{Auth,Journal,Ai,Search,User,
                   Notification,Recommendation}Service.ts - same function signatures as
                   services/*.ts, used for Pass A
  components/      MoodWheel.tsx, ErrorBanner.tsx, OfflineBanner.tsx, ui/ (GlassPanel,
                   GlassInput, PrimaryButton, SkeletonBlock, FadeInView, EmptyState)
  lib/             moods.ts, journalStats.ts, utils.ts (cn()) - ported near-verbatim
                   from frontend/src/lib/, pure TypeScript with no DOM dependency;
                   offlineCache.ts + offlineQueue.ts + pushRegistration.ts - new, no
                   web-app equivalent
  types/           shared Journal/AuthResult/CurrentUser/ProfileData/MfaSetupData types
                   used by both real and mock services
```

## Testing native-storage-backed modules

`authService.ts`/`session.ts` import `expo-secure-store` and `@react-native-async-storage/async-storage`. `jest-expo` mocks `expo-*` packages automatically, but AsyncStorage (a community package, not `expo-*`-namespaced) needs its own mock wired explicitly via `moduleNameMapper` in `package.json`'s `jest` config, pointing at the package's own `jest/async-storage-mock` - otherwise any test that transitively imports `session.ts` fails at import time with `NativeModule: AsyncStorage is null`.

## Verification

1. **Pass A (mocks, no backend needed)**: `npx expo start --dev-client`, open on a device/emulator via the Expo Dev Client. Log in as `demo` / `password123` (no MFA) or `mfa_demo` / `password123` (MFA path, code `123456`). Tap through Dashboard, Journals, create/edit/delete an entry, Calendar, Search, AI Chat, and Settings (edit profile, change password, walk the full 2FA setup/enable/disable flow - confirmation code is always `123456` in Pass A), log out. From the Login screen, "Forgot password?" walks the reset-code flow - `mockAuthService.forgotPassword` always "succeeds," and the fixture reset code accepted by `resetPassword` is `RESET-12345`.
2. `npm run typecheck` and `npm test` (Jest - covers the pure logic in `journalStats.ts` and every mock service's CRUD/auth/search/MFA behavior).
3. **Pass B (real backend)**: set `EXPO_PUBLIC_USE_MOCKS=false` and `EXPO_PUBLIC_API_BASE_URL` to your gateway's reachable address, repeat the same tap-through against live data.

## Production build (EAS)

`eas.json` defines three build profiles (`development`, `preview`, `production`) - this repo ships the config, but actually running a build requires an Expo account and can't be done by an agent on your behalf (account login/creation and any cloud-billable action are both outside what should happen without you directly in the loop). To produce a real installable build yourself:

```bash
npm install -g eas-cli        # or just use `npx eas-cli ...` for each command below
eas login                      # your own Expo account
eas build:configure            # links this project to your account, sets the EAS project ID
eas build --platform android --profile preview      # internal-distribution APK, good for sharing/testing
eas build --platform android --profile production    # app-bundle (.aab), what the Play Store wants
```

Before a real Play Store / App Store submission, two things in this repo still need real attention, not more agent work:

- **`preview`/`production` profiles' `EXPO_PUBLIC_API_BASE_URL`** in `eas.json` is a placeholder (`https://REPLACE-WITH-YOUR-DEPLOYED-GATEWAY-URL`) - the backend needs to be deployed somewhere publicly reachable first (the k8s manifests in `../k8s/` are the closest existing path to that), since a build artifact can't reach `localhost`.
- **App icon / splash / adaptive icon** (`assets/icon.png`, `assets/splash-icon.png`, `assets/android-icon-*.png`) are still Expo's default template graphics from `create-expo-app` (the generic blue chevron logo, not anything Mindora-branded) - nobody has actually designed real app icon/splash art for this app yet. `app.json` already points at the right files and the adaptive-icon background color matches the app's own dark theme (`#090d16`), so swapping in real artwork later is a drop-in asset replacement, not a config change.

