import React from 'react';
import { Inline, Lozenge } from '@forge/react';

// Times follow the time zone in the viewer's Jira profile, as the rest of Jira does.
export const when = (iso, timeZone) => new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

const BAND = { likely: ['removed', 'Likely related'], possible: ['moved', 'Possibly related'], unlikely: ['default', 'Unlikely'] };
export function Band({ band }) {
  const [appearance, label] = BAND[band] || BAND.unlikely;
  return <Inline><Lozenge appearance={appearance}>{label}</Lozenge></Inline>;
}

// Statuspage indicators: minor is a minor service outage, major a partial system outage, critical a major one.
const STATE = { none: ['success', 'Operational'], minor: ['moved', 'Minor issues'], major: ['removed', 'Partial outage'], critical: ['removed', 'Major outage'], maintenance: ['inprogress', 'Maintenance'], unknown: ['default', 'Unknown'] };
export function VendorState({ indicator }) {
  const [appearance, label] = STATE[indicator] || STATE.unknown;
  return <Inline><Lozenge appearance={appearance}>{label}</Lozenge></Inline>;
}
