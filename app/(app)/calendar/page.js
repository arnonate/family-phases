'use client';
import { useState } from 'react';
import { useStore, sideName, mySide, kidName } from '@/lib/store';
import { supa } from '@/lib/supabase/client';
import { Modal, KidChecks, ArrTabs, useArrSelection } from '@/components/ui';
import Moon from '@/components/Moon';
import {
  ds, pd, todayStr, addDays, fmt, custodyFor, daySummary, isTransfer,
} from '@/lib/custody';

export default function CalendarPage() {
  const store = useStore();
  const { arrangements, me } = store;
  const [sel, setSel] = useArrSelection(arrangements, true);
  const now = new Date();
  const [ym, setYm] = useState([now.getFullYear(), now.getMonth()]);
  const [dayModal, setDayModal] = useState(null);      // date string
  const [devModal, setDevModal] = useState(null);      // {date} | true

  if (!arrangements.length) return <div className="empty">No arrangements yet.</div>;
  const active = sel === 'all' ? null : arrangements.find(a => a.id === sel);
  const shown = active ? [active] : arrangements;

  // merged summary across the shown arrangements
  function cellInfo(dstr) {
    const parts = shown.map(a => daySummary(a.schedule, a.deviations, a.children, dstr));
    const set = new Set(parts);
    const who = set.size === 1 ? [...set][0] : (set.has(null) ? null : 'mix');
    const transfer = shown.some(a => isTransfer(a.schedule, a.deviations, a.children, dstr));
    const dev = shown.some(a => a.deviations.some(d =>
      d.status === 'accepted' && dstr >= d.start_date && dstr <= d.end_date));
    const kidsHome = shown.flatMap(a =>
      a.children.filter(k => custodyFor(a.schedule, a.deviations, dstr, k.id) === 'h'));
    const totalKids = shown.reduce((s, a) => s + a.children.length, 0);
    return { who, transfer, dev, kidsHome, totalKids };
  }

  const [y, m] = ym;
  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - first.getDay());
  const tod = todayStr();
  const cells = [...Array(42)].map((_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    return { date: ds(d), num: d.getDate(), other: d.getMonth() !== m };
  });

  function shift(n) {
    let [yy, mm] = ym; mm += n;
    if (mm < 0) { mm = 11; yy--; } if (mm > 11) { mm = 0; yy++; }
    setYm([yy, mm]);
  }

  const pendingDevs = shown.flatMap(a =>
    a.deviations.filter(d => d.status === 'proposed').map(d => ({ ...d, arr: a })));
  const decidedDevs = shown.flatMap(a =>
    a.deviations.filter(d => d.status !== 'proposed').map(d => ({ ...d, arr: a })));

  async function decide(dev, status) {
    await supa().from('deviations').update({ status, decided_by: me.id }).eq('id', dev.id);
    store.refresh();
  }
  async function removeDev(dev) {
    await supa().from('deviations').delete().eq('id', dev.id);
    store.refresh();
  }

  return (
    <>
      <ArrTabs arrangements={arrangements} value={sel} onChange={setSel} allLabel="All kids" />

      {pendingDevs.length > 0 && (
        <div className="approval-banner">
          {pendingDevs.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '4px 0' }}>
              <span>📅 <b>Proposed:</b> kids with <b>{sideName(d.arr, d.who)}</b> {fmt(d.start_date)}
                {d.end_date !== d.start_date && <> – {fmt(d.end_date)}</>} {d.note && <>· {d.note}</>}</span>
              {d.proposed_by !== me.id && mySide(d.arr, me.id) && (
                <span style={{ display: 'flex', gap: 6 }}>
                  <button className="btn small green" onClick={() => decide(d, 'accepted')}>Accept</button>
                  <button className="btn small red" onClick={() => decide(d, 'declined')}>Decline</button>
                </span>
              )}
              {d.proposed_by === me.id && (
                <span className="muted" style={{ fontSize: 12.5 }}>
                  waiting for {sideName(d.arr, mySide(d.arr, me.id) === 'h' ? 'c' : 'h')} ·{' '}
                  <button className="btn danger small" onClick={() => removeDev(d)}>withdraw</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="cal-head">
          <h2>{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn small subtle" onClick={() => shift(-1)}>←</button>
            <button className="btn small subtle" onClick={() => setYm([now.getFullYear(), now.getMonth()])}>Today</button>
            <button className="btn small subtle" onClick={() => shift(1)}>→</button>
            <button className="btn small" onClick={() => setDevModal({ date: tod })}>+ Propose change</button>
          </div>
        </div>
        <div className="cal-grid">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="cal-dow">{d}</div>)}
          {cells.map(c => {
            const info = cellInfo(c.date);
            return (
              <div key={c.date}
                className={`cal-cell ${c.other ? 'other' : ''} ${info.who ? 'who-' + info.who : ''} ${c.date === tod ? 'today' : ''}`}
                onClick={() => setDayModal(c.date)}>
                <span className="dnum">{c.num}</span>
                {info.who && info.totalKids > 0 && (
                  <span style={{ float: 'right', marginTop: 1 }}>
                    <Moon size={13} frac={info.kidsHome.length / info.totalKids}
                      title={`${info.kidsHome.length} of ${info.totalKids} kids home`} />
                  </span>
                )}
                {info.transfer && <span className="transfer-flag" style={{ top: 22 }} title="Transfer day">🔁</span>}
                {info.who && info.who !== 'mix' && (
                  <div className={`who-tag ${info.who}`}>
                    {info.who === 'h' ? (active ? sideName(active, 'h') : 'Home') : (active ? sideName(active, 'c') : 'Away')}
                  </div>
                )}
                {info.who === 'mix' && (
                  <>
                    <div className="who-tag" style={{ color: 'var(--purple)' }}>Split</div>
                    <div className="badge-row">
                      {info.kidsHome.map(k => <span key={k.id} className="kid-dot" title={`${k.name} home`} style={{ background: k.color }} />)}
                    </div>
                  </>
                )}
                {info.dev && <span className="dev-flag" title="Deviation from normal schedule" />}
              </div>
            );
          })}
        </div>
        <div className="legend">
          <span><i style={{ background: 'var(--me-soft)' }} />{active ? `With ${sideName(active, 'h')}` : 'All kids home'}</span>
          <span><i style={{ background: 'var(--cp-soft)' }} />{active ? `With ${sideName(active, 'c')}` : 'All kids away'}</span>
          <span>🔁 Transfer day</span>
          <span><Moon size={13} frac={0.5} /> Lit = share of kids home</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Schedule changes</h2>
        {decidedDevs.length === 0 && <div className="empty">No deviations — the regular patterns apply.</div>}
        {decidedDevs.length > 0 && (
          <table><tbody>
            <tr><th>Dates</th><th>Kids</th><th>With</th><th>Status</th><th>Note</th></tr>
            {decidedDevs.map(d => (
              <tr key={d.id}>
                <td>{fmt(d.start_date)}{d.end_date !== d.start_date && <> – {fmt(d.end_date)}</>}</td>
                <td>{d.child_ids?.length ? d.child_ids.map(id => kidName(d.arr, id)).join(', ') : 'All'}</td>
                <td><span className={`pill ${d.who}`}>{sideName(d.arr, d.who)}</span></td>
                <td><span className={`pill ${d.status}`}>{d.status}</span></td>
                <td className="muted">{d.note}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>

      {dayModal && <DayModal date={dayModal} shown={shown} me={me}
        onClose={() => setDayModal(null)}
        onPropose={d => { setDayModal(null); setDevModal({ date: d }); }} />}
      {devModal && <DeviationModal init={devModal} arrangements={arrangements}
        defaultArr={active || arrangements[0]} me={me} store={store}
        onClose={() => setDevModal(null)} />}
    </>
  );
}

function DayModal({ date, shown, onClose, onPropose }) {
  return (
    <Modal title={fmt(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} onClose={onClose}>
      {shown.map(a => (
        <div key={a.id} style={{ marginBottom: 10 }}>
          {shown.length > 1 && <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{a.name}</div>}
          <table><tbody>
            {a.children.map(k => {
              const w = custodyFor(a.schedule, a.deviations, date, k.id);
              return (
                <tr key={k.id}>
                  <td><span className="kid-dot" style={{ background: k.color }} />{k.name}</td>
                  <td>{w ? <span className={`pill ${w}`}>{sideName(a, w)}</span> : '—'}</td>
                </tr>
              );
            })}
            {!a.children.length && <tr><td className="muted">Add children in Settings</td></tr>}
          </tbody></table>
        </div>
      ))}
      <div className="actions">
        <button className="btn subtle" onClick={onClose}>Close</button>
        <button className="btn" onClick={() => onPropose(date)}>Propose change</button>
      </div>
    </Modal>
  );
}

function DeviationModal({ init, arrangements, defaultArr, me, store, onClose }) {
  const [arrId, setArrId] = useState(defaultArr.id);
  const arr = arrangements.find(a => a.id === arrId);
  const [start, setStart] = useState(init.date || todayStr());
  const [end, setEnd] = useState(init.date || todayStr());
  const [who, setWho] = useState('h');
  const [kids, setKids] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const otherPartyJoined = (arr.arrangement_members || []).length > 1;

  async function submit() {
    if (!start || !end || end < start) { alert('Check the dates.'); return; }
    setBusy(true);
    await supa().from('deviations').insert({
      arrangement_id: arr.id, start_date: start, end_date: end, who,
      child_ids: kids, note: note.trim() || null,
      status: otherPartyJoined ? 'proposed' : 'accepted',
      proposed_by: me.id,
    });
    setBusy(false);
    store.refresh();
    onClose();
  }

  return (
    <Modal title="Propose a schedule change" onClose={onClose}>
      <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        {otherPartyJoined
          ? `This is sent to ${sideName(arr, 'h') === me.name ? sideName(arr, 'c') : 'the other parent'} for approval before it appears on the calendar.`
          : 'The co-parent hasn’t joined yet, so this takes effect immediately.'}
      </p>
      {arrangements.length > 1 && (
        <div className="field"><label>Arrangement</label>
          <select value={arrId} onChange={e => { setArrId(e.target.value); setKids([]); }}>
            {arrangements.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></div>
      )}
      <div className="row">
        <div className="field"><label>From</label><input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
        <div className="field"><label>To (inclusive)</label><input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
      </div>
      <div className="field"><label>Kids are with</label>
        <select value={who} onChange={e => setWho(e.target.value)}>
          <option value="h">{sideName(arr, 'h')}</option>
          <option value="c">{sideName(arr, 'c')}</option>
        </select></div>
      <div className="field"><label>Which children? (none checked = all)</label>
        <KidChecks children={arr.children} value={kids} onChange={setKids} /></div>
      <div className="field"><label>Note</label>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Spring break swap" /></div>
      <div className="actions">
        <button className="btn subtle" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy} onClick={submit}>{otherPartyJoined ? 'Send proposal' : 'Save'}</button>
      </div>
    </Modal>
  );
}
