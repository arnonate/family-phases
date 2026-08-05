'use client';
import { useState, Fragment } from 'react';
import { useStore, sideName, kidSideName, mySide, kidName, childIdentity } from '@/lib/store';
import { supa } from '@/lib/supabase/client';
import { Modal, KidChecks, ArrTabs, useArrSelection } from '@/components/ui';
import Moon, { phaseLabel } from '@/components/Moon';
import { ArrowLeftRight, CalendarDays, MessageCircle, LayoutGrid, List } from 'lucide-react';
import { toast } from '@/components/Toast';
import CommentThread from '@/components/CommentThread';
import { confirmDelete } from '@/components/Confirm';
import {
  ds, pd, todayStr, addDays, fmt, custodyFor, daySummary, isTransfer, activityOn,
} from '@/lib/custody';

export default function CalendarPage() {
  const store = useStore();
  const { arrangements, me } = store;
  const [sel, setSel] = useArrSelection(arrangements, true);
  const now = new Date();
  const [ym, setYm] = useState([now.getFullYear(), now.getMonth()]);
  const [dayModal, setDayModal] = useState(null);      // date string
  const [devModal, setDevModal] = useState(null);      // {date} | true
  const [view, setView] = useState(() =>
    (typeof window !== 'undefined' && localStorage.getItem('fp_calview')) || 'grid');
  function switchView(v) { setView(v); try { localStorage.setItem('fp_calview', v); } catch {} }

  if (!arrangements.length) return <div className="empty">No arrangements yet.</div>;
  const readOnly = !!childIdentity(arrangements, me.id);
  const nameFor = readOnly ? kidSideName : sideName;
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
    const commentCount = shown.reduce((s, a) =>
      s + (a.day_comments || []).filter(c => c.date === dstr).length, 0);
    const acts = shown.flatMap(a =>
      (a.activities || []).filter(act => activityOn(act, dstr)).map(act => ({ ...act, arr: a })));
    return { who, transfer, dev, kidsHome, totalKids, commentCount, acts };
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
    a.deviations.filter(d => d.status !== 'proposed').map(d => ({ ...d, arr: a })))
    .sort((x, y) => (x.start_date < y.start_date ? 1 : -1));

  async function decide(dev, status) {
    const { error } = await supa().from('deviations').update({ status, decided_by: me.id }).eq('id', dev.id);
    if (error) toast.error(`Couldn't update proposal: ${error.message}`);
    store.refresh();
  }
  async function removeDev(dev) {
    if (!(await confirmDelete('Withdraw this schedule-change proposal?'))) return;
    const { error } = await supa().from('deviations').delete().eq('id', dev.id);
    if (error) toast.error(`Couldn't withdraw: ${error.message}`);
    store.refresh();
  }

  return (
    <>
      <ArrTabs arrangements={arrangements} value={sel} onChange={setSel} allLabel="All kids" />

      {pendingDevs.length > 0 && (
        <div className="approval-banner">
          {pendingDevs.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '4px 0' }}>
              <span><CalendarDays size={14} style={{ verticalAlign: '-2px' }} /> <b>Proposed:</b> kids with <b>{sideName(d.arr, d.who)}</b> {fmt(d.start_date)}
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
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="btn small subtle" onClick={() => shift(-1)}>←</button>
            <button className="btn small subtle" onClick={() => setYm([now.getFullYear(), now.getMonth()])}>Today</button>
            <button className="btn small subtle" onClick={() => shift(1)}>→</button>
            <div className="view-toggle">
              <button className={view === 'grid' ? 'on' : ''} aria-label="Month grid" onClick={() => switchView('grid')}><LayoutGrid size={14} /></button>
              <button className={view === 'list' ? 'on' : ''} aria-label="List view" onClick={() => switchView('list')}><List size={14} /></button>
            </div>
            {!readOnly && <button className="btn small" onClick={() => setDevModal({ date: tod })}>+ Propose change</button>}
          </div>
        </div>
        {view === 'grid' && <>
        <div className="cal-grid">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="cal-dow">{d}</div>)}
          {cells.map(c => {
            const info = cellInfo(c.date);
            return (
              <div key={c.date}
                className={`cal-cell ${c.other ? 'other' : ''} ${info.who ? 'who-' + info.who : ''} ${c.date === tod ? 'today' : ''}`}
                onClick={() => setDayModal(c.date)}>
                <span className="dnum">{c.num}</span>
                {info.transfer && <span className="transfer-flag" title="Transfer day"><ArrowLeftRight size={12} strokeWidth={2.5} /></span>}
                {info.who && info.who !== 'mix' && (
                  <div className={`who-tag ${info.who}`}>
                    {info.who === 'h' ? (active ? nameFor(active, 'h') : 'Home') : (active ? nameFor(active, 'c') : 'Away')}
                  </div>
                )}
                {info.who === 'mix' && (
                  <div className="who-tag" style={{ color: 'var(--purple)' }}>Split</div>
                )}
                {!active && info.who && info.totalKids > 0 && (
                  <span className="moon-flag">
                    <Moon size={14} frac={info.kidsHome.length / info.totalKids}
                      title={`${info.kidsHome.length} of ${info.totalKids} kids home`} />
                  </span>
                )}
                {info.commentCount > 0 && (
                  <span className="cmt-flag" title={`${info.commentCount} comment${info.commentCount === 1 ? '' : 's'}`}>
                    <MessageCircle size={12} strokeWidth={2.5} />{info.commentCount}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="legend">
          <span><i style={{ background: 'var(--me-soft)' }} />{active ? `With ${nameFor(active, 'h')}` : 'All kids home'}</span>
          <span><i style={{ background: 'var(--cp-soft)' }} />{active ? `With ${nameFor(active, 'c')}` : 'All kids away'}</span>
          <span><ArrowLeftRight size={12} strokeWidth={2.5} style={{ verticalAlign: '-2px' }} /> Transfer day</span>
          <span><MessageCircle size={12} strokeWidth={2.5} style={{ verticalAlign: '-2px' }} /> Comments</span>
          {!active && <span><Moon size={13} frac={0.5} /> Fill = share of kids home</span>}
        </div>
        </>}
        {view === 'list' && (
          <div>
            {[...Array(new Date(y, m + 1, 0).getDate())].map((_, i) => {
              const dstr = ds(new Date(y, m, i + 1));
              const info = cellInfo(dstr);
              return (
                <div key={dstr} className={`wl-row cal-lr ${dstr === tod ? 'today' : ''}`}
                  onClick={() => setDayModal(dstr)}>
                  <div className="wl-date">
                    <b>{pd(dstr).toLocaleDateString(undefined, { weekday: 'short' })}</b>
                    {pd(dstr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                  <div className="wl-body">
                    <div className="wl-arrs">
                      {shown.map(a => {
                        const w = daySummary(a.schedule, a.deviations, a.children, dstr);
                        return (
                          <span key={a.id} className="wl-arr">
                            {shown.length > 1 && <span className="muted">{a.name} </span>}
                            <span className={`pill ${w === 'mix' || !w ? 'cat' : w}`}>
                              {w ? (w === 'mix' ? 'Split' : nameFor(a, w)) : '—'}
                            </span>
                          </span>
                        );
                      })}
                      {info.transfer && <ArrowLeftRight size={11} strokeWidth={2.5} style={{ color: 'var(--slate-blue)' }} />}
                      {info.commentCount > 0 && (
                        <span className="mini" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <MessageCircle size={10} strokeWidth={2.5} />{info.commentCount}
                        </span>
                      )}
                    </div>
                    {info.acts.map(act => (
                      <div key={act.id} className="wl-act">
                        {act.time && <b>{act.time}</b>} {act.name}
                        {act.child_ids?.length > 0 && (
                          <span className="muted"> — {act.child_ids.map(id => kidName(act.arr, id)).join(', ')}</span>
                        )}
                        {act.location && <span className="muted"> · {act.location}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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

      {dayModal && <DayModal date={dayModal} shown={shown} me={me} store={store} readOnly={readOnly} nameFor={nameFor}
        onClose={() => setDayModal(null)}
        onPropose={d => { setDayModal(null); setDevModal({ date: d }); }} />}
      {devModal && <DeviationModal init={devModal} arrangements={arrangements}
        defaultArr={active || arrangements[0]} me={me} store={store}
        onClose={() => setDevModal(null)} />}
    </>
  );
}

function DayModal({ date, shown, me, store, readOnly, nameFor = sideName, onClose, onPropose }) {
  const [arrId, setArrId] = useState(shown[0].id);
  const comments = shown
    .flatMap(a => (a.day_comments || [])
      .filter(c => c.date === date)
      .map(c => ({ ...c, tag: shown.length > 1 ? a.name : null })))
    .sort((x, y) => (x.created_at < y.created_at ? -1 : 1));

  const allKids = shown.flatMap(a => a.children);
  const homeKids = shown.flatMap(a =>
    a.children.filter(k => custodyFor(a.schedule, a.deviations, date, k.id) === 'h'));

  return (
    <Modal title={fmt(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} onClose={onClose}>
      {allKids.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Moon size={42} frac={homeKids.length / allKids.length} title="Phase for this day" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{phaseLabel(homeKids.length, allKids.length)}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {homeKids.length ? `Home: ${homeKids.map(k => k.name).join(', ')}` : 'All kids at their other homes.'}
            </div>
          </div>
        </div>
      )}
      <div className={`day-kids-wrap ${shown.length > 1 ? '' : 'single'}`}>
        {shown.flatMap((a, ai) => {
          const groups = { h: [], c: [] };
          a.children.forEach(k => {
            const w = custodyFor(a.schedule, a.deviations, date, k.id);
            if (w) groups[w].push(k);
          });
          const cls = i => (ai > 0 && i === 0 ? 'arr-start' : '');
          const sides = ['h', 'c'].filter(s => groups[s].length > 0);
          if (!sides.length) return [(
            <Fragment key={a.id}>
              {shown.length > 1 && <b className={cls(0)}>{a.name}</b>}
              <span className={cls(0)} />
              <span className={`muted ${cls(0)}`} style={{ fontSize: 12.5 }}>Add children in Settings</span>
            </Fragment>
          )];
          return sides.map((s, i) => (
            <Fragment key={a.id + s}>
              {shown.length > 1 && <b className={cls(i)}>{i === 0 ? a.name : ''}</b>}
              <span className={cls(i)}><span className={`pill ${s}`}>{nameFor(a, s)}</span></span>
              <div className={`dk-groups ${cls(i)}`}>
                {groups[s].map(k => (
                  <span key={k.id} className="dk-kid"><span className="kid-dot" style={{ background: k.color }} />{k.name}</span>
                ))}
              </div>
            </Fragment>
          ));
        })}
      </div>
      {(() => {
        const acts = shown.flatMap(a =>
          (a.activities || []).filter(act => activityOn(act, date)).map(act => ({ ...act, arr: a })));
        if (!acts.length) return null;
        return (
          <>
            <div style={{ fontWeight: 700, fontSize: 13, margin: '12px 0 2px' }}>Activities</div>
            {acts.map(act => {
              const w = custodyFor(act.arr.schedule, act.arr.deviations, date,
                act.child_ids?.[0] || act.arr.children[0]?.id);
              return (
                <div key={act.id} className="act-row">
                  <b>{act.name}</b>
                  <span className="muted">{[act.time, act.location].filter(Boolean).join(' · ')}</span>
                  {act.child_ids?.length > 0 && (
                    <span className="muted">{act.child_ids.map(id => kidName(act.arr, id)).join(', ')}</span>
                  )}
                  {w && <span className={`pill ${w}`} title="Whose day this lands on">{nameFor(act.arr, w)}</span>}
                </div>
              );
            })}
          </>
        );
      })()}
      <div style={{ fontWeight: 700, fontSize: 13, margin: '12px 0 6px' }}>Conversation</div>
      <CommentThread
        comments={comments}
        meId={me.id}
        refresh={store.refresh}
        emptyText="No comments for this day yet."
        controls={shown.length > 1 && (
          <select value={arrId} onChange={e => setArrId(e.target.value)}
            style={{ width: 'auto', flex: 'none', padding: '7px 30px 7px 8px' }}>
            {shown.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        onPost={async body => (await supa().from('day_comments').insert({
          arrangement_id: arrId, date, author: me.id, body,
        })).error}
        onDelete={async c => (await supa().from('day_comments').delete().eq('id', c.id)).error}
      />
      <div className="actions">
        <button className="btn subtle" onClick={onClose}>Close</button>
        {!readOnly && <button className="btn" onClick={() => onPropose(date)}>Propose change</button>}
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
    if (!start || !end || end < start) { toast.error('Check the dates — the end can’t be before the start.'); return; }
    setBusy(true);
    const { error } = await supa().from('deviations').insert({
      arrangement_id: arr.id, start_date: start, end_date: end, who,
      child_ids: kids, note: note.trim() || null,
      status: otherPartyJoined ? 'proposed' : 'accepted',
      proposed_by: me.id,
    });
    setBusy(false);
    if (error) { toast.error(`Couldn't save: ${error.message}`); return; }
    if (otherPartyJoined) toast.success('Proposal sent for approval');
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
