'use client';
import Link from 'next/link';
import { useStore, sideName, mySide } from '@/lib/store';
import { supa } from '@/lib/supabase/client';
import {
  todayStr, addDays, fmt, pd, money, daySummary, isTransfer, nextTransfer, custodyFor, balance,
} from '@/lib/custody';
import Moon, { phaseLabel } from '@/components/Moon';
import { ArrowLeftRight } from 'lucide-react';

export default function Dashboard() {
  const store = useStore();
  const { arrangements, me } = store;
  const tod = todayStr();

  if (!arrangements.length) return <div className="empty">No arrangements yet.</div>;

  // items needing my decision (I'm a direct party and didn't create them)
  const needsMe = [];
  for (const a of arrangements) {
    if (!mySide(a, me.id)) continue;
    a.expenses.filter(e => e.status === 'pending' && e.created_by !== me.id)
      .forEach(e => needsMe.push({ type: 'expense', a, item: e }));
    a.deviations.filter(d => d.status === 'proposed' && d.proposed_by !== me.id)
      .forEach(d => needsMe.push({ type: 'deviation', a, item: d }));
  }

  const openTodos = arrangements.flatMap(a =>
    a.todos.filter(t => !t.done).map(t => ({ ...t, arr: a }))).slice(0, 8);

  async function toggleTodo(t) {
    await supa().from('todos').update({ done: !t.done }).eq('id', t.id);
    store.refresh();
  }

  const totalKids = arrangements.reduce((s, a) => s + a.children.length, 0);
  const homeKidsAll = arrangements.flatMap(a =>
    a.children.filter(k => custodyFor(a.schedule, a.deviations, tod, k.id) === 'h'));

  return (
    <>
      {totalKids > 0 && (
        <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Moon size={52} frac={homeKidsAll.length / totalKids} title="Tonight's phase" />
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Tonight&apos;s phase: {phaseLabel(homeKidsAll.length, totalKids)}</div>
            <div className="muted" style={{ fontSize: 13.5 }}>
              {homeKidsAll.length ? `Home: ${homeKidsAll.map(k => k.name).join(', ')}` : 'All kids at their other homes tonight.'}
            </div>
          </div>
        </div>
      )}
      {needsMe.length > 0 && (
        <div className="approval-banner">
          <b>Waiting on you:</b>{' '}
          {needsMe.map((n, i) => (
            <span key={i}>
              {n.type === 'expense'
                ? <>a {money(Number(n.item.amount))} expense</>
                : <>a schedule change ({fmt(n.item.start_date)})</>}
              {' '}in <b>{n.a.name}</b> — review it on the{' '}
              <Link href={n.type === 'expense' ? '/expenses' : '/calendar'}>
                {n.type === 'expense' ? 'Expenses' : 'Calendar'} page</Link>.{' '}
            </span>
          ))}
        </div>
      )}

      {arrangements.map(a => {
        const sum = daySummary(a.schedule, a.deviations, a.children, tod);
        const nt = nextTransfer(a.schedule, a.deviations, a.children, addDays(tod, -1));
        const bal = balance(a, a.expenses, a.settlements);
        const homeKids = a.children.filter(k => custodyFor(a.schedule, a.deviations, tod, k.id) === 'h');
        return (
          <div key={a.id} style={{ marginBottom: 20 }}>
            {arrangements.length > 1 && <h2 style={{ fontSize: 16, margin: '4px 0 10px' }}>{a.name}</h2>}
            <div className="grid cols-3" style={{ marginBottom: 12 }}>
              <div className="card">
                <h2>Tonight the kids are with</h2>
                <div className="stat">
                  {!a.schedule?.anchor_date ? <>—<small>Set the schedule in Settings</small></>
                    : sum === 'mix' ? <>Split<small>Home: {homeKids.map(k => k.name).join(', ') || 'none'}</small></>
                    : <>{sideName(a, sum)}<small>{sum === 'h' ? 'Enjoy the evening together' : 'Quiet night at your place'}</small></>}
                </div>
              </div>
              <div className="card">
                <h2>Next transfer</h2>
                <div className="stat">
                  {nt ? <>{nt === tod ? 'Today' : fmt(nt)}<small>{a.transfer_time || ''}</small></>
                      : <>—<small>None in the next 60 days</small></>}
                </div>
              </div>
              <div className="card">
                <h2>Balance</h2>
                <div className={`stat ${Math.abs(bal) < 0.005 ? '' : bal > 0 ? 'neg' : 'pos'}`}>
                  {money(Math.abs(bal))}
                  <small>
                    {Math.abs(bal) < 0.005 ? 'All settled up'
                      : bal > 0 ? `${sideName(a, 'h')} owes ${sideName(a, 'c')}`
                      : `${sideName(a, 'c')} owes ${sideName(a, 'h')}`}
                  </small>
                </div>
              </div>
            </div>
            <div className="card">
              <h2>Next 7 days <span className="sub">{fmt(tod, { month: 'short', day: 'numeric' })} – {fmt(addDays(tod, 6), { month: 'short', day: 'numeric' })}</span></h2>
              <div className="week-strip">
                {[...Array(7)].map((_, i) => {
                  const d = addDays(tod, i);
                  const w = daySummary(a.schedule, a.deviations, a.children, d);
                  return (
                    <div key={d} className={`ws-day ${w && w !== 'mix' ? 'who-' + w : ''}`}>
                      <b>{pd(d).toLocaleDateString(undefined, { weekday: 'short' })}</b>
                      {pd(d).getDate()}{isTransfer(a.schedule, a.deviations, a.children, d) && <> <ArrowLeftRight size={9} strokeWidth={2.5} /></>}
                      <div style={{ fontWeight: 700, fontSize: 10.5, color: w === 'h' ? 'var(--me)' : w === 'c' ? '#b45309' : 'var(--purple)' }}>
                        {w ? (w === 'mix' ? 'Split' : sideName(a, w)) : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      <div className="card">
        <h2>Open to-dos <Link href="/todos" className="sub">see all →</Link></h2>
        {openTodos.length === 0 && <div className="empty">All clear — no open to-dos.</div>}
        {openTodos.map(t => {
          const overdue = t.due && t.due < tod;
          return (
            <div key={t.id} className="todo">
              <input type="checkbox" checked={false} onChange={() => toggleTodo(t)} />
              <div style={{ flex: 1 }}>
                <div className="t-title">{t.title}</div>
                <div className="t-meta">
                  {t.due && <span className={overdue ? 'overdue' : ''}>{overdue ? 'Overdue · ' : ''}{t.due === tod ? 'Today' : fmt(t.due)}</span>}
                  {arrangements.length > 1 && <>{t.due ? ' · ' : ''}{t.arr.name}</>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
