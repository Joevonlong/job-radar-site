#!/usr/bin/env node
// pnpm sync:docs — copy the product guides into the Starlight content collection.
//
//   job-radar/docs/<name>.md      → src/content/docs/docs/<name>.md      (English, /docs/<name>/)
//   job-radar/docs/<name>.zh.md   → src/content/docs/zh/docs/<name>.md   (Chinese, /zh/docs/<name>/)
//   job-radar/docs/README(.zh).md → the docs index page of each language
//   job-radar/docs/getting-started(.zh).html → public/guide/ (the annotated beginner guide, links rewritten)
//   images referenced by the guides  → src/assets/docs/ (optimised by Astro)
//
// What changes on the way: the first "# Heading" becomes the frontmatter title, the "[English] | [中文]" switch line is
// dropped (the site has its own language picker), links between guides become site links, links to other files of the
// product repository become GitHub links, and every page gets an edit link to its source file. Nothing else is
// rewritten: fix content in the product repository and sync again. Never edit the generated files by hand.
//
// Options:  --from <dir>   product checkout (default: $JOB_RADAR_DIR or ../job-radar, a checkout next to this site)
//           --check        exit 1 if the synced files are out of date (writes nothing)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT_BRANCH, PRODUCT_REPO } from '../site.config.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const CHECK = args.includes('--check');
const PRODUCT = path.resolve(argValue('--from') || process.env.JOB_RADAR_DIR || path.join(SITE, '..', 'job-radar'));
const DOCS = path.join(PRODUCT, 'docs');

const OUT_EN = path.join(SITE, 'src/content/docs/docs');
const OUT_ZH = path.join(SITE, 'src/content/docs/zh/docs');
const OUT_IMG = path.join(SITE, 'src/assets/docs');
const OUT_GUIDE = path.join(SITE, 'public/guide');
const STATE = path.join(SITE, 'src/data/docs-sync.json');
const README = path.join(SITE, 'README.md');

if (!fs.existsSync(DOCS)) {
  console.error(`sync:docs: no docs directory at ${DOCS} (use --from <product checkout> or JOB_RADAR_DIR)`);
  process.exit(2);
}

// ---------------------------------------------------------------- product commit
function git(...a) {
  try {
    return execFileSync('git', ['-C', PRODUCT, ...a], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}
const commit = git('rev-parse', 'HEAD') || 'unknown';
const commitDate = git('log', '-1', '--format=%cI') || null;
const commitSubject = git('log', '-1', '--format=%s') || null;
const dirty = git('status', '--porcelain', '--', 'docs') !== '';

// ---------------------------------------------------------------- page map
// slug "index" is the docs home (README). URLs are relative to the site base: docs/<slug>/ and zh/docs/<slug>/.
const entries = fs
  .readdirSync(DOCS)
  .filter((f) => f.endsWith('.md') && !f.endsWith('.zh.md'))
  .sort();
const slugOf = (file) => {
  const name = file.replace(/\.zh\.md$|\.md$/, '');
  return name === 'README' ? 'index' : name;
};
const pages = entries.map((en) => {
  const zh = en.replace(/\.md$/, '.zh.md');
  return { slug: slugOf(en), en, zh: fs.existsSync(path.join(DOCS, zh)) ? zh : null };
});
const slugs = new Set(pages.map((p) => p.slug));
// Chinese files without an English twin still become Chinese pages.
for (const f of fs.readdirSync(DOCS).filter((f) => f.endsWith('.zh.md'))) {
  if (!slugs.has(slugOf(f))) {
    pages.push({ slug: slugOf(f), en: null, zh: f });
    slugs.add(slugOf(f));
  }
}

const pageUrl = (lang, slug) => `${lang === 'zh' ? 'zh/' : ''}docs/${slug === 'index' ? '' : `${slug}/`}`;
const guideUrl = (lang) => `guide/getting-started${lang === 'zh' ? '.zh' : ''}.html`;
/** Relative link from one site-relative URL to another, so it works under any base path. */
function rel(fromUrl, toUrl) {
  const fromDir = fromUrl.endsWith('/') ? fromUrl : path.posix.dirname(fromUrl) + '/';
  let r = path.posix.relative(`/${fromDir}`, `/${toUrl}`);
  if (toUrl.endsWith('/') && r !== '') r += '/';
  if (r === '') r = './';
  return r;
}

const warnings = [];
const usedImages = new Map(); // source abs path -> asset rel path (under src/assets/docs)

/** Rewrite one link target found on page `lang/slug`. */
function rewriteTarget(target, lang, fromUrl, fromFileAbs, outFileAbs, { image = false } = {}) {
  const m = target.match(/^(\S+?)(\s+"[^"]*")?$/);
  if (!m) return target;
  const [, rawUrl, title = ''] = m;
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(rawUrl)) return target; // absolute, mailto, anchor
  const [pathPart, hash = ''] = rawUrl.split(/(?=#)/);
  const abs = path.resolve(path.dirname(fromFileAbs), decodeURI(pathPart));

  if (image || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(pathPart)) {
    if (!fs.existsSync(abs)) {
      warnings.push(`${lang}/${path.basename(fromFileAbs)}: missing image ${rawUrl}`);
      return target;
    }
    const relInDocs = path.relative(DOCS, abs);
    if (relInDocs.startsWith('..')) return `${githubUrl(abs)}${title}`;
    usedImages.set(abs, relInDocs);
    const assetAbs = path.join(OUT_IMG, relInDocs);
    let r = path.relative(path.dirname(outFileAbs), assetAbs).split(path.sep).join('/');
    if (!r.startsWith('.')) r = `./${r}`;
    return `${r}${title}`;
  }

  if (path.dirname(abs) === DOCS && /\.md$/.test(abs)) {
    const file = path.basename(abs);
    const slug = slugOf(file);
    if (!slugs.has(slug)) {
      warnings.push(`${lang}/${path.basename(fromFileAbs)}: link to unknown guide ${rawUrl}`);
      return `${githubUrl(abs)}${hash}${title}`;
    }
    // Follow the link's own language: guide.zh.md → the Chinese page, guide.md → the English one (the Chinese guides
    // link to *.zh.md, and an explicit *.md link there means the English text on purpose).
    const toLang = file.endsWith('.zh.md') ? 'zh' : 'en';
    return `${rel(fromUrl, pageUrl(toLang, slug))}${hash}${title}`;
  }
  if (path.dirname(abs) === DOCS && /^getting-started(\.zh)?\.html$/.test(path.basename(abs))) {
    const toLang = path.basename(abs).includes('.zh.') ? 'zh' : 'en';
    return `${rel(fromUrl, guideUrl(toLang))}${hash}${title}`;
  }
  if (!fs.existsSync(abs)) warnings.push(`${lang}/${path.basename(fromFileAbs)}: link to missing file ${rawUrl}`);
  return `${githubUrl(abs)}${hash}${title}`;
}

function githubUrl(abs) {
  const relPath = path.relative(PRODUCT, abs).split(path.sep).join('/');
  if (relPath.startsWith('..')) return abs;
  const isDir = fs.existsSync(abs) && fs.statSync(abs).isDirectory();
  return `${PRODUCT_REPO}/${isDir ? 'tree' : 'blob'}/${PRODUCT_BRANCH}/${relPath}`;
}

/** Apply `fn` to the parts of a Markdown document that are not code (fenced blocks, indented code, inline code). */
function outsideCode(md, fn) {
  const lines = md.split('\n');
  const out = [];
  let buf = [];
  let fence = null;
  const flush = () => {
    if (buf.length) out.push(protectInline(buf.join('\n'), fn));
    buf = [];
  };
  for (const line of lines) {
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      out.push(line);
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && line.trim() === f[1]) fence = null;
    } else if (f) {
      flush();
      fence = f[1];
      out.push(line);
    } else {
      buf.push(line);
    }
  }
  flush();
  return out.join('\n');
}
function protectInline(text, fn) {
  const saved = [];
  const masked = text.replace(/(`+)[\s\S]*?\1/g, (s) => {
    saved.push(s);
    return `\u0000${saved.length - 1}\u0000`;
  });
  return fn(masked).replace(/\u0000(\d+)\u0000/g, (_, i) => saved[Number(i)]);
}

function plainText(s) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<([a-z]+:[^>]+)>/gi, '$1')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function describe(body) {
  for (const para of body.split(/\n\s*\n/)) {
    const t = para.trim();
    if (!t || /^(#|\||>|```|~~~|-|\*|\d+\.|<!--|<)/.test(t)) continue;
    const text = plainText(t);
    if (text.length < 20) continue;
    if (text.length <= 160) return text;
    const cut = text.slice(0, 157);
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('。'), cut.lastIndexOf('：'));
    return stop > 60 ? cut.slice(0, stop + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
  }
  return undefined;
}

const yaml = (s) => JSON.stringify(s); // JSON strings are valid YAML scalars

function convert(file, lang, slug) {
  const srcAbs = path.join(DOCS, file);
  const outAbs = path.join(lang === 'zh' ? OUT_ZH : OUT_EN, `${slug}.md`);
  const fromUrl = pageUrl(lang, slug);
  let md = fs.readFileSync(srcAbs, 'utf8').replace(/\r\n/g, '\n');

  let title = slug;
  const h1 = md.match(/^#\s+(.+?)\s*#*\s*$/m);
  if (h1) {
    title = plainText(h1[1]);
    md = md.replace(h1[0], '');
  }
  md = md.replace(/^\s*\[English\]\([^)]*\)\s*\|\s*\[中文\]\([^)]*\)\s*$/m, '');
  md = md.replace(/^\n+/, '');

  md = outsideCode(md, (text) =>
    text
      // images first: ![alt](target)
      .replace(/!\[([^\]]*)\]\(([^)\s]+(?:\s+"[^"]*")?)\)/g, (_, alt, t) =>
        `![${alt}](${rewriteTarget(t, lang, fromUrl, srcAbs, outAbs, { image: true })})`,
      )
      // links: [text](target)
      .replace(/(^|[^!])\[([^\]]*)\]\(([^)\s]+(?:\s+"[^"]*")?)\)/g, (_, pre, txt, t) =>
        `${pre}[${txt}](${rewriteTarget(t, lang, fromUrl, srcAbs, outAbs)})`,
      )
      // reference definitions: [id]: target
      .replace(/^(\s{0,3}\[[^\]]+\]:\s*)(\S+)/gm, (_, pre, t) => `${pre}${rewriteTarget(t, lang, fromUrl, srcAbs, outAbs)}`)
      // raw HTML attributes
      .replace(/\b(href|src)="([^"]+)"/g, (_, attr, t) => `${attr}="${rewriteTarget(t, lang, fromUrl, srcAbs, outAbs)}"`),
  );

  const description = describe(md);
  const front = [
    '---',
    `title: ${yaml(title)}`,
    description ? `description: ${yaml(description)}` : null,
    `editUrl: ${yaml(`${PRODUCT_REPO}/edit/${PRODUCT_BRANCH}/docs/${file}`)}`,
    '---',
    `<!-- Generated by \`pnpm sync:docs\` from Joevonlong/job-radar docs/${file} at ${commit.slice(0, 12)}. Do not edit: change the product repository and sync again. -->`,
    '',
  ]
    .filter((l) => l !== null)
    .join('\n');
  return { outAbs, content: `${front}\n${md.replace(/\s+$/, '')}\n`, title };
}

function convertGuide(file, lang) {
  const srcAbs = path.join(DOCS, file);
  const outAbs = path.join(OUT_GUIDE, path.basename(file));
  const fromUrl = guideUrl(lang);
  let html = fs.readFileSync(srcAbs, 'utf8');
  html = html.replace(/\b(href|src)="([^"#][^"]*)"/g, (_, attr, t) => `${attr}="${rewriteTarget(t, lang, fromUrl, srcAbs, outAbs)}"`);
  const marker = `<!-- Generated by pnpm sync:docs from Joevonlong/job-radar docs/${file} at ${commit.slice(0, 12)}. Do not edit. -->`;
  html = html.replace(/<html/i, `${marker}\n<html`);
  return { outAbs, content: html };
}

// ---------------------------------------------------------------- run
const outputs = new Map(); // abs path -> string | Buffer
const index = [];
for (const p of pages) {
  const row = { slug: p.slug, en: p.en ? `docs/${p.en}` : null, zh: p.zh ? `docs/${p.zh}` : null };
  if (p.en) {
    const r = convert(p.en, 'en', p.slug);
    outputs.set(r.outAbs, r.content);
    row.title_en = r.title;
  }
  if (p.zh) {
    const r = convert(p.zh, 'zh', p.slug);
    outputs.set(r.outAbs, r.content);
    row.title_zh = r.title;
  }
  index.push(row);
}
for (const [file, lang] of [
  ['getting-started.html', 'en'],
  ['getting-started.zh.html', 'zh'],
]) {
  if (fs.existsSync(path.join(DOCS, file))) {
    const r = convertGuide(file, lang);
    outputs.set(r.outAbs, r.content);
  }
}
for (const [abs, relInDocs] of usedImages) outputs.set(path.join(OUT_IMG, relInDocs), fs.readFileSync(abs));

const state = {
  source: 'Joevonlong/job-radar',
  path: 'docs/',
  commit,
  commit_date: commitDate,
  commit_subject: commitSubject,
  dirty,
  pages: index,
};
const stateJson = `${JSON.stringify(state, null, 2)}\n`;

// Files this script owns: everything under the four output directories.
const owned = [OUT_EN, OUT_ZH, OUT_IMG, OUT_GUIDE].flatMap((dir) => listFiles(dir));
function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? listFiles(p) : [p];
  });
}
const same = (abs, content) => fs.existsSync(abs) && Buffer.compare(fs.readFileSync(abs), Buffer.from(content)) === 0;
const stale = owned.filter((f) => !outputs.has(f));
const changed = [...outputs].filter(([abs, c]) => !same(abs, c)).map(([abs]) => abs);
// The commit line in docs-sync.json changes with every product commit; only content changes count for --check.
const stateChanged = !fs.existsSync(STATE) || JSON.stringify(JSON.parse(fs.readFileSync(STATE, 'utf8')).pages) !== JSON.stringify(state.pages);

if (CHECK) {
  if (changed.length || stale.length || stateChanged) {
    console.error(`sync:docs --check: out of date (${changed.length} changed, ${stale.length} removed). Run pnpm sync:docs.`);
    process.exit(1);
  }
  console.log('sync:docs --check: up to date');
  process.exit(0);
}

for (const f of stale) fs.rmSync(f);
for (const [abs, content] of outputs) {
  if (same(abs, content)) continue;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}
fs.mkdirSync(path.dirname(STATE), { recursive: true });
fs.writeFileSync(STATE, stateJson);

// README: keep the "synced from" line current.
if (fs.existsSync(README)) {
  const readme = fs.readFileSync(README, 'utf8');
  const line = `Docs synced from \`Joevonlong/job-radar\` commit \`${commit.slice(0, 12)}\`${commitDate ? ` (${commitDate.slice(0, 10)}` : ''}${commitSubject ? `, "${commitSubject.replace(/"/g, "'")}"` : ''}${commitDate ? ')' : ''}${dirty ? ', **with uncommitted changes in docs/**' : ''}.`;
  const next = readme.replace(/(<!-- docs-sync:start -->\n)[\s\S]*?(\n<!-- docs-sync:end -->)/, `$1${line}$2`);
  if (next !== readme) fs.writeFileSync(README, next);
}

const n = (lang) => index.filter((p) => p[lang]).length;
console.log(
  `sync:docs: ${n('en')} English and ${n('zh')} Chinese guides from ${path.relative(SITE, DOCS) || DOCS} @ ${commit.slice(0, 12)}${dirty ? ' (docs/ has uncommitted changes)' : ''}`,
);
console.log(`           ${changed.length} file(s) written, ${stale.length} removed, ${usedImages.size} image(s)`);
const untranslated = index.filter((p) => p.en && !p.zh).map((p) => p.slug);
if (untranslated.length) console.log(`           English only (Chinese pages fall back to English): ${untranslated.join(', ')}`);
for (const w of warnings) console.warn(`  warn: ${w}`);
