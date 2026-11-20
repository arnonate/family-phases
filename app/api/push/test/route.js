import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { sendAll } from '@/lib/push-server';

// "Send a test" from Settings: pushes to the signed-in user's own devices.
// RLS limits both the read and any dead-endpoint cleanup to their own rows.
export async function POST() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
      // Next caches GET fetches in route handlers; live data must bypass it
      global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return Response.json({ ok: false, error: 'Push isn’t configured on the server.' }, { status: 503 });
  }

  const { data: subs } = await supabase.from('push_subscriptions')
    .select('id, endpoint, p256dh, auth').eq('user_id', user.id);
  const sent = await sendAll(supabase, subs || [], {
    title: 'Family Phases',
    body: 'Notifications are working on this device.',
    url: '/settings',
    tag: 'test',
  });
  return Response.json({ ok: true, sent });
}
