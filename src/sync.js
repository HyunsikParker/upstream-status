// Puts vendor incidents into the Teamwork Graph for every connection the site admin made.
import { graph } from '@forge/teamwork-graph';
import { toDocument } from './core/graphdoc.js';
import { getConnections, setLastSync, getLastSync } from './settings.js';

export const DEFAULT_DAYS = 14;
export const daysOf = (value) => (Number.isFinite(Number(value)) && Number(value) >= 1 && Number(value) <= 30 ? Math.round(Number(value)) : DEFAULT_DAYS);

export async function pushToGraph(incidents, only) {
  const connections = only ? [only] : await getConnections();
  if (connections.length === 0 || incidents.length === 0) return { connections: connections.length, documents: 0, accepted: 0, rejected: [] };
  let accepted = 0;
  let documents = 0;
  const rejected = [];
  for (const conn of connections) {
    const since = Date.now() - daysOf(conn.days) * 86400000;
    const docs = incidents.filter((i) => Date.parse(i.updatedAt) >= since).map(toDocument);
    documents += docs.length;
    for (let i = 0; i < docs.length; i += 100) {
      const res = await graph.setObjects({ objects: docs.slice(i, i + 100), connectionId: conn.id });
      accepted += res.results?.accepted?.length || 0;
      rejected.push(...(res.results?.rejected || []).map((r) => ({ id: r.key?.entityId, error: r.errors?.[0]?.message })));
      if (!res.success && res.error) rejected.push({ error: String(res.error).slice(0, 200) });
    }
  }
  return { connections: connections.length, documents, accepted, rejected: rejected.slice(0, 5) };
}

// Running totals per vendor, so the Vendor status page can say what the graph holds.
export async function recordSync(vendorKey, result) {
  const last = (await getLastSync()) || { vendors: {} };
  last.vendors = { ...(last.vendors || {}), [vendorKey]: { at: new Date().toISOString(), accepted: result.accepted, documents: result.documents, rejected: result.rejected } };
  last.at = new Date().toISOString();
  last.accepted = Object.values(last.vendors).reduce((n, v) => n + (v.accepted || 0), 0);
  await setLastSync(last);
  if (result.rejected.length) console.log('graph rejected', vendorKey, JSON.stringify(result.rejected));
  return last;
}
