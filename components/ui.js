'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { arrName } from '@/lib/store';

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-x" aria-label="Close" onClick={onClose}><X size={18} strokeWidth={2.5} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function InfoTip({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="info-btn" aria-label={`About ${title}`}
        onClick={() => setOpen(true)}>i</button>
      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
          <div style={{ fontSize: 14, lineHeight: 1.55 }}>{children}</div>
          <div className="actions">
            <button className="btn" onClick={() => setOpen(false)}>Got it</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function StructureHelp() {
  return (
    <InfoTip title="Homes & arrangements">
      <p style={{ marginBottom: 10 }}>
        <b>Home</b> is your home team — you and, later, a partner you invite. Everyone
        in a home can see and manage its arrangements. A home can hold several — for
        example, your kids with your co-parent, and your partner&apos;s kids with theirs.
      </p>
      <p style={{ marginBottom: 10 }}>
        <b>Arrangement</b> is one co-parenting relationship: a set of kids connecting
        two homes, with a custody schedule and an expense split. Your co-parent gets a
        home of their own when they join, and can bring a partner into it one day too.
        Each side only ever sees its own arrangements.
      </p>
      <p>
        Arrangements are shown by the kids&apos; names, which reads right to everyone.
        Prefer something else? Set a personal nickname in Settings — it&apos;s only
        visible to you.
      </p>
    </InfoTip>
  );
}

// Icon + description card shown atop a page until the user dismisses it
// (remembered per id in localStorage).
export function Explainer({ id, icon, children }) {
  const key = `fp-explainer-${id}`;
  const [gone, setGone] = useState(() =>
    typeof window !== 'undefined' && !!localStorage.getItem(key));
  if (gone) return null;
  return (
    <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      {icon}
      <p className="muted" style={{ fontSize: 13.5, margin: 0, flex: 1 }}>{children}</p>
      <button aria-label="Dismiss" className="explainer-x"
        onClick={() => { try { localStorage.setItem(key, '1'); } catch {} setGone(true); }}>
        <X size={16} />
      </button>
    </div>
  );
}

// Single-line-looking textarea that grows with its content.
export function GrowText({ value, ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  }, [value]);
  return <textarea ref={ref} rows={1} className="grow" value={value} {...props} />;
}

export function UnitInput({ unit, wrapStyle, ...props }) {
  return (
    <span className="unit-wrap" style={wrapStyle}>
      <input {...props} />
      <span className="unit">{unit}</span>
    </span>
  );
}

export function KidChecks({ children: kids, value, onChange }) {
  return (
    <div className="check-kids">
      {kids.map(k => {
        const on = value.includes(k.id);
        return (
          <label key={k.id} className={on ? 'on' : ''}>
            <input type="checkbox" checked={on}
              onChange={() => onChange(on ? value.filter(x => x !== k.id) : [...value, k.id])} />
            <span className="kid-dot" style={{ background: k.color }} />{k.name}
          </label>
        );
      })}
    </div>
  );
}

export function ArrTabs({ arrangements, value, onChange, allLabel }) {
  if (arrangements.length < 2 && !allLabel) return null;
  return (
    <div className="arr-tabs">
      {allLabel && arrangements.length > 1 && (
        <button className={value === 'all' ? 'active' : ''} onClick={() => onChange('all')}>{allLabel}</button>
      )}
      {arrangements.map(a => (
        <button key={a.id} className={value === a.id ? 'active' : ''} onClick={() => onChange(a.id)}>{arrName(a)}</button>
      ))}
    </div>
  );
}

// simple hook for the “current arrangement” selection
export function useArrSelection(arrangements, withAll = false) {
  const first = withAll && arrangements.length > 1 ? 'all' : arrangements[0]?.id;
  const [sel, setSel] = useState(first);
  useEffect(() => {
    if (!sel || (sel !== 'all' && !arrangements.some(a => a.id === sel))) setSel(first);
  }, [arrangements, sel, first]);
  return [sel, setSel];
}
