// Loads optional per-machine settings from a git-ignored `.env.local` in the site root (KEY=value lines), so local
// paths never need to be committed. Variables already set in the environment win.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local');
if (fs.existsSync(file)) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* an unreadable .env.local is ignored */
  }
}
