import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeIncident } from '../src/core/statuspage.js';
import { rankIncidents, span } from '../src/core/match.js';
import { VENDORS } from '../src/core/vendors.js';

const gh = VENDORS.find((v) => v.key === 'github');
const zoom = VENDORS.find((v) => v.key === 'zoom');
const raw = JSON.parse(readFileSync(new URL('./fixtures/github_incidents.json', import.meta.url))).incidents;
const ghIncidents = raw.map((i) => normalizeIncident(gh, i));
const actions = ghIncidents[2];
const zoomInc = normalizeIncident(zoom, { id: 'z1', name: 'Degraded meeting join', status: 'resolved', impact: 'major', created_at: actions.startedAt, started_at: actions.startedAt, resolved_at: new Date(Date.parse(actions.startedAt) + 3600000).toISOString(), incident_updates: [], components: [{ name: 'Meetings' }] });
const at = new Date(Date.parse(actions.startedAt) + 5 * 60000).toISOString();

test('a request that names the vendor and the component ranks the open incident first', () => {
  const r = rankIncidents({ at, text: 'GitHub Actions jobs stay queued and pull requests will not merge' }, [...ghIncidents, zoomInc], [gh, zoom]);
  assert.equal(r[0].id, actions.id);
  assert.equal(r[0].band, 'likely');
  assert.equal(r[0].open, true);
  assert.ok(r[0].why.includes('The request mentions GitHub'));
  assert.ok(r[0].why.some((w) => w.startsWith('Shared words:') && w.includes('action')));
  const z = r.find((x) => x.id === 'z1');
  assert.notEqual(z.band, 'likely');
});

test('incidents outside the window are left out; back-filled incidents count from their start', () => {
  const later = new Date(Date.parse(actions.startedAt) + 30 * 3600000).toISOString();
  const r = rankIncidents({ at: later, text: 'GitHub is slow' }, ghIncidents, [gh]);
  assert.ok(!r.some((x) => x.id === actions.id));
  const back = ghIncidents[1];
  const s = span(back);
  assert.ok(s.end >= s.start);
});

test('a request that names nothing still sees open incidents, ranked lower', () => {
  const r = rankIncidents({ at, text: 'The build server is down' }, [...ghIncidents, zoomInc], [gh, zoom]);
  assert.ok(r.length >= 2);
  assert.ok(r.every((x) => x.score < 0.6 || x.why.some((w) => w.startsWith('Shared'))));
});

test('maintenance the vendor says has no impact stays unlikely even when the request names the vendor', () => {
  const m = normalizeIncident(zoom, { id: 'm1', name: 'Zoom Chat Backend Update: October, 2026 (No Operational Impact)', status: 'in_progress', impact: 'maintenance', created_at: actions.startedAt, scheduled_for: actions.startedAt, scheduled_until: new Date(Date.parse(actions.startedAt) + 86400000).toISOString(), incident_updates: [], components: [] });
  const q = normalizeIncident(zoom, { id: 'q1', name: 'Service Degradation Affecting the Evaluations Acknowledge Button in Zoom Quality Management', status: 'identified', impact: 'minor', created_at: actions.startedAt, started_at: actions.startedAt, incident_updates: [], components: [{ name: 'Zoom Quality Management' }] });
  const r = rankIncidents({ at, text: 'Zoom Quality Management not working for several of us' }, [m, q, ...ghIncidents], [gh, zoom]);
  assert.equal(r[0].id, 'q1');
  assert.equal(r[0].band, 'likely');
  assert.ok(!r[0].why.some((w) => /Shared words:.*zoom/.test(w)));
  const mm = r.find((x) => x.id === 'm1');
  assert.equal(mm.band, 'unlikely');
  assert.ok(mm.why.includes('The vendor says it has no impact'));
  assert.ok(r.filter((x) => x.vendor === 'github').every((x) => x.band === 'unlikely'));
});
