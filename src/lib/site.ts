import fs from 'node:fs';
import path from 'node:path';
import videosData from '../data/videos.json';
import type { Lang } from '../i18n/ui';

const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

/** Site-relative path → URL path under the configured base ("docs/setup/" → "/job-radar-site/docs/setup/"). */
export function url(p = ''): string {
  return BASE + p.replace(/^\/+/, '');
}

/** Path of a page in a language: localePath('zh', 'tutorials/') → "zh/tutorials/". */
export function localePath(lang: Lang, p = ''): string {
  return `${lang === 'zh' ? 'zh/' : ''}${p.replace(/^\/+/, '')}`;
}

export const docsUrl = (lang: Lang, slug = '') => url(localePath(lang, `docs/${slug && slug !== 'index' ? `${slug}/` : ''}`));

// ---------------------------------------------------------------- videos

export interface Media {
  mp4: string;
  webm: string | null;
  poster: string | null;
  poster_webp: string | null;
  poster_small: string | null;
  vtt: { en: string | null; zh: string | null };
}
export interface Video {
  id: string;
  kind: 'short' | 'full';
  pillar: string;
  highlights: string[];
  target: string;
  preview_label?: { en: string; zh: string };
  title: { en: string; zh: string };
  description: { en: string; zh: string };
  chapters?: { en: string[]; zh: string[] };
  docs: string[];
  status: 'ready' | 'coming-soon';
  media: Media | null;
  meta: { width: number; height: number; duration_s: number | null } | null;
}

const PUBLIC = path.resolve(process.cwd(), 'public');
const exists = (rel: string | null | undefined) => !!rel && fs.existsSync(path.join(PUBLIC, rel));

/**
 * Videos from src/data/videos.json (written by `pnpm sync:media`). A video counts as ready only when its MP4 is really
 * in public/, so a stale data file can never produce a broken player.
 */
export const VIDEOS: Video[] = (videosData as Video[]).map((v) => {
  const ready = v.status === 'ready' && v.media && exists(v.media.mp4);
  if (!ready) return { ...v, status: 'coming-soon', media: null, meta: null };
  const m = v.media!;
  return {
    ...v,
    media: {
      ...m,
      webm: exists(m.webm) ? m.webm : null,
      poster: exists(m.poster) ? m.poster : null,
      poster_webp: exists(m.poster_webp) ? m.poster_webp : null,
      poster_small: exists(m.poster_small) ? m.poster_small : null,
      vtt: { en: exists(m.vtt.en) ? m.vtt.en : null, zh: exists(m.vtt.zh) ? m.vtt.zh : null },
    },
  };
});

export function video(id: string): Video {
  const v = VIDEOS.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown video id ${id} (src/data/videos.json)`);
  return v;
}

export function duration(v: Video): string {
  const s = v.meta?.duration_s;
  if (!s) return v.target;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}:${String(r).padStart(2, '0')}` : `${r} s`;
}

/** Visitor-facing video label: "Video 2" / "视频 2". The internal id (M-02, V-03 …) stays in code and file names only. */
export function vlabel(id: string, lang: string): string {
  const n = String(parseInt(id.replace(/\D/g, ''), 10));
  return lang === 'zh' ? `视频 ${n}` : `Video ${n}`;
}
