# Deployment Guide — path to a real launch

This app is a fully working prototype: real database, real (test-mode) Stripe payments, real
authentication, seeded demo data. Nothing here is a mockup. Going live means pointing the same
code at real accounts/services instead of local/test ones, plus filling in the handful of content
placeholders only you can supply. This document is a checklist of exactly which env var or
dashboard step each of those is, in the order you'd actually do them.

Nothing below requires a code rewrite except the one item marked **(code change)** under Photo
storage — everything else is configuration.

## 1. Hosting

The app is a standard Next.js 16 App Router project, so it deploys to
[Vercel](https://vercel.com) (or any Next.js-capable host) with no special configuration:

1. Push this repo to GitHub/GitLab/Bitbucket.
2. Create a Vercel account (or use an existing one) and import the repo.
3. Add the environment variables from section 3 below in Vercel's Project Settings → Environment
   Variables before the first deploy.

Ongoing cost: Vercel's free Hobby tier covers a low-traffic small-business site comfortably; the
Pro tier ($20/month, at time of writing) is worth it once you want a team member added or want
Vercel's own uptime/analytics guarantees. Check [vercel.com/pricing](https://vercel.com/pricing)
for current numbers before committing.

## 2. Database (production Postgres)

Local dev runs Postgres inside the sandbox; production needs a real managed instance. Any
Postgres works — [Neon](https://neon.tech) or [Supabase](https://supabase.com) both have
generous free tiers and a connection string you paste straight into `DATABASE_URL`.

1. Create a Postgres instance on whichever provider you pick.
2. Copy its connection string into `DATABASE_URL` (see section 3).
3. Run the schema against it once: `npm run db:migrate` (this runs `prisma migrate dev` — for a
   first production deploy this creates every table from `prisma/schema.prisma`).
4. Decide whether you want the seeded demo data (`npm run db:seed`) in production. **Almost
   certainly not** — it creates fake clients, pets, and appointments with `.example` email
   addresses. Skip it and let the owner/staff accounts be created fresh (see below).
5. Create the real owner/staff login(s). The seed script (`prisma/seed.ts`) shows the shape of an
   owner `User` + Better Auth credential row; the simplest path is to temporarily register a
   normal account at `/register` (which always creates a `CLIENT` role — see
   `src/lib/actions/auth.ts`), then hand-update that one user's `role` to `"owner"` directly in
   the database (`npm run db:studio` opens Prisma Studio, a GUI for exactly this).

## 3. Environment variables

Every variable the app reads lives in `.env` locally (with inline comments). Here's what each one
maps to in production:

| Variable | What it is | Where to get it |
|---|---|---|
| `DATABASE_URL` | Production Postgres connection string | Neon/Supabase dashboard, after step 2 above |
| `BETTER_AUTH_SECRET` | Session-signing secret | Generate a new one: `openssl rand -base64 32` — **do not reuse the dev value** |
| `BETTER_AUTH_URL` | The app's own canonical URL, used by Better Auth server-side | Your real domain, e.g. `https://trimsandbubbles.com.au` |
| `NEXT_PUBLIC_APP_URL` | Same URL, used to build Stripe success/cancel redirect links (`src/lib/stripe.ts`) | Same as above |
| `STRIPE_SECRET_KEY` | Server-side Stripe API key | Stripe Dashboard → Developers → API keys — switch the dashboard's "Test mode" toggle **off** first, then copy the **live** key (`sk_live_...`) |
| `STRIPE_PUBLISHABLE_KEY` | Client-safe Stripe key (currently unused by any client component, but kept for parity with the secret key / future use) | Same screen, `pk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Verifies that webhook POSTs genuinely came from Stripe | Stripe Dashboard → Developers → Webhooks → **Add endpoint** → URL `https://<your-domain>/api/webhooks/stripe` → events `checkout.session.completed` and `checkout.session.expired` (see `src/app/api/webhooks/stripe/route.ts`) → copy the endpoint's signing secret |
| `RESEND_API_KEY` | Sends real emails (booking confirmations, balance-due notices) instead of the current `console.log` stand-ins | [resend.com](https://resend.com) → API Keys, after verifying a sending domain (next section) |
| `EMAIL_FROM` | The "from" address for those emails | Must be `@` your verified Resend domain, e.g. `bookings@trimsandbubbles.com.au` |
| `NODE_ENV` | Standard Next.js env flag | Vercel sets this automatically — don't set it manually |

**Stripe test → live is a one-time flip**, not a rebuild: the app already checks
`isStripeConfigured()` everywhere (`src/lib/stripe.ts`) and behaves identically either way — the
only thing that changes is which keys are in the environment. Test the whole flow once with the
**test** keys and Stripe's [test cards](https://docs.stripe.com/testing#cards) after deploying,
*before* switching to live keys, exactly like the local walkthrough in `README.md`.

## 4. Email sending domain (Resend)

Right now, the contact form (`src/lib/actions/contact.ts`) and any booking/balance-due
notifications just `console.log` instead of sending — a deliberate dev stand-in, not a bug. To
make emails real:

1. Create a [Resend](https://resend.com) account.
2. Add and verify your domain (DNS records — Resend's dashboard walks through the exact TXT/CNAME
   records to add wherever your domain's DNS is managed).
3. Add `RESEND_API_KEY` and `EMAIL_FROM` (section 3).
4. Replace the `console.log(...)` stand-ins with real Resend `send()` calls. There's currently
   exactly one such stand-in, in `submitContactForm` (`src/lib/actions/contact.ts`) — search the
   codebase for `console.log("[` to find it and any others added later.

## 5. Photo storage **(code change)**

Grooming photos currently save to local disk: `public/uploads/appointments/<id>/<file>` via plain
`fs/promises` calls in `savePhotoFile()` (`src/lib/actions/admin-appointments.ts`). That's correct
for local development but **won't persist on Vercel** — deployed serverless functions don't share
a writable, permanent filesystem the way a single dev server does.

Before going live, swap `savePhotoFile()` to upload to
[Vercel Blob](https://vercel.com/docs/storage/vercel-blob) (simplest if you're hosting on Vercel)
or any S3-compatible bucket:

1. `npm install @vercel/blob` and provision a Blob store from the Vercel dashboard (this adds a
   `BLOB_READ_WRITE_TOKEN` env var automatically).
2. In `savePhotoFile()`, replace the `mkdir`/`writeFile` calls with `put(filename, bytes, {
   access: "public" })` from `@vercel/blob`, and return the URL it gives back instead of the
   local `/uploads/...` path.
3. Everywhere a photo URL is stored (the `AppointmentPhoto.url` column) and rendered (`next/image`
   `src`) keeps working unchanged, since it's just stored as a string URL either way — this is a
   one-function change, not a schema change.

This is the only genuine code change on this whole list; everything else is configuration.

## 6. Content placeholders

Twelve pieces of real business content are centralized in `src/config/business.ts`, each marked
`TODO_CLIENT`, specifically so nothing ships by accident. Run:

```bash
npm run check:placeholders
```

At last check this listed exactly 12 items, in three groups:

- **Location** (4 items): suburb/city, the region description shown across the site, full
  address (or confirmation that you're mobile/by-appointment only), and a service-radius note for
  pickups/drop-offs.
- **Groomer credentials** (3 items): the exact certificate/qualification title, the issuing
  institution, and years of experience — shown on the About page's "Our Credentials" tab.
- **Contact** (3 items, plus 2 duplicated in the count above): phone number, Instagram handle,
  Facebook handle.

Fill these in directly in `src/config/business.ts` (each has an inline comment with an example),
then re-run `npm run check:placeholders` until it reports zero remaining. Day-to-day operational
settings (deposit %, hours, business contact info the owner might change often) are **not** in
this file — those live in the database and are editable from `/admin/settings` and
`/admin/availability` without touching code.

## 7. Real photos

The gallery, home page teaser, and pet profile photos currently use placeholder seed images in
`public/seed-images/`. Once you have real, consented photos of client dogs (and, ideally, a photo
of the groomer/salon for the About page), replace:

- Photos uploaded per-appointment happen naturally through normal use of the admin panel's
  "Save & Mark Complete" flow — no setup needed, this just accumulates real photos over time.
- The four hardcoded gallery showcase images (`extraShowcase` array in
  `src/app/(marketing)/gallery/page.tsx`) and the hero image (`src/app/(marketing)/page.tsx`) are
  worth swapping for real photos before launch, since those are the first impression.

## 8. Legal pages

`/legal/privacy` and `/legal/terms` are real, business-specific starting drafts (they already
cover pet/photo data collection, Stripe payment processing, and grooming-specific terms like
deposit non-refundability and matted-coat/health-condition clauses) — but both are explicitly
labeled "Placeholder — not yet legally reviewed" on the page itself. Have a solicitor (or a
reputable online privacy-policy generator tailored to the Australian Privacy Act, since you're
collecting client/pet personal information and processing payments) review both before taking
real payments. Once reviewed, remove the placeholder notice banner at the top of each page
(`src/app/(marketing)/legal/privacy/page.tsx`, `.../legal/terms/page.tsx`).

## 9. Domain & DNS

Point your domain's DNS at Vercel (Vercel's dashboard gives exact records once you add the domain
to the project), then update `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to match (section 3).
Do this *before* switching Stripe to live keys, since the webhook endpoint URL (section 3) needs
to be the real domain.

## 10. Pre-launch smoke test

After deploying with production env vars but *before* announcing the site publicly:

1. Register a real test client account and book an appointment through to a real (small, e.g.
   $1) Stripe **live-mode** payment, using a real card, then refund it from `/admin/payments` —
   confirms the whole money path end-to-end on the real infrastructure.
2. Confirm the booking confirmation / balance-due emails actually arrive (section 4).
3. Log in as owner and staff separately and confirm the owner-only pages (`/admin/services`,
   `/admin/settings`) correctly block the staff account.
4. Run `npm run check:placeholders` one last time — should report zero.
5. Check `/legal/privacy` and `/legal/terms` no longer show the "not yet legally reviewed" banner
   (section 8).

## Ongoing costs (beyond free tiers, indicative — check current pricing)

- **Hosting**: free on Vercel Hobby for low traffic; ~$20/month on Pro once you outgrow it.
- **Database**: Neon/Supabase free tiers cover a small business comfortably; paid tiers start
  around $19-25/month if you outgrow storage/compute limits.
- **Stripe**: no monthly fee — a small percentage + fixed fee per transaction (check
  [stripe.com/au/pricing](https://stripe.com/au/pricing) for current AU rates).
- **Resend**: free tier covers a few thousand emails/month, which is very unlikely to be exceeded
  by a single-location grooming business's booking/balance-due notifications.
- **Domain**: ~$15-25/year depending on registrar and TLD.
