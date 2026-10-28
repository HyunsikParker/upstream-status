// A vendor incident as a Teamwork Graph document, so Rovo Search and Chat can find it next to the team's own work.
import { toMs } from './time.js';

const iso = (s) => new Date(toMs(s)).toISOString().replace(/\.\d{3}Z$/, 'Z');

export function incidentText(inc) {
  const head = `${inc.vendorName}: ${inc.name}. ${inc.maintenance ? 'Scheduled maintenance' : `Impact ${inc.impact}`}, status ${inc.status}.`;
  const comps = inc.components.length ? ` Affected: ${inc.components.join(', ')}.` : '';
  const lines = inc.updates.map((u) => `${iso(u.at)} ${u.status}: ${u.body}`);
  return `${head}${comps}\n${lines.join('\n')}`.slice(0, 20000);
}

export function toDocument(inc) {
  return {
    schemaVersion: '1.0',
    id: `${inc.pageId}:${inc.id}`,
    updateSequenceNumber: toMs(inc.updatedAt),
    displayName: `${inc.vendorName}: ${inc.name}`,
    description: `${inc.maintenance ? 'Scheduled maintenance' : `${inc.impact} impact`}, ${inc.status}`,
    url: inc.url,
    createdAt: iso(inc.startedAt),
    lastUpdatedAt: iso(inc.updatedAt),
    permissions: [{ accessControls: [{ principals: [{ type: 'ATLASSIAN_WORKSPACE' }] }] }],
    'atlassian:document': {
      type: { category: 'DOCUMENT', mimeType: 'text/plain' },
      content: { mimeType: 'text/plain', text: incidentText(inc) },
      labels: ['vendor-incident', inc.vendor, inc.maintenance ? 'maintenance' : inc.impact, inc.status],
    },
  };
}
