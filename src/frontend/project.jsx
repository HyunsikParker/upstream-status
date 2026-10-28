import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Button, DynamicTable, Heading, Inline, Link, SectionMessage, Select, Spinner, Stack, Text, Textfield,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { VendorState, when } from './common.jsx';

const DAY = 86400000;
// Open incidents in full; maintenance only when under way or starting within a day, at most three.
function Happening({ s, timeZone }) {
  const soon = s.maintenance.filter((m) => m.status === 'in_progress' || (Date.parse(m.startedAt) - Date.now() < DAY && Date.parse(m.startedAt) > Date.now() - DAY));
  const items = [...s.incidents, ...soon.slice(0, 3)];
  const more = s.maintenance.length - Math.min(soon.length, 3);
  if (items.length === 0) return <Text>{more > 0 ? `None now; ${more} maintenance window${more === 1 ? '' : 's'} scheduled later` : 'None'}</Text>;
  return (
    <Stack space="space.050">
      {items.map((i) => (
        <Text key={i.id}><Link href={i.url} openNewTab>{i.name}</Link>{` (${i.maintenance ? `maintenance from ${when(i.startedAt, timeZone)}` : `${i.impact}, ${i.status} since ${when(i.startedAt, timeZone)}`})`}</Text>
      ))}
      {more > 0 && <Text size="small"><Link href={s.url} openNewTab>{`${more} more maintenance window${more === 1 ? '' : 's'} on the status page`}</Link></Text>}
    </Stack>
  );
}

function Board({ states, timeZone }) {
  return (
    <DynamicTable
      head={{ cells: [{ key: 'v', content: 'Vendor' }, { key: 's', content: 'Now' }, { key: 'i', content: 'Open incidents and maintenance' }] }}
      rows={states.map((s) => ({
        key: s.vendor,
        cells: [
          { key: 'v', content: <Link href={s.url} openNewTab>{s.name}</Link> },
          { key: 's', content: <Stack space="space.050"><VendorState indicator={s.indicator} /><Text size="small">{s.degradedCount ? `${s.degradedCount} component${s.degradedCount === 1 ? '' : 's'} degraded` : s.description}</Text></Stack> },
          { key: 'i', content: <Happening s={s} timeZone={timeZone} /> },
        ],
      }))}
    />
  );
}

function Settings({ data, onSaved }) {
  const options = data.choices.map((c) => ({ label: c.name, value: c.key }));
  const [chosen, setChosen] = useState(options.filter((o) => data.followedKeys.includes(o.value)));
  const [custom, setCustom] = useState(data.custom);
  const [pageId, setPageId] = useState('');
  const [name, setName] = useState('');
  const [state, setState] = useState(null);
  const add = () => {
    if (!pageId) return;
    setCustom([...custom, { pageId: pageId.trim().toLowerCase(), name: name.trim() }]);
    setChosen([...chosen, { label: name.trim() || pageId.trim(), value: `page-${pageId.trim().toLowerCase()}` }]);
  };
  const save = async () => {
    setState({ busy: true });
    const r = await invoke('saveSettings', { keys: chosen.map((o) => o.value), custom }).catch((e) => ({ ok: false, error: String(e) }));
    setState(r);
    if (r.ok) onSaved();
  };
  return (
    <Stack space="space.100">
      <Heading size="small">Vendors this site follows</Heading>
      <Select isMulti options={[...options, ...custom.filter((c) => !options.some((o) => o.value === `page-${c.pageId}`)).map((c) => ({ label: c.name || c.pageId, value: `page-${c.pageId}` }))]} value={chosen} onChange={(v) => setChosen(v || [])} />
      <Text size="small">Another vendor on Atlassian Statuspage: enter its page id (the part before .statuspage.io, also shown in the page's API address) and a name.</Text>
      <Inline space="space.100" alignBlock="center">
        <Textfield name="pageId" placeholder="Page id, for example kctbh9vrtdwd" onChange={(e) => setPageId(e.target.value)} />
        <Textfield name="name" placeholder="Name" onChange={(e) => setName(e.target.value)} />
        <Button onClick={add}>Add</Button>
      </Inline>
      <Inline><Button appearance="primary" isDisabled={state?.busy || chosen.length === 0} onClick={save}>Save vendors</Button></Inline>
      {state && state.ok === false && <SectionMessage appearance="error"><Text>{state.error}</Text></SectionMessage>}
      {state?.ok && <SectionMessage appearance="success"><Text>Saved.</Text></SectionMessage>}
    </Stack>
  );
}

function Sample() {
  const [state, setState] = useState(null);
  const load = async () => {
    setState({ busy: true });
    setState(await invoke('loadSample').catch((e) => ({ ok: false, error: String(e) })));
  };
  return (
    <Stack space="space.100">
      <Heading size="small">Sample requests</Heading>
      <Text>Creates a few requests in this project, each timed a quarter of an hour into a real incident from the last two weeks on a followed vendor's status page, plus one unrelated request for contrast.</Text>
      <Inline><Button isDisabled={state?.busy || state?.ok} onClick={load}>{state?.busy ? 'Creating requests…' : 'Load sample requests'}</Button></Inline>
      {state?.ok && <SectionMessage appearance="success"><Text>{`Created ${state.keys.join(', ')} (label ${state.label}), based on: ${state.based.join('; ')}.`}</Text></SectionMessage>}
      {state && state.ok === false && <SectionMessage appearance="error"><Text>{state.error}</Text></SectionMessage>}
    </Stack>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    invoke('getBoard').then(setData).catch((e) => setError(String(e)));
  }, [version]);
  useEffect(() => {
    if (data?.refreshing && version < 3) {
      const t = setTimeout(() => setVersion((v) => v + 1), 8000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [data]);
  if (error) return <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>;
  if (!data) return <Spinner label="Reading vendor status pages" />;
  const s = data.lastSync;
  return (
    <Stack space="space.250">
      <Text>Status of the vendors this site follows, read from their public status pages. Open a request to see the vendor incidents that were open around the time it came in.</Text>
      <Board states={data.states} timeZone={data.timeZone} />
      {data.oldest && <Text size="small">{`Read ${when(data.oldest, data.timeZone)} or later${data.refreshing ? '; refreshing now' : ''}. Pages are read again when older than five minutes and every hour.`}</Text>}
      <Stack space="space.100">
        <Heading size="small">Teamwork Graph</Heading>
        {data.connected ? (
          <Text>{s ? `Connected. Last update ${when(s.at, data.timeZone)}; ${s.accepted} vendor incidents were sent to the Teamwork Graph, where Rovo Search and Chat can find them.` : 'Connected; vendor incidents are sent as soon as the status pages are read.'}</Text>
        ) : (
          <Text>Not connected. A site admin can connect "Upstream vendor status" in Atlassian Administration: Apps, your site, Connected apps, Upstream, Connections. Each vendor incident then becomes a document that Rovo Search and Chat can find.</Text>
        )}
      </Stack>
      <Sample />
      {data.admin ? <Settings data={data} onSaved={() => { setData(null); setVersion((v) => v + 1); }} /> : <Text size="small">{`Followed vendors: ${data.states.map((x) => x.name).join(', ')}. Jira administrators can change them here.`}</Text>}
    </Stack>
  );
}

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
