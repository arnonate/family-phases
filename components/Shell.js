'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStore, childIdentity } from '@/lib/store';
import { supa } from '@/lib/supabase/client';
import Setup from '@/components/Setup';
import AddToHome from '@/components/AddToHome';
import { Bell, X, Menu, LogOut } from 'lucide-react';
import { Toasts } from '@/components/Toast';
import { ConfirmHost } from '@/components/Confirm';

const NAV = [
  ['/dashboard', 'Dashboard'],
  ['/calendar', 'Calendar'],
  ['/expenses', 'Expenses'],
  ['/activities', 'Activities'],
  ['/todos', 'To-Dos'],
  ['/settings', 'Settings'],
];

export default function Shell({ children }) {
  const store = useStore();
  const path = usePathname();
  const router = useRouter();
  const [showNotifs, setShowNotifs] = useState(false);
  const [drawer, setDrawer] = useState(false);

  if (store.loading) return <div className="center"><p>Loading Family Phases…</p></div>;

  const needsSetup = !store.arrangements.length && !store.households.length;
  const unread = store.notifications.filter(n => !n.read).length;
  const child = store.me && childIdentity(store.arrangements, store.me.id);
  const nav = child ? NAV.filter(([href]) => ['/dashboard', '/calendar', '/activities', '/todos'].includes(href)) : NAV;

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
      <AddToHome />
      <header className="top">
        {!needsSetup && (
          <button className="hamburger" aria-label="Menu" onClick={() => setDrawer(true)}>
            <Menu size={22} strokeWidth={2.2} />
          </button>
        )}
        <div className="brand">
          <img src="/brand/family-phases-mark-on-navy.svg" alt="" />
          <h1>Family Phases</h1>
        </div>
        {!needsSetup && (
          <nav className="main">
            {nav.map(([href, label]) => (
              <Link key={href} href={href} className={path.startsWith(href) ? 'active' : ''}>{label}</Link>
            ))}
          </nav>
        )}
        {!child && (
          <button className="bell" style={{ marginLeft: 'auto' }} title="Notifications"
            onClick={() => { setShowNotifs(v => !v); if (!showNotifs) markAllRead(); }}>
            <Bell size={18} strokeWidth={2} />{unread > 0 && <span className="n">{unread}</span>}
          </button>
        )}
        <button className="btn small subtle signout-desktop" onClick={signOut}>Sign out</button>
      </header>

      {drawer && (
        <>
          <div className="drawer-overlay" onClick={() => setDrawer(false)} />
          <div className="drawer">
            <div className="drawer-head">
              <img src="/brand/family-phases-mark-on-navy.svg" alt="" style={{ height: 24 }} />
              <button aria-label="Close menu" onClick={() => setDrawer(false)}><X size={20} /></button>
            </div>
            {nav.map(([href, label]) => (
              <Link key={href} href={href} className={path.startsWith(href) ? 'active' : ''}
                onClick={() => setDrawer(false)}>{label}</Link>
            ))}
            <button className="drawer-signout" onClick={signOut}>
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </>
      )}

      {showNotifs && (
        <div className="notif-pop">
          <div className="notif-head">
            <b>Notifications</b>
            <button aria-label="Close" onClick={() => setShowNotifs(false)}><X size={16} strokeWidth={2.5} /></button>
          </div>
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
      <footer className="site">
        Family Phases &copy; {new Date().getFullYear()} · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
      </footer>
      <Toasts />
      <ConfirmHost />
    </>
  );
}
