#!/usr/bin/env node
// pnpm media:release-notes — which video file goes to which GitHub Release of this repository.
// Reads src/data/media.lock.json, groups the files by release tag and prints, per tag, the files (from public/media/)
// with size and sha256, plus the `gh` commands that create the release and upload them.
//
// Options: --tag <tag>   only this release
//          --check       ask GitHub which files are already there (network; no token needed for a public repo)
//          --markdown    print the list as Markdown (for a release description)

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
const ONLY_TAG = argValue('--tag');
const CHECK = args.includes('--check');
const MD = args.includes('--markdown');
const LOCK = path.join(SITE, 'src/data/media.lock.json');
const repo = new URL(SITE_REPO).pathname.replace(/^\/|\/$/g, '');

if (!fs.existsSync(LOCK)) {
  console.log('media:release-notes: no src/data/media.lock.json yet (run pnpm sync:media)');
  process.exit(0);
}
const files = JSON.parse(fs.readFileSync(LOCK, 'utf8')).files;
const tags = [...new Set(files.map((f) => f.release))].sort().filter((t) => !ONLY_TAG || t === ONLY_TAG);
const fmt = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);
const local = (f) => path.join('public', f.path);
const localOk = (f) => {
  const abs = path.join(SITE, local(f));
  return fs.existsSync(abs) && crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex') === f.sha256;
};
async function remote(f) {
  const url = MEDIA_URL.replace('{tag}', encodeURIComponent(f.release)).replace('{file}', encodeURIComponent(f.file));
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return r.ok ? 'uploaded' : `missing (HTTP ${r.status})`;
  } catch (e) {
    return `unknown (${e.cause?.code || e.message})`;
  }
}

if (!MD) {
  console.log(`Media releases for ${repo}: every file below must be an asset of the release named on its group.`);
  console.log('Upload from the site checkout after `pnpm sync:media` (the files are in public/media/, not in git).\n');
}
for (const tag of tags) {
  const group = files.filter((f) => f.release === tag);
  const total = group.reduce((a, f) => a + f.bytes, 0);
  const status = CHECK ? await Promise.all(group.map(remote)) : [];
  if (MD) {
    console.log(`### ${tag}\n\n| File | Size | sha256 |\n|---|---|---|`);
    for (const f of group) console.log(`| \`${f.file}\` | ${fmt(f.bytes)} | \`${f.sha256}\` |`);
    console.log('');
    continue;
  }
  console.log(`== release ${tag}: ${group.length} file(s), ${fmt(total)}`);
  group.forEach((f, i) => {
    const flags = [localOk(f) ? '' : 'NOT IN public/media (run pnpm sync:media or pnpm fetch:media)', CHECK ? status[i] : ''].filter(Boolean).join('; ');
    console.log(`  ${local(f).padEnd(42)} ${fmt(f.bytes).padStart(8)}  ${f.sha256.slice(0, 16)}…${flags ? `  [${flags}]` : ''}`);
  });
  const paths = group.map(local).join(' \\\n    ');
  console.log('\n  # first time (creates the release; it must be published, not a draft, for anonymous downloads):');
  console.log(`  gh release create ${tag} --repo ${repo} --title "Media ${tag.replace(/^media-/, '')}" \\\n    --notes "Video files for the website (src/data/media.lock.json)." \\\n    ${paths}`);
  console.log('  # release exists already (adds or replaces these files):');
  console.log(`  gh release upload ${tag} --repo ${repo} --clobber \\\n    ${paths}\n`);
}
if (!MD) console.log('Then check: pnpm fetch:media --force (downloads everything again and verifies sha256), or pnpm media:release-notes --check.');
