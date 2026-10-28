import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeIncident, vendorState, isOpen, latestUpdate } from '../src/core/statuspage.js';
import { VENDORS, customVendor, followed, DEFAULT_VENDORS } from '../src/core/vendors.js';

const gh = VENDORS.find((v) => v.key === 'github');
const incidents = JSON.parse(readFileSync(new URL('./fixtures/github_incidents.json', import.meta.url))).incidents;
const summary = JSON.parse(readFileSync(new URL('./fixtures/github_summary.json', import.meta.url)));

test('incidents keep timing, components, updates in order and a link', () => {
  const i = normalizeIncident(gh, incidents[2]);
  assert.equal(i.vendorName, 'GitHub');
  assert.deepEqual(i.components, ['API Requests', 'Issues', 'Pull Requests', 'Actions']);
  assert.equal(i.impact, 'minor');
  assert.ok(i.url.startsWith('https://'));
  assert.ok(Date.parse(i.updates[0].at) <= Date.parse(i.updates.at(-1).at));
  assert.equal(isOpen(i), false);
  assert.equal(latestUpdate(i).status, 'resolved');
  assert.equal(isOpen(normalizeIncident(gh, incidents[0])), true);
});

test('scheduled maintenance is told apart from incidents', () => {
  const m = normalizeIncident(gh, { id: 'm1', name: 'Database upgrade', status: 'scheduled', impact: 'maintenance', created_at: '2026-10-28T00:00:00Z', scheduled_for: '2026-10-30T02:00:00Z', scheduled_until: '2026-10-30T04:00:00Z', incident_updates: [] });
  assert.equal(m.maintenance, true);
  assert.equal(m.startedAt, '2026-10-30T02:00:00Z');
  assert.equal(m.endsAt, '2026-10-30T04:00:00Z');
});

test('vendor state reads the page indicator', () => {
  const s = vendorState(gh, summary);
  assert.equal(s.name, 'GitHub');
  assert.ok(['none', 'minor', 'major', 'critical', 'maintenance'].includes(s.indicator));
  assert.equal(Array.isArray(s.incidents), true);
});

test('followed vendors: defaults, chosen keys and custom pages', () => {
  assert.deepEqual(followed(null).map((v) => v.key), DEFAULT_VENDORS);
  assert.deepEqual(followed({ keys: ['github', 'zoom'] }).map((v) => v.name), ['GitHub', 'Zoom']);
  const custom = followed({ keys: ['page-abcd1234efgh'], custom: [{ pageId: 'abcd1234efgh', name: 'Acme Payments' }] });
  assert.equal(custom[0].url, 'https://abcd1234efgh.statuspage.io');
  assert.deepEqual(custom[0].words, ['acme', 'payments']);
  assert.throws(() => customVendor('https://status.acme.com', 'Acme'), /page id/);
});
