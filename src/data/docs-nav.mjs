// Sidebar of the docs section. The pages themselves come from `pnpm sync:docs` (src/data/docs-sync.json lists them);
// this file only groups them. A synced guide that is not listed here still appears, under "More guides", so a new
// product guide never goes missing; add it to a group when you see it there.

export const DOCS_GROUPS = [
  {
    label: 'Get started',
    zh: '开始',
    items: ['index', 'setup', 'usage', 'host-setup'],
  },
  {
    label: 'Make it yours',
    zh: '按你定制',
    items: ['configuration', 'market-packs', 'settings', 'languages', 'signals', 'interest-suggestions', 'insights'],
  },
  {
    label: 'AI',
    zh: 'AI',
    items: ['ai-providers', 'ai-usage', 'breakdown', 'ai-traps', 'extraction'],
  },
  {
    label: 'Sources',
    zh: '来源',
    items: ['sources', 'linkedin-session', 'gmail-alerts', 'jsearch', 'tavily', 'apify', 'brightdata'],
  },
  {
    label: 'Phone and résumé',
    zh: '手机和简历',
    items: ['telegram', 'resume-kit'],
  },
  {
    label: 'Run it',
    zh: '运维',
    items: ['deploy', 'upgrade', 'backup-restore'],
  },
  {
    label: 'Contributing',
    zh: '参与开发',
    items: ['development', 'ci'],
  },
];

// Short names for the sidebar (and the site's own links to guides). The page titles stay the product's own; several
// are full sentences that wrap badly in a sidebar. A guide without an entry here shows its page title.
export const SHORT_LABELS = {
  index: { en: 'Overview', zh: '总览' },
  setup: { en: 'First-run setup', zh: '首次设置' },
  usage: { en: 'Daily use', zh: '日常使用' },
  'host-setup': { en: 'Mac host setup', zh: 'Mac 主机设置' },
  configuration: { en: 'Configuration', zh: '配置' },
  'market-packs': { en: 'Market packs', zh: '市场包' },
  settings: { en: 'Settings page', zh: '设置页' },
  languages: { en: 'Languages', zh: '语言' },
  signals: { en: 'Signal categories', zh: '信号类别' },
  'interest-suggestions': { en: 'Weekly suggestions', zh: '每周建议' },
  insights: { en: 'Insights page', zh: '统计页' },
  'ai-providers': { en: 'AI providers and ai-worker', zh: 'AI 服务与 ai-worker' },
  'ai-usage': { en: 'AI usage and cost', zh: 'AI 用量和费用' },
  breakdown: { en: 'Job breakdown', zh: '岗位拆解' },
  'ai-traps': { en: 'AI traps', zh: 'AI 陷阱' },
  extraction: { en: 'Extraction rules', zh: '提取规则' },
  sources: { en: 'Sources', zh: '来源清单' },
  'linkedin-session': { en: 'LinkedIn session', zh: 'LinkedIn 登录态' },
  'gmail-alerts': { en: 'Gmail alert emails', zh: 'Gmail 提醒邮件' },
  jsearch: { en: 'JSearch (Google Jobs)', zh: 'JSearch（Google Jobs）' },
  tavily: { en: 'Tavily (board discovery)', zh: 'Tavily（发现招聘页）' },
  apify: { en: 'Apify (LinkedIn)', zh: 'Apify（LinkedIn）' },
  brightdata: { en: 'Bright Data (LinkedIn)', zh: 'Bright Data（LinkedIn）' },
  telegram: { en: 'Telegram push', zh: 'Telegram 推送' },
  'resume-kit': { en: 'resume-kit', zh: 'resume-kit 联动' },
  deploy: { en: 'Deploy and acceptance', zh: '部署和验收' },
  upgrade: { en: 'Upgrade and uninstall', zh: '升级和卸载' },
  'backup-restore': { en: 'Backup and restore', zh: '备份与恢复' },
  development: { en: 'Development', zh: '开发' },
  ci: { en: 'CI explained', zh: 'CI 说明' },
};

/** Short label of a guide in a language, or undefined. */
export const shortLabel = (slug, lang) => SHORT_LABELS[slug]?.[lang];

/** Starlight sidebar from the groups and the list of synced pages. */
export function buildSidebar(syncedSlugs) {
  const known = new Set(syncedSlugs);
  const used = new Set();
  const item = (slug) => {
    used.add(slug);
    const link = slug === 'index' ? 'docs' : `docs/${slug}`;
    const l = SHORT_LABELS[slug];
    return l ? { label: l.en, translations: { 'zh-CN': l.zh }, slug: link } : link;
  };
  const groups = DOCS_GROUPS.map((g) => ({
    label: g.label,
    translations: { 'zh-CN': g.zh },
    items: g.items.filter((s) => known.has(s)).map(item),
  })).filter((g) => g.items.length);
  const rest = syncedSlugs.filter((s) => !used.has(s)).sort();
  if (rest.length) groups.push({ label: 'More guides', translations: { 'zh-CN': '更多指南' }, items: rest.map(item) });
  return groups;
}
