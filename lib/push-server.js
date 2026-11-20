import webpush from 'web-push';

// Server-only: needs the VAPID private key.

// Sends to each subscription and prunes the ones the push service says are
// gone (unsubscribed, app removed from the Home Screen, expired).
export async function sendAll(admin, subs, payload) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:phases@apps.natearnold.me',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const body = JSON.stringify(payload);
  const dead = [];
  let sent = 0;
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body, { TTL: 60 * 60 * 24 });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.id);
      else console.error('push failed:', e.statusCode, e.body || e.message);
    }
  }));
  if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead);
  return sent;
}
