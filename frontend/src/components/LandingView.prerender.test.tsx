import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import LandingView from './LandingView';

// LandingView is rendered to static HTML at build time by prerender/build.mjs
// and injected into dist/index.html, because the app is a client-rendered SPA
// and every crawler that does not execute JavaScript would otherwise see an
// empty root div.
//
// That makes "LandingView must stay renderable outside a browser" a real
// contract rather than an implementation detail. Add a useEffect, a
// window/localStorage read, or any hook that touches the DOM, and `npm run
// build` starts failing inside a Vite SSR bundle with an error that points at
// node_modules rather than at the change that caused it. These tests fail first,
// in the place that explains why.
const noop = () => {};

describe('LandingView prerendering', () => {
  it('renders to static markup outside a browser', () => {
    const html = renderToStaticMarkup(
      <LandingView onSignIn={noop} onGetStarted={noop} onNavigateToDownload={noop} />
    );
    expect(html.length).toBeGreaterThan(5000);
  });

  it('emits the copy and headings crawlers are meant to index', () => {
    const html = renderToStaticMarkup(
      <LandingView onSignIn={noop} onGetStarted={noop} onNavigateToDownload={noop} />
    );
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    expect(text).toContain('A journal that notices');
    expect(text).toContain('Your thoughts. Your story. Your AI companion.');
    expect(text).toContain('Start journaling free');
    expect(html).toMatch(/<h1[^>]*>/);
    // Real body copy, not just chrome - a page of nothing but nav and buttons
    // is thin content whether or not it technically renders.
    expect(text.split(' ').length).toBeGreaterThan(250);
  });

  it('keeps every screenshot alt-texted, since alt text is the only description a crawler gets', () => {
    const html = renderToStaticMarkup(
      <LandingView onSignIn={noop} onGetStarted={noop} onNavigateToDownload={noop} />
    );
    const imgs = html.match(/<img[^>]*>/g) ?? [];
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img).toMatch(/alt="/);
    }
  });
});
