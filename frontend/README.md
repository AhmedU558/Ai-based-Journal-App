# frontend

React 19 + TypeScript SPA for the AI Journaling Platform. Talks to `gateway-service` (port 8080) - the dev server proxies `/api/**` to `http://localhost:8080` (see `vite.config.js`), and the production build expects the gateway reachable at the same origin or `http://localhost:8080` (see `src/services/api.js`). No frontend `.env` file is needed for local dev.

## Tech stack

- **React 19** + **TypeScript** (partial migration in progress - some components are still `.jsx`, converted incrementally one at a time; see `docs/ARCHITECTURE.md` in the repo root for the migration's status)
- **Tailwind CSS v4** (via `@tailwindcss/vite`, no separate `tailwind.config.js`/`postcss.config.js`) + shadcn/ui-style components (`components.json`, `src/lib/utils.ts`'s `cn()` helper)
- **react-router-dom v7** for routing
- **Vite** for dev/build, **Vitest** + **React Testing Library** for tests
- **axios** for HTTP, **recharts** for charts, **framer-motion** for animation, **lucide-react** for icons

## Scripts

```bash
npm install
npm run dev         # start dev server on :3000, proxies /api to :8080
npm run build        # production build
npm run test          # run Vitest suite
npm run test:watch    # Vitest in watch mode
npm run typecheck     # tsc --noEmit
npm run lint           # oxlint
npm run preview        # preview a production build locally
```

## Structure

```
src/
  components/   one file per view/widget (DashboardView, JournalEditor, SettingsModal, ...)
  services/     thin API client wrappers (authService, journalService, aiService, ...) -
                each unwraps the backend's ApiResponse<T> envelope (res.data.data)
  lib/          shared utilities - moods.ts (mood/emoji/color lookup, single source of
                truth), journalStats.ts (streak/AI-level calculations), utils.ts (cn())
  assets/       static assets
  App.jsx       route tree + top-level auth gating
  main.jsx      entry point, wraps App in BrowserRouter
```

## Routes

Logged out, only two routes render: `/` is the marketing landing page
(`LandingView`) and `/login` is the sign-in / registration form (`AuthView`).
Anything else redirects to `/login` rather than `/`, so a bookmarked
`/dashboard` lands somewhere you can act on instead of a marketing pitch.

`/download` is checked ahead of the auth gate and renders either way.

Logged in, `/` and `/login` both fall through the catch-all to `/dashboard`.

Both `LandingView` and `AuthView` are eagerly imported on purpose - `/` is what
a fresh visitor hits, so lazy-loading it would move a chunk fetch onto the LCP
path that the lazy-loading in `App.jsx` exists to protect. The five modals that
fix was actually about are still lazy.

Every new component added since the TypeScript/Tailwind migration started ships as `.tsx` with at least a smoke test alongside it (`Component.test.tsx`).
