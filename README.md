# Upstream

Is it us, or is it a vendor? Upstream puts the incidents your vendors report on their status pages next to the Jira
requests and work items that came in at the same time. A service desk agent who opens "GitHub Copilot not working for
several of us" sees that GitHub reported a Copilot incident fifteen minutes earlier, with the vendor's latest update
and a link, and can link that incident to the request.

Built on Atlassian Forge for Codegeist 2026.

## What you get

- **Vendor incidents panel** on any request or work item: the incidents and maintenance the followed vendors reported
  in the 24 hours or 3 days before the request came in, ranked with the reasons: whether the incident was open at that
  moment, whether the request names the vendor, the words the two share, and the impact. **Link to request** adds a
  link to the vendor's incident page.
- **Vendor status page** in every Jira project: each followed vendor's status now, open incidents and maintenance
  under way or starting within a day. Jira administrators choose the vendors there.
- **Teamwork Graph connector**: when a site admin connects "Upstream vendor status", each vendor incident becomes a
  document in the Teamwork Graph, with the vendor's updates as its text. Documents are among the object types that
  Rovo Search and Chat use.
- **Rovo agent "Upstream"** with three actions, `vendor-incidents-around`, `vendor-status-now` and
  `link-vendor-incident` (Rovo asks for confirmation before it adds a link), which the app also exposes as tools on the
  Atlassian MCP server. [`skills/upstream/SKILL.md`](skills/upstream/SKILL.md) tells a third-party agent how to use
  them.
- **Load sample requests** creates a few requests timed a quarter of an hour into real incidents from the last two
  weeks on the followed vendors' status pages, plus one unrelated request for contrast.

## Vendors

Twenty vendors that publish on Atlassian Statuspage are built in: GitHub, Jira, Confluence, Bitbucket, Cloudflare,
Zoom, Twilio, Datadog, npm, Vercel, Netlify, DigitalOcean, Discord, Dropbox, CircleCI, Sentry, Claude (Anthropic),
Shopify, Figma and MongoDB Cloud. Any other Statuspage-hosted page can be added by its page id. The app reads only the
public Statuspage API (`/api/v2/summary.json`, `incidents.json`, `scheduled-maintenances.json`).

Status pages are read in a queue consumer, one vendor per job, at most two at a time, and cached in Forge storage.
The panel and the Vendor status page read the cache and ask for a fresh read when it is older than five minutes; an
hourly trigger refreshes every followed vendor. Built-in vendors are read on their own status domains and a vendor
added by page id through `<page id>.statuspage.io`, each request on a fresh connection, because reused connections
stalled for about thirty seconds in our tests.

## How related is measured

An incident counts when it was open at any time between the window's start and two hours after the request. Its
score is recency (1 when open at the request time, then falling with the gap) times relevance (a base, plus the vendor
named in the request, plus shared words with the incident name and affected components) times an impact weight. The
panel shows "Likely related", "Possibly related" or "Unlikely" with the reasons in words. A vendor incident that
overlaps in time is a lead, not proof.

## Try it

1. Install the app on a Jira site (a Jira Service Management project shows the panel in the agent view).
2. Open any project, choose **Vendor status** in the project's navigation, and press **Load sample requests**.
3. Open one of the new requests and open the **Vendor incidents** panel from the apps button.
4. Optional: in Atlassian Administration, Apps, your site, Connected apps, Upstream, Connections, connect
   "Upstream vendor status" to bring vendor incidents into Rovo Search and Chat.

## Architecture

- `src/core/`: plain JavaScript, no network: `vendors.js` (built-in vendors, custom pages), `statuspage.js` (API
  responses in one shape), `match.js` (ranking and reasons), `graphdoc.js` (Teamwork Graph documents), `slim.js`
  (what the cache keeps), `sample.js` (sample requests), `time.js`, `text.js`.
- `src/statuspage-api.js` (reads), `src/cache.js` (Forge storage and the refresh queue), `src/sync.js` (Teamwork Graph
  `setObjects`), `src/jira.js` (Jira REST as the current user), `src/index.js` (resolvers, connector handlers, queue
  consumer, Rovo actions).
- `src/frontend/`: UI Kit panel and project page.
- No LLM calls in the app. The Rovo agent uses Rovo's own model on the site that runs it.

## Development

```sh
npm install
npm test
forge lint
forge deploy -e development
forge install --site <your-site>.atlassian.net -p Jira -e development
```

## Credits

Built with help from an AI coding assistant (Anthropic Claude). Status data comes from the vendors' public status
pages; vendor names belong to their owners. Sample requests are fictional; the incidents they refer to are real.

## Licence

MIT.
