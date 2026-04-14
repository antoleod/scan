/**
 * Post-build script: injects PWA meta tags into dist/index.html.
 *
 * Expo's metro bundler (output: "single") does not automatically add:
 *   - <link rel="manifest">
 *   - Apple PWA meta tags
 *   - Edge/Windows tile meta tags
 *   - Service-worker registration
 *
 * Run this after `expo export --platform web`.
 */

const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const htmlPath = path.join(distDir, 'index.html');

if (!fs.existsSync(htmlPath)) {
  console.warn('[inject-pwa] dist/index.html not found — skipping.');
  process.exit(0);
}

let html = fs.readFileSync(htmlPath, 'utf-8');

// ── Detect base path from existing script src ─────────────────────────────────
// e.g. src="/oryxen/_expo/..." → basePath = "/oryxen"
const baseMatch = html.match(/src="(\/[^/][^"]*)\/_expo\//);
const basePath = baseMatch ? baseMatch[1] : '';

// ── Helper: insert before </head> if tag not already present ─────────────────
function injectIfMissing(tag, marker) {
  if (html.includes(marker || tag)) return;
  html = html.replace('</head>', `  ${tag}\n</head>`);
}

// ── Manifest link ─────────────────────────────────────────────────────────────
injectIfMissing(
  `<link rel="manifest" href="${basePath}/manifest.webmanifest" crossorigin="use-credentials">`,
  'rel="manifest"'
);

// ── Apple PWA meta tags (iOS / iPadOS Safari) ─────────────────────────────────
injectIfMissing(
  `<meta name="apple-mobile-web-app-capable" content="yes">`,
  'apple-mobile-web-app-capable'
);
injectIfMissing(
  `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`,
  'apple-mobile-web-app-status-bar-style'
);
injectIfMissing(
  `<meta name="apple-mobile-web-app-title" content="Oryxen">`,
  'apple-mobile-web-app-title'
);
injectIfMissing(
  `<link rel="apple-touch-icon" href="${basePath}/favicon.png">`,
  'apple-touch-icon'
);

// ── Edge / Windows tile ───────────────────────────────────────────────────────
injectIfMissing(
  `<meta name="msapplication-TileColor" content="#1A1A1A">`,
  'msapplication-TileColor'
);
injectIfMissing(
  `<meta name="msapplication-tap-highlight" content="no">`,
  'msapplication-tap-highlight'
);

// ── Mobile web-app capable (Android legacy) ───────────────────────────────────
injectIfMissing(
  `<meta name="mobile-web-app-capable" content="yes">`,
  'mobile-web-app-capable'
);

// ── Service worker registration ───────────────────────────────────────────────
const swSnippet = `<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('${basePath}/sw.js', { scope: '${basePath}/' })
        .then(function(reg) { console.log('[SW] registered', reg.scope); })
        .catch(function(err) { console.warn('[SW] registration failed', err); });
    });
  }
</script>`;

if (!html.includes("serviceWorker.register")) {
  html = html.replace('</body>', `${swSnippet}\n</body>`);
}

fs.writeFileSync(htmlPath, html, 'utf-8');
console.log(`[inject-pwa] Patched ${htmlPath} (base: "${basePath}")`);
