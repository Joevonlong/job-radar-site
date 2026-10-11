#!/usr/bin/env node
// pnpm check:links — after `pnpm build`: every internal link and asset in dist/ points at a file that exists, and every
// #fragment at an element id on the target page. External links are not fetched (listed with --external).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_URL, siteParts } from '../site.config.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(SITE, 'dist');
const { site, base } = siteParts(SITE_URL);
const SHOW_EXTERNAL = process.argv.includes('--external');

if (!fs.existsSync(DIST)) {
  console.error('check:links: no dist/ — run pnpm build first');
  process.exit(2);
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const htmlFiles = walk(DIST).filter((f) => f.endsWith('.html'));
const idsCache = new Map();
const ids = (file) => {
  if (!idsCache.has(file)) {
    const html = fs.readFileSync(file, 'utf8');
    idsCache.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idsCache.get(file);
};
/** URL path under the site → file in dist, or null. */
function resolve(urlPath) {
  if (!urlPath.startsWith(base)) return null;
  const rel = decodeURIComponent(urlPath.slice(base.length));
  const candidates = [rel, path.join(rel, 'index.html'), `${rel}.html`];
  for (const c of candidates) {
    const f = path.join(DIST, c);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

const problems = [];
const upstream = [];
const external = new Set();
let checked = 0;
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const pageUrl = new URL(`${base}${path.relative(DIST, file).split(path.sep).join('/').replace(/index\.html$/, '')}`, site);
  for (const m of html.matchAll(/\s(href|src|srcset|poster|data-mp4|data-webm|data-vtt-en|data-vtt-zh|data-poster)="([^"]+)"/g)) {
    const [, attr, raw] = m;
    const values = attr === 'srcset' ? raw.split(',').map((s) => s.trim().split(/\s+/)[0]) : [raw];
    for (const v of values) {
      if (!v || /^(mailto:|tel:|data:|javascript:)/.test(v)) continue;
      let u;
      try {
        u = new URL(v.replace(/&amp;/g, '&'), pageUrl);
      } catch {
        problems.push(`${path.relative(DIST, file)}: bad URL ${v}`);
        continue;
      }
      if (u.origin !== site) {
        external.add(u.href);
        continue;
      }
      checked++;
      const target = resolve(u.pathname);
      if (!target) {
        problems.push(`${path.relative(DIST, file)}: ${attr} → ${u.pathname} (missing)`);
        continue;
      }
      if (u.hash && target.endsWith('.html')) {
        const id = decodeURIComponent(u.hash.slice(1));
        if (id && id !== '_top' && !ids(target).has(id)) {
          const msg = `${path.relative(DIST, file)}: ${u.pathname}${u.hash} (no such anchor)`;
          // anchors inside the synced guides come from the product repository: report, fix them there
          if (/^(zh\/)?docs\//.test(path.relative(DIST, file))) upstream.push(msg);
          else problems.push(msg);
        }
      }
    }
  }
}

if (SHOW_EXTERNAL) for (const e of [...external].sort()) console.log(`external: ${e}`);
for (const p of upstream) console.log(`warn (product docs): ${p}`);
for (const p of problems) console.log(`!! ${p}`);
console.log(`check:links: ${htmlFiles.length} pages, ${checked} internal links checked, ${external.size} external, ${problems.length} problem(s), ${upstream.length} warning(s) in the synced product docs`);
process.exit(problems.length ? 1 : 0);
