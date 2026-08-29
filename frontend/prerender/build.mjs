// Build-time prerender of the landing page into dist/index.html.
//
// Why this exists: the app is a client-rendered SPA, so before this ran the
// entire crawlable body was `<div id="root"></div>`. Google executes JavaScript
// and would eventually see the page, but Bing, every social-preview fetcher and
// the LLM crawlers do not - to them the site had no content at all.
//
// This is a prerender, not hydration. React's createRoot().render() replaces
// the container's children on mount, so the markup below is what a crawler (and
// the visitor's first paint) sees, and the real interactive tree takes over a
// moment later. The two are the same component with the same props, so there is
// nothing to "match" and no hydration-mismatch class of bug to worry about.
//
// Run by `npm run build` after `vite build`. It fails loudly rather than
// silently shipping an empty shell.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(root, 'prerender/.out');
const indexPath = resolve(root, 'dist/index.html');

function fail(msg) {
  console.error(`\n[prerender] ${msg}\n`);
  process.exit(1);
}

if (!existsSync(indexPath)) fail('dist/index.html not found - run `vite build` first.');

// 1. Compile the SSR entry with Vite so it resolves the same aliases, TS and
//    CSS handling the client build uses.
execFileSync(
  process.execPath,
  [
    resolve(root, 'node_modules/vite/bin/vite.js'),
    'build',
    '--ssr', 'prerender/entry.tsx',
    '--outDir', 'prerender/.out',
    '--logLevel', 'warn',
  ],
  { cwd: root, stdio: 'inherit' }
);

// 2. Render.
const { render } = await import(pathToFileURL(resolve(outDir, 'entry.js')).href);
let markup = render();
if (!markup || markup.length < 500) fail(`render() produced ${markup?.length ?? 0} chars - expected the full landing page.`);

// 3. Strip inlined base64 images. MindoraMark carries a ~35 KB data URI and
//    appears twice, which would add ~70 KB to every single page load for a
//    decorative mark that is already in the JS bundle. Crawlers want the text,
//    not the logo bytes; the real image appears the instant React mounts.
const before = markup.length;
markup = markup.replace(/src="data:image\/[^"]{200,}"/g, 'src="/favicon.svg"');
const saved = before - markup.length;

// 4. Inject into the root div.
const html = readFileSync(indexPath, 'utf8');
const rootDiv = '<div id="root"></div>';
if (!html.includes(rootDiv)) fail(`could not find ${rootDiv} in dist/index.html`);
writeFileSync(indexPath, html.replace(rootDiv, `<div id="root">${markup}</div>`), 'utf8');

rmSync(outDir, { recursive: true, force: true });

const text = markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
console.log(
  `[prerender] injected ${markup.length} chars of markup ` +
  `(${text.split(' ').length} words of crawlable text, ${(saved / 1024).toFixed(0)} KB of base64 stripped)`
);
