import Resolver from '@forge/resolver';
import { followed, allVendors, customVendor, DEFAULT_VENDORS, VENDORS } from './core/vendors.js';
import { rankIncidents } from './core/match.js';
import { isOpen, latestUpdate } from './core/statuspage.js';
import { buildSample, pickIncidents, seedSample, SAMPLE_LABEL } from './core/sample.js';
import { adfText } from './core/text.js';
import { isoSeconds, toMs } from './core/time.js';
import { fetchVendor } from './statuspage-api.js';
import { readVendors, requestRefresh, writeVendor } from './cache.js';
import { slimVendor } from './core/slim.js';
import { getConnections, getLastSync, getSettings, saveSettings, setConnection } from './settings.js';
import { daysOf, pushToGraph, recordSync } from './sync.js';
import { getIssue, isSiteAdmin, linkIncident, myTimeZone, remoteLinks, request, setProperty, PROPERTY } from './jira.js';

const KEY = /^[A-Z][A-Z0-9_]+-\d+$/;
const WINDOWS = [24, 72];

// The request's own time: the time set on it (sample requests, or a correction), otherwise when it was created.
async function requestOf(key) {
  const issue = await getIssue(key);
  const f = issue.fields || {};
  const prop = issue.properties?.[PROPERTY] || {};
  return { key, summary: f.summary || '', text: `${f.summary || ''}\n${adfText(f.description)}`.slice(0, 4000), at: prop.at || f.created, atSource: prop.at ? 'set' : 'created' };
}

const view = (i) => ({
  vendor: i.vendor, vendorName: i.vendorName, id: i.id, name: i.name, url: i.url, status: i.status, impact: i.impact,
  maintenance: i.maintenance, startedAt: i.startedAt, resolvedAt: i.resolvedAt, components: i.components.slice(0, 6),
  latest: latestUpdate(i)?.body?.slice(0, 280) || '', open: i.open, band: i.band, why: i.why,
});

// Cached vendor data for the followed vendors; anything older than five minutes is queued for a refresh.
async function cached(vendors, reason) {
  const { byKey, stale } = await readVendors(vendors);
  if (stale.length) await requestRefresh(stale, reason).catch((e) => console.log('refresh not queued', String(e).slice(0, 200)));
  const incidents = [];
  const states = [];
  const errors = [];
  let oldest = null;
  for (const v of vendors) {
    const e = byKey[v.key];
    if (e?.incidents) incidents.push(...e.incidents);
    states.push(e?.state ? { ...e.state, fetchedAt: e.fetchedAt } : { vendor: v.key, name: v.name, url: v.url, indicator: 'unknown', description: e?.error ? 'Status page could not be read' : 'Not read yet', degraded: [], degradedCount: 0, incidents: [], maintenance: [], fetchedAt: null });
    if (e?.error && (!e.fetchedAt || Date.parse(e.errorAt) > Date.parse(e.fetchedAt))) errors.push({ vendor: v.name, message: e.error });
    if (e?.fetchedAt && (!oldest || e.fetchedAt < oldest)) oldest = e.fetchedAt;
  }
  const missing = vendors.filter((v) => !byKey[v.key]?.fetchedAt).map((v) => v.name);
  return { incidents, states, errors, oldest, refreshing: stale.length > 0, missing };
}

async function around(key, hours) {
  const req = await requestOf(key);
  const vendors = followed(await getSettings());
  const c = await cached(vendors, 'panel');
  const ranked = rankIncidents(req, c.incidents, vendors, { beforeHours: hours, afterHours: 2 });
  return { req, vendors, ranked, ...c };
}

const resolver = new Resolver();

resolver.define('getPanel', async ({ payload, context }) => {
  const hours = WINDOWS.includes(Number(payload.hours)) ? Number(payload.hours) : 24;
  const key = context.extension.issue.key;
  const [{ req, vendors, ranked, errors, oldest, refreshing, missing }, links, timeZone] = await Promise.all([around(key, hours), remoteLinks(key), myTimeZone()]);
  const linked = (links || []).map((l) => l.globalId).filter((g) => g?.startsWith('upstream:'));
  return { request: req, hours, timeZone, vendors: vendors.map((v) => v.name), incidents: ranked.slice(0, 12).map(view), linked, errors, oldest, refreshing, missing };
});

resolver.define('link', async ({ payload, context }) => {
  const key = context.extension.issue.key;
  const { ranked } = await around(key, 72);
  const inc = ranked.find((i) => i.vendor === payload.vendor && i.id === payload.id);
  if (!inc) return { ok: false, error: 'That incident is no longer on the vendor status page.' };
  await linkIncident(key, inc);
  return { ok: true };
});

resolver.define('setTime', async ({ payload, context }) => {
  const ms = toMs(payload.at);
  if (ms === null || ms > Date.now() + 60000) return { ok: false, error: 'Pick a date and time that is not in the future.' };
  await setProperty(context.extension.issue.key, { at: isoSeconds(ms) });
  return { ok: true };
});

resolver.define('getBoard', async () => {
  const settings = await getSettings();
  const vendors = followed(settings);
  const [c, admin, connections, lastSync, timeZone] = await Promise.all([cached(vendors, 'board'), isSiteAdmin().catch(() => false), getConnections(), getLastSync(), myTimeZone()]);
  return {
    states: c.states, oldest: c.oldest, refreshing: c.refreshing, missing: c.missing, admin, connected: connections.length > 0, lastSync, timeZone,
    choices: allVendors(settings).map((v) => ({ key: v.key, name: v.name, custom: !!v.custom })),
    followedKeys: settings?.keys?.length ? settings.keys : DEFAULT_VENDORS,
    custom: settings?.custom || [],
  };
});

resolver.define('saveSettings', async ({ payload }) => {
  if (!(await isSiteAdmin())) return { ok: false, error: 'Only Jira administrators can change the vendors this site follows.' };
  try {
    const saved = await saveSettings({ keys: payload.keys || [], custom: payload.custom || [] });
    await requestRefresh(followed(saved), 'settings');
    return { ok: true, saved };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

resolver.define('loadSample', async ({ context }) => {
  const projectKey = context.extension.project.key;
  const vendors = followed(await getSettings());
  const { incidents, missing } = await cached(vendors, 'sample');
  const items = buildSample(pickIncidents(incidents));
  if (items.length === 0) return { ok: false, error: missing.length ? 'Vendor status pages are still being read for the first time. Try again in a minute.' : 'None of the followed vendors reported an incident in the last two weeks, so there is nothing real to build a sample on.' };
  try {
    const keys = await seedSample(request, projectKey, items, PROPERTY);
    return { ok: true, keys, label: SAMPLE_LABEL, based: items.filter((i) => i.incident).map((i) => i.incident) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

export const handler = resolver.getDefinitions();

// Teamwork Graph connector: remember the connection, fill it from the cache at once and queue a fresh read.
export async function onConnectionChange(event) {
  try {
    const days = daysOf(event.configProperties?.days);
    await setConnection(event.connectionId, event.action !== 'DELETED', days);
    if (event.action === 'DELETED') return { success: true, message: 'Disconnected; Atlassian removes the connection data.' };
    const vendors = followed(await getSettings());
    const { incidents } = await cached(vendors, 'connection');
    const r = await pushToGraph(incidents, { id: event.connectionId, days });
    await recordSync('initial', r);
    return { success: true, message: `Connected: ${r.accepted} vendor incidents from ${vendors.length} status pages.` };
  } catch (e) {
    return { success: false, message: String(e.message || e).slice(0, 200) };
  }
}

// Checks the form value and that vendor data is available.
export async function validateConnection(request) {
  const raw = request?.configProperties?.days;
  if (raw !== undefined && raw !== null && raw !== '' && daysOf(raw) !== Math.round(Number(raw))) {
    return { success: false, reasonCode: 'INVALID_CONFIGURATION', message: 'Days of history must be between 1 and 30.' };
  }
  const vendors = followed(await getSettings());
  return { success: true, message: `Ready to bring in incidents from ${vendors.length} status pages.` };
}

// Hourly: queue a fresh read of every followed vendor; each read also updates the Teamwork Graph.
export async function scheduledSync() {
  await requestRefresh(followed(await getSettings()), 'hourly');
}

// Queue consumer: read one vendor's status page, cache it, and push its incidents to the Teamwork Graph.
export async function refreshVendor(event) {
  const { key, custom } = event.body || {};
  const vendor = custom ? customVendor(custom.pageId, custom.name) : VENDORS.find((v) => v.key === key);
  if (!vendor) return;
  const { byKey } = await readVendors([vendor]);
  const prev = byKey[vendor.key];
  try {
    const t0 = Date.now();
    const data = slimVendor(await fetchVendor(vendor));
    await writeVendor(vendor.key, { fetchedAt: new Date().toISOString(), ...data });
    console.log('vendor refreshed', vendor.key, data.incidents.length, Date.now() - t0);
    const r = await pushToGraph(data.incidents);
    if (r.connections) await recordSync(vendor.key, r);
  } catch (e) {
    await writeVendor(vendor.key, { ...(prev || {}), error: String(e.message || e).slice(0, 200), errorAt: new Date().toISOString() });
    console.log('vendor refresh failed', vendor.key, String(e.message || e).slice(0, 200));
  }
}

// Rovo actions and MCP tools.
const keyFrom = (value, context) => String(value || context?.jira?.issueKey || '').trim().toUpperCase();

export async function vendorIncidentsAround(payload) {
  const key = keyFrom(payload.issueKey, payload.context);
  if (!KEY.test(key)) return { error: 'Provide the key of the request or work item, for example ITS-42.' };
  const { req, ranked, errors, oldest } = await around(key, 24);
  const vendor = String(payload.vendor || '').trim().toLowerCase();
  const list = vendor ? ranked.filter((i) => i.vendorName.toLowerCase().includes(vendor) || i.vendor === vendor) : ranked;
  return {
    request: req.key, summary: req.summary, at: req.at, atSource: req.atSource === 'set' ? 'time set on the request' : 'creation time',
    incidents: list.slice(0, 8).map(({ vendor: v, vendorName, id, name, url, status, impact, open, band, why, startedAt, resolvedAt }) => ({ vendor: v, vendorName, id, name, url, status, impact, openAtRequestTime: open, band, why, startedAt, resolvedAt })),
    statusPagesNotRead: errors.map((e) => e.vendor),
    vendorDataAsOf: oldest,
  };
}

export async function vendorStatusNow() {
  const { states, oldest } = await cached(followed(await getSettings()), 'rovo');
  return {
    asOf: oldest,
    vendors: states.map((s) => ({
      vendor: s.name, status: s.description, indicator: s.indicator, page: s.url,
      openIncidents: s.incidents.filter(isOpen).map((i) => ({ name: i.name, impact: i.impact, status: i.status, startedAt: i.startedAt, url: i.url })),
      maintenance: s.maintenance.map((m) => ({ name: m.name, status: m.status, startsAt: m.startedAt, endsAt: m.endsAt, url: m.url })),
    })),
  };
}

export async function linkVendorIncident(payload) {
  const key = keyFrom(payload.issueKey, payload.context);
  if (!KEY.test(key)) return { error: 'Provide the key of the request or work item, for example ITS-42.' };
  const { ranked } = await around(key, 72);
  const id = String(payload.incidentId || '').trim();
  const vendor = String(payload.vendor || '').trim().toLowerCase();
  const inc = ranked.find((i) => i.id === id && (!vendor || i.vendor === vendor || i.vendorName.toLowerCase().includes(vendor)));
  if (!inc) return { error: 'That incident is not among the vendor incidents around this request. List them first.' };
  await linkIncident(key, inc);
  return { linked: `${key} now links to ${inc.vendorName}: ${inc.name}`, url: inc.url };
}
