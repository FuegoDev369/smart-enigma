// build.mjs — Minimal build script for Smart Enigma.
//
// Two modes:
//   node build.mjs dev    -> serves the project via a small local static
//                            server (needed for real ES modules, which
//                            don't load over file://).
//   node build.mjs build  -> bundles src/js/main.js -> dist/app.js (esbuild,
//                            minified), concatenates+minifies the CSS listed
//                            in src/css/main.css -> dist/style.css, then
//                            copies index.html (script/style paths
//                            rewritten) -> dist/index.html.
//
// Zero runtime dependency: esbuild is only used at build time (devDependency).

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
const DEV_PORT = 5173;

const mode = process.argv[2];

if (mode === 'dev') {
  await runDevServer();
} else if (mode === 'build') {
  await runBuild();
} else {
  console.error('Usage: node build.mjs <dev|build>');
  process.exit(1);
}

// ---------------------------------------------------------------------
// DEV mode: local static server, no bundling.
// The browser natively resolves ES imports (needs http://, not
// file://, hence this small server).
// ---------------------------------------------------------------------
async function runDevServer() {
  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
  };

  const server = createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = resolve(join(ROOT, urlPath));

    // Prevent escaping the project root.
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const type = MIME[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    createReadStream(filePath).pipe(res);
  });

  server.listen(DEV_PORT, () => {
    console.log(`[dev] Smart Enigma served at http://localhost:${DEV_PORT}/`);
    console.log('[dev] No bundling — the browser resolves ES modules natively.');
  });
}

// ---------------------------------------------------------------------
// BUILD mode: produces dist/index.html, dist/app.js, dist/style.css
// ---------------------------------------------------------------------
async function runBuild() {
  const esbuild = await import('esbuild');

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  await buildJs(esbuild);
  await buildCss(esbuild);
  await buildHtml();

  console.log('[build] dist/ generated successfully:');
  console.log('[build]   - dist/index.html');
  console.log('[build]   - dist/app.js');
  console.log('[build]   - dist/style.css');
}

// src/js/features/airgap-actions.js, src/js/main.js and
// src/js/i18n/index.js use dynamic `import()` (qr-encoder.js/qr-canvas.js,
// sound/sound-transfer.js, and 8 of the 9 locales) to load these modules
// on demand rather than at initial page load.
//
// For a dynamic `import()` to actually produce a separate file lazily
// fetched by the browser (rather than inlined code deferred within the
// same single bundle), esbuild needs to emit real output chunks: this
// requires `splitting: true` and an `outdir` (a plain `outfile` can't
// emit multiple files).
//
// `entryPoints: { app: entry }` + `entryNames: '[name]'` keep the output
// filename `app.js` for the entry point (the one referenced by
// dist/index.html, rewritten by buildHtml() below). Chunks generated for
// each dynamic `import()` are written separately under dist/chunks/, with
// a content-hashed name to avoid collisions between chunks.
async function buildJs(esbuild) {
  const entry = join(ROOT, 'src/js/main.js');
  await esbuild.build({
    entryPoints: { app: entry },
    entryNames: '[name]',
    chunkNames: 'chunks/[name]-[hash]',
    bundle: true,
    minify: true,
    format: 'esm',
    splitting: true,
    target: ['es2020'],
    outdir: DIST,
    logLevel: 'warning',
  });
}

// Recursively resolves @import "..."; / @import url("...");
// statements in a CSS file, preserving order of appearance. If the
// file contains no @import (a standalone file), its content is used
// as-is.
async function resolveCssImports(filePath, seen = new Set()) {
  const absPath = resolve(filePath);
  if (seen.has(absPath)) return ''; // avoids circular imports
  seen.add(absPath);

  const raw = await readFile(absPath, 'utf8');
  const importRe = /@import\s+(?:url\()?["']?([^"')]+)["']?\)?\s*;/g;

  let result = '';
  let lastIndex = 0;
  let match;
  let hasImport = false;

  while ((match = importRe.exec(raw)) !== null) {
    hasImport = true;
    const importedPath = join(dirname(absPath), match[1]);
    result += raw.slice(lastIndex, match.index);
    result += await resolveCssImports(importedPath, seen);
    lastIndex = importRe.lastIndex;
  }
  result += raw.slice(lastIndex);

  return hasImport ? result : raw;
}

async function buildCss(esbuild) {
  const entry = join(ROOT, 'src/css/main.css');
  const concatenated = await resolveCssImports(entry);

  const { code } = await esbuild.transform(concatenated, {
    loader: 'css',
    minify: true,
  });

  await writeFile(join(DIST, 'style.css'), code, 'utf8');
}

async function buildHtml() {
  const srcHtmlPath = join(ROOT, 'index.html');
  let html = await readFile(srcHtmlPath, 'utf8');

  // Rewrites the stylesheet link. index.html (source) points to the
  // "dev" path src/css/main.css (resolved natively by the browser via
  // CSS @import, no build step). For dist/, it's rewritten to the
  // concatenated/minified file co-located with dist/index.html, hence
  // a simple relative path.
  const linkRe = /<link\s+rel="stylesheet"\s+href="\.\/src\/css\/main\.css">/;
  if (!linkRe.test(html)) {
    throw new Error('[build] <link rel="stylesheet"> tag for ./src/css/main.css not found in index.html — aborting.');
  }
  html = html.replace(linkRe, '<link rel="stylesheet" href="./style.css">');

  // Replaces the "dev" JS entry point reference (ES module, resolved
  // natively by the browser during development) with a reference to
  // the production bundle. esbuild produces an ESM-format bundle (see
  // buildJs, format: 'esm'), so the type="module" attribute must be
  // kept on the output tag.
  const scriptRe = /<script\s+type="module"\s+src="\.\/src\/js\/main\.js"><\/script>/;
  if (!scriptRe.test(html)) {
    throw new Error('[build] <script type="module" src="./src/js/main.js"> tag not found in index.html — aborting.');
  }
  html = html.replace(scriptRe, '<script type="module" src="./app.js"></script>');

  await writeFile(join(DIST, 'index.html'), html, 'utf8');
}
