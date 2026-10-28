// Vendor data cached in Forge storage. Pages read the cache; a queue consumer refreshes it.
import { kvs } from '@forge/kvs';
import { Queue } from '@forge/events';

export const FRESH_MS = 5 * 60000;
const queue = new Queue({ key: 'vendor-refresh' });

export async function readVendors(vendors) {
  const entries = await Promise.all(vendors.map((v) => kvs.get(`vendor:${v.key}`)));
  const byKey = {};
  const stale = [];
  vendors.forEach((v, i) => {
    const e = entries[i] || null;
    byKey[v.key] = e;
    const last = Math.max(Date.parse(e?.fetchedAt || 0) || 0, Date.parse(e?.errorAt || 0) || 0);
    if (Date.now() - last > FRESH_MS) stale.push(v);
  });
  return { byKey, stale };
}

export const writeVendor = (key, value) => kvs.set(`vendor:${key}`, value);

// One event per vendor; a custom vendor travels with its page id and name.
export async function requestRefresh(vendors, reason) {
  if (vendors.length === 0) return 0;
  // Two at a time: parallel calls from Forge to these pages stall.
  const events = vendors.map((v) => ({ body: { key: v.key, custom: v.custom ? { pageId: v.pageId, name: v.name } : null, reason }, concurrency: { key: 'statuspage', limit: 2 } }));
  for (let i = 0; i < events.length; i += 50) {
    const r = await queue.push(events.slice(i, i + 50));
    console.log('refresh queued', reason, events.length, r?.jobId || '');
  }
  return events.length;
}
