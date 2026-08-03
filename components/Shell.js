'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { supa } from '@/lib/supabase/client';
import Setup from '@/components/Setup';

const NAV = [
  ['/dashboard', 'Dashboard'],
  ['/calendar', 'Calendar'],
  ['/expenses', 'Expenses'],
  ['/todos', 'To-Dos'],
  ['/settings', 'Settings'],
];

export default function Shell({ children }) {
  const store = useStore();
  const path = usePathname();
  const router = useRouter();
  const [showNotifs, setShowNotifs] = useState(false);

  if (store.loading) return <div className="center"><p>Loading Family Phases…</p></div>;

  const needsSetup = !store.arrangements.length && !store.households.length;
  const unread = store.notifications.filter(n => !n.read).length;

  async function markAllRead() {
    const ids = store.notifications.filter(n => !n.read).map(n => n.id);
    if (ids.length) {
      await supa().from('notifications').update({ read: true }).in('id', ids);
      store.refresh();
    }
  }
  async function signOut() {
    await supa().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      <header className="top">
        <h1>Family<span>Phases</span> <span style={{ fontSize: 15 }}>🌗</span></h1>
        {!needsSetup && (
          <nav className="main">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className={path.startsWith(href) ? 'active' : ''}>{label}</Link>
            ))}
          </nav>
        )}
        <button className="bell" title="Notifications" onClick={() => { setShowNotifs(v => !v); if (!showNotifs) markAllRead(); }}>
          🔔{unread > 0 && <span className="n">{unread}</span>}
        </button>
        <button className="btn small subtle" onClick={signOut}>Sign out</button>
      </header>
      {showNotifs && (
        <div className="notif-pop" onMouseLeave={() => setShowNotifs(false)}>
          {store.notifications.length === 0 && <div className="empty">No notifications yet.</div>}
          {store.notifications.map(n => (
            <div key={n.id} className={`notif ${n.read ? '' : 'unread'}`}>
              {n.message}
              <div className="when">{new Date(n.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
      <main className="wrap">
        {needsSetup ? <Setup /> : children}
      </main>
    </>
  );
}
