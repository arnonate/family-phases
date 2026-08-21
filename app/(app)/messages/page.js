'use client';
import { useState } from 'react';
import { useStore, mySide, childIdentity, arrName } from '@/lib/store';
import { supa } from '@/lib/supabase/client';
import { Modal, ArrTabs, useArrSelection, GrowText, Explainer } from '@/components/ui';
import { toast } from '@/components/Toast';
import { confirmDelete } from '@/components/Confirm';
import CommentThread from '@/components/CommentThread';
import { MessageCircle, MessagesSquare } from 'lucide-react';

export default function MessagesPage() {
  const store = useStore();
  const { arrangements, me } = store;
  const [sel, setSel] = useArrSelection(arrangements, true);
  const [showNew, setShowNew] = useState(false);
  const [openPost, setOpenPost] = useState(null); // post id

  if (!arrangements.length) return <div className="empty">No arrangements yet.</div>;
  if (childIdentity(arrangements, me.id)) {
    return <div className="empty">Nothing here for you — check the Calendar and To-Dos.</div>;
  }

  const active = sel === 'all' ? null : arrangements.find(a => a.id === sel);
  const shown = active ? [active] : arrangements;
  const posts = shown.flatMap(a => (a.posts || []).map(p => ({ ...p, arr: a })));
  const canPost = arrangements.some(a => mySide(a, me.id));
  const when = ts => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  async function removePost(p) {
    if (!(await confirmDelete(`Delete "${p.title}"${p.comments?.length ? ' and its replies' : ''}? This can’t be undone.`))) return;
    const { error } = await supa().from('posts').delete().eq('id', p.id);
    if (error) toast.error(`Couldn't delete: ${error.message}`);
    if (openPost === p.id) setOpenPost(null);
    store.refresh();
  }

  return (
    <>
      <ArrTabs arrangements={arrangements} value={sel} onChange={setSel} allLabel="All" />
      <Explainer id="messages" icon={<MessagesSquare size={28} strokeWidth={1.8} style={{ flex: 'none', marginTop: 2 }} />}>
        Messages are for talking things through — trip plans, school decisions, anything
        that isn&apos;t a to-do. Each conversation belongs to an arrangement, and everyone
        in both homes can read and reply. Kids never see this page.
      </Explainer>
      <div className="card">
        <h2>Messages {canPost && <button className="btn small" onClick={() => setShowNew(true)}>+ New conversation</button>}</h2>
        {posts.length === 0 && (
          <div className="empty">No conversations yet{canPost ? ' — start one' : ''}.</div>
        )}
        {posts.map(p => {
          const n = p.comments?.length || 0;
          const last = n ? p.comments[n - 1] : null;
          return (
            <div key={p.id} className="todo" style={{ cursor: 'pointer' }} onClick={() => setOpenPost(p.id)}>
              <div style={{ flex: 1 }}>
                <div className="t-title">{p.title}</div>
                <div className="t-meta">
                  {p.profiles?.name || p.profiles?.email} · {when(p.created_at)}
                  {arrangements.length > 1 && <> · {arrName(p.arr)}</>}
                  {last && <> · last reply {when(last.created_at)}</>}
                </div>
              </div>
              <button className={`thread-btn ${n ? 'has' : ''}`} title="Replies"
                onClick={e => { e.stopPropagation(); setOpenPost(p.id); }}>
                <MessageCircle size={19} />{n > 0 && <span>{n}</span>}
              </button>
              {p.author === me.id && (
                <button className="btn danger small" onClick={e => { e.stopPropagation(); removePost(p); }}>✕</button>
              )}
            </div>
          );
        })}
      </div>

      {openPost && (() => {
        const p = posts.find(x => x.id === openPost);
        if (!p) return null;
        const readOnly = !mySide(p.arr, me.id);
        return (
          <Modal title={p.title} onClose={() => setOpenPost(null)}>
            <div className="comment" style={{ marginBottom: 4 }}>
              <div className="c-head"><b>{p.profiles?.name || p.profiles?.email}</b><span>{when(p.created_at)}</span></div>
              {p.body && <div className="c-body">{p.body}</div>}
            </div>
            <CommentThread
              comments={p.comments}
              meId={me.id}
              refresh={store.refresh}
              readOnly={readOnly}
              emptyText="No replies yet."
              onPost={async body => (await supa().from('post_comments').insert({
                post_id: p.id, arrangement_id: p.arr.id, author: me.id, body,
              })).error}
              onDelete={async c => (await supa().from('post_comments').delete().eq('id', c.id)).error}
            />
            <div className="actions">
              <button className="btn subtle" onClick={() => setOpenPost(null)}>Close</button>
            </div>
          </Modal>
        );
      })()}

      {showNew && <NewPost arrangements={arrangements.filter(a => mySide(a, me.id))}
        defaultArr={active && mySide(active, me.id) ? active : arrangements.find(a => mySide(a, me.id))}
        me={me} store={store} onClose={() => setShowNew(false)} onOpen={setOpenPost} />}
    </>
  );
}

function NewPost({ arrangements, defaultArr, me, store, onClose, onOpen }) {
  const [arrId, setArrId] = useState(defaultArr.id);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) { toast.error('Give the conversation a title.'); return; }
    setBusy(true);
    const id = crypto.randomUUID();
    const { error } = await supa().from('posts').insert({
      id, arrangement_id: arrId, title: title.trim(), body: body.trim() || null, author: me.id,
    });
    setBusy(false);
    if (error) { toast.error(`Couldn't post: ${error.message}`); return; }
    await store.refresh();
    onClose();
    onOpen(id);
  }

  return (
    <Modal title="New conversation" onClose={onClose}>
      {arrangements.length > 1 && (
        <div className="field"><label>Arrangement</label>
          <select value={arrId} onChange={e => setArrId(e.target.value)}>
            {arrangements.map(a => <option key={a.id} value={a.id}>{arrName(a)}</option>)}
          </select></div>
      )}
      <div className="field"><label>Title</label>
        <GrowText autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Fall break plans" /></div>
      <div className="field"><label>Message (optional)</label>
        <GrowText value={body} onChange={e => setBody(e.target.value)} placeholder="Start the conversation…" /></div>
      <div className="actions">
        <button className="btn subtle" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Posting…' : 'Post'}</button>
      </div>
    </Modal>
  );
}
