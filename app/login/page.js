'use client';
import { useState } from 'react';
import { supa } from '@/lib/supabase/client';
import { toast, Toasts } from '@/components/Toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const { error } = await supa().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else setSent(true);
  }

  async function verify(e) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    const { error } = await supa().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.replace(/\D/g, ''),
      type: 'email',
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else window.location.href = '/dashboard';
  }

  return (
    <div className="login-box">
      <div className="login-brand">
        <img src="/brand/family-phases-mark-on-light.svg" alt="" />
        <div>
          <div className="lb-word">Family Phases</div>
          <div className="lb-tag">Every week, in phase</div>
        </div>
      </div>
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
          </form>
        ) : (
          <form onSubmit={send}>
            <div className="field">
              <label>Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <button type="submit" className="btn" disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Sending…' : 'Email me a sign-in code'}
            </button>
          </form>
        )}
      </div>
      <Toasts />
    </div>
  );
}
