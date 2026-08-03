'use client';
import { useEffect, useState } from 'react';

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <h3>{title}</h3>
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
    <InfoTip title="Households & arrangements">
      <p style={{ marginBottom: 10 }}>
        <b>Household</b> is your home team — you and your partner. Household members
        can see everything below. The name is just a label; only you two ever see it.
      </p>
      <p style={{ marginBottom: 10 }}>
        <b>Arrangement</b> is one co-parenting relationship: a set of kids, their two
        parents, a custody schedule, and an expense split. A household can hold several —
        for example, your kids with your co-parent, and your partner&apos;s kids with theirs.
      </p>
      <p>
        The <b>arrangement name</b> appears on tabs and cards so everyone can tell them
        apart — something like &ldquo;Nate&apos;s kids&rdquo; works well. Your co-parent
        sees it too, so keep it friendly. They only ever see their own arrangement,
        never the other one.
      </p>
    </InfoTip>
  );
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
        <button key={a.id} className={value === a.id ? 'active' : ''} onClick={() => onChange(a.id)}>{a.name}</button>
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
