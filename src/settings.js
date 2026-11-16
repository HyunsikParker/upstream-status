// App settings in Forge storage: the vendors the site follows, the Teamwork Graph connections and the last sync.
import { kvs, WhereConditions } from '@forge/kvs';
import { VENDORS, customVendor } from './core/vendors.js';

export const getSettings = async () => (await kvs.get('settings')) || null;

export async function saveSettings({ keys = [], custom = [] }) {
  const customs = custom.map((c) => customVendor(c.pageId, c.name));
  const known = new Set([...VENDORS.map((v) => v.key), ...customs.map((c) => c.key)]);
  const chosen = [...new Set(keys)].filter((k) => known.has(k));
  if (chosen.length === 0) throw new Error('Follow at least one vendor.');
  const value = { keys: chosen, custom: customs.map((c) => ({ pageId: c.pageId, name: c.name })) };
  await kvs.set('settings', value);
  return value;
}

// Each Teamwork Graph connection the admin made, with the days of history it asked for.
export const getConnections = async () => (await kvs.get('connections')) || [];

export async function setConnection(id, present, days) {
  const list = (await getConnections()).filter((c) => c.id !== id);
  if (present) list.push({ id, days });
  await kvs.set('connections', list);
  return list;
}

// The last Teamwork Graph update per vendor, one small key each (`lastSync:<vendor>`), so recording one needs no read.
// The Vendor status page puts them together with the single `lastSync` record that held them before.
export const setVendorSync = (vendorKey, entry) => kvs.set(`lastSync:${vendorKey}`, entry);

async function vendorSyncs() {
  const out = {};
  let cursor;
  do {
    let q = kvs.query().where('key', WhereConditions.beginsWith('lastSync:')).limit(100);
    if (cursor) q = q.cursor(cursor);
    const page = await q.getMany();
    for (const r of page.results || []) out[r.key.slice('lastSync:'.length)] = r.value;
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

export async function getLastSync() {
  const [old, entries] = await Promise.all([kvs.get('lastSync'), vendorSyncs()]);
  const vendors = { ...(old?.vendors || {}), ...entries };
  const list = Object.values(vendors);
  if (!old && list.length === 0) return null;
  const at = [old?.at, ...list.map((v) => v.at)].filter(Boolean).sort().pop() || null;
  return { vendors, at, accepted: list.reduce((n, v) => n + (v.accepted || 0), 0) };
}
