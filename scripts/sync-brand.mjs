#!/usr/bin/env node
// pnpm sync:brand — copy the finished brand kit (logo "Pixel Scope") into the site, unchanged.
// The logo is final; never edit these copies. To change the brand, change the kit and run this again.
// Maintainers only: it needs the brand kit, which is not part of this repository.
//
// Options: --from <dir>  brand kit folder (or set SITE_BRAND_DIR, e.g. in the git-ignored .env.local)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './local-env.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--from');
const BRAND_ARG = i > 0 ? process.argv[i + 1] : process.env.SITE_BRAND_DIR;
if (!BRAND_ARG) {
  console.error('sync:brand: no brand kit given (use --from <dir> or SITE_BRAND_DIR)');
  process.exit(1);
}
const BRAND = path.resolve(BRAND_ARG);

// source (in the brand kit) → destination (in the site)
const FILES = {
  'favicon/favicon.svg': 'public/favicon.svg',
  'favicon/favicon.ico': 'public/favicon.ico',
  'favicon/apple-touch-icon.png': 'public/apple-touch-icon.png',
  'favicon/icon-192.png': 'public/icon-192.png',
  'favicon/icon-512.png': 'public/icon-512.png',
  'favicon/icon-maskable-512.png': 'public/icon-maskable-512.png',
  'social/social-preview-light.png': 'public/og.png', // og:image / twitter:image of English pages
  'social/social-preview-zh-light.png': 'public/og-zh.png', // the same for /zh/ pages
  'svg/lockup-h-small-light.svg': 'src/assets/brand/lockup-h-small-light.svg', // nav bar, Starlight logo
  'svg/lockup-h-small-dark.svg': 'src/assets/brand/lockup-h-small-dark.svg',
  'svg/lockup-h-layered-light.svg': 'src/assets/brand/lockup-h-layered-light.svg', // hero reveal (animation.md)
  'svg/mark-light.svg': 'src/assets/brand/mark-light.svg',
  'svg/mark-dark.svg': 'src/assets/brand/mark-dark.svg',
};

if (!fs.existsSync(BRAND)) {
  console.error(`sync:brand: no brand kit at ${BRAND} (use --from <dir> or SITE_BRAND_DIR)`);
  process.exit(2);
}
let copied = 0;
for (const [src, dst] of Object.entries(FILES)) {
  const from = path.join(BRAND, src);
  const to = path.join(SITE, dst);
  if (!fs.existsSync(from)) {
    console.error(`sync:brand: missing ${src}`);
    process.exitCode = 1;
    continue;
  }
  const raw = fs.readFileSync(from);
  // the only change to a copy: drop a pointer to a doc outside this repo from an SVG <desc>
  const out = dst.endsWith('.svg') ? Buffer.from(raw.toString('utf8').replace(/ \([^()]*animation\.md\)/, '')) : raw;
  if (fs.existsSync(to) && Buffer.compare(out, fs.readFileSync(to)) === 0) continue;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, out);
  copied++;
}

// The web manifest is written here (not copied) so its paths stay relative to wherever the site is served.
const manifest = {
  name: 'Job Radar',
  short_name: 'Job Radar',
  description: 'Your job feed, tuned to you.',
  start_url: './',
  scope: './',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  theme_color: '#f1f0e8',
  background_color: '#f1f0e8',
  display: 'standalone',
};
fs.writeFileSync(path.join(SITE, 'public/site.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`sync:brand: ${Object.keys(FILES).length} files from ${path.relative(SITE, BRAND) || BRAND}, ${copied} updated`);
