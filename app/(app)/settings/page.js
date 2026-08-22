'use client';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useStore, sideName, mySide, childIdentity, kidName, identityOf, identityLabel, arrName } from '@/lib/store';
import { supa } from '@/lib/supabase/client';
import { ArrTabs, useArrSelection, StructureHelp, UnitInput } from '@/components/ui';
import { toast } from '@/components/Toast';
import { confirmDelete } from '@/components/Confirm';
import { PRESETS, PATTERN_LABELS } from '@/lib/custody';

const KIDCOLORS = ['#2563eb', '#16a34a', '#9333ea', '#e11d48', '#0891b2', '#ca8a04'];

const IDENTITIES = [
  ['mom', 'Mom'], ['dad', 'Dad'], ['stepmom', 'Stepmom'], ['stepdad', 'Stepdad'],
  ['grandparent', 'Grandparent'], ['other', 'Other'],
];

export default function SettingsPage() {
  const store = useStore();
  const { arrangements, households, me } = store;
  const [sel, setSel] = useArrSelection(arrangements);
  if (!arrangements.length) return <div className="empty">No arrangements yet.</div>;
  if (childIdentity(arrangements, me.id)) {
    return <div style={{ maxWidth: 520, margin: '0 auto' }}><MyProfile store={store} /></div>;
  }
  const arr = arrangements.find(a => a.id === sel) || arrangements[0];
  const side = mySide(arr, me.id);   // 'h' | 'c' | null (viewer)
  const myHouse = households.find(h =>
    (h.household_members || []).some(m => m.user_id === me.id));

  if (!side) {
    // Read-only viewer: their profile and how the kids know them.
    return (
      <>
        <ArrTabs arrangements={arrangements} value={sel} onChange={setSel} />
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <MyProfile store={store} />
          <IdentityCard key={'i' + arr.id} arr={arr} me={me} store={store} />
        </div>
      </>
    );
  }

  return (
    <>
      <ArrTabs arrangements={arrangements} value={sel} onChange={setSel} />
      <div className="grid cols-2">
        <div>
          <MyProfile store={store} />
          <IdentityCard key={'i' + arr.id} arr={arr} me={me} store={store} />
          {side === 'h' && <General key={'g' + arr.id} arr={arr} store={store} />}
          {side === 'h' && <Children key={'k' + arr.id} arr={arr} store={store} />}
        </div>
        <div>
          {side === 'h' && <Schedule key={'s' + arr.id} arr={arr} store={store} />}
          <People key={'p' + arr.id} arr={arr} side={side} myHouse={myHouse} me={me} store={store} />
        </div>
      </div>
      <HouseholdTools myHouse={myHouse} side={side} me={me} store={store} />
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

// Who am I to these kids, and what do I personally call this arrangement.
// Both are per-person: nobody else's labels move when these change.
function IdentityCard({ arr, me, store }) {
  const mine = identityOf(arr, me.id);
  const [identity, setIdentity] = useState(mine?.identity || 'other');
  const [label, setLabel] = useState(mine?.label || '');
  const [nickname, setNickname] = useState((arr.arrangement_prefs || [])[0]?.nickname || '');
  const [busy, setBusy] = useState(false);

  const dirty = identity !== (mine?.identity || 'other')
    || label.trim() !== (mine?.label || '')
    || nickname.trim() !== ((arr.arrangement_prefs || [])[0]?.nickname || '');

  async function save() {
    setBusy(true);
    const s = supa();
    const { error: e1 } = await s.from('member_identities').upsert({
      arrangement_id: arr.id, user_id: me.id, identity,
      label: label.trim() || null,
    });
    if (e1) toast.error(`Couldn't save: ${e1.message}`);
    const { error: e2 } = await s.from('arrangement_prefs').upsert({
      arrangement_id: arr.id, user_id: me.id, nickname: nickname.trim() || null,
    });
    if (e2) toast.error(`Couldn't save nickname: ${e2.message}`);
    await store.refresh();
    setBusy(false);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>Me &amp; {arrName(arr)}</h2>
      <div className="row">
        <div className="field"><label>The kids know me as</label>
          <select value={identity} onChange={e => setIdentity(e.target.value)}>
            {IDENTITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div className="field"><label>Custom label (optional)</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Grandma Jo" /></div>
      </div>
      <div className="field"><label>My nickname for this arrangement (only you see it)</label>
        <input value={nickname} onChange={e => setNickname(e.target.value)}
          placeholder={`Shown as “${arrName(arr)}” by default`} /></div>
      <button className="btn" disabled={busy || !dirty} onClick={save}>
        {busy ? 'Saving…' : dirty ? 'Save' : 'Saved ✓'}
      </button>
    </div>
  );
}

function General({ arr, store }) {
  const cJoined = (arr.members || []).some(m => m.side === 'c');
  const [cLabel, setCLabel] = useState(arr.c_label || '');
  const [kidC, setKidC] = useState(arr.kid_c_label || '');
  const [split, setSplit] = useState(arr.split_pct);
  const [threshold, setThreshold] = useState(Number(arr.approval_threshold));
  const [time, setTime] = useState(arr.transfer_time || '');
  const [supAmount, setSupAmount] = useState(arr.support_amount ? Number(arr.support_amount) : '');
  const [supFrom, setSupFrom] = useState(arr.support_from || '');
  const [supDays, setSupDays] = useState((arr.support_days || []).join(', '));
  const [busy, setBusy] = useState(false);

  const dirty = cLabel !== (arr.c_label || '')
    || kidC !== (arr.kid_c_label || '')
    || +split !== arr.split_pct
    || +threshold !== Number(arr.approval_threshold)
    || time !== (arr.transfer_time || '')
    || Number(supAmount || 0) !== Number(arr.support_amount || 0)
    || supFrom !== (arr.support_from || '')
    || supDays.split(/[\s,]+/).filter(Boolean).join(',') !== (arr.support_days || []).join(',');

  async function save() {
    const days = supDays.split(/[\s,]+/).filter(Boolean).map(Number);
    if (supAmount && (!supFrom || !days.length)) {
      toast.error('Support needs who pays and at least one day of the month.'); return;
    }
    if (days.some(d => !Number.isInteger(d) || d < 1 || d > 28)) {
      toast.error('Support days must be between 1 and 28 so every month has them.'); return;
    }
    setBusy(true);
    const { error } = await supa().from('arrangements').update({
      c_label: cLabel.trim() || null,
      kid_c_label: kidC.trim() || null,
      split_pct: Math.min(100, Math.max(0, +split || 0)),
      approval_threshold: Math.max(0, +threshold || 0),
      transfer_time: time || null,
      support_amount: supAmount ? +supAmount : null,
      support_from: supAmount ? supFrom : null,
      support_days: supAmount ? days : [],
    }).eq('id', arr.id);
    if (error) toast.error(`Couldn't save: ${error.message}`);
    else {
      // snap fields to canonical form so the dirty check settles
      setSupDays(supAmount ? days.join(', ') : '');
      setSupAmount(supAmount ? String(+supAmount) : '');
      if (!supAmount) setSupFrom('');
    }
    await store.refresh();
    setBusy(false);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>Arrangement<StructureHelp /></h2>
      {!cJoined && (
        <div className="row">
          <div className="field"><label>Co-parent&apos;s name (until they join)</label>
            <input value={cLabel} onChange={e => setCLabel(e.target.value)} placeholder="Their name" /></div>
          <div className="field"><label>Kids see them as (until they join)</label>
            <input value={kidC} onChange={e => setKidC(e.target.value)} placeholder="e.g. Mom" /></div>
        </div>
      )}
      <div className="row">
        <div className="field"><label>My share</label>
          <UnitInput unit="%" type="number" min="0" max="100" value={split} onChange={e => setSplit(e.target.value)} /></div>
        <div className="field"><label>Approval needed above</label>
          <UnitInput unit="USD" type="number" min="0" value={threshold} onChange={e => setThreshold(e.target.value)} /></div>
      </div>
      <div className="field"><label>Usual transfer time</label>
        <input value={time} onChange={e => setTime(e.target.value)} placeholder="e.g. 6:00 PM" /></div>
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
        <label>Support &amp; maintenance (optional)</label>
        <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 10px' }}>
          A standing amount owed on set days each month. It lands in the expense
          ledger automatically, adds to the payer&apos;s balance, and is settled
          with &ldquo;Record payment&rdquo;.
        </p>
        <div className="row">
          <div className="field"><label>Amount per due day</label>
            <UnitInput unit="USD" type="number" min="0" step="0.01" value={supAmount}
              onChange={e => setSupAmount(e.target.value)} placeholder="0.00" /></div>
          <div className="field"><label>Who pays</label>
            <select value={supFrom} onChange={e => setSupFrom(e.target.value)}>
              <option value="">Not set</option>
              <option value="h">{sideName(arr, 'h')} pays {sideName(arr, 'c')}</option>
              <option value="c">{sideName(arr, 'c')} pays {sideName(arr, 'h')}</option>
            </select></div>
        </div>
        <div className="field"><label>Days of the month (1–28)</label>
          <input value={supDays} onChange={e => setSupDays(e.target.value)}
            placeholder="e.g. 1, 15" /></div>
      </div>
      <button className="btn" disabled={busy || !dirty} onClick={save}>
        {busy ? 'Saving…' : dirty ? 'Save' : 'Saved ✓'}
      </button>
    </div>
  );
}

function Children({ arr, store }) {
  const [newName, setNewName] = useState('');
  const [inviteKid, setInviteKid] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');

  async function sendChildInvite(k) {
    if (!inviteEmail.trim()) return;
    const { error } = await supa().from('invites').insert({
      email: inviteEmail.trim(), role: 'child', child_id: k.id, invited_by: store.me.id,
    });
    if (error) { toast.error(`Invite failed: ${error.message}`); return; }
    const emailed = await sendInviteEmail(inviteEmail.trim(), 'child');
    toast.success(emailed
      ? `Invitation emailed — when ${k.name} signs in with that address, they get read-only access.`
      : `When ${k.name} signs in with that email, they get read-only access.`);
    setInviteKid(null); setInviteEmail('');
    store.refresh();
  }

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
        <div key={k.id} style={{ marginBottom: 8 }}>
          <div className="kid-row">
            <input style={{ minWidth: 0 }} defaultValue={k.name} onBlur={e => e.target.value !== k.name && update(k, { name: e.target.value })} />
            <input type="color" defaultValue={k.color}
              onBlur={e => e.target.value !== k.color && update(k, { color: e.target.value })} />
            {k.user_id
              ? <span className="pill approved" title="Has a read-only login">login ✓</span>
              : <button className="btn small subtle" title="Invite a read-only login"
                  onClick={() => { setInviteKid(inviteKid === k.id ? null : k.id); setInviteEmail(''); }}>Invite</button>}
            <button className="btn danger small" onClick={() => remove(k)}><Trash2 size={15} /></button>
          </div>
          {inviteKid === k.id && (
            <div className="row" style={{ alignItems: 'center', marginTop: 6, flexWrap: 'nowrap' }}>
              <input type="email" style={{ minWidth: 0 }} placeholder={`${k.name}'s email`}
                value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChildInvite(k)} />
              <button className="btn small" style={{ flex: 'none' }} onClick={() => sendChildInvite(k)}>Send</button>
            </div>
          )}
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

// Fire the invitation email; returns whether one actually went out.
async function sendInviteEmail(email, role) {
  try {
    const res = await fetch('/api/send-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    });
    const body = await res.json();
    return !!body.ok;
  } catch {
    return false;
  }
}

function People({ arr, side, myHouse, me, store }) {
  const [cpEmail, setCpEmail] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [viewerEmail, setViewerEmail] = useState('');

  const cJoined = (arr.members || []).some(m => m.side === 'c');
  const personLine = m => {
    const nm = m.profiles?.name || m.profiles?.email;
    const ident = identityLabel(identityOf(arr, m.user_id));
    return ident ? `${nm} (${ident})` : nm;
  };
  const sideMembers = s => (arr.members || []).filter(m => m.side === s);

  async function invite(kind) {
    const email = { coparent: cpEmail, partner: partnerEmail, viewer: viewerEmail }[kind];
    if (!email.trim()) return;
    const row = {
      coparent: { email: email.trim(), arrangement_id: arr.id, role: 'coparent', invited_by: me.id },
      partner: { email: email.trim(), household_id: myHouse?.id, role: 'household', invited_by: me.id },
      viewer: { email: email.trim(), arrangement_id: arr.id, role: 'viewer', invited_by: me.id },
    }[kind];
    const { error } = await supa().from('invites').insert(row);
    if (error) { toast.error(`Invite failed: ${error.message}`); return; }
    const emailed = await sendInviteEmail(email.trim(), kind);
    toast.success(emailed
      ? `Invitation emailed to ${email.trim()} — they sign in with that address and connect automatically.`
      : `Invite saved for ${email.trim()} — send them the app link; they sign in with that address and connect automatically.`);
    setCpEmail(''); setPartnerEmail(''); setViewerEmail('');
    store.refresh();
  }

  async function removeViewer(v) {
    const nm = v.profiles?.name || v.profiles?.email;
    if (!(await confirmDelete(`Remove ${nm}'s read-only access to this arrangement?`))) return;
    const { error } = await supa().from('arrangement_viewers')
      .delete().eq('arrangement_id', arr.id).eq('user_id', v.user_id);
    if (error) toast.error(`Couldn't remove: ${error.message}`);
    store.refresh();
  }

  async function disconnectCoparent() {
    if (!(await confirmDelete(
      `Disconnect ${sideName(arr, 'c')}'s home from ${arrName(arr)}? Everyone on their side loses access immediately. ` +
      'The schedule, expenses, and history all stay, and you can re-invite a co-parent anytime.'))) return;
    const { error } = await supa().from('arrangements')
      .update({ c_household_id: null }).eq('id', arr.id);
    if (error) { toast.error(`Couldn't disconnect: ${error.message}`); return; }
    toast.success('Co-parent disconnected.');
    store.refresh();
  }

  async function revokeInvite(inv) {
    if (!(await confirmDelete(`Revoke the invite for ${inv.email}? Their sign-in will no longer connect to anything.`))) return;
    const { error } = await supa().from('invites').delete().eq('id', inv.id);
    if (error) toast.error(`Couldn't revoke: ${error.message}`);
    store.refresh();
  }

  // Pending invites relevant to this arrangement: into it, into my home,
  // or for one of its children.
  const kidIds = (arr.children || []).map(k => k.id);
  const pending = (store.invites || []).filter(i =>
    i.arrangement_id === arr.id
    || (i.household_id && i.household_id === myHouse?.id)
    || (i.child_id && kidIds.includes(i.child_id)));
  const inviteDesc = i =>
    i.role === 'child' ? `child login (${kidName(arr, i.child_id)})`
    : i.role === 'household' ? 'partner in your home'
    : i.role === 'viewer' ? 'read-only viewer'
    : 'co-parent';

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>People &amp; invites</h2>
      <p style={{ fontSize: 13.5, marginBottom: 4 }}>
        <b>{sideName(arr, 'h')}&apos;s home:</b> {sideMembers('h').map(personLine).join(', ') || '—'}
      </p>
      <p style={{ fontSize: 13.5, marginBottom: 10 }}>
        <b>{cJoined ? `${sideName(arr, 'c')}'s home:` : 'Co-parent:'}</b>{' '}
        {sideMembers('c').map(personLine).join(', ') || <span className="muted">not joined yet</span>}
        {cJoined && side === 'h' && (
          <button className="btn danger small" style={{ marginLeft: 8 }} title="Remove their side's access"
            onClick={disconnectCoparent}>Disconnect</button>
        )}
      </p>
      {(arr.arrangement_viewers || []).length > 0 && (
        <p style={{ fontSize: 13.5, marginBottom: 10 }}>
          <b>Read-only:</b>{' '}
          {arr.arrangement_viewers.map(v => (
            <span key={v.user_id} style={{ marginRight: 8 }}>
              {v.profiles?.name || v.profiles?.email}
              <button className="btn danger small" style={{ marginLeft: 4, padding: '1px 6px' }}
                onClick={() => removeViewer(v)}><Trash2 size={15} /></button>
            </span>
          ))}
        </p>
      )}
      {side === 'h' && !cJoined && (
        <div className="field"><label>Invite co-parent ({sideName(arr, 'c')}) by email</label>
          <div className="row" style={{ alignItems: 'center' }}>
            <input type="email" value={cpEmail} onChange={e => setCpEmail(e.target.value)} placeholder="coparent@example.com" />
            <button className="btn small subtle" style={{ flex: 0 }} onClick={() => invite('coparent')}>Invite</button>
          </div>
        </div>
      )}
      {myHouse && (
        <div className="field"><label>Invite a partner into your home (they manage everything with you)</label>
          <div className="row" style={{ alignItems: 'center' }}>
            <input type="email" value={partnerEmail} onChange={e => setPartnerEmail(e.target.value)} placeholder="partner@example.com" />
            <button className="btn small subtle" style={{ flex: 0 }} onClick={() => invite('partner')}>Invite</button>
          </div>
        </div>
      )}
      <div className="field"><label>Invite a read-only viewer (sees everything, changes nothing)</label>
        <div className="row" style={{ alignItems: 'center' }}>
          <input type="email" value={viewerEmail} onChange={e => setViewerEmail(e.target.value)} placeholder="viewer@example.com" />
          <button className="btn small subtle" style={{ flex: 0 }} onClick={() => invite('viewer')}>Invite</button>
        </div>
      </div>
      {pending.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <label>Pending invites</label>
          {pending.map(i => (
            <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 13.5 }}>
              <span style={{ flex: 1 }}>{i.email} <span className="muted">— {inviteDesc(i)}</span></span>
              <button className="btn danger small" style={{ flex: 'none' }} title="Revoke invite"
                onClick={() => revokeInvite(i)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HouseholdTools({ myHouse, side, me, store }) {
  const [showNewArr, setShowNewArr] = useState(false);
  const [arrName_, setArrName_] = useState('');
  const [split, setSplit] = useState(50);
  const icalBase = typeof window !== 'undefined' && store.me
    ? `${window.location.origin}/api/ical/${store.me.ical_token}` : '';
  const feeds = store.arrangements.length > 1
    ? [{ label: 'Everything (all arrangements)', url: icalBase },
       ...store.arrangements.map(a => ({ label: arrName(a), url: `${icalBase}?arrangement=${a.id}` }))]
    : [{ label: 'Custody calendar', url: icalBase }];

  function copyFeed(f) {
    navigator.clipboard.writeText(f.url);
    toast.success(`${f.label} feed link copied`);
  }

  async function createArrangement() {
    if (!arrName_.trim()) return;
    const s = supa();
    // Client-generated id: asking for the row back (RETURNING) trips the read
    // policy, which can't see a row mid-insert. Same pattern as initial setup.
    const arrId = crypto.randomUUID();
    const { error } = await s.from('arrangements').insert({
      id: arrId, h_household_id: myHouse.id, name: arrName_.trim(), split_pct: split, approval_threshold: 500,
    });
    if (error) { toast.error(`Couldn't create arrangement: ${error.message}`); return; }
    await s.from('schedules').insert({ arrangement_id: arrId, type: 'weeks' });
    toast.success(`Arrangement "${arrName_.trim()}" created`);
    setShowNewArr(false); setArrName_('');
    store.refresh();
  }

  return (
    <div className="card" style={{ marginTop: 4 }}>
      <h2>Home tools</h2>
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
        {myHouse && side === 'h' && <div style={{ minWidth: 260 }}>
          <label>Add another arrangement</label>
          <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
            e.g. your partner&apos;s kids with their co-parent (their own schedule and split).
          </p>
          {showNewArr ? (
            <>
              <div className="row" style={{ alignItems: 'center' }}>
                <input placeholder="Kids' names, e.g. Ava & Sam" value={arrName_} onChange={e => setArrName_(e.target.value)} />
                <UnitInput unit="%" type="number" title="your side's share" wrapStyle={{ flex: '0 0 90px' }} value={split} onChange={e => setSplit(+e.target.value)} />
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
