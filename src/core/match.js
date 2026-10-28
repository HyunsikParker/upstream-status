// Vendor incidents that were open around the time a request came in, ranked with the reasons for each: whether the
// incident was open at that moment, whether the request names the vendor, and the words the two share.
import { toMs, spanText } from './time.js';
import { termsOf } from './text.js';

const IMPACT = { none: 0.6, minor: 0.8, major: 1, critical: 1.1, maintenance: 0.7 };
export const BANDS = { likely: 0.6, possible: 0.3 };
const round = (x) => Math.round(x * 100) / 100;

// Some status pages back-fill incidents with a resolution time before the start; such an incident covers its start only.
export function span(inc) {
  const start = toMs(inc.startedAt);
  const raw = inc.resolvedAt ? toMs(inc.resolvedAt) : inc.endsAt ? toMs(inc.endsAt) : Infinity;
  return { start, end: Math.max(start, raw) };
}

function timing(inc, t) {
  const { start, end } = span(inc);
  if (start <= t && t <= end) return { open: true, gapHours: 0, text: `Open when the request came in (started ${spanText((t - start) / 60000)} before)` };
  if (start > t) return { open: false, gapHours: (start - t) / 3600000, text: `Started ${spanText((start - t) / 60000)} after the request` };
  return { open: false, gapHours: (t - end) / 3600000, text: `Resolved ${spanText((t - end) / 60000)} before the request` };
}

export function rankIncidents(request, incidents, vendors, { beforeHours = 24, afterHours = 2 } = {}) {
  const t = toMs(request.at);
  const words = termsOf(request.text);
  const named = new Set(vendors.filter((v) => v.words.some((w) => words.has(w)) || words.has(v.name.toLowerCase())).map((v) => v.key));
  const out = [];
  for (const inc of incidents) {
    const { start, end } = span(inc);
    if (start > t + afterHours * 3600000 || end < t - beforeHours * 3600000) continue;
    const when = timing(inc, t);
    const incWords = termsOf(`${inc.name} ${inc.components.join(' ')}`);
    const shared = [...words].filter((w) => incWords.has(w));
    const recency = when.open ? 1 : 1 / (1 + when.gapHours / 2);
    const relevance = 0.3 + (named.has(inc.vendor) ? 0.5 : 0) + 0.3 * Math.min(1, shared.length / 2);
    const score = recency * relevance * (IMPACT[inc.maintenance ? 'maintenance' : inc.impact] || 0.6);
    const why = [when.text];
    if (named.has(inc.vendor)) why.push(`The request mentions ${inc.vendorName}`);
    if (shared.length) why.push(`Shared words: ${shared.slice(0, 4).join(', ')}`);
    why.push(inc.maintenance ? 'Scheduled maintenance' : `Impact: ${inc.impact}`);
    out.push({ ...inc, open: when.open, score: round(score), band: score >= BANDS.likely ? 'likely' : score >= BANDS.possible ? 'possible' : 'unlikely', why });
  }
  return out.sort((a, b) => b.score - a.score || toMs(b.startedAt) - toMs(a.startedAt));
}
