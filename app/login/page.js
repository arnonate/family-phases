'use client';
import { useState } from 'react';
import { supa } from '@/lib/supabase/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function send(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    setBusy(true);
    const { error } = await supa().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  async function verify(e) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setErr('');
    setBusy(true);
    const { error } = await supa().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.replace(/\D/g, ''),
      type: 'email',
    });
    setBusy(false);
    if (error) setErr(error.message);
    else window.location.href = '/dashboard';
  }

  return (
    <div className="login-box">
      <img src="/brand/family-phases-lockup-on-light.svg" alt="Family Phases — every week, in phase"
        style={{ width: '100%', maxWidth: 360, marginBottom: 16, display: 'block' }} />
      <div className="card">
        {sent ? (
          <form onSubmit={verify}>
            <p style={{ fontSize: 14, marginBottom: 14 }}>
              We emailed <b>{email}</b>. Enter the 6-digit code from that email:
            </p>
            <div className="field">
              <label>Sign-in code</label>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={code} onChange={e => setCode(e.target.value)} placeholder="123456" autoFocus />
            </div>
            <button type="submit" className="btn" disabled={busy || code.trim().length < 6} style={{ width: '100%' }}>
              {busy ? 'Verifying…' : 'Sign in'}
            </button>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
              The email&apos;s link also works if you opened this page in your regular browser —
              but from the home-screen app, use the code.
            </p>
            {err && <p style={{ color: 'var(--red)', marginTop: 10, fontSize: 13 }}>{err}</p>}
          </form>
        ) : (
          <form onSubmit={send}>
            <div className="field">
              <label>Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <button type="submit" className="btn" disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </button>
            {err && <p style={{ color: 'var(--red)', marginTop: 10, fontSize: 13 }}>{err}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
