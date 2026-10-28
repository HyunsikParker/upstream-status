import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeIncident } from '../src/core/statuspage.js';
import { toDocument, incidentText } from '../src/core/graphdoc.js';
import { VENDORS } from '../src/core/vendors.js';

const gh = VENDORS.find((v) => v.key === 'github');
const inc = normalizeIncident(gh, JSON.parse(readFileSync(new URL('./fixtures/github_incidents.json', import.meta.url))).incidents[2]);

test('a vendor incident becomes a Teamwork Graph document', () => {
  const d = toDocument(inc);
  assert.equal(d.id, `kctbh9vrtdwd:${inc.id}`);
  assert.equal(d.displayName, `GitHub: ${inc.name}`);
  assert.match(d.createdAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.equal(d.permissions[0].accessControls[0].principals[0].type, 'ATLASSIAN_WORKSPACE');
  assert.equal(d['atlassian:document'].content.mimeType, 'text/plain');
  // The ingestion API accepted DOCUMENT and rejected web_page, WEB_PAGE and document (2026-10-28).
  assert.equal(d['atlassian:document'].type.category, 'DOCUMENT');
  assert.ok(d['atlassian:document'].labels.includes('github'));
  assert.ok(Number.isFinite(d.updateSequenceNumber));
});

test('the document text carries the impact, components and every update', () => {
  const t = incidentText(inc);
  assert.match(t, /^GitHub: /);
  assert.match(t, /Affected: API Requests, Issues, Pull Requests, Actions/);
  assert.equal(t.split('\n').length, 1 + inc.updates.length);
});
