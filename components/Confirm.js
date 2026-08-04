'use client';
import { useEffect, useState } from 'react';

// App-wide delete confirmation. `await confirmDelete('Delete this?')` resolves
// true/false. ConfirmHost must be mounted once (Shell does this).
let trigger = null;

export function confirmDelete(message) {
  return new Promise(resolve => {
    if (trigger) trigger({ message, resolve });
    else resolve(window.confirm(message)); // fallback if host unmounted
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState(null);
  useEffect(() => {
    trigger = setReq;
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
        <h3>Are you sure?</h3>
        <p style={{ fontSize: 14 }}>{req.message}</p>
        <div className="actions">
          <button className="btn subtle" onClick={() => done(false)}>Cancel</button>
          <button className="btn red" onClick={() => done(true)}>Delete</button>
        </div>
      </div>
    </div>
  );
}
