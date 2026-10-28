// Public Statuspage API v2. Reads run in a queue consumer with a long time limit, never inside a page view.
import api from '@forge/api';
import { normalizeIncident, vendorState } from './core/statuspage.js';

const TIMEOUT_MS = 30000;

function withTimeout(promise, label) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} did not answer within ${TIMEOUT_MS / 1000} seconds`)), TIMEOUT_MS); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

// Listed vendors are read on their own status domains (declared in the manifest), which answer quickly from
// Forge; a vendor added by page id goes through <page id>.statuspage.io. A fresh connection per request avoids the
// half-minute stalls seen when a connection is reused.
async function get(vendor, path) {
  const base = vendor.custom ? `https://${vendor.pageId}.statuspage.io` : vendor.url;
  const res = await withTimeout(api.fetch(`${base}/api/v2/${path}`, { headers: { Accept: 'application/json', 'User-Agent': 'Upstream-Forge-app', Connection: 'close' } }), `${vendor.name} status page`);
  if (!res.ok) throw new Error(`${vendor.name} status page answered ${res.status}`);
  return withTimeout(res.json(), `${vendor.name} status page`);
}

export async function fetchVendor(vendor) {
  const summary = await get(vendor, 'summary.json');
  const incidents = await get(vendor, 'incidents.json');
  const maintenance = await get(vendor, 'scheduled-maintenances.json').catch(() => ({ scheduled_maintenances: [] }));
  return {
    state: vendorState(vendor, summary),
    incidents: [...(incidents.incidents || []), ...(maintenance.scheduled_maintenances || [])].map((i) => normalizeIncident(vendor, i)),
  };
}
