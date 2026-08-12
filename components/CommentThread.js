'use client';
import { useState } from 'react';
import { X, SendHorizontal } from 'lucide-react';
import { GrowText } from '@/components/ui';
import { toast } from '@/components/Toast';
import { confirmDelete } from '@/components/Confirm';

// Shared flat comment thread. `onPost(body)` / `onDelete(comment)` return a
// Supabase error or null; `refresh` reloads the store afterwards.
export default function CommentThread({
  comments = [], meId, onPost, onDelete, refresh,
  emptyText = 'No comments yet.', controls = null,
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function post(e) {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    const error = await onPost(body.trim());
    setBusy(false);
    if (error) { toast.error(`Couldn't post comment: ${error.message}`); return; }
    setBody('');
    refresh();
  }
  async function del(c) {
    if (!(await confirmDelete('Delete this comment? This can’t be undone.'))) return;
    const error = await onDelete(c);
    if (error) { toast.error(`Couldn't delete comment: ${error.message}`); return; }
    refresh();
  }
  const when = ts => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="thread">
      {comments.map(c => (
        <div key={c.id} className="comment">
          <div className="c-head">
            <b>{c.profiles?.name || c.profiles?.email || 'Someone'}</b>
            {c.tag && <span className="mini">{c.tag}</span>}
            <span>{when(c.created_at)}</span>
            {c.author === meId && (
              <button aria-label="Delete comment" onClick={() => del(c)}><X size={12} /></button>
            )}
          </div>
          <div className="c-body">{c.body}</div>
        </div>
      ))}
      {!comments.length && <div className="muted" style={{ fontSize: 12.5, padding: '2px 0 6px' }}>{emptyText}</div>}
      <form className="c-form" onSubmit={post}>
        {controls}
        <GrowText value={body} onChange={e => setBody(e.target.value)} placeholder="Write a comment…"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) post(e); }} />
        <button type="submit" className="btn small" disabled={busy || !body.trim()} aria-label="Post comment">
          <SendHorizontal size={14} />
        </button>
      </form>
    </div>
  );
}
