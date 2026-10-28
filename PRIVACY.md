# Upstream privacy policy

Last updated: 28 October 2026

Upstream is a Forge app that runs on Atlassian's platform inside your Jira site.

## What the app reads
As the person using it and with that person's permissions: the summary, description, creation time and the app's
issue property of the request or work item they open the panel on, its remote links, the person's time zone setting
and whether they are a Jira administrator. From the internet, the app reads only the public status pages of the
vendors your site follows (Atlassian Statuspage API); it sends nothing about your site to them.

## What the app writes
Only when a person asks for it: a link from a request to a vendor's incident page, a corrected request time (stored
as an issue property named upstream), the list of followed vendors, and sample requests (Load sample requests). When
a site admin connects the Teamwork Graph connector, the app sends the vendors' public incident data to the Teamwork
Graph of your site. Everything it writes stays in your Atlassian site.

## What the app stores
Forge storage of the app holds the followed vendors, the Teamwork Graph connection ids and a cache of public vendor
status data. The developer does not collect, receive or sell personal data. Atlassian's platform keeps its usual
operational logs for Forge apps; see Atlassian's privacy policy.

## Contact
Questions and requests: the issues page of the app's public code repository.
