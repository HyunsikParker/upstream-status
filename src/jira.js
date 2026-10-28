// Jira REST calls made as the current user, so people only see and change work items they can open.
import api, { route, assumeTrustedRoute } from '@forge/api';

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };
export const PROPERTY = 'upstream';

async function call(path, options = {}) {
  const res = await api.asUser().requestJira(path, { headers: JSON_HEADERS, ...options });
  if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 300)}`);
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// For the app's own constant paths (the sample loader); never pass user input as `path`.
export const request = (method, path, body) => call(assumeTrustedRoute(path), { method, body: body ? JSON.stringify(body) : undefined });

export const getIssue = (key) => call(route`/rest/api/3/issue/${key}?fields=summary,description,created,labels,project,issuetype&properties=${PROPERTY}`);
export const remoteLinks = (key) => call(route`/rest/api/3/issue/${key}/remotelink`);
export const setProperty = (key, value) => call(route`/rest/api/3/issue/${key}/properties/${PROPERTY}`, { method: 'PUT', body: JSON.stringify(value) });
export const siteUrl = async () => (await call(route`/rest/api/3/serverInfo`)).baseUrl;
export const myTimeZone = async () => (await call(route`/rest/api/3/myself`)).timeZone || 'UTC';

export async function isSiteAdmin() {
  const r = await call(route`/rest/api/3/mypermissions?permissions=ADMINISTER`);
  return !!r?.permissions?.ADMINISTER?.havePermission;
}

export function linkIncident(key, inc) {
  return call(route`/rest/api/3/issue/${key}/remotelink`, {
    method: 'POST',
    body: JSON.stringify({
      globalId: `upstream:${inc.pageId}:${inc.id}`,
      relationship: 'Vendor incident',
      object: {
        url: inc.url,
        title: `${inc.vendorName}: ${inc.name}`,
        summary: `${inc.maintenance ? 'Scheduled maintenance' : `${inc.impact} impact`}, ${inc.status}`,
        status: { resolved: !!inc.resolvedAt },
      },
    }),
  });
}
