'use client';
import { useState } from 'react';
import { useStore, kidName } from '@/lib/store';
import { supa } from '@/lib/supabase/client';
import { Modal, ArrTabs, useArrSelection } from '@/components/ui';
import { todayStr, fmt } from '@/lib/custody';
import { User } from 'lucide-react';
import { toast } from '@/components/Toast';

export default function TodosPage() {
  const store = useStore();
  const { arrangements, me } = store;
  const [sel, setSel] = useArrSelection(arrangements, true);
  const [showAdd, setShowAdd] = useState(false);

  if (!arrangements.length) return <div className="empty">No arrangements yet.</div>;
  const shown = sel === 'all' ? arrangements : arrangements.filter(a => a.id === sel);
  const todos = shown.flatMap(a => a.todos.map(t => ({ ...t, arr: a })))
    .sort((a, b) => (a.done - b.done) || ((a.due || '9999') < (b.due || '9999') ? -1 : 1));
  const tod = todayStr();

  async function toggle(t) {
    await supa().from('todos').update({ done: !t.done }).eq('id', t.id);
    store.refresh();
  }
  async function remove(t) {
    await supa().from('todos').delete().eq('id', t.id);
    store.refresh();
  }
  function assigneeName(t) {
    const m = (t.arr.arrangement_members || []).find(x => x.user_id === t.assigned_to);
    return m?.profiles?.name || m?.profiles?.email || null;
  }

  return (
    <>
      <ArrTabs arrangements={arrangements} value={sel} onChange={setSel} allLabel="All" />
      <div className="card">
        <h2>To-dos &amp; reminders <button className="btn small" onClick={() => setShowAdd(true)}>+ Add</button></h2>
        {todos.length === 0 && <div className="empty">Nothing here. Add reminders for forms, payments, gear to pack, pickups…</div>}
        {todos.map(t => {
          const overdue = !t.done && t.due && t.due < tod;
          const assignee = assigneeName(t);
          return (
            <div key={t.id} className={`todo ${t.done ? 'done' : ''}`}>
              <input type="checkbox" checked={t.done} onChange={() => toggle(t)} />
              <div style={{ flex: 1 }}>
                <div className="t-title">{t.title}</div>
                <div className="t-meta">
                  {t.due && <span className={overdue ? 'overdue' : ''}>{overdue ? 'Overdue · ' : ''}{t.due === tod ? 'Today' : fmt(t.due)}</span>}
                  {t.child_id && <> · {kidName(t.arr, t.child_id)}</>}
                  {assignee && <> · <User size={11} style={{ verticalAlign: '-1px' }} /> {assignee}{t.assigned_to === me.id && ' (you)'}</>}
                  {arrangements.length > 1 && <> · {t.arr.name}</>}
                </div>
              </div>
              <button className="btn danger small" onClick={() => remove(t)}>✕</button>
            </div>
          );
        })}
      </div>
      {showAdd && <AddTodo arrangements={arrangements}
        defaultArr={sel === 'all' ? arrangements[0] : arrangements.find(a => a.id === sel)}
        me={me} store={store} onClose={() => setShowAdd(false)} />}
    </>
  );
}

function AddTodo({ arrangements, defaultArr, me, store, onClose }) {
  const [arrId, setArrId] = useState(defaultArr.id);
  const arr = arrangements.find(a => a.id === arrId);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [childId, setChildId] = useState('');
  const [assignee, setAssignee] = useState('');

  async function submit() {
    if (!title.trim()) { toast.error('Give the to-do a name.'); return; }
    const { error } = await supa().from('todos').insert({
      arrangement_id: arr.id, title: title.trim(), due: due || null,
      child_id: childId || null, assigned_to: assignee || null, created_by: me.id,
    });
    if (error) { toast.error(`Couldn't save to-do: ${error.message}`); return; }
    store.refresh();
    onClose();
  }

  return (
    <Modal title="Add to-do / reminder" onClose={onClose}>
      <div className="field"><label>What needs doing?</label>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Turn in field-trip form" /></div>
      {arrangements.length > 1 && (
        <div className="field"><label>Arrangement</label>
          <select value={arrId} onChange={e => { setArrId(e.target.value); setChildId(''); setAssignee(''); }}>
            {arrangements.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></div>
      )}
      <div className="row">
        <div className="field"><label>Due date (optional)</label>
          <input type="date" value={due} onChange={e => setDue(e.target.value)} /></div>
        <div className="field"><label>Child (optional)</label>
          <select value={childId} onChange={e => setChildId(e.target.value)}>
            <option value="">—</option>
            {arr.children.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select></div>
      </div>
      <div className="field"><label>Assign to (optional)</label>
        <select value={assignee} onChange={e => setAssignee(e.target.value)}>
          <option value="">—</option>
          {(arr.arrangement_members || []).map(m => (
            <option key={m.user_id} value={m.user_id}>
              {m.profiles?.name || m.profiles?.email}{m.user_id === me.id ? ' (you)' : ''}
            </option>
          ))}
        </select></div>
      <div className="actions">
        <button className="btn subtle" onClick={onClose}>Cancel</button>
        <button className="btn" onClick={submit}>Save</button>
      </div>
    </Modal>
  );
}
