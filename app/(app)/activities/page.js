'use client';
import { useState } from 'react';
import { useStore, mySide, childIdentity, kidName, arrName } from '@/lib/store';
import { supa } from '@/lib/supabase/client';
import { ArrTabs, useArrSelection, KidChecks } from '@/components/ui';
import { fmt } from '@/lib/custody';
import { toast } from '@/components/Toast';
import { confirmDelete } from '@/components/Confirm';
import { CalendarClock } from 'lucide-react';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function ActivitiesPage() {
  const store = useStore();
  const { arrangements, me } = store;
  const [sel, setSel] = useArrSelection(arrangements);

  if (!arrangements.length) return <div className="empty">No arrangements yet.</div>;
  const child = childIdentity(arrangements, me.id);
  const arr = child ? child.arr : (arrangements.find(a => a.id === sel) || arrangements[0]);
  const canEdit = !child && !!mySide(arr, me.id);

  return (
    <>
      {!child && <ArrTabs arrangements={arrangements} value={sel} onChange={setSel} />}
      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <CalendarClock size={28} strokeWidth={1.8} style={{ flex: 'none', marginTop: 2 }} />
        <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
          Activities are the kids&apos; recurring commitments — soccer practice, piano lessons,
          summer camp — and one-off events like a game or recital. Each one shows up on the
          calendar and in day details on the days it happens, alongside whose day it is, so
          whoever has the kids knows where they need to be. They flow into your iCal feed too.
        </p>
      </div>
      <Activities arr={arr} me={me} store={store} canEdit={canEdit} />
    </>
  );
}

function Activities({ arr, me, store, canEdit }) {
  const [showAdd, setShowAdd] = useState(false);
  const [kind, setKind] = useState('once');   // 'once' | 'recurring'
  const [name, setName] = useState('');
  const [kids, setKids] = useState([]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [days, setDays] = useState([]);
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    const once = kind === 'once';
    if (!name.trim() || !start || (!once && !end)) { toast.error(once ? 'Name and date are required.' : 'Name, start, and end dates are required.'); return; }
    if (!once && end < start) { toast.error('The end date can’t be before the start.'); return; }
    if (!once && !days.length) { toast.error('Pick at least one weekday for a recurring activity.'); return; }
    setBusy(true);
    const { error } = await supa().from('activities').insert({
      arrangement_id: arr.id, name: name.trim(), child_ids: kids,
      start_date: start, end_date: once ? start : end, days: once ? [] : days,
      time: time.trim() || null, location: location.trim() || null, created_by: me.id,
    });
    setBusy(false);
    if (error) { toast.error(`Couldn't save: ${error.message}`); return; }
    toast.success(`${name.trim()} added`);
    setShowAdd(false);
    setName(''); setKids([]); setStart(''); setEnd(''); setDays([]); setTime(''); setLocation('');
    store.refresh();
  }
  async function remove(act) {
    if (!(await confirmDelete(`Delete ${act.name} and all its calendar entries?`))) return;
    const { error } = await supa().from('activities').delete().eq('id', act.id);
    if (error) toast.error(`Couldn't delete: ${error.message}`);
    store.refresh();
  }
  const desc = act => {
    const parts = [];
    if (act.start_date === act.end_date) parts.push(fmt(act.start_date));
    else parts.push(`${(act.days || []).map(d => DOW[d]).join('')} · ${fmt(act.start_date, { month: 'short', day: 'numeric' })}–${fmt(act.end_date, { month: 'short', day: 'numeric' })}`);
    if (act.time) parts.push(act.time);
    if (act.location) parts.push(act.location);
    return parts.join(' · ');
  };

  return (
    <div className="card">
      <h2>{arrName(arr)}&apos;s activities
        {canEdit && <button className="btn small" onClick={() => setShowAdd(v => !v)}>{showAdd ? 'Cancel' : '+ Add'}</button>}
      </h2>
      {!arr.activities?.length && !showAdd && (
        <div className="empty">Nothing scheduled yet{canEdit ? ' — add a practice season or a one-time event to get it on the calendar' : ''}.</div>
      )}
      {(arr.activities || []).map(act => (
        <div key={act.id} className="todo">
          <div style={{ flex: 1 }}>
            <div className="t-title">{act.name}</div>
            <div className="t-meta">
              {desc(act)}
              {act.child_ids?.length > 0 && <> · {act.child_ids.map(id => kidName(arr, id)).join(', ')}</>}
            </div>
          </div>
          {canEdit && <button className="btn danger small" onClick={() => remove(act)}>✕</button>}
        </div>
      ))}
      {showAdd && (
        <div style={{ marginTop: 10 }}>
          <div className="field"><label>What kind?</label>
            <div className="dow-row">
              <button type="button" className={`dow wide ${kind === 'once' ? 'on' : ''}`}
                onClick={() => setKind('once')}>One-time</button>
              <button type="button" className={`dow wide ${kind === 'recurring' ? 'on' : ''}`}
                onClick={() => setKind('recurring')}>Repeats weekly</button>
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              {kind === 'once'
                ? 'A game, concert, appointment — anything that happens on one day.'
                : 'Practices, lessons, camps — pick the weekdays and the season they run.'}
            </p>
          </div>
          <div className="field"><label>{kind === 'once' ? 'Event name' : 'Activity name'}</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder={kind === 'once' ? 'e.g. Championship game, dentist appointment' : 'e.g. Soccer practice'} autoFocus /></div>
          <div className="field"><label>Which children?</label>
            <KidChecks children={arr.children} value={kids} onChange={setKids} /></div>
          {kind === 'once' ? (
            <div className="field"><label>Date</label>
              <input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
          ) : (
            <>
              <div className="row">
                <div className="field"><label>Season starts</label><input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
                <div className="field"><label>Season ends</label><input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
              </div>
              <div className="field"><label>Repeats on</label>
                <div className="dow-row">
                  {DOW.map((d, i) => (
                    <button key={i} type="button" className={`dow ${days.includes(i) ? 'on' : ''}`}
                      onClick={() => setDays(v => v.includes(i) ? v.filter(x => x !== i) : [...v, i])}>{d}</button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="row">
            <div className="field"><label>Time</label><input value={time} onChange={e => setTime(e.target.value)} placeholder="e.g. 5:30 PM" /></div>
            <div className="field"><label>Location</label><input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Riverside Park" /></div>
          </div>
          <button className="btn" disabled={busy} onClick={add}>{busy ? 'Saving…' : kind === 'once' ? 'Add event' : 'Add activity'}</button>
        </div>
      )}
    </div>
  );
}
