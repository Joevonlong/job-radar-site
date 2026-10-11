// Site-wide settings. Imported by astro.config.mjs, the sync scripts and the pages.
//
// SITE_URL is the one value to change when the site moves:
//   project Pages (default)   https://joevonlong.github.io/job-radar-site/
//   custom domain             https://jobradar.example.org/
// Astro's `site` (origin) and `base` (path) are both derived from it. The environment variable SITE_URL overrides it
// for a one-off build (`SITE_URL=http://localhost:4321/ pnpm build`).

export const SITE_URL = process.env.SITE_URL || 'https://joevonlong.github.io/job-radar-site/';

/** Product repository: source links, "View on GitHub", edit links of the synced docs. */
export const PRODUCT_REPO = 'https://github.com/Joevonlong/job-radar';
/** Branch the synced docs' edit and source links point at. */
export const PRODUCT_BRANCH = 'main';
/** This site's own repository (footer link). */
export const SITE_REPO = 'https://github.com/Joevonlong/job-radar-site';

export function siteParts(url = SITE_URL) {
  const u = new URL(url);
  const base = u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`;
  return { site: u.origin, base };
}

// ---------------------------------------------------------------- media (videos are not kept in git)
// `pnpm fetch:media` downloads every file listed in src/data/media.lock.json from a GitHub Release of this repository
// and checks its sha256. {tag} is the file's release tag from the lock, {file} its asset name (e.g. V-12.mp4).
export const MEDIA_URL = process.env.MEDIA_URL || 'https://github.com/Joevonlong/job-radar-site/releases/download/{tag}/{file}';
/** Release tag for files that are new or changed in a `pnpm sync:media` run (date = the sync date, UTC). */
export const mediaTag = (date = new Date()) => `media-${date.toISOString().slice(0, 10)}`;
