import { createClient } from '@supabase/supabase-js';
import { pushPayload } from '@/lib/notify';
import { sendAll } from '@/lib/push-server';

export const dynamic = 'force-dynamic';

// Called by the notifications insert trigger (schema.sql, PUSH WEBHOOK). Sends a Web Push to each of the recipient's devices for the
// types that warrant one; the bell and digest still cover everything.
export async function POST(request) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return Response.json({ ok: false, skipped: 'push not configured' });
  }

  const { record } = await request.json();
  const payload = pushPayload(record);
  if (!payload) return Response.json({ ok: true, skipped: 'not a push type' });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false },
      // Next caches GET fetches in route handlers; live data must bypass it
      global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) },
    }
  );
  const { data: subs } = await admin.from('push_subscriptions')
    .select('id, endpoint, p256dh, auth').eq('user_id', record.user_id);
  const sent = await sendAll(admin, subs || [], payload);
  return Response.json({ ok: true, sent });
}
