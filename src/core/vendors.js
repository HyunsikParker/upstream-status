// Vendors whose status pages run on Atlassian Statuspage. Every such page also answers on <page id>.statuspage.io,
// the one host this app is allowed to call, so a team can follow any of them, or add another by its page id.
export const VENDORS = [
  { key: 'github', name: 'GitHub', pageId: 'kctbh9vrtdwd', url: 'https://www.githubstatus.com', words: ['github', 'git', 'actions', 'codespaces', 'copilot', 'pages', 'packages', 'pull', 'push'] },
  { key: 'jira', name: 'Jira', pageId: '7yh3h3y0c0x1', url: 'https://jira-software.status.atlassian.com', words: ['jira'] },
  { key: 'confluence', name: 'Confluence', pageId: '4g2my7tbhjsq', url: 'https://confluence.status.atlassian.com', words: ['confluence', 'wiki'] },
  { key: 'bitbucket', name: 'Bitbucket', pageId: 'bqlf8qjztdtr', url: 'https://bitbucket.status.atlassian.com', words: ['bitbucket', 'pipelines'] },
  { key: 'cloudflare', name: 'Cloudflare', pageId: 'yh6f0r4529hb', url: 'https://www.cloudflarestatus.com', words: ['cloudflare', 'cdn', 'dns', 'waf'] },
  { key: 'zoom', name: 'Zoom', pageId: '14qjgk812kgk', url: 'https://www.zoomstatus.com', words: ['zoom', 'meeting', 'webinar'] },
  { key: 'twilio', name: 'Twilio', pageId: 'gpkpyklzq55q', url: 'https://status.twilio.com', words: ['twilio', 'sms', 'otp'] },
  { key: 'datadog', name: 'Datadog', pageId: '1k6wzpspjf99', url: 'https://status.datadoghq.com', words: ['datadog'] },
  { key: 'npm', name: 'npm', pageId: 'wyvgptkd90hm', url: 'https://status.npmjs.org', words: ['npm'] },
  { key: 'vercel', name: 'Vercel', pageId: 'lvglq8h0mdyh', url: 'https://www.vercel-status.com', words: ['vercel'] },
  { key: 'netlify', name: 'Netlify', pageId: '83dz7syz0j3x', url: 'https://www.netlifystatus.com', words: ['netlify'] },
  { key: 'digitalocean', name: 'DigitalOcean', pageId: 'w4cz49tckxhp', url: 'https://status.digitalocean.com', words: ['digitalocean', 'droplet'] },
  { key: 'discord', name: 'Discord', pageId: 'srhpyqt94yxb', url: 'https://discordstatus.com', words: ['discord'] },
  { key: 'dropbox', name: 'Dropbox', pageId: 't34htyd6jblf', url: 'https://status.dropbox.com', words: ['dropbox'] },
  { key: 'circleci', name: 'CircleCI', pageId: '6w4r0ttlx5ft', url: 'https://status.circleci.com', words: ['circleci'] },
  { key: 'sentry', name: 'Sentry', pageId: 't687h3m0nh65', url: 'https://status.sentry.io', words: ['sentry'] },
  { key: 'claude', name: 'Claude (Anthropic)', pageId: 'tymt9n04zgry', url: 'https://status.claude.com', words: ['claude', 'anthropic'] },
  { key: 'shopify', name: 'Shopify', pageId: 'd33g96wd23dd', url: 'https://www.shopifystatus.com', words: ['shopify'] },
  { key: 'figma', name: 'Figma', pageId: 'rxpksf93ynw6', url: 'https://status.figma.com', words: ['figma'] },
  { key: 'mongodb', name: 'MongoDB Cloud', pageId: 'smhnl3lt74kc', url: 'https://status.mongodb.com', words: ['mongodb', 'atlas'] },
];

export const DEFAULT_VENDORS = ['github', 'jira', 'confluence', 'bitbucket', 'cloudflare', 'zoom', 'npm', 'claude'];

const PAGE_ID = /^[a-z0-9]{8,16}$/;

// A vendor the team adds by hand: a Statuspage page id and a display name.
export function customVendor(pageId, name) {
  const id = String(pageId || '').trim().toLowerCase();
  if (!PAGE_ID.test(id)) throw new Error('A Statuspage page id is 8 to 16 lowercase letters and digits, for example kctbh9vrtdwd.');
  const label = String(name || '').trim().slice(0, 40) || id;
  return { key: `page-${id}`, name: label, pageId: id, url: `https://${id}.statuspage.io`, words: label.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2), custom: true };
}

// Settings hold the followed keys plus any custom vendors.
export function followed(settings) {
  const custom = (settings?.custom || []).map((c) => customVendor(c.pageId, c.name));
  const all = [...VENDORS, ...custom];
  const keys = settings?.keys?.length ? settings.keys : DEFAULT_VENDORS;
  return all.filter((v) => keys.includes(v.key));
}

export const allVendors = (settings) => [...VENDORS, ...(settings?.custom || []).map((c) => customVendor(c.pageId, c.name))];
