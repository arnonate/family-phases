# Family Phases 🌗

*Every family has its phases.* Co-parenting schedules, expenses, and reminders for a blended household. Built with Next.js and Supabase.

The moon glyphs throughout the app show the share of kids home on any given night — all six under your roof is a full moon.

Supports multiple co-parenting arrangements under one household, each with its own children, custody pattern, expense split, and approval threshold. Household partners see everything; co-parents see only their own arrangement (enforced by Postgres row-level security).

## Setup (about 15 minutes)

**1. Create a Supabase project** at [supabase.com](https://supabase.com) (free tier is fine).

**2. Run the schema.** In the Supabase dashboard open SQL Editor, paste the contents of `supabase/schema.sql`, and run it. This creates all tables, security policies, notification triggers, and the receipts storage bucket.

**3. Configure auth.** In Authentication → URL Configuration, set the Site URL to your app's URL (`http://localhost:3000` for local use) and add `http://localhost:3000/auth/callback` (and later your production equivalent) to Redirect URLs. Email sign-in links are enabled by default.

**4. Set environment variables.** Copy `.env.example` to `.env.local` and fill in the URL and keys from Project Settings → API.

**5. Run it.**

```
yarn
yarn dev
```

(npm works too: `npm install && npm run dev`.)

Open http://localhost:3000, sign in with your email, and follow the setup screen.

## Deploying (Vercel)

Push the repo to GitHub, import it at [vercel.com](https://vercel.com), and add the same environment variables (set `NEXT_PUBLIC_APP_URL` to your production URL). Update the Supabase Site URL and Redirect URLs to match. The included `vercel.json` schedules the email-notification cron; it does nothing unless you add a `RESEND_API_KEY`.

## How invites work

Settings → People & invites. Enter the person's email; when they sign in with that address they're connected automatically — a co-parent to their arrangement, a partner to the whole household. There's no invite email yet, so send them the app link yourself.

## Things to know

- **Approvals:** expenses above the arrangement's threshold (default $500) need the other parent's approval before they count toward the balance. Schedule changes are proposals until accepted. Both are instant while the co-parent hasn't joined yet.
- **Ledger export:** Expenses page → "Export ledger (CSV)" — full history with running balance.
- **Calendar feed:** Settings → Household tools has a private iCal URL; subscribe in Google/Apple Calendar.
- **v1 import:** if you used the single-file prototype (FamilySync), export its JSON backup and import it in Settings → Household tools.
- **Email notifications** are optional. In-app notifications always work; to also send email, create a [Resend](https://resend.com) account and set `RESEND_API_KEY`.
