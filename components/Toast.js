'use client';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// Tiny event-bus toast engine: call toast.error()/toast.success() from any
// client component. Errors stay until dismissed; successes auto-clear.
const listeners = new Set();
let nextId = 1;

function emit(t) {
  const item = { id: nextId++, ...t };
  listeners.forEach(l => l(item));
}

export const toast = {
  error: message => emit({ type: 'error', message, ttl: 6500 }),
  success: message => emit({ type: 'success', message, ttl: 4000 }),
};

export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const add = t => {
      setItems(v => [...v, t]);
      if (t.ttl) setTimeout(() => setItems(v => v.filter(x => x.id !== t.id)), t.ttl);
    };
    listeners.add(add);
    return () => listeners.delete(add);
  }, []);
  if (!items.length) return null;
  return (
    <div className="toasts">
      {items.map(t => (
        <div key={t.id} className={`toast ${t.type}`} role="alert" style={{ cursor: 'pointer' }}
          onClick={() => setItems(v => v.filter(x => x.id !== t.id))}>
          <span style={{ flex: 1 }}>{t.message}</span>
          <X size={15} strokeWidth={2.5} style={{ flex: 'none', marginTop: 2 }} />
        </div>
      ))}
    </div>
  );
}
