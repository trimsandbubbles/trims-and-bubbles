# Trims and Bubbles

A full-scale website, client portal, and admin platform for a dog grooming business: public marketing site, real-time appointment booking, a client portal (pet profiles, grooming history, photos, payments), Stripe deposit/balance payments, and a simple admin panel the owner can run without a developer.

## Tech stack

Next.js 16 (App Router) + React 19 + TypeScript, Tailwind CSS v4, shadcn/ui, PostgreSQL + Prisma 7, Better Auth, Stripe Checkout, Vitest + Playwright.

## Local setup

```bash
npm install
cp .env.example .env  # then fill in DATABASE_URL and BETTER_AUTH_SECRET at minimum
npm run db:migrate    # create the schema in your local Postgres
npm run db:seed       # wipe + reseed realistic demo data
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`.env.example` has comments explaining what each variable is. `DATABASE_URL` must point at a running local Postgres instance before `db:migrate`/`db:seed` will work. Stripe and email vars can stay blank for now — see "Payments (Stripe)" below and `DEPLOYMENT.md`.

### Demo logins

Seeded fresh by `npm run db:seed` — all passwords match the account type:

| Role | Email | Password |
|---|---|---|
| Owner | `owner@trimsandbubbles.example` | `OwnerPass123!` |
| Staff | `staff@trimsandbubbles.example` | `StaffPass123!` |
| Client | `sarah.thompson@example.com` | `ClientPass123!` |

7 more demo client accounts exist with the same password — see `prisma/seed.ts` for the full list. Client accounts sign in at `/login`; owner/staff sign in separately at `/admin/login`.

## Payments (Stripe)

Booking a service that isn't priced "on inspection" charges a deposit (20% by default, adjustable in `/admin/settings`). Until real Stripe keys are configured, the app **falls back to confirming bookings immediately with no online payment step** — so the site, portal, and admin panel are fully clickable out of the box with zero external setup. Nothing breaks; there's just no real charge happening yet.

To test the real deposit → Stripe Checkout → webhook → confirmed flow locally:

1. Create a free Stripe account (test mode needs no business verification): [dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Copy your **test mode** keys from *Developers → API keys* into `.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```
3. Install the [Stripe CLI](https://docs.stripe.com/stripe-cli) and forward webhooks to your local server:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
   This prints a webhook signing secret (`whsec_...`) — paste it into `.env` as `STRIPE_WEBHOOK_SECRET`.
4. Restart `npm run dev` so the new env vars are picked up.
5. Book an appointment at `/book` — you'll be redirected to a real Stripe-hosted Checkout page. Use [any Stripe test card](https://docs.stripe.com/testing#cards), e.g. `4242 4242 4242 4242`, any future expiry, any CVC.
6. The webhook flips the appointment from *Awaiting deposit* to *Confirmed* — watch the `stripe listen` terminal and the admin calendar update.

The same applies to paying an outstanding balance from `/portal/appointments/[id]` once a job is marked complete.

## Testing

```bash
npm test              # Vitest — slot-generation/availability logic, balance/refund math
node scripts/smoke-booking.mjs         # Playwright — register, book, admin verify (needs `npm run dev` running)
node scripts/portal-check.mjs          # Playwright — client portal pages, console-clean check
node scripts/portal-functional-check.mjs  # Playwright — add-pet, profile saves, cross-client 404 security check
node scripts/admin-check.mjs           # Playwright — admin panel flows, console-clean check
node scripts/mobile-check.mjs          # Playwright — every page at a 390px mobile viewport, layout-overflow + console check
```

The Playwright scripts create and mutate real demo data — run `npm run db:seed` afterward to reset to a clean state before a real walkthrough or demo.

## Content still needed before launch

Run `npm run check:placeholders` — it greps `src/config/business.ts` for everything marked `TODO_CLIENT` (exact business address/service area, groomer certificate wording, social links) and lists what's still outstanding.

## Deploying for real

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the full path from this prototype to a live site — production database, live Stripe keys, a real email-sending domain, swapping local photo storage for cloud storage, and the content placeholders above.
