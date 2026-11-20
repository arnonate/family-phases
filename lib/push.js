'use client';
import { supa } from '@/lib/supabase/client';

// Browser side of Web Push: service worker registration and this device's
// subscription, mirrored into push_subscriptions so the server can reach it.

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function isIOS() {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isStandalone() {
  return typeof window !== 'undefined' && (
    window.matchMedia?.('(display-mode: standalone)').matches || !!window.navigator.standalone);
}

// 'ok' | 'unconfigured' | 'needs-install' (iOS Safari tab) | 'unsupported'
export function pushSupport() {
  if (typeof window === 'undefined') return 'unsupported';
  if (!VAPID_KEY) return 'unconfigured';
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS() && !isStandalone()) return 'needs-install';
  return capable ? 'ok' : 'unsupported';
}

export async function registerSW() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/sw.js'); } catch { return null; }
}

export async function currentSubscription() {
  const reg = await registerSW();
  return reg ? reg.pushManager.getSubscription() : null;
}

async function save(sub, userId) {
  const { endpoint, keys } = sub.toJSON();
  return supa().from('push_subscriptions').upsert({
    user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth,
    user_agent: navigator.userAgent.slice(0, 300),
  }, { onConflict: 'endpoint' });
}

// Must run from a tap: iOS only shows the permission prompt for a gesture.
export async function enablePush(userId) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { error: perm === 'denied' ? 'denied' : 'dismissed' };
  const reg = await registerSW();
  if (!reg) return { error: 'Couldn’t start the notification service.' };
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(VAPID_KEY) });
  const { error } = await save(sub, userId);
  return { error: error?.message || null };
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await supa().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

// On app load: re-save this device's subscription in case the browser
// rotated its endpoint or the row was pruned.
export async function syncPush(userId) {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return;
  const sub = await currentSubscription();
  if (sub) await save(sub, userId);
}

function urlB64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
