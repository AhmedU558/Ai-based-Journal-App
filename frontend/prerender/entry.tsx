import { renderToStaticMarkup } from 'react-dom/server';
import LandingView from '../src/components/LandingView';

// SSR entry for the build-time prerender. Only LandingView is rendered, never
// App - App reads the session on mount and decides between the landing page,
// the auth form and the dashboard, none of which is knowable at build time.
// LandingView is pure presentation (no hooks, no browser APIs), so rendering it
// in Node is safe and its output is identical for every visitor.
//
// The handlers are no-ops on purpose. In the prerendered HTML these buttons are
// inert; React replaces the whole subtree on mount and wires up the real
// navigation. The markup exists for crawlers and for first paint, not to be
// interactive.
const noop = () => {};

export function render(): string {
  return renderToStaticMarkup(
    <LandingView onSignIn={noop} onGetStarted={noop} onNavigateToDownload={noop} />
  );
}
