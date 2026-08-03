'use client';
import { useState } from 'react';
import { supa } from '@/lib/supabase/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  async function send(e) {
    e.preventDefault();
    setErr('');
    const { error } = await supa().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <div className="login-box">
      <img src="/brand/family-phases-lockup-on-light.svg" alt="Family Phases — every week, in phase"
        style={{ width: '100%', maxWidth: 360, marginBottom: 8, display: 'block' }} />
      <p className="muted" style={{ marginBottom: 20 }}>Schedules, expenses, and reminders for both households.</p>
      <div className="card">
        {sent ? (
          <p>Check <b>{email}</b> for a sign-in link. You can close this tab.</p>
        ) : (
          <form onSubmit={send}>
            <div className="field">
              <label>Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <button className="btn" style={{ width: '100%' }}>Email me a sign-in link</button>
            {err && <p style={{ color: 'var(--red)', marginTop: 10, fontSize: 13 }}>{err}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
