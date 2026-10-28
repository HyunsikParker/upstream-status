// Statuspage API v2 responses (summary.json, incidents.json, scheduled-maintenances.json) in one shape.
const byTime = (a, b) => Date.parse(a.at) - Date.parse(b.at);

export function normalizeIncident(vendor, inc) {
  const updates = (inc.incident_updates || [])
    .map((u) => ({ at: u.display_at || u.created_at, status: u.status, body: String(u.body || '').slice(0, 2000) }))
    .sort(byTime);
  const maintenance = !!inc.scheduled_for;
  return {
    vendor: vendor.key,
    vendorName: vendor.name,
    pageId: vendor.pageId,
    id: inc.id,
    name: inc.name,
    status: inc.status,
    impact: inc.impact || 'none',
    maintenance,
    startedAt: (maintenance ? inc.scheduled_for : inc.started_at) || inc.created_at,
    endsAt: maintenance ? inc.scheduled_until || null : null,
    resolvedAt: inc.resolved_at || null,
    updatedAt: inc.updated_at || inc.created_at,
    components: (inc.components || []).map((c) => c.name),
    updates,
    url: inc.shortlink || `${vendor.url}/incidents/${inc.id}`,
  };
}

const ACTIVE = new Set(['investigating', 'identified', 'monitoring', 'in_progress', 'verifying']);
export const isOpen = (inc) => !inc.resolvedAt && ACTIVE.has(inc.status);

export function vendorState(vendor, summary) {
  const comps = (summary?.components || []).filter((c) => !c.group && c.status !== 'operational');
  return {
    vendor: vendor.key,
    name: vendor.name,
    url: vendor.url,
    indicator: summary?.status?.indicator || 'unknown',
    description: summary?.status?.description || 'No status available',
    degraded: comps.slice(0, 8).map((c) => ({ name: c.name, status: c.status })),
    degradedCount: comps.length,
    incidents: (summary?.incidents || []).map((i) => normalizeIncident(vendor, i)),
    maintenance: (summary?.scheduled_maintenances || []).map((i) => normalizeIncident(vendor, i)),
  };
}

export const latestUpdate = (inc) => inc.updates[inc.updates.length - 1] || null;
