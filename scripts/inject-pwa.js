/**
 * Post-build script: injects PWA meta tags into dist/index.html and generates
 * correctly-sized icon assets.
 *
 * Fixes applied vs. previous version:
 *  1. Removed crossorigin="use-credentials" from <link rel="manifest"> — this
 *     attribute causes manifest load failures when the server does not send
 *     Access-Control-Allow-Credentials, breaking PWA detection in Edge/Brave.
 *  2. Generates 192×192 and 512×512 PNG icons from the source favicon using
 *     pngjs (already in node_modules via Expo). Declaring wrong sizes in the
 *     manifest causes Chromium-based browsers to reject the PWA install prompt.
 *  3. Removed screenshots — the 512×512 square used previously has the wrong
 *     aspect ratio (narrow needs portrait ≥ 1:2, wide needs landscape ≥ 2:1).
 *  4. Added display_override with window-controls-overlay for Edge desktop.
 */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const distDir  = path.resolve(__dirname, '..', 'dist');
const htmlPath = path.join(distDir, 'index.html');

if (!fs.existsSync(htmlPath)) {
  console.warn('[inject-pwa] dist/index.html not found — skipping.');
  process.exit(0);
}

// ── 1. Generate correctly-sized PNG icons ─────────────────────────────────────

function readPngPixels(filePath) {
  // Minimal PNG reader using pngjs (pure JS, bundled with Expo)
  const PNG = require('pngjs').PNG;
  const data = fs.readFileSync(filePath);
  return PNG.sync.read(data);         // { width, height, data: Uint8Array RGBA }
}

function writePng(png, filePath) {
  const PNG = require('pngjs').PNG;
  const buf = PNG.sync.write(png);
  fs.writeFileSync(filePath, buf);
}

function resizePng(src, targetSize) {
  const PNG = require('pngjs').PNG;
  const dst = new PNG({ width: targetSize, height: targetSize });
  const scaleX = src.width  / targetSize;
  const scaleY = src.height / targetSize;

  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      const srcX = Math.min(Math.floor(x * scaleX), src.width  - 1);
      const srcY = Math.min(Math.floor(y * scaleY), src.height - 1);
      const si = (srcY * src.width + srcX) * 4;
      const di = (y * targetSize + x) * 4;
      dst.data[di]     = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
  return dst;
}

const srcIconPath = path.join(distDir, 'favicon.png');

let icon192Path = path.join(distDir, 'icon-192.png');
let icon512Path = path.join(distDir, 'icon-512.png');

try {
  const src = readPngPixels(srcIconPath);
  writePng(resizePng(src, 192), icon192Path);
  writePng(resizePng(src, 512), icon512Path);
  console.log('[inject-pwa] Generated icon-192.png and icon-512.png');
} catch (err) {
  console.warn('[inject-pwa] Icon generation failed, using favicon.png as fallback:', err.message);
  icon192Path = srcIconPath;
  icon512Path = srcIconPath;
}

// ── 2. Rewrite manifest with correct sizes and no broken screenshots ──────────

let html = fs.readFileSync(htmlPath, 'utf-8');

// Detect base path from existing script src, e.g. src="/oryxen/_expo/..."
const baseMatch = html.match(/src="(\/[^/"][^"]*)\/_expo\//);
const basePath  = baseMatch ? baseMatch[1] : '';

const icon192Url = `${basePath}/icon-192.png`;
const icon512Url = `${basePath}/icon-512.png`;

const manifest = {
  name:        'Oryxen Scanner',
  short_name:  'Oryxen',
  description: 'Secure barcode & QR scanner workspace with offline-ready cloud sync.',
  lang:        'en-US',
  id:          `${basePath}/`,
  start_url:   `${basePath}/`,
  scope:       `${basePath}/`,
  display:     'standalone',
  display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
  orientation: 'any',
  background_color: '#0a0f1e',
  theme_color:      '#1A1A1A',
  categories: ['productivity', 'utilities', 'business'],
  prefer_related_applications: false,
  icons: [
    { src: icon192Url, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: icon192Url, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: icon512Url, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: icon512Url, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  // No screenshots — incorrect aspect ratios block the install prompt in Chrome/Edge
};

fs.writeFileSync(
  path.join(distDir, 'manifest.webmanifest'),
  JSON.stringify(manifest, null, 2),
  'utf-8',
);
console.log('[inject-pwa] manifest.webmanifest rewritten');

// ── 3. Helper: replace-or-insert a tag into <head> ────────────────────────────

function injectIfMissing(tag, marker) {
  if (html.includes(marker || tag)) return;
  html = html.replace('</head>', `  ${tag}\n</head>`);
}

function replaceOrInject(oldMarker, tag) {
  // Remove any existing version of this tag first, then inject fresh
  const re = new RegExp(`\\s*${oldMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*`, 'g');
  html = html.replace(re, '');
  html = html.replace('</head>', `  ${tag}\n</head>`);
}

// ── 4. Manifest link — no crossorigin (same-origin asset, no CORS needed) ─────
//    Previous version used crossorigin="use-credentials" which fails when the
//    server does not set Access-Control-Allow-Credentials: true.
replaceOrInject('rel="manifest"',
  `<link rel="manifest" href="${basePath}/manifest.webmanifest">`
);

// ── 5. theme-color — must match manifest ─────────────────────────────────────
injectIfMissing(
  `<meta name="theme-color" content="#1A1A1A">`,
  'name="theme-color"'
);

// ── 6. Apple PWA ──────────────────────────────────────────────────────────────
injectIfMissing(`<meta name="apple-mobile-web-app-capable" content="yes">`,             'apple-mobile-web-app-capable');
injectIfMissing(`<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`, 'apple-mobile-web-app-status-bar-style');
injectIfMissing(`<meta name="apple-mobile-web-app-title" content="Oryxen">`,            'apple-mobile-web-app-title');
injectIfMissing(`<link rel="apple-touch-icon" href="${basePath}/icon-192.png">`,         'apple-touch-icon');

// ── 7. Edge / Windows ────────────────────────────────────────────────────────
injectIfMissing(`<meta name="msapplication-TileColor" content="#1A1A1A">`,              'msapplication-TileColor');
injectIfMissing(`<meta name="msapplication-TileImage" content="${basePath}/icon-192.png">`, 'msapplication-TileImage');
injectIfMissing(`<meta name="msapplication-tap-highlight" content="no">`,               'msapplication-tap-highlight');

// ── 8. Android / Chrome ───────────────────────────────────────────────────────
injectIfMissing(`<meta name="mobile-web-app-capable" content="yes">`,                   'mobile-web-app-capable');

// ── 9. Service worker registration ───────────────────────────────────────────
//    Uses 'load' event so it doesn't block first paint.
//    updateViaCache: 'none' forces the browser to always fetch a fresh SW,
//    ensuring new builds are picked up immediately.
const swSnippet = `<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('${basePath}/sw.js', { scope: '${basePath}/', updateViaCache: 'none' })
        .then(function (reg) {
          console.log('[SW] registered scope:', reg.scope);
          reg.update(); // check for updates on every page load
        })
        .catch(function (err) { console.warn('[SW] registration failed:', err); });
    });
  }
</script>`;

// Replace any existing SW registration block
if (html.includes('serviceWorker.register')) {
  html = html.replace(/<script>\s*if\s*\('serviceWorker'[\s\S]*?<\/script>/, swSnippet);
} else {
  html = html.replace('</body>', `${swSnippet}\n</body>`);
}

fs.writeFileSync(htmlPath, html, 'utf-8');
console.log(`[inject-pwa] Patched ${htmlPath} (base: "${basePath || '/'}")`);
