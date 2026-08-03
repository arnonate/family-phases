// Custody engine. Sides: 'h' = household parent, 'c' = co-parent.
// Only ACCEPTED deviations affect the calendar.

export const PRESETS = {
  weeks: [...Array(14)].map((_, i) => (i < 7 ? 'h' : 'c')),
  223: ['h','h','c','c','h','h','h','c','c','h','h','c','c','c'],
  2255: ['h','h','c','c','h','h','h','h','h','c','c','c','c','c'],
  eow: ['h','h','h','c','c','c','c','c','c','c','c','c','c','c'],
};
export const PATTERN_LABELS = {
  weeks: 'Alternating weeks (7/7)',
  223: '2-2-3 rotation',
  2255: '2-2-5-5 rotation',
  eow: 'Every other weekend',
  custom: 'Custom 14-day cycle',
};
export const CATS = ['Medical', 'School', 'Extra-curricular', 'Other'];

export function ds(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function pd(s) { const [a, b, c] = s.split('-').map(Number); return new Date(a, b - 1, c); }
export function todayStr() { return ds(new Date()); }
export function addDays(s, n) { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); }
export function fmt(s, opts) { return pd(s).toLocaleDateString(undefined, opts || { weekday: 'short', month: 'short', day: 'numeric' }); }
export function diffDays(a, b) { return Math.round((pd(b) - pd(a)) / 864e5); }
export function money(n) { return (n < 0 ? '-' : '') + '$' + Math.abs(n).toFixed(2); }

function cycleArr(schedule) {
  if (!schedule) return null;
  if (schedule.type === 'custom') return schedule.cycle?.length ? schedule.cycle : PRESETS.weeks;
  return PRESETS[schedule.type] || PRESETS.weeks;
}

export function baseCustody(schedule, dateStr) {
  if (!schedule?.anchor_date) return null;
  const arr = cycleArr(schedule);
  let idx = diffDays(schedule.anchor_date, dateStr) % arr.length;
  if (idx < 0) idx += arr.length;
  return arr[idx];
}

export function custodyFor(schedule, deviations, dateStr, childId) {
  let who = baseCustody(schedule, dateStr);
  for (const d of deviations) {
    if (d.status !== 'accepted') continue;
    if (dateStr >= d.start_date && dateStr <= d.end_date &&
        (!d.child_ids?.length || d.child_ids.includes(childId))) who = d.who;
  }
  return who;
}

// 'h' | 'c' | 'mix' | null across an arrangement's children
export function daySummary(schedule, deviations, children, dateStr) {
  if (!children.length) return baseCustody(schedule, dateStr);
  const set = new Set(children.map(k => custodyFor(schedule, deviations, dateStr, k.id)));
  return set.size === 1 ? [...set][0] : (set.has(null) ? null : 'mix');
}

export function isTransfer(schedule, deviations, children, dateStr) {
  const prev = addDays(dateStr, -1);
  const kids = children.length ? children : [{ id: null }];
  return kids.some(k => {
    const a = custodyFor(schedule, deviations, prev, k.id);
    const b = custodyFor(schedule, deviations, dateStr, k.id);
    return a && b && a !== b;
  });
}

export function nextTransfer(schedule, deviations, children, fromStr, horizon = 60) {
  for (let i = 1; i <= horizon; i++) {
    const d = addDays(fromStr, i);
    if (isTransfer(schedule, deviations, children, d)) return d;
  }
  return null;
}

// Positive = household side owes co-parent. Only approved expenses count.
export function balance(arrangement, expenses, settlements) {
  let b = 0;
  const split = arrangement.split_pct / 100;
  for (const e of expenses) {
    if (e.status !== 'approved') continue;
    if (e.paid_by === 'c') b += Number(e.amount) * split;
    else b -= Number(e.amount) * (1 - split);
  }
  for (const p of settlements) {
    if (p.direction === 'h2c') b -= Number(p.amount);
    else b += Number(p.amount);
  }
  return b;
}
