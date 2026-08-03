'use client';
import { useState } from 'react';
import { useStore, sideName, mySide, kidName } from '@/lib/store';
import { supa } from '@/lib/supabase/client';
import { Modal, KidChecks, ArrTabs, useArrSelection, UnitInput } from '@/components/ui';
import { todayStr, fmt, money, balance, CATS } from '@/lib/custody';
import { Banknote, Paperclip } from 'lucide-react';
import { toast } from '@/components/Toast';

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
    const { error } = await supa().from('expenses').update({ status, decided_by: me.id }).eq('id', e.id);
    if (error) toast.error(`Couldn't update expense: ${error.message}`);
    store.refresh();
  }
  async function remove(e) {
    if (!confirm('Delete this expense?')) return;
    const { error } = await supa().from('expenses').delete().eq('id', e.id);
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
        delta: e.paid_by === 'c' ? Number(e.amount) * arr.split_pct / 100 : -Number(e.amount) * (100 - arr.split_pct) / 100,
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
       `${sideName(arr,'h')} share (${arr.split_pct}%)`,
       `Running balance (+ = ${sideName(arr,'h')} owes ${sideName(arr,'c')})`].map(q).join(','),
      ...events.map(ev => {
        run += ev.delta;
        return [ev.date, ev.kind, ev.category, ev.description, ev.children,
          ev.amount.toFixed(2), ev.paid_by,
          ev.kind === 'Expense' ? (ev.amount * arr.split_pct / 100).toFixed(2) : '',
          run.toFixed(2)].map(q).join(',');
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `family-phases-ledger-${arr.name.replaceAll(' ', '-')}-${todayStr()}.csv`;
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
                {' '}(paid by {sideName(arr, e.paid_by)}, over the {money(Number(arr.approval_threshold))} threshold)</span>
              {e.created_by !== me.id && side ? (
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

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
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
          <div className="stat">{money(mTot * arr.split_pct / 100)}<small>{arr.split_pct}% of shared costs</small></div>
        </div>
      </div>

      <div className="card">
        <h2>Expenses
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select style={{ width: 'auto' }} value={monthFilter} onChange={e => setMonthFilter(e.target.value)}>
              <option value="all">All months</option>
              {months.map(m => <option key={m} value={m}>{new Date(m + '-15').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</option>)}
            </select>
            <button className="btn small subtle" onClick={exportLedger}>Export ledger (CSV)</button>
            <button className="btn small subtle" onClick={() => setShowSettle(true)}>Record payment</button>
            <button className="btn small" onClick={() => setShowAdd(true)}>+ Add expense</button>
          </span>
        </h2>
        <div style={{ overflowX: 'auto' }}>
          {rows.length === 0 ? <div className="empty">No expenses{monthFilter !== 'all' ? ' this month' : ' yet'}.</div> : (
            <table><tbody>
              <tr><th>Date</th><th>Child</th><th>Category</th><th>Description</th>
                <th className="right">Amount</th><th>Paid by</th>
                <th className="right">{side === 'h' ? 'My share' : `${sideName(arr, 'h')}'s share`}</th><th>Status</th><th></th></tr>
              {rows.map(e => (
                <tr key={e.id}>
                  <td>{fmt(e.date, { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                  <td>{(e.child_ids || []).map(id => kidName(arr, id)).join(', ') || '—'}</td>
                  <td><span className="pill cat">{e.category}</span></td>
                  <td>{e.description}{e.receipt_path && <> <a onClick={() => viewReceipt(e)} style={{ cursor: 'pointer' }} title="View receipt"><Paperclip size={13} style={{ verticalAlign: '-2px' }} /></a></>}</td>
                  <td className="right">{money(Number(e.amount))}</td>
                  <td><span className={`pill ${e.paid_by}`}>{sideName(arr, e.paid_by)}</span></td>
                  <td className="right">{money(Number(e.amount) * arr.split_pct / 100)}</td>
                  <td><span className={`pill ${e.status}`}>{e.status}</span></td>
                  <td className="right">{(e.created_by === me.id && e.status !== 'approved') &&
                    <button className="btn danger small" onClick={() => remove(e)}>✕</button>}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Payments / settlements</h2>
        {arr.settlements.length === 0 ? <div className="empty">No payments recorded yet.</div> : (
          <table><tbody>
            <tr><th>Date</th><th>Payment</th><th className="right">Amount</th><th>Note</th></tr>
            {arr.settlements.map(p => (
              <tr key={p.id}>
                <td>{fmt(p.date, { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                <td>{p.direction === 'h2c'
                  ? `${sideName(arr, 'h')} → ${sideName(arr, 'c')}`
                  : `${sideName(arr, 'c')} → ${sideName(arr, 'h')}`}</td>
                <td className="right">{money(Number(p.amount))}</td>
                <td className="muted">{p.note}</td>
              </tr>
            ))}
          </tbody></table>
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

  const otherPartyJoined = (arr.arrangement_members || []).length > 1;
  const amt = parseFloat(amount);
  const needsApproval = otherPartyJoined && amt > Number(arr.approval_threshold);

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
      <p className="muted" style={{ fontSize: 12.5 }}>
        Split: {sideName(arr, 'h')} covers <b>{arr.split_pct}%</b>, {sideName(arr, 'c')} covers {100 - arr.split_pct}%.
        {needsApproval && <> This is over {money(Number(arr.approval_threshold))}, so it needs the other parent&apos;s approval before it counts toward the balance.</>}
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
