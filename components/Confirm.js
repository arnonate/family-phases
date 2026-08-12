'use client';
import { useEffect, useState } from 'react';
import { GrowText } from '@/components/ui';

// App-wide confirmation. ConfirmHost must be mounted once (Shell does this).
//
//   await confirmDelete('Delete this?')                       → true | false
//   await confirmAction({ title, message, confirmLabel,
//                         withReason, reasonPlaceholder })    → { reason } | false
let trigger = null;

export function confirmAction(opts) {
  return new Promise(resolve => {
    if (trigger) trigger({ ...opts, resolve });
    else resolve(window.confirm(opts.message) ? {} : false); // fallback if host unmounted
  });
}

export function confirmDelete(message) {
  return confirmAction({ message, confirmLabel: 'Delete' }).then(r => !!r);
}

export function ConfirmHost() {
  const [req, setReq] = useState(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    trigger = r => { setReason(''); setReq(r); };
    return () => { trigger = null; };
  }, []);
  useEffect(() => {
    if (!req) return;
    const h = e => { if (e.key === 'Escape') { req.resolve(false); setReq(null); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [req]);
  if (!req) return null;
  const done = v => { req.resolve(v); setReq(null); };
  return (
    <div className="overlay" style={{ zIndex: 400 }} onClick={e => { if (e.target === e.currentTarget) done(false); }}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <h3>{req.title || 'Are you sure?'}</h3>
        <p style={{ fontSize: 14 }}>{req.message}</p>
        {req.withReason && (
          <div className="field" style={{ marginTop: 10 }}>
            <GrowText value={reason} onChange={e => setReason(e.target.value)}
              placeholder={req.reasonPlaceholder || 'Reason (optional)'} autoFocus />
          </div>
        )}
        <div className="actions">
          <button className="btn subtle" onClick={() => done(false)}>Cancel</button>
          <button className="btn red" onClick={() => done({ reason: reason.trim() || null })}>
            {req.confirmLabel || 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
