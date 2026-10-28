import test from 'node:test';
import assert from 'node:assert/strict';
import { pickIncidents, buildSample, seedSample } from '../src/core/sample.js';

const inc = (vendor, vendorName, id, startedAt, impact = 'major', components = []) => ({ vendor, vendorName, id, name: `Incident with ${components[0] || 'API'}`, startedAt, impact, components, maintenance: false });
const NOW = '2026-10-28T15:00:00.000Z';
const list = [
  inc('github', 'GitHub', 'a', '2026-10-28T14:12:53Z', 'critical', ['Copilot']),
  inc('github', 'GitHub', 'b', '2026-10-26T18:48:26Z', 'minor', ['Actions']),
  inc('zoom', 'Zoom', 'c', '2026-10-27T09:00:00Z', 'major', ['Meetings']),
  inc('npm', 'npm', 'd', '2026-10-01T09:00:00Z', 'major'),
  inc('cloudflare', 'Cloudflare', 'e', '2026-10-28T10:00:00Z', 'none'),
];

test('picks the latest incident per vendor from the last two weeks, skipping impact none', () => {
  assert.deepEqual(pickIncidents(list, NOW).map((i) => i.id), ['a', 'c']);
});

test('samples are dated a quarter of an hour into their incident, with one unrelated request', () => {
  const s = buildSample(pickIncidents(list, NOW));
  assert.equal(s[0].summary, 'GitHub Copilot not working for several of us');
  assert.equal(s[0].at, '2026-10-28T14:27:53Z');
  assert.equal(s.at(-1).incident, null);
  assert.equal(s.length, 3);
});

test('a component named after the vendor is not repeated in the summary', () => {
  const s = buildSample([inc('zoom', 'Zoom', 'z', '2026-10-28T14:31:00Z', 'minor', ['Zoom Quality Management'])]);
  assert.equal(s[0].summary, 'Zoom Quality Management not working for several of us');
});

test('seeding creates service requests when the project has them, with the time as a property', async () => {
  const calls = [];
  let n = 0;
  const request = async (m, p, b) => {
    calls.push([m, p, b]);
    if (p.includes('createmeta')) return { issueTypes: [{ id: '1', name: 'Task', untranslatedName: 'Task' }, { id: '9', name: '[System] Service request', untranslatedName: '[System] Service request' }] };
    if (m === 'POST') return { key: `ITS-${++n}` };
    return null;
  };
  const keys = await seedSample(request, 'ITS', buildSample(pickIncidents(list, NOW)));
  assert.deepEqual(keys, ['ITS-1', 'ITS-2', 'ITS-3']);
  assert.equal(calls.find(([m]) => m === 'POST')[2].fields.issuetype.id, '9');
  assert.deepEqual(calls.filter(([m]) => m === 'PUT')[0][2], { at: '2026-10-28T14:27:53Z' });
});
