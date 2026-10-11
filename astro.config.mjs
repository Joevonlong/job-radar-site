// @ts-check
import fs from 'node:fs';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { buildSidebar } from './src/data/docs-nav.mjs';
import { PRODUCT_REPO, SITE_URL, siteParts } from './site.config.mjs';

const { site, base } = siteParts(SITE_URL);

// Guides synced from the product repository (pnpm sync:docs).
const synced = JSON.parse(fs.readFileSync(new URL('./src/data/docs-sync.json', import.meta.url), 'utf8'));
const slugs = synced.pages.map((p) => p.slug);

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  // Astro 7 defaults to JSX whitespace rules; the pages here are copy-heavy HTML, so keep HTML-aware compression.
  compressHTML: true,
  build: { format: 'directory' },
  integrations: [
    starlight({
      title: 'Job Radar',
      description: 'Your job feed, tuned to you. Self-hosted AI job radar: scores every posting against your own criteria and sends the best matches to Telegram.',
      logo: {
        light: './src/assets/brand/lockup-h-small-light.svg',
        dark: './src/assets/brand/lockup-h-small-dark.svg',
        alt: 'Job Radar',
        replacesTitle: true,
      },
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        zh: { label: '简体中文', lang: 'zh-CN' },
      },
      social: [{ icon: 'github', label: 'GitHub', href: PRODUCT_REPO }],
      sidebar: buildSidebar(slugs),
      customCss: ['./src/styles/fonts.css', './src/styles/cjk.css', './src/styles/tokens.css', './src/styles/starlight.css'],
      favicon: '/favicon.svg',
      head: [
        { tag: 'link', attrs: { rel: 'icon', href: `${base}favicon.ico`, sizes: '16x16 32x32 48x48' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: `${base}apple-touch-icon.png` } },
        { tag: 'link', attrs: { rel: 'manifest', href: `${base}site.webmanifest` } },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#f1f0e8', media: '(prefers-color-scheme: light)' } },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#0b0b0a', media: '(prefers-color-scheme: dark)' } },
        // og:image / twitter:image depend on the language: src/components/starlight/Head.astro
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1280' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '640' } },
      ],
      components: {
        Head: './src/components/starlight/Head.astro',
        SocialIcons: './src/components/starlight/SocialIcons.astro',
        Footer: './src/components/starlight/Footer.astro',
      },
      // Pages are synced from the product repo; each page's own `editUrl` points at its source file there.
      editLink: {},
      lastUpdated: false,
      disable404Route: true, // src/pages/404.astro serves the whole site
      expressiveCode: {
        styleOverrides: {
          borderRadius: '10px',
          borderWidth: '2px',
          borderColor: 'var(--ink)',
          codeFontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          uiFontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          frames: { shadowColor: 'var(--shadow-c)', frameBoxShadowCssValue: '4px 4px 0 var(--shadow-c)' },
        },
      },
    }),
  ],
});
