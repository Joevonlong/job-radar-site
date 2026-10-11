// Install commands shown on the landing page. Source of truth: the product README "Quick start" (keep it identical),
// plus docs/setup.md and docs/host-setup.md. Re-check after every product release that changes install steps.

/** The release the install block checks out. After a new product release, change this one line (and re-check the commands). */
export const RELEASE_TAG = 'v2.0.1';

export interface Line {
  /** a command (copied by the Copy button) … */
  cmd?: string;
  /** … or a comment line (not copied) */
  comment?: { en: string; zh: string };
  note?: { en: string; zh: string };
  /** shown for everyone, but only needed on Linux (the line is marked in the UI) */
  linuxOnly?: boolean;
}

export const INSTALL: Line[][] = [
  [
    { cmd: 'git clone https://github.com/Joevonlong/job-radar.git' },
    { cmd: 'cd job-radar' },
    { cmd: `git checkout ${RELEASE_TAG}`, note: { en: 'the latest release; main is the development branch', zh: '最新发布版；main 是开发分支' } },
    { comment: { en: 'on Linux only, before the first "docker compose up" (containers must run as your user):', zh: '只在 Linux 上、第一次 docker compose up 之前做（容器要以你的用户运行）：' } },
    { cmd: '[ -f .env ] || cp .env.example .env', linuxOnly: true },
    { cmd: `sed -i.bak -e "s/^PUID=.*/PUID=$(id -u)/" -e "s/^PGID=.*/PGID=$(id -g)/" .env && rm .env.bak`, linuxOnly: true },
    { cmd: 'mkdir -p data/config data/profile data/backups data/exports data/logs .auth', linuxOnly: true },
    { cmd: 'docker compose up -d --build', note: { en: 'db, web, runner, jobspy; the first build takes a few minutes', zh: 'db、web、runner、jobspy；第一次构建要几分钟' } },
  ],
  [
    { comment: { en: 'open http://127.0.0.1:3000 — the setup wizard starts on its own', zh: '打开 http://127.0.0.1:3000，设置向导会自己出来' } },
    { comment: { en: 'no browser? the same eight questions in the terminal:', zh: '没有浏览器？在终端里答同样的 8 个问题：' } },
    { cmd: 'pnpm install && pnpm run setup' },
  ],
  [
    { cmd: 'pnpm install' },
    { cmd: 'pnpm ai-worker', note: { en: 'keep it running', zh: '让它一直开着' } },
    { comment: { en: 'or run it as a background service (launchd on macOS, a systemd user unit on Linux):', zh: '或者装成后台服务（macOS 用 launchd，Linux 用 systemd 用户单元）：' } },
    { cmd: 'scripts/ops/install-ai-worker.sh' },
    { cmd: 'pnpm run doctor', note: { en: 'checks everything, says what to fix', zh: '全面体检，告诉你该修什么' } },
  ],
];
