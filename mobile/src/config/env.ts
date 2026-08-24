// Single composition point deciding mock-vs-real, per the Phase 11 plan's two-pass
// build order: Pass A (prototype) runs entirely against mocks/, Pass B (real
// integration) flips this flag and points at a real reachable gateway. No RN device
// proxy equivalent exists for "localhost:8080" the way Vite's dev proxy did for the
// web app, so EXPO_PUBLIC_API_BASE_URL must be the gateway's real LAN/tunnel address.
export const USE_MOCKS = process.env.EXPO_PUBLIC_USE_MOCKS !== 'false';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8080';

// The gateway (API_BASE_URL, port 8080 by default) serves only /api/v1/**
// routes - it has no static file handling, so TurnstileGate's embed page
// (frontend/public/turnstile-embed.html, served by the frontend's own nginx
// container on port 3000) 404'd when it was previously built from
// API_BASE_URL. A real device/tunnel deployment needs its own real value
// here too, same as API_BASE_URL's own comment already notes.
export const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_BASE_URL || 'http://localhost:3000';
