// Sample requests built on real, recent incidents from the followed vendors' status pages: each sample is dated a
// quarter of an hour into one incident, plus one unrelated request from the same moment for contrast.
import { isoSeconds, toMs } from './time.js';

export const SAMPLE_LABEL = 'upstream-sample';
const DAYS = 14;

export function pickIncidents(incidents, now = new Date().toISOString(), limit = 3) {
  const since = toMs(now) - DAYS * 86400000;
  const seen = new Set();
  return incidents
    .filter((i) => !i.maintenance && i.impact !== 'none' && toMs(i.startedAt) >= since && toMs(i.startedAt) < toMs(now))
    .sort((a, b) => toMs(b.startedAt) - toMs(a.startedAt))
    .filter((i) => (seen.has(i.vendor) ? false : seen.add(i.vendor)))
    .slice(0, limit);
}

export function buildSample(picked) {
  const items = picked.map((i) => {
    const what = i.components[0] || i.name.replace(/^(Incident with|Disruption with|Degraded performance for)\s+/i, '').replace(/^some\s+/i, '');
    return {
      summary: `${i.vendorName} ${what} not working for several of us`,
      description: `Several people in the team report problems with ${i.vendorName} (${what}) since this morning. Sample request created by Upstream from a real incident on the vendor's status page.`,
      at: isoSeconds(toMs(i.startedAt) + 15 * 60000),
      incident: `${i.vendorName}: ${i.name}`,
    };
  });
  if (items.length) {
    items.push({
      summary: 'New starter needs a laptop and accounts by Monday',
      description: 'Sample request created by Upstream with no vendor involved, to show how an unrelated request looks.',
      at: items[0].at,
      incident: null,
    });
  }
  return items;
}

const doc = (t) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });

// `request(method, path, body)` resolves to parsed JSON or null.
export async function seedSample(request, projectKey, items, property = 'upstream') {
  const meta = await request('GET', `/rest/api/3/issue/createmeta/${projectKey}/issuetypes`);
  const types = (meta?.issueTypes || meta?.values || []).filter((t) => !t.subtask);
  const pick = (re) => types.find((t) => re.test(t.untranslatedName || t.name));
  const type = pick(/service request/i) || pick(/^task$/i) || types.find((t) => t.hierarchyLevel === 0) || types[0];
  if (!type) throw new Error(`No work type in ${projectKey} can be created.`);
  const keys = [];
  for (const it of items) {
    const res = await request('POST', '/rest/api/3/issue', { fields: { project: { key: projectKey }, issuetype: { id: type.id }, summary: it.summary, description: doc(it.description), labels: [SAMPLE_LABEL] } });
    await request('PUT', `/rest/api/3/issue/${res.key}/properties/${property}`, { at: it.at });
    keys.push(res.key);
  }
  return keys;
}
