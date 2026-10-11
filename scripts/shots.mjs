#!/usr/bin/env node
// pnpm shots — build check by eye: screenshots of the built site at 1440, 768 and 390 px, light and dark, English and
// Chinese, into .shots/ (gitignored): `<page>-<lang>-<theme>-<width>-view.png` is what a visitor sees on arrival
// (viewport), `<page>-<lang>-<theme>-<width>.png` the whole page. Also reports layout shift (CLS), horizontal
// overflow, console errors and images without alt. Needs `pnpm build` first; starts `astro preview` itself.
//
// Options: --pages home,tutorials,docs,404   --widths 1440,768,390   --no-full (viewport shots only)

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_URL, siteParts } from '../site.config.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(SITE, '.shots');
const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const FULL = !args.includes('--no-full');

// Optional: a local folder of Playwright browsers (SITE_BROWSERS_DIR, e.g. in the git-ignored .env.local).
const vendored = process.env.SITE_BROWSERS_DIR;
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && vendored && fs.existsSync(vendored)) process.env.PLAYWRIGHT_BROWSERS_PATH = vendored;
const { chromium } = await import('playwright');

const { base } = siteParts(SITE_URL);
const PORT = Number(opt('--port', '4399'));
const origin = `http://localhost:${PORT}`;
const PAGES = {
  home: { en: '', zh: 'zh/' },
  tutorials: { en: 'tutorials/', zh: 'zh/tutorials/' },
  docs: { en: 'docs/setup/', zh: 'zh/docs/setup/' },
  404: { en: 'no-such-page/', zh: null },
};
const pages = opt('--pages', 'home,tutorials,docs,404').split(',');
const widths = opt('--widths', '1440,768,390').split(',').map(Number);

if (!fs.existsSync(path.join(SITE, 'dist'))) {
  console.error('shots: no dist/ — run pnpm build first');
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

// Astro 7's preview keeps a lock file and may fork; run our own instance in its own process group and end the group.
const server = spawn(path.join(SITE, 'node_modules/.bin/astro'), ['preview', '--port', String(PORT), '--ignore-lock'], {
  cwd: SITE,
  env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
const stop = () => {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {}
};
process.on('exit', stop);
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview did not start')), 30000);
  const check = async () => {
    try {
      const r = await fetch(`${origin}${base}`);
      if (r.ok) {
        clearTimeout(t);
        return resolve();
      }
    } catch {}
    setTimeout(check, 300);
  };
  check();
});

const browser = await chromium.launch();
const report = [];
for (const name of pages) {
  for (const lang of ['en', 'zh']) {
    const p = PAGES[name]?.[lang];
    if (p === null || p === undefined) continue;
    for (const theme of ['light', 'dark']) {
      for (const width of widths) {
        const ctx = await browser.newContext({
          viewport: { width, height: width < 768 ? 844 : 900 },
          deviceScaleFactor: width < 768 ? 2 : 1,
          colorScheme: theme,
          isMobile: width < 768,
          hasTouch: width < 768,
        });
        await ctx.addInitScript((t) => {
          try {
            localStorage.setItem('starlight-theme', t);
          } catch {}
          window.__cls = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
          }).observe({ type: 'layout-shift', buffered: true });
        }, theme);
        const page = await ctx.newPage();
        const errors = [];
        // the 404 page is itself served with status 404; that one console line is expected
        page.on('console', (m) => m.type() === 'error' && !(name === '404' && /status of 404/.test(m.text())) && errors.push(m.text()));
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.goto(`${origin}${base}${p}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2900); // entrance animation and logo reveal
        const stem = path.join(OUT, `${name}-${lang}-${theme}-${width}`);
        await page.screenshot({ path: `${stem}-view.png` });
        if (FULL) {
          // walk down once so lazy images load, then jump back to the very top. The page scrolls smoothly, so scroll
          // with behavior "instant" and wait until it is really at 0: a full-page shot taken mid-scroll draws the
          // sticky header over the content.
          await page.evaluate(async () => {
            for (let y = 0; y < document.body.scrollHeight; y += 700) {
              window.scrollTo({ top: y, behavior: 'instant' });
              await new Promise((r) => setTimeout(r, 60));
            }
            window.scrollTo({ top: 0, behavior: 'instant' });
          });
          await page.waitForFunction(() => window.scrollY === 0);
          await page.waitForTimeout(300);
        }
        const stats = await page.evaluate(() => ({
          cls: Math.round(window.__cls * 1000) / 1000,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          noAlt: Array.from(document.images).filter((i) => !i.hasAttribute('alt')).length,
          theme: document.documentElement.dataset.theme,
        }));
        const file = FULL ? `${stem}.png` : `${stem}-view.png`;
        if (FULL) await page.screenshot({ path: file, fullPage: true });
        report.push({ shot: path.relative(SITE, file), ...stats, errors: errors.length ? errors.slice(0, 3).join(' | ') : '' });
        await ctx.close();
      }
    }
  }
}
await browser.close();
stop();

let bad = 0;
for (const r of report) {
  const flags = [r.cls > 0.1 && `CLS ${r.cls}`, r.overflow > 0 && `overflow ${r.overflow}px`, r.noAlt && `${r.noAlt} img without alt`, r.errors && `errors: ${r.errors}`].filter(Boolean);
  if (flags.length) bad++;
  console.log(`${flags.length ? '!!' : 'ok'} ${r.shot.padEnd(40)} cls=${r.cls} theme=${r.theme} ${flags.join('; ')}`);
}
console.log(`shots: ${report.length} screenshots in .shots/, ${bad} with findings`);
process.exit(0);
