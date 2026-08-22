'use client';
import { useState } from 'react';
import { useStore, sideName, mySide, kidName, bothSidesJoined, isViewer, arrName } from '@/lib/store';
import { supa } from '@/lib/supabase/client';
import { Modal, KidChecks, ArrTabs, useArrSelection, UnitInput } from '@/components/ui';
import { todayStr, fmt, money, balance, expenseSplit, CATS } from '@/lib/custody';
import { Banknote, Paperclip } from 'lucide-react';
import { toast } from '@/components/Toast';
import { confirmDelete, confirmAction } from '@/components/Confirm';

export default function ExpensesPage() {
  const store = useStore();
  const { arrangements, me } = store;
  const [sel, setSel] = useArrSelection(arrangements);
  const [monthFilter, setMonthFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [showSettle, setShowSettle] = useState(false);

  if (!arrangements.length) return <div className="empty">No arrangements yet.</div>;
  const arr = arrangements.find(a => a.id === sel) || arrangements[0];
  const side = mySide(arr, me.id);
  const bal = balance(arr, arr.expenses, arr.settlements);
  const nowM = todayStr().slice(0, 7);
  const months = [...new Set(arr.expenses.map(e => e.date.slice(0, 7)))].sort().reverse();
  const rows = arr.expenses.filter(e => monthFilter === 'all' || e.date.startsWith(monthFilter));
  const mExp = arr.expenses.filter(e => e.date.startsWith(nowM) && e.status === 'approved');
  const mTot = mExp.reduce((s, e) => s + Number(e.amount), 0);
  const pending = arr.expenses.filter(e => e.status === 'pending');

  async function decide(e, status) {
    let decision_note = null;
    if (status === 'disputed') {
      const r = await confirmAction({
        title: 'Dispute this expense?',
        message: 'The other home will be notified. A short reason helps sort it out.',
        confirmLabel: 'Dispute', withReason: true, reasonPlaceholder: 'e.g. Receipt shows a different amount (optional)',
      });
      if (!r) return;
      decision_note = r.reason;
    }
    const { error } = await supa().from('expenses')
      .update({ status, decided_by: me.id, decision_note }).eq('id', e.id);
    if (error) toast.error(`Couldn't update expense: ${error.message}`);
    store.refresh();
  }
  async function remove(e) {
    if (!(await confirmDelete(`Delete this ${money(Number(e.amount))} expense? This can’t be undone.`))) return;
    const { error } = await supa().from('expenses').delete().eq('id', e.id);
    if (error) toast.error(`Couldn't delete: ${error.message}`);
    store.refresh();
  }
  async function removeSettle(p) {
    if (!(await confirmDelete(`Delete this ${money(Number(p.amount))} payment? The balance will change accordingly.`))) return;

    const { error } = await supa().from('settlements').delete().eq('id', p.id);
    if (error) toast.error(`Couldn't delete: ${error.message}`);
    store.refresh();
  }
  async function viewReceipt(e) {
    const { data, error } = await supa().storage.from('receipts').createSignedUrl(e.receipt_path, 300);
    if (error) toast.error(`Couldn't open receipt: ${error.message}`);
    else window.open(data.signedUrl, '_blank');
  }

  function exportLedger() {
    const events = [
      ...arr.expenses.filter(e => e.status === 'approved').map(e => ({
        date: e.date, kind: 'Expense', category: e.category,
        description: e.description || '', children: (e.child_ids || []).map(id => kidName(arr, id)).join('; '),
        amount: Number(e.amount), paid_by: sideName(arr, e.paid_by),
        // effect on "household owes co-parent" balance
        share: Number(e.amount) * expenseSplit(arr, e),
        delta: e.paid_by === 'c'
          ? Number(e.amount) * expenseSplit(arr, e)
          : -Number(e.amount) * (1 - expenseSplit(arr, e)),
      })),
      ...arr.settlements.map(p => ({
        date: p.date, kind: 'Payment', category: '',
        description: p.note || '', children: '',
        amount: Number(p.amount),
        paid_by: p.direction === 'h2c' ? `${sideName(arr, 'h')} → ${sideName(arr, 'c')}` : `${sideName(arr, 'c')} → ${sideName(arr, 'h')}`,
        delta: p.direction === 'h2c' ? -Number(p.amount) : Number(p.amount),
      })),
    ].sort((a, b) => (a.date < b.date ? -1 : 1));

    let run = 0;
    const q = v => '"' + String(v).replaceAll('"', '""') + '"';
    const lines = [
      ['Date','Type','Category','Description','Children','Amount','Paid by',
       `${sideName(arr,'h')} share`,
       `Running balance (+ = ${sideName(arr,'h')} owes ${sideName(arr,'c')})`].map(q).join(','),
      ...events.map(ev => {
        run += ev.delta;
        return [ev.date, ev.kind, ev.category, ev.description, ev.children,
          ev.amount.toFixed(2), ev.paid_by,
          ev.kind === 'Expense' ? ev.share.toFixed(2) : '',
          run.toFixed(2)].map(q).join(',');
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `family-phases-ledger-${arrName(arr).replaceAll(' ', '-')}-${todayStr()}.csv`;
    a.click();
  }

  return (
    <>
      <ArrTabs arrangements={arrangements} value={sel} onChange={setSel} />

      {pending.length > 0 && (
        <div className="approval-banner">
          {pending.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '4px 0' }}>
              <span><Banknote size={14} style={{ verticalAlign: '-2px' }} /> <b>{money(Number(e.amount))}</b> {e.category.toLowerCase()} — {e.description || 'no description'}
                {' '}(paid by {sideName(arr, e.paid_by)}, over the {money(Number(arr.approval_threshold))} threshold
                {e.split_pct != null && <>, custom split {e.split_pct}/{100 - e.split_pct}</>})</span>
              {side && mySide(arr, e.created_by) !== side ? (
                <span style={{ display: 'flex', gap: 6 }}>
                  <button className="btn small green" onClick={() => decide(e, 'approved')}>Approve</button>
                  <button className="btn small red" onClick={() => decide(e, 'disputed')}>Dispute</button>
                </span>
              ) : (
                <span className="muted" style={{ fontSize: 12.5 }}>awaiting approval</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid cols-3 exp-stats" style={{ marginBottom: 16 }}>
        <div className="card"><h2>Balance</h2>
          <div className={`stat ${Math.abs(bal) < 0.005 ? '' : bal > 0 ? 'neg' : 'pos'}`}>
            {money(Math.abs(bal))}
            <small>{Math.abs(bal) < 0.005 ? 'All settled up'
              : bal > 0 ? `${sideName(arr, 'h')} owes ${sideName(arr, 'c')}`
              : `${sideName(arr, 'c')} owes ${sideName(arr, 'h')}`}</small>
          </div>
        </div>
        <div className="card"><h2>This month (approved)</h2>
          <div className="stat">{money(mTot)}<small>{mExp.length} expense{mExp.length === 1 ? '' : 's'}</small></div>
        </div>
        <div className="card"><h2>{side === 'h' ? 'My share this month' : `${sideName(arr, 'h')}'s share this month`}</h2>
          <div className="stat">{money(mExp.reduce((s, e) => s + Number(e.amount) * expenseSplit(arr, e), 0))}
            <small>{arr.split_pct}% default split</small></div>
        </div>
      </div>

      <div className="card">
        <h2>Expenses
          <select style={{ width: 'auto' }} value={monthFilter} onChange={e => setMonthFilter(e.target.value)}>
            <option value="all">All months</option>
            {months.map(m => <option key={m} value={m}>{new Date(m + '-15').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</option>)}
          </select>
        </h2>
        <div className="exp-actions">
          <button className="btn small subtle" onClick={exportLedger}>Export ledger (CSV)</button>
          {side && <button className="btn small" onClick={() => setShowAdd(true)}>+ Add expense</button>}
        </div>
        {rows.length === 0 && <div className="empty">No expenses{monthFilter !== 'all' ? ' this month' : ' yet'}.</div>}
        {rows.length > 0 && (
          <div className="exp-cards">
            {rows.map(e => (
              <div key={e.id} className="exp-item">
                <div className="ei-top">
                  <b>{money(Number(e.amount))}</b>
                  <span className="pill cat">{e.category}</span>
                  <span className={`pill ${e.status}`}>{e.status}</span>
                  <span className="ei-date">{fmt(e.date, { month: 'short', day: 'numeric' })}</span>
                </div>
                {(e.description || e.receipt_path || e.decision_note) && (
                  <div className="ei-desc">{e.description}
                    {e.decision_note && <span className="muted"> · {e.status}: {e.decision_note}</span>}
                    {e.receipt_path && <> <a onClick={() => viewReceipt(e)} style={{ cursor: 'pointer' }} title="View receipt"><Paperclip size={13} style={{ verticalAlign: '-2px' }} /></a></>}
                  </div>
                )}
                <div className="ei-meta">
                  <span>
                    paid by {sideName(arr, e.paid_by)}
                    {(e.child_ids || []).length > 0 && <> · {e.child_ids.map(id => kidName(arr, id)).join(', ')}</>}
                    {' '}· {side === 'h' ? 'my' : `${sideName(arr, 'h')}'s`} share {money(Number(e.amount) * expenseSplit(arr, e))}
                    {e.split_pct != null && <span className="mini" style={{ marginLeft: 4 }}>{e.split_pct}%</span>}
                  </span>
                  {e.created_by === me.id && e.status !== 'pending' &&
                    <button className="btn danger small" onClick={() => remove(e)}>✕</button>}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="exp-table" style={{ overflowX: 'auto' }}>
          {rows.length > 0 && (
            <table><tbody>
              <tr><th>Date</th><th>Child</th><th>Category</th><th>Description</th>
                <th className="right">Amount</th><th>Paid by</th>
                <th className="right">{side === 'h' ? 'My share' : `${sideName(arr, 'h')}'s share`}</th><th>Status</th><th></th></tr>
              {rows.map(e => (
                <tr key={e.id}>
                  <td>{fmt(e.date, { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                  <td>{(e.child_ids || []).map(id => kidName(arr, id)).join(', ') || '—'}</td>
                  <td><span className="pill cat">{e.category}</span></td>
                  <td>{e.description}
                    {e.decision_note && <span className="muted"> · {e.status}: {e.decision_note}</span>}
                    {e.receipt_path && <> <a onClick={() => viewReceipt(e)} style={{ cursor: 'pointer' }} title="View receipt"><Paperclip size={13} style={{ verticalAlign: '-2px' }} /></a></>}</td>
                  <td className="right">{money(Number(e.amount))}</td>
                  <td><span className={`pill ${e.paid_by}`}>{sideName(arr, e.paid_by)}</span></td>
                  <td className="right">{money(Number(e.amount) * expenseSplit(arr, e))}
                    {e.split_pct != null && <span className="mini" title={`Custom split: ${e.split_pct}/${100 - e.split_pct}`} style={{ marginLeft: 4 }}>{e.split_pct}%</span>}</td>
                  <td><span className={`pill ${e.status}`}>{e.status}</span></td>
                  <td className="right">{e.created_by === me.id && e.status !== 'pending' &&
                    <button className="btn danger small" onClick={() => remove(e)}>✕</button>}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Payments / settlements
          {side && <button className="btn small" onClick={() => setShowSettle(true)}>+ Record payment</button>}
        </h2>
        {arr.settlements.length === 0 && <div className="empty">No payments recorded yet.</div>}
        {arr.settlements.length > 0 && (
          <div className="exp-cards">
            {arr.settlements.map(p => (
              <div key={p.id} className="exp-item">
                <div className="ei-top">
                  <b>{money(Number(p.amount))}</b>
                  <span className="pill cat">{p.direction === 'h2c'
                    ? `${sideName(arr, 'h')} → ${sideName(arr, 'c')}`
                    : `${sideName(arr, 'c')} → ${sideName(arr, 'h')}`}</span>
                  <span className="ei-date">{fmt(p.date, { month: 'short', day: 'numeric' })}</span>
                </div>
                <div className="ei-meta">
                  <span>{p.note || ''}</span>
                  {p.created_by === me.id && <button className="btn danger small" onClick={() => removeSettle(p)}>✕</button>}
                </div>
              </div>
            ))}
          </div>
        )}
        {arr.settlements.length > 0 && (
          <div className="exp-table" style={{ overflowX: 'auto' }}>
            <table><tbody>
              <tr><th>Date</th><th>Payment</th><th className="right">Amount</th><th>Note</th><th></th></tr>
              {arr.settlements.map(p => (
                <tr key={p.id}>
                  <td>{fmt(p.date, { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                  <td>{p.direction === 'h2c'
                    ? `${sideName(arr, 'h')} → ${sideName(arr, 'c')}`
                    : `${sideName(arr, 'c')} → ${sideName(arr, 'h')}`}</td>
                  <td className="right">{money(Number(p.amount))}</td>
                  <td className="muted">{p.note}</td>
                  <td className="right">{p.created_by === me.id &&
                    <button className="btn danger small" onClick={() => removeSettle(p)}>✕</button>}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}
      </div>

      {showAdd && <AddExpense arr={arr} me={me} store={store} onClose={() => setShowAdd(false)} />}
      {showSettle && <Settle arr={arr} me={me} bal={bal} store={store} onClose={() => setShowSettle(false)} />}
    </>
  );
}

function AddExpense({ arr, me, store, onClose }) {
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATS[0]);
  const [paidBy, setPaidBy] = useState(mySide(arr, me.id) || 'h');
  const [kids, setKids] = useState([]);
  const [desc, setDesc] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const [splitChoice, setSplitChoice] = useState('default');
  const [customPct, setCustomPct] = useState(arr.split_pct);

  const otherPartyJoined = bothSidesJoined(arr);
  const amt = parseFloat(amount);

  // Resolve the choice to an h-side share; null = arrangement default.
  const splitOverride =
    splitChoice === 'default' ? null
    : splitChoice === 'even' ? 50
    : splitChoice === 'payback' ? (paidBy === 'h' ? 0 : 100)     // payer fully reimbursed
    : splitChoice === 'no-reimburse' ? (paidBy === 'h' ? 100 : 0) // payer covers it all
    : Math.min(100, Math.max(0, +customPct || 0));
  const hPct = splitOverride ?? arr.split_pct;
  const otherOwes = !(amt > 0) ? null
    : paidBy === 'h' ? amt * (100 - hPct) / 100 : amt * hPct / 100;
  // Approval protects whoever ends up owing; an expense the payer fully
  // covers burdens nobody, so it never needs sign-off.
  const needsApproval = otherPartyJoined && amt > Number(arr.approval_threshold) && otherOwes > 0;

  async function submit() {
    if (!date || !(amt > 0)) { toast.error('Enter a date and a positive amount.'); return; }
    setBusy(true);
    const s = supa();
    let receipt_path = null;
    if (file) {
      const path = `${arr.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
      const { error } = await s.storage.from('receipts').upload(path, file);
      if (error) { toast.error(`Receipt upload failed: ${error.message}`); setBusy(false); return; }
      receipt_path = path;
    }
    const { error } = await s.from('expenses').insert({
      arrangement_id: arr.id, date, amount: amt, category,
      description: desc.trim() || null, child_ids: kids, paid_by: paidBy,
      receipt_path, status: needsApproval ? 'pending' : 'approved', created_by: me.id,
      split_pct: splitOverride,
    });
    setBusy(false);
    if (error) { toast.error(`Couldn't save expense: ${error.message}`); return; }
    store.refresh();
    onClose();
  }

  return (
    <Modal title="Add expense" onClose={onClose}>
      <div className="row">
        <div className="field"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="field"><label>Amount</label><UnitInput unit="USD" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div>
      </div>
      <div className="row">
        <div className="field"><label>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label>Paid by</label>
          <select value={paidBy} onChange={e => setPaidBy(e.target.value)}>
            <option value="h">{sideName(arr, 'h')}</option>
            <option value="c">{sideName(arr, 'c')}</option>
          </select></div>
      </div>
      <div className="field"><label>Child(ren)</label><KidChecks children={arr.children} value={kids} onChange={setKids} /></div>
      <div className="field"><label>Description</label><input value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Soccer registration, copay…" /></div>
      <div className="field"><label>Receipt (optional)</label>
        <input type="file" accept="image/*,.pdf" onChange={e => setFile(e.target.files[0] || null)} /></div>
      <div className="row">
        <div className="field"><label>Split</label>
          <select value={splitChoice} onChange={e => setSplitChoice(e.target.value)}>
            <option value="default">Default ({arr.split_pct}/{100 - arr.split_pct})</option>
            <option value="even">50/50</option>
            <option value="payback">Fully paid back to {sideName(arr, paidBy)}</option>
            <option value="no-reimburse">{sideName(arr, paidBy)} covers it all</option>
            <option value="custom">Custom…</option>
          </select></div>
        {splitChoice === 'custom' && (
          <div className="field"><label>{sideName(arr, 'h')}&apos;s share</label>
            <UnitInput unit="%" type="number" min="0" max="100" value={customPct} onChange={e => setCustomPct(e.target.value)} /></div>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>
        {sideName(arr, 'h')} covers <b>{hPct}%</b>, {sideName(arr, 'c')} covers {100 - hPct}%.
        {otherOwes != null && <> {sideName(arr, paidBy === 'h' ? 'c' : 'h')} owes <b>{money(otherOwes)}</b> of this.</>}
        {needsApproval && <> This is over {money(Number(arr.approval_threshold))}, so it needs the other parent&apos;s approval before it counts toward the balance.</>}
        {otherPartyJoined && amt > Number(arr.approval_threshold) && !(otherOwes > 0) && <> No approval needed — nobody else owes anything on this.</>}
      </p>
      <div className="actions">
        <button className="btn subtle" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Saving…' : needsApproval ? 'Submit for approval' : 'Save'}</button>
      </div>
    </Modal>
  );
}

function Settle({ arr, me, bal, store, onClose }) {
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState(Math.abs(bal) > 0.005 ? Math.abs(bal).toFixed(2) : '');
  const [direction, setDirection] = useState(bal >= 0 ? 'h2c' : 'c2h');
  const [note, setNote] = useState('');

  async function submit() {
    const amt = parseFloat(amount);
    if (!(amt > 0)) { toast.error('Enter a positive amount.'); return; }
    const { error } = await supa().from('settlements').insert({
      arrangement_id: arr.id, date, amount: amt, direction, note: note.trim() || null, created_by: me.id,
    });
    if (error) { toast.error(`Couldn't record payment: ${error.message}`); return; }
    store.refresh();
    onClose();
  }

  return (
    <Modal title="Record a payment" onClose={onClose}>
      <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Current balance: <b>{money(Math.abs(bal))}</b>{' '}
        {Math.abs(bal) < 0.005 ? '(settled)' : bal > 0 ? `— ${sideName(arr, 'h')} owes ${sideName(arr, 'c')}` : `— ${sideName(arr, 'c')} owes ${sideName(arr, 'h')}`}
      </p>
      <div className="row">
        <div className="field"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="field"><label>Amount</label><UnitInput unit="USD" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
      </div>
      <div className="field"><label>Direction</label>
        <select value={direction} onChange={e => setDirection(e.target.value)}>
          <option value="h2c">{sideName(arr, 'h')} paid {sideName(arr, 'c')}</option>
          <option value="c2h">{sideName(arr, 'c')} paid {sideName(arr, 'h')}</option>
        </select></div>
      <div className="field"><label>Note</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Venmo, July settle-up" /></div>
      <div className="actions">
        <button className="btn subtle" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={submit}>Save</button>
      </div>
    </Modal>
  );
}
