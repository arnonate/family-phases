export const dynamic = 'force-dynamic';

// Reports whether required env vars are present (never their values).
// Delete this route once setup is confirmed working.
export async function GET() {
  const present = k => {
    const v = process.env[k];
    return v ? { set: true, length: v.length } : { set: false };
  };
  return Response.json({
    NEXT_PUBLIC_SUPABASE_URL: present('NEXT_PUBLIC_SUPABASE_URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: present('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: present('SUPABASE_SERVICE_ROLE_KEY'),
    NEXT_PUBLIC_APP_URL: present('NEXT_PUBLIC_APP_URL'),
    urlLooksRight: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').includes('.supabase.co'),
    anonKeyLooksRight: /^(eyJ|sb_publishable_)/.test(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''),
    node: process.version,
    time: new Date().toISOString(),
  });
}
