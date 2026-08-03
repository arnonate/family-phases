'use client';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { supa } from '@/lib/supabase/client';
import { StructureHelp, UnitInput } from '@/components/ui';

export default function Setup() {
  const { me, refresh } = useStore();
  const [name, setName] = useState(me?.name || '');
  const [houseName, setHouseName] = useState('Our household');
  const [arrName, setArrName] = useState('My kids');
  const [cpName, setCpName] = useState('');
  const [split, setSplit] = useState(75);
  const [threshold, setThreshold] = useState(500);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function create(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const s = supa();
    try {
      if (name.trim()) await s.from('profiles').update({ name: name.trim() }).eq('id', me.id);
      // IDs generated client-side: inserting with RETURNING would trip the read
      // policies, which require memberships that don't exist until a step later.
      const houseId = crypto.randomUUID();
      const arrId = crypto.randomUUID();
      const { error: e1 } = await s.rpc('create_household_with_membership', {
        hid: houseId, hname: houseName,
      });
      if (e1) throw e1;
      const { error: e3 } = await s.from('arrangements').insert({
        id: arrId, household_id: houseId, name: arrName,
        split_pct: split, approval_threshold: threshold,
        h_label: name.trim() || 'Me', c_label: cpName.trim() || 'Co-parent',
      });
      if (e3) throw e3;
      const { error: e4 } = await s.from('arrangement_members')
        .insert({ arrangement_id: arrId, user_id: me.id, role: 'household' });
      if (e4) throw e4;
      await s.from('schedules').insert({ arrangement_id: arrId, type: 'weeks' });
      await refresh();
    } catch (ex) {
      setErr(ex.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <div className="card">
        <h2>Welcome — let&apos;s set things up</h2>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
          This creates your household and your first co-parenting arrangement. You&apos;ll add
          children, the custody schedule, and invite people in Settings right after.
        </p>
        <form onSubmit={create}>
          <div className="row">
            <div className="field"><label>Your name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nate" required /></div>
            <div className="field"><label>Household name<StructureHelp /></label>
              <input value={houseName} onChange={e => setHouseName(e.target.value)} /></div>
          </div>
          <div className="row">
            <div className="field"><label>Arrangement name<StructureHelp /></label>
              <input value={arrName} onChange={e => setArrName(e.target.value)} placeholder="My kids" /></div>
            <div className="field"><label>Co-parent&apos;s name</label>
              <input value={cpName} onChange={e => setCpName(e.target.value)} placeholder="Their name" /></div>
          </div>
          <div className="row">
            <div className="field"><label>Your share of shared expenses</label>
              <UnitInput unit="%" type="number" min="0" max="100" value={split} onChange={e => setSplit(+e.target.value)} /></div>
            <div className="field"><label>Approval needed above</label>
              <UnitInput unit="USD" type="number" min="0" value={threshold} onChange={e => setThreshold(+e.target.value)} /></div>
          </div>
          <button className="btn" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Creating…' : 'Create household'}
          </button>
          {err && <p style={{ color: 'var(--red)', marginTop: 10, fontSize: 13 }}>{err}</p>}
        </form>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 14, textAlign: 'center' }}>
        Invited by someone? Their invitation is linked to your email address —
        if you signed in with that address, it&apos;s applied automatically. Try reloading.
      </p>
    </div>
  );
}
