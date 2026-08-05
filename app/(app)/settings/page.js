'use client';
import { useState } from 'react';
import { useStore, sideName, mySide } from '@/lib/store';
import { supa } from '@/lib/supabase/client';
import { ArrTabs, useArrSelection, StructureHelp, UnitInput } from '@/components/ui';
import { toast } from '@/components/Toast';
import { confirmDelete } from '@/components/Confirm';
import { PRESETS, PATTERN_LABELS } from '@/lib/custody';

const KIDCOLORS = ['#2563eb', '#16a34a', '#9333ea', '#e11d48', '#0891b2', '#ca8a04'];

export default function SettingsPage() {
  const store = useStore();
  const { arrangements, households, me } = store;
  const [sel, setSel] = useArrSelection(arrangements);
  if (!arrangements.length) return <div className="empty">No arrangements yet.</div>;
  const arr = arrangements.find(a => a.id === sel) || arrangements[0];
  const house = households.find(h => h.id === arr.household_id) || households[0];

  return (
    <>
      <ArrTabs arrangements={arrangements} value={sel} onChange={setSel} />
      <div className="grid cols-2">
        <div>
          <MyProfile store={store} />
          <General key={'g' + arr.id} arr={arr} store={store} />
          <Children key={'k' + arr.id} arr={arr} store={store} />
        </div>
        <div>
          <Schedule key={'s' + arr.id} arr={arr} store={store} />
          <People key={'p' + arr.id} arr={arr} house={house} me={me} store={store} />
        </div>
      </div>
      <HouseholdTools house={house} me={me} store={store} arr={arr} />
    </>
  );
}

function MyProfile({ store }) {
  const [name, setName] = useState(store.me?.name || '');
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== (store.me?.name || '');

  async function save() {
    setBusy(true);
    const { error } = await supa().from('profiles')
      .update({ name: name.trim() }).eq('id', store.me.id);
    if (error) toast.error(`Couldn't save: ${error.message}`);
    await store.refresh();
    setBusy(false);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>My profile</h2>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Your display name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
        </div>
        <button className="btn" style={{ flex: 'none' }} disabled={busy || !dirty || !name.trim()} onClick={save}>
          {busy ? 'Saving…' : dirty ? 'Save' : 'Saved ✓'}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
        Shown on comments, to-dos, and anywhere your name appears. Signed in as {store.me?.email}.
      </p>
    </div>
  );
}

function General({ arr, store }) {
  const [name, setName] = useState(arr.name);
  const [hLabel, setHLabel] = useState(arr.h_label || '');
  const [cLabel, setCLabel] = useState(arr.c_label || '');
  const [split, setSplit] = useState(arr.split_pct);
  const [threshold, setThreshold] = useState(Number(arr.approval_threshold));
  const [time, setTime] = useState(arr.transfer_time || '');
  const [busy, setBusy] = useState(false);

  const dirty = name !== arr.name
    || hLabel !== (arr.h_label || '')
    || cLabel !== (arr.c_label || '')
    || +split !== arr.split_pct
    || +threshold !== Number(arr.approval_threshold)
    || time !== (arr.transfer_time || '');

  async function save() {
    setBusy(true);
    const { error } = await supa().from('arrangements').update({
      name, h_label: hLabel || null, c_label: cLabel || null,
      split_pct: Math.min(100, Math.max(0, +split || 0)),
      approval_threshold: Math.max(0, +threshold || 0),
      transfer_time: time || null,
    }).eq('id', arr.id);
    if (error) toast.error(`Couldn't save: ${error.message}`);
    await store.refresh();
    setBusy(false);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>Arrangement</h2>
      <div className="field"><label>Name<StructureHelp /></label><input value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="row">
        <div className="field"><label>Household parent label</label>
          <input value={hLabel} onChange={e => setHLabel(e.target.value)} placeholder="used until they sign up" /></div>
        <div className="field"><label>Co-parent label</label>
          <input value={cLabel} onChange={e => setCLabel(e.target.value)} placeholder="used until they sign up" /></div>
      </div>
      <div className="row">
        <div className="field"><label>{mySide(arr, store.me.id) === 'h' ? 'My share' : `${sideName(arr, 'h')}'s share`}</label>
          <UnitInput unit="%" type="number" min="0" max="100" value={split} onChange={e => setSplit(e.target.value)} /></div>
        <div className="field"><label>Approval needed above</label>
          <UnitInput unit="USD" type="number" min="0" value={threshold} onChange={e => setThreshold(e.target.value)} /></div>
      </div>
      <div className="field"><label>Usual transfer time</label>
        <input value={time} onChange={e => setTime(e.target.value)} placeholder="e.g. 6:00 PM" /></div>
      <button className="btn" disabled={busy || !dirty} onClick={save}>
        {busy ? 'Saving…' : dirty ? 'Save' : 'Saved ✓'}
      </button>
    </div>
  );
}

function Children({ arr, store }) {
  const [newName, setNewName] = useState('');

  async function add() {
    if (!newName.trim()) return;
    await supa().from('children').insert({
      arrangement_id: arr.id, name: newName.trim(),
      color: KIDCOLORS[arr.children.length % KIDCOLORS.length],
    });
    setNewName('');
    store.refresh();
  }
  async function update(k, patch) {
    await supa().from('children').update(patch).eq('id', k.id);
    store.refresh();
  }
  async function remove(k) {
    if (!(await confirmDelete(`Remove ${k.name}? Their expense and schedule history stays but loses the name link.`))) return;
    const { error } = await supa().from('children').delete().eq('id', k.id);
    if (error) toast.error(`Couldn't remove: ${error.message}`);
    store.refresh();
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>Children</h2>
      {arr.children.map(k => (
        <div key={k.id} className="row" style={{ marginBottom: 8, alignItems: 'center', flexWrap: 'nowrap' }}>
          <input style={{ flex: 3, minWidth: 0 }} defaultValue={k.name} onBlur={e => e.target.value !== k.name && update(k, { name: e.target.value })} />
          <input type="color" style={{ flex: '0 0 34px', minWidth: 0, padding: 2, height: 34 }} defaultValue={k.color}
            onBlur={e => e.target.value !== k.color && update(k, { color: e.target.value })} />
          <button className="btn danger small" style={{ flex: 'none', minWidth: 0 }} onClick={() => remove(k)}>✕</button>
        </div>
      ))}
      <div className="row" style={{ alignItems: 'center' }}>
        <input style={{ flex: 3 }} placeholder="Add a child…" value={newName}
          onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="btn small subtle" style={{ flex: 0 }} onClick={add}>Add</button>
      </div>
    </div>
  );
}

function Schedule({ arr, store }) {
  const sch = arr.schedule || {};
  const [type, setType] = useState(sch.type || 'weeks');
  const [anchor, setAnchor] = useState(sch.anchor_date || '');
  const [cycle, setCycle] = useState(sch.cycle?.length === 14 ? sch.cycle : PRESETS.weeks);
  const [busy, setBusy] = useState(false);

  const savedCycle = sch.cycle?.length === 14 ? sch.cycle : PRESETS.weeks;
  const dirty = type !== (sch.type || 'weeks')
    || anchor !== (sch.anchor_date || '')
    || (type === 'custom' && JSON.stringify(cycle) !== JSON.stringify(savedCycle));

  async function save() {
    setBusy(true);
    const { error } = await supa().from('schedules').upsert({
      arrangement_id: arr.id, type, anchor_date: anchor || null,
      cycle: type === 'custom' ? cycle : [],
    });
    if (error) toast.error(`Couldn't save schedule: ${error.message}`);
    await store.refresh();
    setBusy(false);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>Custody schedule</h2>
      <div className="field"><label>Pattern</label>
        <select value={type} onChange={e => setType(e.target.value)}>
          {Object.entries(PATTERN_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select></div>
      <div className="field">
        <label>Cycle start date (day 1 = first day of a stretch with {sideName(arr, 'h')})</label>
        <input type="date" value={anchor} onChange={e => setAnchor(e.target.value)} /></div>
      {type === 'custom' && (
        <div className="field">
          <label>Tap days to toggle who has the kids</label>
          <div className="cycle-grid">
            {cycle.map((w, i) => (
              <div key={i} className={`cycle-day ${w}`}
                onClick={() => setCycle(c => c.map((x, j) => j === i ? (x === 'h' ? 'c' : 'h') : x))}>
                D{i + 1}<br />{w === 'h' ? sideName(arr, 'h') : sideName(arr, 'c')}
              </div>
            ))}
          </div>
        </div>
      )}
      <button className="btn" disabled={busy || !dirty} onClick={save}>
        {busy ? 'Saving…' : dirty ? 'Save' : 'Saved ✓'}
      </button>
    </div>
  );
}

function People({ arr, house, me, store }) {
  const [cpEmail, setCpEmail] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [msg, setMsg] = useState('');

  const hasCoparent = (arr.arrangement_members || []).some(m => m.role === 'coparent');
  const houseMembers = house?.household_members || [];

  async function invite(kind) {
    const email = kind === 'coparent' ? cpEmail : partnerEmail;
    if (!email.trim()) return;
    const row = kind === 'coparent'
      ? { email: email.trim(), arrangement_id: arr.id, role: 'coparent', invited_by: me.id }
      : { email: email.trim(), household_id: house.id, role: 'household', invited_by: me.id };
    const { error } = await supa().from('invites').insert(row);
    if (error) { toast.error(`Invite failed: ${error.message}`); return; }
    setMsg(`Invite saved for ${email.trim()} — when they sign in with that email, they're connected automatically. Send them the app link!`);
    setCpEmail(''); setPartnerEmail('');
    store.refresh();
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>People &amp; invites</h2>
      <p style={{ fontSize: 13.5, marginBottom: 10 }}>
        <b>{arr.name}:</b>{' '}
        {(arr.arrangement_members || []).map(m => m.profiles?.name || m.profiles?.email).join(', ') || '—'}
        {!hasCoparent && <span className="muted"> · co-parent not joined yet</span>}
      </p>
      {!hasCoparent && (
        <div className="field"><label>Invite co-parent ({sideName(arr, 'c')}) by email</label>
          <div className="row" style={{ alignItems: 'center' }}>
            <input type="email" value={cpEmail} onChange={e => setCpEmail(e.target.value)} placeholder="coparent@example.com" />
            <button className="btn small subtle" style={{ flex: 0 }} onClick={() => invite('coparent')}>Invite</button>
          </div>
        </div>
      )}
      <p style={{ fontSize: 13.5, margin: '10px 0' }}>
        <b>Household:</b> {houseMembers.map(m => m.profiles?.name || m.profiles?.email).join(', ') || '—'}
      </p>
      <div className="field"><label>Invite your partner to the household (full visibility)</label>
        <div className="row" style={{ alignItems: 'center' }}>
          <input type="email" value={partnerEmail} onChange={e => setPartnerEmail(e.target.value)} placeholder="partner@example.com" />
          <button className="btn small subtle" style={{ flex: 0 }} onClick={() => invite('partner')}>Invite</button>
        </div>
      </div>
      {msg && <p className="muted" style={{ fontSize: 13 }}>{msg}</p>}
    </div>
  );
}

function HouseholdTools({ house, me, store, arr }) {
  const [showNewArr, setShowNewArr] = useState(false);
  const [arrName, setArrName] = useState('');
  const [split, setSplit] = useState(50);
  const icalBase = typeof window !== 'undefined' && store.me
    ? `${window.location.origin}/api/ical/${store.me.ical_token}` : '';
  const isHouseholdMember = !!house;
  // Household members can subscribe to everything or per arrangement;
  // co-parents' tokens only ever reach their own arrangement.
  const feeds = isHouseholdMember && store.arrangements.length > 1
    ? [{ label: 'Everything (all arrangements)', url: icalBase },
       ...store.arrangements.map(a => ({ label: a.name, url: `${icalBase}?arrangement=${a.id}` }))]
    : [{ label: 'Custody calendar', url: icalBase }];

  function copyFeed(f) {
    navigator.clipboard.writeText(f.url);
    toast.success(`${f.label} feed link copied`);
  }

  async function createArrangement() {
    if (!arrName.trim()) return;
    const s = supa();
    // Client-generated id: asking for the row back (RETURNING) trips the read
    // policy, which can't see a row mid-insert. Same pattern as initial setup.
    const arrId = crypto.randomUUID();
    const { error } = await s.from('arrangements').insert({
      id: arrId, household_id: house.id, name: arrName.trim(), split_pct: split, approval_threshold: 500,
    });
    if (error) { toast.error(`Couldn't create arrangement: ${error.message}`); return; }
    const { error: e2 } = await s.from('arrangement_members')
      .insert({ arrangement_id: arrId, user_id: me.id, role: 'household' });
    if (e2) { toast.error(e2.message); return; }
    await s.from('schedules').insert({ arrangement_id: arrId, type: 'weeks' });
    toast.success(`Arrangement "${arrName.trim()}" created`);
    setShowNewArr(false); setArrName('');
    store.refresh();
  }

  return (
    <div className="card" style={{ marginTop: 4 }}>
      <h2>Household tools</h2>
      <div className="row" style={{ alignItems: 'flex-start', gap: 36 }}>
        <div style={{ minWidth: 260 }}>
          <label>Calendar feeds (iCal)</label>
          <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
            Subscribe in Google/Apple Calendar to see custody days everywhere. Treat the links as private.
          </p>
          {feeds.map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <span style={{ flex: 1, fontSize: 13.5 }}>{f.label}</span>
              <button className="btn small subtle" style={{ flex: 'none' }} onClick={() => copyFeed(f)}>Copy link</button>
            </div>
          ))}
        </div>
        {isHouseholdMember && <div style={{ minWidth: 260 }}>
          <label>Add another arrangement</label>
          <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
            e.g. your partner&apos;s kids with their co-parent (their own schedule and split).
          </p>
          {showNewArr ? (
            <>
              <div className="row" style={{ alignItems: 'center' }}>
                <input placeholder="Arrangement name" value={arrName} onChange={e => setArrName(e.target.value)} />
                <UnitInput unit="%" type="number" title="household-side share" wrapStyle={{ flex: '0 0 90px' }} value={split} onChange={e => setSplit(+e.target.value)} />
              </div>
              <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                <button className="btn small" onClick={createArrangement}>Create</button>
                <button className="btn small subtle" onClick={() => setShowNewArr(false)}>Cancel</button>
              </div>
            </>
          ) : (
            <button className="btn small subtle" onClick={() => setShowNewArr(true)}>+ New arrangement</button>
          )}
        </div>}
      </div>
    </div>
  );
}
