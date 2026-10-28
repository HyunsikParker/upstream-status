// App settings in Forge storage: the vendors the site follows, the Teamwork Graph connections and the last sync.
import { kvs } from '@forge/kvs';
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

export const getLastSync = async () => (await kvs.get('lastSync')) || null;
export const setLastSync = (value) => kvs.set('lastSync', value);
