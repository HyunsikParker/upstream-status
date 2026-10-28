// What the cache keeps per vendor, small enough for one storage value: the last 30 days, three updates each.
const DAYS = 30;

export function slimIncident(i) {
  return {
    vendor: i.vendor, vendorName: i.vendorName, pageId: i.pageId, id: i.id, name: String(i.name).slice(0, 200), status: i.status,
    impact: i.impact, maintenance: i.maintenance, startedAt: i.startedAt, endsAt: i.endsAt, resolvedAt: i.resolvedAt, updatedAt: i.updatedAt,
    components: i.components.slice(0, 8), url: i.url,
    updates: i.updates.slice(-3).map((u) => ({ at: u.at, status: u.status, body: u.body.slice(0, 400) })),
  };
}

export function slimVendor({ state, incidents }, now = Date.now()) {
  const since = now - DAYS * 86400000;
  return {
    state: { ...state, incidents: state.incidents.map(slimIncident), maintenance: state.maintenance.map(slimIncident) },
    incidents: incidents.filter((i) => Date.parse(i.updatedAt) >= since || !i.resolvedAt).slice(0, 60).map(slimIncident),
  };
}
