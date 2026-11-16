// Vendor data cached in Forge storage. Pages read the cache; a queue consumer refreshes it.
// Each vendor has a large value, `vendor:<key>` (its current state and recent incidents, deflated), and a small one,
// `vendorMeta:<key>` (when it was read, the last error, and a hash of the large value). The large value is written
// only when its content changes and is read through an in-memory copy checked against that hash, so the hourly
// refresh and repeated page views move a few hundred bytes per vendor instead of the whole value.
import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { kvs } from '@forge/kvs';
import { Queue } from '@forge/events';
import { getConnections } from './settings.js';

export const FRESH_MS = 5 * 60000;
const queue = new Queue({ key: 'vendor-refresh' });
const dataKey = (key) => `vendor:${key}`;
const metaKey = (key) => `vendorMeta:${key}`;
const hashOf = (json) => createHash('sha256').update(json).digest('base64url').slice(0, 22);

export const pack = (json) => ({ z: deflateRawSync(json).toString('base64') });
export const unpack = (raw) => (typeof raw?.z === 'string' ? inflateRawSync(Buffer.from(raw.z, 'base64')).toString('utf8') : null);

// Large values this function instance has read, by vendor, with the hash of their content. A copy is used only
// when the stored hash matches, and each use gets its own parsed objects.
const memo = new Map();
const MEMO_MAX = 64;

async function readData(key, meta) {
  const hit = memo.get(key);
  if (meta?.hash && hit?.hash === meta.hash) return JSON.parse(hit.json);
  const raw = await kvs.get(dataKey(key));
  let json = null;
  try {
    json = unpack(raw);
  } catch (e) {
    console.log('cached vendor data unreadable', key, String(e).slice(0, 200));
    return null;
  }
  if (json === null) return raw || null; // written before the deflated format: read as it is
  memo.delete(key);
  memo.set(key, { hash: hashOf(json), json });
  if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value);
  return JSON.parse(json);
}

export async function readVendors(vendors) {
  const metas = await Promise.all(vendors.map((v) => kvs.get(metaKey(v.key))));
  const datas = await Promise.all(vendors.map((v, i) => readData(v.key, metas[i])));
  const byKey = {};
  const stale = [];
  vendors.forEach((v, i) => {
    const e = metas[i] || datas[i] ? { ...(datas[i] || {}), ...(metas[i] || {}) } : null;
    byKey[v.key] = e;
    const last = Math.max(Date.parse(e?.fetchedAt || 0) || 0, Date.parse(e?.errorAt || 0) || 0);
    if (Date.now() - last > FRESH_MS) stale.push(v);
  });
  return { byKey, stale };
}

export const readMeta = async (key) => (await kvs.get(metaKey(key))) || null;

// After a successful read: the large value is written only when its content changed, the small one every time.
export async function storeVendor(key, data, prev) {
  const json = JSON.stringify(data);
  const hash = hashOf(json);
  const changed = prev?.hash !== hash;
  if (changed) await kvs.set(dataKey(key), pack(json));
  await kvs.set(metaKey(key), { fetchedAt: new Date().toISOString(), hash });
  return { hash, changed };
}

// After a failed read: the vendor keeps the data it had and shows the error, as before.
export const storeVendorError = (key, prev, message) => kvs.set(metaKey(key), { ...(prev || {}), error: message, errorAt: new Date().toISOString() });

// One event per vendor; a custom vendor travels with its page id and name. The Teamwork Graph connections travel
// with the events too, read once here rather than once per vendor.
export async function requestRefresh(vendors, reason) {
  if (vendors.length === 0) return 0;
  const connections = await getConnections();
  // Two at a time: parallel calls from Forge to these pages stall.
  const events = vendors.map((v) => ({ body: { key: v.key, custom: v.custom ? { pageId: v.pageId, name: v.name } : null, reason, connections }, concurrency: { key: 'statuspage', limit: 2 } }));
  for (let i = 0; i < events.length; i += 50) {
    const r = await queue.push(events.slice(i, i + 50));
    console.log('refresh queued', reason, events.length, r?.jobId || '');
  }
  return events.length;
}
