---
name: upstream
description: Checks whether a vendor such as GitHub, Cloudflare, Zoom or Jira had an incident when a Jira request or work item came in, using the Upstream tools on the Atlassian MCP server. Use when someone asks whether a problem might be a vendor outage, which vendors have problems now, or to link a vendor incident to a request.
---

# Upstream

Upstream is a Forge app for Jira. It reads the public status pages (Atlassian Statuspage) of the vendors a site follows
and puts their incidents next to the requests that came in at the same time. This skill tells an MCP client how to
call its three tools and how to report what they return.

## Connect

1. A site admin installs Upstream and turns on "Expose tools to MCP-compatible apps" for its Jira installation:
   Atlassian Administration > Apps > Sites > your site > Connected apps > Upstream > app details. External MCP access
   is part of Atlassian's Early Access Program and is off by default.
2. Add `https://mcp.atlassian.com/forge/69192be5-b55b-42c8-ae1a-32b2d30c9e18` as a remote MCP server in your client and
   sign in. On the consent screen you choose the site. The tools run with your own Jira permissions.

## Tools

- `vendor-incidents-around`, inputs `issueKey` and optional `vendor`: the vendor incidents and maintenance open in the
  24 hours before the request came in, each with `band` (likely, possible, unlikely), `openAtRequestTime`, impact,
  status, `why` (the evidence) and the link to the vendor's incident page.
- `vendor-status-now`: every followed vendor's current status with open incidents and maintenance.
- `link-vendor-incident`, inputs `issueKey`, `vendor` and `incidentId`: links that vendor incident to the request. It
  changes Jira, so call it only for an incident the user named or confirmed.

## Answering

When the user asks whether a vendor explains a request, call `vendor-incidents-around` and report the likely and
possible incidents first: vendor, name, whether it was open at the request time, impact, the evidence in `why`, and
the link. Say plainly when nothing overlaps. When the user asks what is down now, call `vendor-status-now` and name
only the vendors that are not fully operational.

## Limits

- Report only what the tools return and quote vendor updates as the vendor's words.
- An incident that overlaps in time is a lead, not proof: say "may explain" unless the vendor's update describes the
  same symptom.
