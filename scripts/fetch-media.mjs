#!/usr/bin/env node
// pnpm fetch:media — download the published video files listed in src/data/media.lock.json into public/media/.
// Each file is a GitHub Release asset of this repository (URL pattern: MEDIA_URL in site.config.mjs, {tag} and {file}
// from the lock). Every download is checked against the lock's sha256; files already present and correct are skipped.
// Exits 1 when a file is missing or does not match, naming the release it should be in (the deploy workflow relies on
// this). With --allow-missing it only warns (the site then shows "coming soon" in those slots).
//
// A private repository: set GITHUB_TOKEN (the workflow does); downloads then go through the GitHub API.
//
// Options: --only <ID,…>   --allow-missing   --force (download again even when the local file matches)

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA_URL, SITE_REPO } from '../site.config.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const ONLY = (argValue('--only') || '').split(',').filter(Boolean);
const ALLOW_MISSING = args.includes('--allow-missing');
const FORCE = args.includes('--force');
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const LOCK = path.join(SITE, 'src/data/media.lock.json');
const PUBLIC = path.join(SITE, 'public');

if (!fs.existsSync(LOCK)) {
  console.log('fetch:media: no src/data/media.lock.json, nothing to fetch');
  process.exit(0);
}
const files = JSON.parse(fs.readFileSync(LOCK, 'utf8')).files.filter((f) => !ONLY.length || ONLY.includes(f.id));
const repo = new URL(SITE_REPO).pathname.replace(/^\/|\/$/g, ''); // owner/name
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const fmt = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

/** Asset download through the API (works for private repositories with a token). */
async function viaApi(tag, name) {
  const headers = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const rel = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, { headers });
  if (!rel.ok) return { status: rel.status, why: `release ${tag}: HTTP ${rel.status}` };
  const asset = (await rel.json()).assets?.find((a) => a.name === name);
  if (!asset) return { status: 404, why: `release ${tag} has no asset ${name}` };
  const res = await fetch(asset.url, { headers: { ...headers, Accept: 'application/octet-stream' }, redirect: 'follow' });
  if (!res.ok) return { status: res.status, why: `asset ${name}: HTTP ${res.status}` };
  return { buf: Buffer.from(await res.arrayBuffer()) };
}

async function download(f) {
  const url = MEDIA_URL.replace('{tag}', encodeURIComponent(f.release)).replace('{file}', encodeURIComponent(f.file));
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (res.ok) return { buf: Buffer.from(await res.arrayBuffer()), url };
    if (TOKEN && /github\.com/.test(url)) {
      const r = await viaApi(f.release, f.file);
      return { ...r, url };
    }
    return { status: res.status, why: `HTTP ${res.status}`, url };
  } catch (e) {
    return { why: String(e.cause?.code || e.message), url };
  }
}

let ok = 0;
let fetched = 0;
const missing = [];
for (const f of files) {
  const dest = path.join(PUBLIC, f.path);
  if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).size === f.bytes && sha256(fs.readFileSync(dest)) === f.sha256) {
    ok++;
    continue;
  }
  const r = await download(f);
  if (!r.buf) {
    missing.push(`${f.file} (release ${f.release}): ${r.why} — ${r.url}`);
    continue;
  }
  const got = sha256(r.buf);
  if (got !== f.sha256) {
    missing.push(`${f.file} (release ${f.release}): sha256 mismatch (got ${got.slice(0, 12)}…, lock ${f.sha256.slice(0, 12)}…): the release has a different file than the lock`);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, r.buf);
  fetched++;
  console.log(`  fetched ${f.path} (${fmt(f.bytes)})`);
}

console.log(`fetch:media: ${files.length} file(s) in the lock: ${ok} already here, ${fetched} downloaded, ${missing.length} missing`);
if (missing.length) {
  for (const m of missing) console.error(`  ${ALLOW_MISSING ? 'warn' : 'error'}: ${m}`);
  console.error('  Attach the files to their releases (pnpm media:release-notes lists them), or run with --allow-missing.');
  if (!ALLOW_MISSING) process.exit(1);
}
