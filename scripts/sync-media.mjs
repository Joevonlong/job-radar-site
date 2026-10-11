#!/usr/bin/env node
// pnpm sync:media — copy finished video exports into public/media/ (local, not in git) and record them in
// src/data/videos.json (what each slot shows) and src/data/media.lock.json (every published file: name, bytes,
// sha256, duration, release tag). Both JSON files are committed; the media files travel as GitHub Release assets
// (`pnpm media:release-notes` says which file goes to which release, `pnpm fetch:media` downloads them again).
//
// Maintainers only: the exports are produced outside this repository. Sources, under the exports folder <OUT>
// (--from or SITE_MEDIA_DIR):
//   <OUT>/export/<ID>/<ID>.web.mp4    → public/media/<ID>/<ID>.mp4
//   <OUT>/export/<ID>/<ID>.webm       → public/media/<ID>/<ID>.webm
//   <OUT>/export/<ID>/<ID>.poster.jpg → public/media/<ID>/<ID>.poster.jpg (+ .poster.webp 1280 w, -640.webp)
//   <ID>.en.vtt / .zh.vtt (next to the export, else <OUT>/subs/) → public/media/<ID>/<ID>.en.vtt / .zh.vtt
//
// An id with an MP4 becomes `status: "ready"`; an id without one stays `"coming-soon"` and the site shows a
// coming-soon poster in its slot (also for a ready id whose files were not downloaded yet). Files that are new or
// changed get the release tag of today (site.config.mjs mediaTag, or --tag); unchanged files keep their tag.
// When an export is gone (the exports folder is re-renderable and may be cleaned), the published entry is kept;
// `--prune` removes it instead.
//
// Budgets: short clips ≤ 6 MB per file, full videos ≤ 60 MB per file; GitHub refuses release
// assets over 2 GB and Pages files over 100 MB. Over budget = warning; with --strict the script exits 1 and copies
// nothing for that id.
//
// Options:  --from <dir>   the exports folder <OUT> (or set SITE_MEDIA_DIR, e.g. in the git-ignored .env.local)
//           --only <ID,…>  sync only these ids        --prune   drop media whose export is gone
//           --tag <tag>    release tag for new files  --strict  fail on budget overruns
//           --check        report only, write nothing

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mediaTag } from '../site.config.mjs';
import './local-env.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const OUT_ARG = argValue('--from') || process.env.SITE_MEDIA_DIR;
if (!OUT_ARG) {
  console.error('sync:media: no exports folder given (use --from <dir> or SITE_MEDIA_DIR)');
  process.exit(1);
}
const OUT = path.resolve(OUT_ARG);
const ONLY = (argValue('--only') || '').split(',').filter(Boolean);
const PRUNE = args.includes('--prune');
const STRICT = args.includes('--strict');
const CHECK = args.includes('--check');
const NEW_TAG = argValue('--tag') || mediaTag();

const DATA = path.join(SITE, 'src/data/videos.json');
const LOCK = path.join(SITE, 'src/data/media.lock.json');
const PUBLIC = path.join(SITE, 'public');
const MB = 1024 * 1024;
const BUDGET = { short: 6 * MB, full: 60 * MB };
const PAGES_LIMIT = 100 * MB;

const videos = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const lock = fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, 'utf8')) : { files: [] };
const exportsDir = path.join(OUT, 'export');
const subsDir = path.join(OUT, 'subs');
const manifestDir = path.resolve(process.env.SITE_MEDIA_MANIFESTS || path.join(OUT, '..', '..', 'manifest')); // <ID>.yaml per video (optional)

let sharp = null;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.warn('sync:media: sharp is not installed: posters are copied as JPEG only');
}
const hasFfprobe = (() => {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const first = (...files) => files.find((f) => fs.existsSync(f));
const rel = (abs) => path.relative(PUBLIC, abs).split(path.sep).join('/');
const fmt = (bytes) => `${(bytes / MB).toFixed(1)} MB`;

function probe(file) {
  if (!hasFfprobe) return {};
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file],
      { encoding: 'utf8' },
    );
    const j = JSON.parse(out);
    const s = j.streams?.[0] ?? {};
    return { width: s.width, height: s.height, duration_s: j.format?.duration ? Math.round(Number(j.format.duration) * 10) / 10 : undefined };
  } catch {
    return {};
  }
}

function manifestInfo(id) {
  const file = path.join(manifestDir, `${id}.yaml`);
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  const version = text.match(/^version:\s*(\d+)/m)?.[1];
  const draft = text.match(/^draft:\s*(true|false)/m)?.[1];
  return { manifest_version: version ? Number(version) : undefined, draft: draft ? draft === 'true' : undefined };
}

/** Copy when the content differs; returns true when something was (or, with --check, would be) written. */
function copy(src, dst) {
  if (fs.existsSync(dst) && fs.statSync(dst).size === fs.statSync(src).size && sha256(dst) === sha256(src)) return false;
  if (CHECK) return true;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return true;
}

async function posterVariants(jpg, dir, id) {
  const big = path.join(dir, `${id}.poster.webp`);
  const small = path.join(dir, `${id}.poster-640.webp`);
  if (!sharp || CHECK) return { webp: fs.existsSync(big) ? big : null, small: fs.existsSync(small) ? small : null };
  const srcTime = fs.statSync(jpg).mtimeMs;
  for (const [out, width] of [
    [big, 1280],
    [small, 640],
  ]) {
    if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= srcTime) continue;
    await sharp(jpg).resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toFile(out);
  }
  return { webp: big, small };
}

/** Lock entries for the files now in public/media/<id>/, keeping the release tag of unchanged files. */
function lockEntries(id, dir, durationS) {
  const prev = new Map(lock.files.filter((f) => f.id === id).map((f) => [f.file, f]));
  return fs
    .readdirSync(dir)
    .filter((f) => !f.startsWith('.'))
    .sort()
    .map((file) => {
      const abs = path.join(dir, file);
      const hash = sha256(abs);
      const old = prev.get(file);
      const entry = { id, file, path: rel(abs), bytes: fs.statSync(abs).size, sha256: hash };
      if (/\.(mp4|webm)$/.test(file) && durationS) entry.duration_s = durationS;
      entry.release = old && old.sha256 === hash ? old.release : NEW_TAG;
      return entry;
    });
}

const rows = [];
let failed = false;
let changedFiles = 0;
const nextLock = [];

for (const v of videos) {
  const id = v.id;
  const keepLock = () => nextLock.push(...lock.files.filter((f) => f.id === id));
  if (ONLY.length && !ONLY.includes(id)) {
    keepLock();
    continue;
  }
  const srcDir = path.join(exportsDir, id);
  const dstDir = path.join(PUBLIC, 'media', id);
  const src = {
    mp4: first(path.join(srcDir, `${id}.web.mp4`), path.join(srcDir, `${id}.mp4`)),
    webm: first(path.join(srcDir, `${id}.webm`)),
    poster: first(path.join(srcDir, `${id}.poster.jpg`), path.join(srcDir, `${id}.poster.png`)),
    // captions: the copy next to the export (bin/export writes it) wins over <OUT>/subs
    en: first(path.join(srcDir, `${id}.en.vtt`), path.join(subsDir, `${id}.en.vtt`)),
    zh: first(path.join(srcDir, `${id}.zh.vtt`), path.join(subsDir, `${id}.zh.vtt`)),
  };
  const dst = {
    mp4: path.join(dstDir, `${id}.mp4`),
    webm: path.join(dstDir, `${id}.webm`),
    poster: path.join(dstDir, `${id}.poster${src.poster ? path.extname(src.poster) : '.jpg'}`),
    en: path.join(dstDir, `${id}.en.vtt`),
    zh: path.join(dstDir, `${id}.zh.vtt`),
  };
  const published = lock.files.some((f) => f.id === id);

  let note = '';
  if (src.mp4) {
    const budget = BUDGET[v.kind] ?? BUDGET.short;
    const over = ['mp4', 'webm']
      .filter((k) => src[k])
      .map((k) => [k, fs.statSync(src[k]).size])
      .filter(([, size]) => size > budget || size > PAGES_LIMIT);
    if (over.length) {
      const msg = over.map(([k, size]) => `${k} ${fmt(size)} > ${fmt(budget)}`).join(', ');
      if (STRICT) {
        failed = true;
        keepLock();
        rows.push([id, 'OVER BUDGET', msg]);
        continue;
      }
      note = `over budget: ${msg}`;
    }
    for (const k of ['mp4', 'webm', 'poster', 'en', 'zh']) if (src[k] && copy(src[k], dst[k])) changedFiles++;
    // a stale WebM / caption from an older export would not match the new MP4
    for (const k of ['webm', 'en', 'zh']) if (!src[k] && fs.existsSync(dst[k]) && !CHECK) fs.rmSync(dst[k]);
  } else if (fs.existsSync(dst.mp4)) {
    if (PRUNE) {
      if (!CHECK) fs.rmSync(dstDir, { recursive: true, force: true });
      v.status = 'coming-soon';
      v.media = null;
      v.meta = null;
      rows.push([id, 'pruned', 'export gone']);
      continue;
    }
    note = 'export gone: kept the published copy';
  } else if (published) {
    // Published (in the lock) but neither exported here nor downloaded: keep everything as it is.
    if (PRUNE) {
      v.status = 'coming-soon';
      v.media = null;
      v.meta = null;
      rows.push([id, 'pruned', 'dropped from the lock']);
      continue;
    }
    keepLock();
    rows.push([id, 'ready', 'not downloaded here (pnpm fetch:media)']);
    continue;
  }

  const ready = fs.existsSync(dst.mp4) || (CHECK && src.mp4);
  if (!ready) {
    v.status = 'coming-soon';
    v.media = null;
    v.meta = null;
    rows.push([id, 'coming soon', note]);
    continue;
  }

  const posterFile = first(dst.poster, path.join(dstDir, `${id}.poster.jpg`), path.join(dstDir, `${id}.poster.png`));
  const variants = posterFile ? await posterVariants(posterFile, dstDir, id) : {};
  const mp4 = fs.existsSync(dst.mp4) ? dst.mp4 : src.mp4;
  const info = probe(mp4);
  const has = (k) => fs.existsSync(dst[k]) || (CHECK && src[k]);
  v.status = 'ready';
  v.media = {
    mp4: rel(dst.mp4),
    webm: has('webm') ? rel(dst.webm) : null,
    poster: posterFile ? rel(posterFile) : null,
    poster_webp: variants.webp ? rel(variants.webp) : null,
    poster_small: variants.small ? rel(variants.small) : null,
    vtt: { en: has('en') ? rel(dst.en) : null, zh: has('zh') ? rel(dst.zh) : null },
  };
  v.meta = {
    width: info.width ?? v.meta?.width ?? 1920,
    height: info.height ?? v.meta?.height ?? 1080,
    duration_s: info.duration_s ?? v.meta?.duration_s ?? null,
    bytes: {
      mp4: fs.statSync(mp4).size,
      webm: v.media.webm ? fs.statSync(fs.existsSync(dst.webm) ? dst.webm : src.webm).size : null,
    },
    ...manifestInfo(id),
  };
  if (!CHECK) nextLock.push(...lockEntries(id, dstDir, v.meta.duration_s));
  else keepLock();
  const missing = [!v.media.webm && 'webm', !v.media.poster && 'poster', !v.media.vtt.en && 'en.vtt', !v.media.vtt.zh && 'zh.vtt'].filter(Boolean);
  rows.push([id, 'ready', [missing.length ? `missing ${missing.join(', ')}` : '', note].filter(Boolean).join('; ')]);
}

/** JSON with 2-space indent, short arrays and objects of plain values kept on one line (as the files are hand-written). */
function pretty(value) {
  return JSON.stringify(value, null, 2).replace(/([\[{])\n\s+([^\[\]{}]*?)\n\s*([\]}])/g, (all, open, body, close) => {
    const flat = body.split(/,\n\s*/).join(', ');
    const line = open === '{' ? `{ ${flat} }` : `[${flat}]`;
    return line.length <= 110 && open + close !== '[}' ? line : all;
  });
}

const order = new Map(videos.map((v, i) => [v.id, i]));
nextLock.sort((a, b) => order.get(a.id) - order.get(b.id) || a.file.localeCompare(b.file));
const lockOut = {
  about:
    'Published video files of the site (written by pnpm sync:media). The files are GitHub Release assets of this repository: pnpm fetch:media downloads them into public/media/ and checks sha256; pnpm media:release-notes lists what to upload.',
  files: nextLock,
};
const newFiles = nextLock.filter((f) => !lock.files.some((o) => o.file === f.file && o.sha256 === f.sha256));
if (!CHECK) {
  fs.writeFileSync(DATA, `${pretty(videos)}\n`);
  fs.writeFileSync(LOCK, `${JSON.stringify(lockOut, null, 2)}\n`);
}

const w = Math.max(...rows.map((r) => r[1].length));
console.log(`sync:media: ${path.relative(SITE, exportsDir) || exportsDir} → public/media/${CHECK ? ' (check only)' : ''}`);
for (const [id, status, note] of rows) console.log(`  ${id.padEnd(5)} ${status.padEnd(w)}  ${note}`);
const ready = rows.filter((r) => r[1] === 'ready').length;
console.log(`  ${ready} ready, ${rows.length - ready} coming soon; ${changedFiles} file(s) ${CHECK ? 'would change' : 'copied'}`);
if (newFiles.length) {
  console.log(`  ${newFiles.length} new or changed file(s) for release ${[...new Set(newFiles.map((f) => f.release))].join(', ')}: ${newFiles.map((f) => f.file).join(', ')}`);
  console.log('  → upload them: pnpm media:release-notes');
}
if (failed) process.exit(1);
