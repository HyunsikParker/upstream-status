// Storage use of the vendor cache, against an in-memory stand-in for Forge storage that counts bytes the way the
// Forge price list does (an empty read counts as 1 KB). Run with --experimental-test-module-mocks.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const store = new Map();
const log = { reads: [], writes: [] };
const bytes = (v) => (v === undefined ? 1024 : Buffer.byteLength(JSON.stringify(v)));
const kvs = {
  async get(key) {
    const v = store.has(key) ? JSON.parse(store.get(key)) : undefined;
    log.reads.push([key, bytes(v)]);
    return v;
  },
  async set(key, value) {
    const s = JSON.stringify(value);
    store.set(key, s);
    log.writes.push([key, Buffer.byteLength(s)]);
  },
  query() {
    let prefix = '';
    let size = 10;
    let from = 0;
    const q = {
      where: (_, c) => { prefix = c.value; return q; },
      limit: (n) => { size = n; return q; },
      cursor: (c) => { from = Number(c); return q; },
      async getMany() {
        const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
        const results = keys.slice(from, from + size).map((key) => ({ key, value: JSON.parse(store.get(key)) }));
        log.reads.push([`query:${prefix}`, results.reduce((n, r) => n + bytes(r.value), 0)]);
        return { results, nextCursor: from + size < keys.length ? String(from + size) : undefined };
      },
    };
    return q;
  },
};
const pushed = [];
const graphCalls = [];
let failFetch = false;
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const pages = { summary: fixture('github_summary.json'), incidents: fixture('github_incidents.json') };
const fakeFetch = async (url) => {
  if (failFetch) throw new Error('GitHub status page did not answer within 30 seconds');
  if (url.endsWith('/summary.json')) return { ok: true, json: async () => structuredClone(pages.summary) };
  if (url.endsWith('/incidents.json')) return { ok: true, json: async () => structuredClone(pages.incidents) };
  return { ok: false, status: 404 };
};

mock.module('@forge/kvs', { namedExports: { kvs, WhereConditions: { beginsWith: (value) => ({ condition: 'BEGINS_WITH', value }) } }, defaultExport: kvs });
mock.module('@forge/events', { namedExports: { Queue: class { async push(events) { pushed.push(...events); return { jobId: 'job' }; } } } });
mock.module('@forge/teamwork-graph', {
  namedExports: { graph: { async setObjects({ objects, connectionId }) { graphCalls.push({ connectionId, n: objects.length }); return { success: true, results: { accepted: objects.map((o) => ({ key: o.id })), rejected: [] } }; } } },
});
mock.module('@forge/api', { defaultExport: { fetch: (url) => fakeFetch(url) }, namedExports: { route: String.raw, assumeTrustedRoute: (s) => s } });
mock.module('@forge/resolver', { defaultExport: class { define() {} getDefinitions() { return {}; } } });

const app = await import('../src/index.js');
const cache = await import('../src/cache.js');
const settings = await import('../src/settings.js');
const { VENDORS } = await import('../src/core/vendors.js');
const { normalizeIncident, vendorState } = await import('../src/core/statuspage.js');
const { slimVendor } = await import('../src/core/slim.js');
const github = VENDORS.find((v) => v.key === 'github');

const reset = () => { store.clear(); log.reads.length = 0; log.writes.length = 0; pushed.length = 0; graphCalls.length = 0; failFetch = false; };
const clearLog = () => { log.reads.length = 0; log.writes.length = 0; };
const expected = () => slimVendor({ state: vendorState(github, pages.summary), incidents: (pages.incidents.incidents || []).map((i) => normalizeIncident(github, i)) });
const refresh = (extra = {}) => app.refreshVendor({ body: { key: 'github', custom: null, reason: 'test', connections: [], ...extra } });

test('a refresh reads only the small record and stores the vendor deflated', async () => {
  reset();
  await refresh();
  assert.deepEqual(log.reads.map(([k]) => k), ['vendorMeta:github']);
  assert.deepEqual(log.writes.map(([k]) => k), ['vendor:github', 'vendorMeta:github']);
  const raw = JSON.parse(store.get('vendor:github'));
  assert.equal(typeof raw.z, 'string');
  assert.deepEqual(JSON.parse(cache.unpack(raw)), JSON.parse(JSON.stringify(expected())));
  const meta = JSON.parse(store.get('vendorMeta:github'));
  const { byKey, stale } = await cache.readVendors([github]);
  assert.deepEqual({ state: byKey.github.state, incidents: byKey.github.incidents }, JSON.parse(JSON.stringify(expected())));
  assert.equal(byKey.github.fetchedAt, meta.fetchedAt);
  assert.equal(byKey.github.error, undefined);
  assert.deepEqual(stale, []);
});

test('an unchanged vendor is not rewritten; a changed one is', async () => {
  reset();
  await refresh();
  clearLog();
  await refresh();
  assert.deepEqual(log.writes.map(([k]) => k), ['vendorMeta:github']);
  assert.deepEqual(log.reads.map(([k]) => k), ['vendorMeta:github']);
  const before = pages.summary.status.description;
  pages.summary.status.description = 'Partial outage';
  try {
    clearLog();
    await refresh();
    assert.deepEqual(log.writes.map(([k]) => k), ['vendor:github', 'vendorMeta:github']);
    const { byKey } = await cache.readVendors([github]);
    assert.equal(byKey.github.state.description, 'Partial outage');
  } finally {
    pages.summary.status.description = before;
  }
});

test('a failed read keeps the data, keeps the old read time and shows the error, as before', async () => {
  reset();
  await refresh();
  const first = (await cache.readVendors([github])).byKey.github;
  await new Promise((r) => setTimeout(r, 5));
  failFetch = true;
  clearLog();
  await refresh();
  assert.deepEqual(log.writes.map(([k]) => k), ['vendorMeta:github']);
  const e = (await cache.readVendors([github])).byKey.github;
  assert.deepEqual(e.incidents, first.incidents);
  assert.deepEqual(e.state, first.state);
  assert.equal(e.fetchedAt, first.fetchedAt);
  assert.match(e.error, /did not answer/);
  assert.ok(Date.parse(e.errorAt) > Date.parse(e.fetchedAt));
  failFetch = false;
  await refresh();
  const ok = (await cache.readVendors([github])).byKey.github;
  assert.equal(ok.error, undefined);
  assert.ok(Date.parse(ok.fetchedAt) > Date.parse(first.fetchedAt));
});

test('a vendor cached in the old single-value form is read as it is, then replaced', async () => {
  reset();
  const legacy = { fetchedAt: '2026-11-16T17:00:05.000Z', ...JSON.parse(JSON.stringify(expected())) };
  store.set('vendor:github', JSON.stringify(legacy));
  assert.deepEqual((await cache.readVendors([github])).byKey.github, legacy);
  failFetch = true;
  await refresh();
  const errored = (await cache.readVendors([github])).byKey.github;
  assert.deepEqual({ ...errored, error: undefined, errorAt: undefined }, { ...legacy, error: undefined, errorAt: undefined });
  assert.match(errored.error, /did not answer/);
  failFetch = false;
  await refresh();
  assert.equal(typeof JSON.parse(store.get('vendor:github')).z, 'string');
  const now = (await cache.readVendors([github])).byKey.github;
  assert.deepEqual(now.incidents, legacy.incidents);
  assert.equal(now.error, undefined);
});

test('pages reuse the copy they read while the stored hash is unchanged', async () => {
  reset();
  await refresh();
  clearLog();
  const a = await cache.readVendors([github]);
  const b = await cache.readVendors([github]);
  assert.deepEqual(a.byKey, b.byKey);
  assert.notEqual(a.byKey.github.incidents, b.byKey.github.incidents); // each read gets its own objects
  assert.ok(log.reads.filter(([k]) => k === 'vendor:github').length <= 1);
  const before = pages.summary.status.description;
  pages.summary.status.description = 'Major outage';
  try {
    await refresh();
    clearLog();
    const c = await cache.readVendors([github]);
    assert.equal(c.byKey.github.state.description, 'Major outage');
    assert.equal(log.reads.filter(([k]) => k === 'vendor:github').length, 1);
  } finally {
    pages.summary.status.description = before;
  }
});

test('refresh events carry the Teamwork Graph connections, read once', async () => {
  reset();
  store.set('connections', JSON.stringify([{ id: 'conn-1', days: 14 }]));
  await cache.requestRefresh(VENDORS.slice(0, 3), 'hourly');
  assert.equal(log.reads.filter(([k]) => k === 'connections').length, 1);
  assert.deepEqual(pushed.map((e) => e.body.connections), Array(3).fill([{ id: 'conn-1', days: 14 }]));
  clearLog();
  await app.refreshVendor(pushed.find((e) => e.body.key === 'github'));
  assert.equal(log.reads.filter(([k]) => k === 'connections').length, 0);
  assert.ok(store.has('lastSync:github')); // pushed to the connection from the event and recorded
  // an event queued before this change has no list and reads it, as before
  clearLog();
  await app.refreshVendor({ body: { key: 'github', custom: null, reason: 'old' } });
  assert.equal(log.reads.filter(([k]) => k === 'connections').length, 1);
});

test('graph totals: one small key per vendor, summed together with the old single record', async () => {
  reset();
  store.set('lastSync', JSON.stringify({ vendors: { initial: { at: '2026-10-28T12:00:00.000Z', accepted: 100, documents: 100, rejected: [] }, github: { at: '2026-11-16T16:00:00.000Z', accepted: 30, documents: 30, rejected: [] } }, at: '2026-11-16T16:00:00.000Z', accepted: 130 }));
  const { recordSync } = await import('../src/sync.js');
  clearLog();
  await recordSync('github', { accepted: 36, documents: 36, rejected: [] });
  await recordSync('zoom', { accepted: 51, documents: 51, rejected: [] });
  assert.deepEqual(log.reads, []);
  const last = await settings.getLastSync();
  assert.equal(last.accepted, 100 + 36 + 51);
  assert.equal(last.at, last.vendors.zoom.at);
  assert.deepEqual(Object.keys(last.vendors).sort(), ['github', 'initial', 'zoom']);
  reset();
  assert.equal(await settings.getLastSync(), null);
});
