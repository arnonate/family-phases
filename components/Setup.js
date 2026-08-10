'use client';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { supa } from '@/lib/supabase/client';
import { StructureHelp, UnitInput } from '@/components/ui';
import { toast } from '@/components/Toast';

const IDENTITIES = [
  ['mom', 'Mom'], ['dad', 'Dad'], ['stepmom', 'Stepmom'], ['stepdad', 'Stepdad'],
  ['grandparent', 'Grandparent'], ['other', 'Other'],
];

export default function Setup() {
  const { me, refresh } = useStore();
  const [name, setName] = useState(me?.name || '');
  const [identity, setIdentity] = useState('mom');
  const [identityLabel, setIdentityLabel] = useState('');
  const [cpName, setCpName] = useState('');
  const [split, setSplit] = useState(75);
  const [threshold, setThreshold] = useState(500);
  const [busy, setBusy] = useState(false);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    const s = supa();
    try {
      if (name.trim()) await s.from('profiles').update({ name: name.trim() }).eq('id', me.id);
      // IDs generated client-side: inserting with RETURNING would trip the read
      // policies, which require memberships that don't exist until a step later.
      const houseId = crypto.randomUUID();
      const arrId = crypto.randomUUID();
      const { error: e1 } = await s.rpc('create_household_with_membership', {
        hid: houseId, hname: name.trim() ? `${name.trim()}'s home` : 'My home',
      });
      if (e1) throw e1;
      const { error: e3 } = await s.from('arrangements').insert({
        id: arrId, h_household_id: houseId, name: 'Our kids',
        split_pct: split, approval_threshold: threshold,
        c_label: cpName.trim() || null,
      });
      if (e3) throw e3;
      const { error: e4 } = await s.from('member_identities').insert({
        arrangement_id: arrId, user_id: me.id, identity,
        label: identity === 'other' ? identityLabel.trim() || null : null,
      });
      if (e4) throw e4;
      await s.from('schedules').insert({ arrangement_id: arrId, type: 'weeks' });
      await refresh();
    } catch (ex) {
      toast.error(ex.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <div className="card">
        <h2>Welcome — let&apos;s set things up</h2>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
          This creates your home and your first co-parenting arrangement. You&apos;ll add
          children, the custody schedule, and invite people in Settings right after.
        </p>
        <form onSubmit={create}>
          <div className="row">
            <div className="field"><label>Your name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nate" required /></div>
            <div className="field"><label>The kids know you as<StructureHelp /></label>
              <select value={identity} onChange={e => setIdentity(e.target.value)}>
                {IDENTITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
          </div>
          {identity === 'other' && (
            <div className="field"><label>What should the kids see?</label>
              <input value={identityLabel} onChange={e => setIdentityLabel(e.target.value)} placeholder="e.g. Grandma Jo" /></div>
          )}
          <div className="field"><label>Co-parent&apos;s name</label>
            <input value={cpName} onChange={e => setCpName(e.target.value)} placeholder="Their name — used until they join" /></div>
          <div className="row">
            <div className="field"><label>Your share of shared expenses</label>
              <UnitInput unit="%" type="number" min="0" max="100" value={split} onChange={e => setSplit(+e.target.value)} /></div>
            <div className="field"><label>Approval needed above</label>
              <UnitInput unit="USD" type="number" min="0" value={threshold} onChange={e => setThreshold(+e.target.value)} /></div>
          </div>
          <button className="btn" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Creating…' : 'Get started'}
          </button>
        </form>
      </div>
    </div>
  );
}
