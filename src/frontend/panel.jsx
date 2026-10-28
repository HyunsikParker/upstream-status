import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Button, DatePicker, DynamicTable, EmptyState, Inline, Link, Lozenge, SectionMessage, Select, Spinner, Stack, Strong, Text, TimePicker,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { Band, when } from './common.jsx';
import { zonedParts, zonedToIso } from '../core/time.js';

const WINDOWS = [{ label: '24 hours', value: 24 }, { label: '3 days', value: 72 }];
const pad = (n) => String(n).padStart(2, '0');
const TIMES = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

function TimeEditor({ at, timeZone, onSaved, onCancel }) {
  const initial = zonedParts(at, timeZone);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [state, setState] = useState(null);
  const save = async () => {
    setState({ busy: true });
    const r = await invoke('setTime', { at: zonedToIso(date, time, timeZone) }).catch((e) => ({ ok: false, error: String(e) }));
    if (r.ok) onSaved(); else setState(r);
  };
  return (
    <Stack space="space.100">
      <Inline space="space.100" alignBlock="end">
        <DatePicker value={date} onChange={setDate} label="Date" />
        <TimePicker value={time} onChange={setTime} label="Time" times={TIMES} timeIsEditable timeFormat="HH:mm" />
        <Button appearance="primary" isDisabled={state?.busy || !date || !time} onClick={save}>Save time</Button>
        <Button appearance="subtle" onClick={onCancel}>Cancel</Button>
      </Inline>
      <Text size="small">{`Time zone: ${timeZone}, as in your Jira profile.`}</Text>
      {state?.error && <SectionMessage appearance="error"><Text>{state.error}</Text></SectionMessage>}
    </Stack>
  );
}

function Incidents({ rows, linked, busy, onLink, timeZone }) {
  return (
    <DynamicTable
      head={{ cells: [{ key: 'i', content: 'Vendor incident' }, { key: 'y', content: 'Why it is here' }, { key: 'a', content: '' }] }}
      rows={rows.map((i) => {
        const gid = `upstream:${i.id}`;
        const isLinked = linked.some((g) => g.endsWith(`:${i.id}`));
        return {
          key: `${i.vendor}-${i.id}`,
          cells: [
            { key: 'i', content: (
              <Stack space="space.050">
                <Band band={i.band} />
                <Link href={i.url} openNewTab>{`${i.vendorName}: ${i.name}`}</Link>
                <Text size="small">{`${i.maintenance ? 'Maintenance' : `Impact ${i.impact}`}, ${i.status}, started ${when(i.startedAt, timeZone)}${i.resolvedAt ? `, resolved ${when(i.resolvedAt, timeZone)}` : ''}`}</Text>
                {i.latest && <Text size="small">{`Latest update: ${i.latest}`}</Text>}
              </Stack>
            ) },
            { key: 'y', content: <Stack space="space.0">{i.why.map((w) => <Text key={w}>{w}</Text>)}</Stack> },
            { key: 'a', content: isLinked ? <Lozenge appearance="success" isBold>Linked</Lozenge> : <Button appearance="subtle" isDisabled={!!busy} onClick={() => onLink(i)}>{busy === gid ? 'Linking…' : 'Link to request'}</Button> },
          ],
        };
      })}
    />
  );
}

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [win, setWin] = useState(WINDOWS[0]);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const [showUnlikely, setShowUnlikely] = useState(false);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    invoke('getPanel', { hours: win.value }).then(setData).catch((e) => setError(String(e)));
  }, [version, win]);
  // While status pages are being read, look again a few times.
  useEffect(() => {
    if (data?.refreshing && version < 3) {
      const t = setTimeout(() => setVersion((v) => v + 1), 8000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [data]);
  if (error) return <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>;
  if (!data) return <Spinner label="Reading vendor status pages" />;
  const reload = () => setVersion((v) => v + 1);
  const link = async (i) => {
    setBusy(`upstream:${i.id}`);
    const r = await invoke('link', { vendor: i.vendor, id: i.id }).catch((e) => ({ ok: false, error: String(e) }));
    setBusy(null);
    if (r.ok) reload(); else setError(r.error);
  };
  const { request: req, incidents, timeZone } = data;
  const relevant = incidents.filter((i) => i.band !== 'unlikely');
  const unlikely = incidents.filter((i) => i.band === 'unlikely');
  const shown = showUnlikely ? incidents : relevant;
  return (
    <Stack space="space.200">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Text><Strong>{`Reported ${when(req.at, timeZone)}`}</Strong></Text>
        <Text>{req.atSource === 'set' ? '(time set on the request)' : '(when it was created)'}</Text>
        {!editing && <Button appearance="link" onClick={() => setEditing(true)}>Change time</Button>}
      </Inline>
      {editing && <TimeEditor at={req.at} timeZone={timeZone} onSaved={() => { setEditing(false); reload(); }} onCancel={() => setEditing(false)} />}
      <Inline space="space.100" alignBlock="center">
        <Text>Vendor incidents open in the</Text>
        <Select options={WINDOWS} value={win} onChange={(o) => { setData(null); setWin(o); }} />
        <Text>{`before it: ${incidents.length}, ${relevant.length} likely or possibly related.`}</Text>
      </Inline>
      {incidents.length === 0 ? (
        <EmptyState header="No vendor incident around this time" description={`None of the followed vendors (${data.vendors.join(', ')}) reported an incident or maintenance in that window.`} />
      ) : (
        <Stack space="space.100">
          {shown.length > 0 ? <Incidents rows={shown} linked={data.linked} busy={busy} onLink={link} timeZone={timeZone} /> : <Text>No incident names a vendor or a component this request mentions.</Text>}
          {unlikely.length > 0 && <Inline><Button appearance="subtle" onClick={() => setShowUnlikely(!showUnlikely)}>{showUnlikely ? 'Hide unlikely ones' : `Show ${unlikely.length} unlikely one${unlikely.length === 1 ? '' : 's'}`}</Button></Inline>}
        </Stack>
      )}
      {data.missing.length > 0 && <Text size="small">{`Reading the status pages of ${data.missing.join(', ')} for the first time…`}</Text>}
      {data.errors.length > 0 && <Text size="small">{`Could not read the status page of ${data.errors.map((e) => e.vendor).join(', ')} just now; showing the last data read.`}</Text>}
      {data.oldest && <Text size="small">{`Vendor data as of ${when(data.oldest, timeZone)}${data.refreshing ? ', refreshing' : ''}.`}</Text>}
      <Text size="small">{`Live from the public status pages of ${data.vendors.join(', ')}. Jira administrators choose the vendors on the Vendor status page of any project. An incident is likely related when it was open at the time and the request names the vendor or shares words with the incident.`}</Text>
    </Stack>
  );
}

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
