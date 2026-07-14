# Trims & Bubbles — Project Handoff / Continuity Doc

_Last updated: 2026-07-11. Written so that if this chat/session is lost, a person or a fresh AI
agent can pick up exactly where things left off._

## What this project is

"Trims & Bubbles" is a dog-grooming business website, being built as a favour for the owner's
sister. It's a full Next.js application — public marketing site, live appointment booking, an
authenticated client portal, an owner/staff admin panel, and (new this session) a small online
store — not a mockup or a template. Business facts (from `src/config/business.ts`):

- **Location:** Hobday Place, Dunlop ACT (Dunlop, Canberra)
- **Phone:** 0423 464 314
- **Tagline:** "Professional & luxury grooming for your beloved pet"
- **Groomer background:** qualified dog groomer with 10+ years of in-home dog boarding experience,
  now extending into washing, grooming and trimming.

## Where everything lives

| What | Path |
|---|---|
| The app (run all commands from here) | `C:\Users\ayatawara\Documents\Anjana\Trims and bubbless\extracted\` |
| This handoff doc (canonical copy) | `...\extracted\HANDOFF.md` |
| This handoff doc (easy-to-find copy) | `C:\Users\ayatawara\Documents\Anjana\Trims and bubbless\HANDOFF.md` |
| Original zip the app was unpacked from | `...\Trims and bubbless\trimsandbubbles.zip` |
| Source logo files (CorelDRAW/SVG/PDF) | `...\Trims and bubbless\images\logo\` (sibling folder, **not** inside `extracted/`) |
| Other raw AI-generated source images | `...\Trims and bubbless\images\dog services\`, `...\images\must use images\`, `...\images\store images\`, `...\images\etc fun ai generated stuff\` |
| A previous fast-reference doc (very useful — see below) | `...\Trims and bubbless\CLAUDE (5).md` |

`CLAUDE (5).md` at the parent-folder level is essentially an earlier snapshot of the in-repo
`AGENTS.md`/`CLAUDE.md` fast-reference and is worth reading — it documents several "bit us once"
gotchas (balance/refund math, `params` being a `Promise` in Next 16, flex layout overflow,
semantic-color-tokens-only rule, Playwright `waitForImages()` scroll requirement) in more detail
than this handoff repeats.

## Quick start (local dev)

1. **Start Postgres.** This machine has no system-installed Postgres — the app has been running
   against an *embedded* Postgres 18 instance (the `embedded-postgres` npm package) booted by a
   helper script, listening on **port 5433**, database `trims_and_bubbles`, user/pass
   `postgres`/`postgres`. That helper script lives in a **session-specific scratchpad temp
   directory** (under `%LocalAppData%\Temp\claude\...\scratchpad\pgengine\start-pg.mjs`), which
   will *not* survive into a new chat session. If you're starting fresh:
   - Simplest: re-create a small Node script that uses the `embedded-postgres` package to boot
     Postgres on port 5433 with db `trims_and_bubbles` / user+pass `postgres`, and keep it running
     in the foreground or as a background process.
   - Or: install Postgres normally, or spin up a free instance on [neon.tech](https://neon.tech) /
     [supabase.com](https://supabase.com), and point `DATABASE_URL` at it instead (see below).
2. In `extracted/`, install and set up the database:
   ```
   npm install
   npx prisma migrate deploy   # or: npx prisma migrate dev  (npm run db:migrate uses `migrate dev`)
   npx prisma generate
   npm run db:seed             # wipes + reseeds realistic demo data
   ```
3. Dev server: `npm run dev` → http://localhost:3000. Production-style: `npm run build` then
   `npm run start`.

**`.env`** (gitignored, already present in `extracted/`) currently has:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/trims_and_bubbles?schema=public"
BETTER_AUTH_SECRET="<generated>"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY / STRIPE_WEBHOOK_SECRET = "" (unset)
RESEND_API_KEY="" (unset — emails log to console instead of sending)
```
`.env.example` in the repo root documents every variable with comments if you need to rebuild
`.env` from scratch.

## Verified current state of the repo (checked 2026-07-11)

- **Stack** (from `package.json`): Next.js `16.2.10` (App Router, Turbopack), React `19.2.4`,
  Prisma `^7.8.0` + `@prisma/adapter-pg` + `pg`, Better Auth `^1.6.23`, Tailwind CSS `^4`,
  `@base-ui/react` (shadcn-style components in `src/components/ui/`), Stripe `^22.3.1` SDK present
  but **not configured** (no keys set), Vitest + Playwright for testing.
- **`package.json` scripts:** `dev`, `build`, `start`, `lint`, `db:migrate` (→ `prisma migrate
  dev`), `db:seed` (→ `prisma db seed`), `db:studio` (→ `prisma studio`),
  `check:placeholders`, `test` / `test:watch` (Vitest).
- **Prisma migrations** (`prisma/migrations/`): three applied migrations —
  `20260710025552_init`, `20260710025611_add_appointment_no_overlap_constraint`,
  `20260711140241_add_store_orders` (the store feature's migration, confirmed present).
- **Schema models** (`prisma/schema.prisma`): `User`, `Session`, `Account`, `Verification`,
  `Client`, `Pet`, `Service`, `ServicePrice`, `Appointment`, `AppointmentAddOn`,
  `AppointmentPhoto`, `AvailabilityRule`, `AvailabilityException`, `BlockedTimeSlot`, `Payment`,
  `BusinessSettings`, plus the new **`Order`** and **`OrderItem`** models for the store (mapped to
  `store_order` / `store_order_item` tables).
- **`src/`** contains 150+ files across route groups `(marketing)`, `portal/`, `admin/`, plus
  `src/lib/`, `src/components/`, `src/config/`. Confirmed present: `src/config/business.ts`,
  `src/config/store.ts`, `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/stripe.ts`,
  `src/lib/actions/store.ts`, `src/components/store/cart-context.tsx`,
  `src/components/store/cart-widget.tsx`, `src/components/poppable-bubbles.tsx`, all admin/portal
  route pages, and the Playwright scripts in `scripts/`.
- **`public/` image folders** — all present and populated:
  - `public/seed-images/` — 16 files: hero (`hero-main.jpg`) + breed-matched pet/gallery photos
    (cavoodle, collie, kelpie, golden, cavalier, corgi, husky, standard poodle, shepherd,
    schnauzer, labrador, toy poodle, staffy, shih tzu, bernese).
  - `public/service-images/` — `service-1.jpg` through `service-5.jpg` (5 grooming scene photos).
  - `public/store-images/` — `product-1.jpg` through `product-6.jpg` (6 store product photos).
  - `public/logo.svg` and `public/logo-horizontal.svg` — the cropped logo lockups actually used by
    the app (see Design/Branding below). `src/app/favicon.ico` and `src/app/icon.svg` also present.
- **Background processes currently running** (verified via `Get-NetTCPConnection` /
  `Get-Process` at time of writing): a `node` process listening on **port 3000** (the production
  server, `npm run start`), a `postgres` process listening on **port 5433** (the embedded
  Postgres), and a `cloudflared` process (the review tunnel). All three were confirmed live — but
  they only stay up as long as this machine is on and nobody has closed those terminals/processes.
  If they're gone by the time you read this, restart them per Quick Start above plus the
  cloudflared section below.
- **`npm run check:placeholders` currently reports only 1 outstanding item**: the contact email in
  `src/config/business.ts` (`hello@trimsandbubbles.example`, marked `TODO_CLIENT` — the flyer only
  had a phone number). Note: `instagram` and `facebook` fields in that file are also still blank
  (`""`) but are **not** currently marked with a `TODO_CLIENT` comment, so the checker script
  doesn't flag them — worth confirming with the client and either filling them in or adding
  `TODO_CLIENT` markers so they surface in the check. `issuingInstitution` under `credentials` is
  also blank/unmarked for the same reason.

## Demo logins

Seeded by `npm run db:seed` (see `prisma/seed.ts` for the full list):

| Role | URL | Email | Password |
|---|---|---|---|
| Owner | `/admin/login` | `owner@trimsandbubbles.example` | `OwnerPass123!` |
| Staff | `/admin/login` | `staff@trimsandbubbles.example` | `StaffPass123!` |
| Client | `/login` | `sarah.thompson@example.com` | `ClientPass123!` |

7 more demo client accounts exist with the same password.

## Sharing a live preview with the owner (temporary link)

`cloudflared.exe` was downloaded into the session scratchpad. Running:
```
cloudflared tunnel --url http://localhost:3000
```
prints a temporary public HTTPS URL on `trycloudflare.com` (the last one issued was
`https://flux-zum-scores-long.trycloudflare.com` — **this will have changed** if the tunnel was
ever restarted; always use whatever URL the current `cloudflared` invocation just printed).

This only works while: the machine is on, **and** the production server (`npm run start`) is
running, **and** Postgres is running, **and** the tunnel itself is running. The URL changes every
time the tunnel restarts, so it is not a stable link to give out long-term.

Login works over the tunnel because of two deliberate code changes:
- `src/lib/auth.ts` → `trustedOrigins: ["http://localhost:3000", "https://*.trycloudflare.com"]`
- `src/lib/auth-client.ts` → no hardcoded `baseURL`; Better Auth uses the current window origin,
  so the same build works on localhost, a tunnel, or a real deployment without rebuilding.

**For a permanent link**, do a real deployment — see `DEPLOYMENT.md` in the repo root (Vercel +
hosted Postgres such as Neon/Supabase is the documented path, with a full env-var table, Stripe
test→live flip instructions, and a photo-storage code change needed for Vercel specifically since
local disk uploads don't persist on serverless).

## Design / branding

- **Palette:** warm cream background (`#FBF6EC`), coral accent (`#DA5B4A`, same coral as the
  logo), charcoal ink (`#1E1816`). Defined as `oklch()` custom properties in
  `src/app/globals.css` under `:root` — a `--coral-50`…`--coral-900` ramp, a `--neutral-50`…`900`
  achromatic ramp, then semantic tokens (`--background`, `--accent`, `--accent-solid`,
  `--destructive`, `--ring`, `--sidebar-*`, etc.) built from those ramps. **Components must only
  use the semantic Tailwind classes** (`bg-primary`, `text-muted-foreground`, …) — never a
  hardcoded color or hex value; the whole site/portal/admin re-themes from ~20 variables in this
  one file. It has already been through a WCAG AA contrast pass (see comments near `--border` /
  `--ring` / `--destructive` for what failed and why) — re-check contrast if you touch a token.
- **Fonts:** Nunito (body + headings) and Corben (the "Trims & Bubbles" wordmark specifically,
  chosen to match the logo's Cooper-Black-style lettering), loaded via `next/font/google` in
  `src/app/layout.tsx` (confirmed: `import { Nunito, Corben, Geist_Mono } from "next/font/google"`).
  The wordmark styling is the `.wordmark` class in `globals.css`.
- **Logos** (in `public/`): header uses `/logo-horizontal.svg` (cropped from the source "Trims
  logo horizontal (2).svg"); footer + About page feature `/logo.svg` (the square lockup, also
  cropped); favicon is `src/app/icon.svg`. The original CorelDRAW-exported SVGs have an invisible
  full-canvas 5000×5000 frame that pads the real artwork down to a tiny corner, so their
  `viewBox` was manually cropped to the actual artwork bounds (measured via `getBBox()` of the
  visible-fill elements). **Source files are at the parent-folder level**, not inside `extracted/`:
  `C:\Users\ayatawara\Documents\Anjana\Trims and bubbless\images\logo\` — contains
  `Trims logo (1).svg`/`.pdf`, `Trims logo horizontal.svg`/`.pdf`/`.cdr` (and numbered variants),
  and `Trims logo.cdr`.
- **Bubbles motif:** `src/components/poppable-bubbles.tsx` renders one colourful floating
  soap-bubble layer (pastel palette, soft cartoon bubbles with a shine highlight). Poppable on
  desktop via hover; purely decorative (non-interactive) on touch/mobile, gated by the
  `.bubble-pop-target` rule plus a `(hover: hover)` media query so touch devices don't get stuck
  bubbles or accidental taps. Styles/keyframes (`.bubble`, `.bubble-pop`, `bubble-rise`,
  `bubble-pop`) live in `globals.css`. Confirmed mounted in `src/app/(marketing)/layout.tsx`.

## Features

- **Marketing pages:** home, services (with grooming photos), about (features the logo, a
  "Credentials" band, and the 10-years-boarding origin story), gallery, contact, `/book`.
- **Booking:** multi-step wizard (service → your dog → add-ons → date & time → confirm). Add-ons
  include Nail Clipping, Ear Cleaning, and Pickup & Drop-off (modeled as separate services). A
  "When we're open" summary shows at the top of `/book`
  (`src/components/booking/availability-glance.tsx`); the interactive month calendar and live time
  slots live in the Date & Time step. Double-booking prevention is two-layered: an in-transaction
  re-check at write time, plus a Postgres exclusion constraint on `Appointment` (migration
  `add_appointment_no_overlap_constraint`).
- **Client portal** (`src/components/portal/portal-header.tsx`): Dashboard, My Dogs, Appointments
  (each row has a "View details →" link), Payments, Profile, a Shop link, and a written "Log out"
  button.
- **Admin** (`src/components/admin/admin-shell.tsx`): Today, Calendar, Clients, Availability
  (per-weekday open/closed toggle + start/end times, plus one-off exceptions for busy days),
  Services, Payments, Store Orders, Settings.
- **Online store** (built this session, `/store`): 6 products defined in `src/config/store.ts`
  (images at `public/store-images/product-1.jpg`…`product-6.jpg`), each with slug, name, tagline,
  description, price (integer cents), optional "compare at" sale price, category, optional badge.
  Client-side cart (`src/components/store/cart-context.tsx`, persisted to `localStorage`), a cart
  slide-over widget in the header (`src/components/store/cart-widget.tsx`), checkout at
  `/store/checkout` with **PICKUP** (free) or **SHIPPING** (flat rate $9.95, free over $60 — see
  `SHIPPING_CENTS` / `FREE_SHIPPING_THRESHOLD_CENTS` in `src/config/store.ts`) as the only
  fulfilment options, a `placeOrder` server action (`src/lib/actions/store.ts` — validates via Zod,
  re-resolves prices/names server-side from the catalogue rather than trusting client input, auto-
  links a logged-in client's `clientId`, and since Stripe isn't configured, confirms the order
  immediately just like the booking flow does), an order confirmation page
  (`/store/orders/[id]`), and an admin "Store Orders" view (`/admin/orders`). New DB models `Order`
  + `OrderItem` (migration `add_store_orders`, tables `store_order` / `store_order_item`). Guests
  can order without an account.
- **Images:** `public/seed-images/` (hero + pet/gallery photos, breed-matched), `public/service-
  images/` (5 grooming scene photos), `public/store-images/` (6 product photos) — all verified
  present (see file counts above).

## Architecture notes worth knowing before making changes

(Sourced from the in-repo `AGENTS.md`/`CLAUDE.md` fast-reference and the parent-folder
`CLAUDE (5).md` snapshot — read those files directly for more detail.)

- Route groups share one app: `(marketing)` is public, `portal/` requires client auth, `admin/`
  requires owner/staff auth with its own `/admin/login`. Layouts enforce auth server-side, but
  **every Server Action that touches client/pet/appointment/payment/order data also re-checks the
  session itself** (`requireOwner()` / `requireStaffOrOwner()` in `src/lib/session.ts`) — Server
  Actions are independently reachable POST endpoints, not protected by page-level redirects alone.
- Most CRUD is Server Actions (`src/lib/actions/*.ts`), not API routes. The one real Route Handler
  is `src/app/api/webhooks/stripe/route.ts` (needs the raw request body for signature
  verification, which Server Actions can't provide).
- Money is integer cents everywhere (bookings and the store both). Times are handled in
  `Australia/Sydney` server-side (`src/lib/availability.ts` — see its test file for DST edge
  cases already covered).
- Better Auth, one `role` field (`CLIENT`/`STAFF`/`OWNER`). Public `/register` always hard-codes
  `CLIENT` server-side — never trust a role from client input.
- Balance-owing math must go through `computeBalanceOwingCents()` in `src/lib/payments-data.ts`.
  Refunds are always a new `REFUND`-type ledger row — never flip the original payment's status
  (this caused a double-counting bug once).
- `params`/`searchParams` are `Promise<T>` in this Next.js version (16) — must `await` them. This
  version of Next.js has breaking changes vs. training-data assumptions; read
  `node_modules/next/dist/docs/` before assuming an API matches what you remember (see
  `AGENTS.md`).
- Flex layouts need `min-w-0` on any `flex-1` container that might end up with a wide descendant
  (a `<Table>`, mainly) — otherwise the whole page becomes horizontally scrollable on mobile
  instead of just the table's own `overflow-x-auto` wrapper. Root layout also carries
  `overflow-x-hidden` on `<body>` as a backstop.

## Remaining TODO / open items

1. **Contact email placeholder** — `src/config/business.ts` still has
   `hello@trimsandbubbles.example` marked `TODO_CLIENT` (the source flyer only listed a phone
   number). Confirm a real email with the client. Run `npm run check:placeholders` to re-check.
2. **Social handles** — `instagram` / `facebook` in `src/config/business.ts` are blank; confirm
   whether the business has these and fill in, or leave blank if not applicable.
3. **Groomer credentials wording** — confirm the exact certificate/qualification title and
   issuing institution (`credentials.issuingInstitution` is currently blank).
4. **Go-live checklist** — see `DEPLOYMENT.md` in the repo root for the full path: real hosting
   (Vercel recommended, zero special config needed), a real managed Postgres (Neon/Supabase),
   real Stripe live keys if online payment is wanted (test-mode currently works with zero setup;
   `isStripeConfigured()` in `src/lib/stripe.ts` gates every Stripe-touching code path so bookings/
   orders auto-confirm without it), a Resend account for real emails (currently `console.log`
   stand-ins), swapping local-disk photo uploads for Vercel Blob or S3 (the **one** genuine code
   change required — local disk uploads don't persist on serverless), and a legal review of the
   `/legal/privacy` and `/legal/terms` pages (both currently marked "not yet legally reviewed").
5. **Store payment flow** — the store checkout currently mirrors the booking flow's "no Stripe
   configured → auto-confirm" behavior; once Stripe is live, verify whether store orders should
   route through the same Stripe Checkout path bookings use, or need their own.

## Known gotchas

1. **Editing `globals.css` theme tokens or `next/font` config while `next dev` is running** can
   serve stale output under Turbopack. Fix: stop the dev server, delete `.next/`, restart.
2. **Swapping an image file in `public/`** won't show updated content until the Next.js image
   cache is cleared (`.next/cache/images` and/or `.next/dev/cache/images` — confirmed both exist
   in this repo — or just delete all of `.next/`) and the server is restarted.
3. **The Bash tool in this environment has no coreutils and no Node on `PATH`** — confirmed:
   `head` and `node` both fail as Bash commands here. Use **PowerShell** for file operations and
   for running `node`/`npm` commands directly.
4. **Verify UI changes visually with Playwright** (already a devDependency) — run the capture/
   check scripts from inside `extracted/`:
   - `node scripts/smoke-booking.mjs` — register → book → admin sees it → non-staff blocked from
     `/admin/login`
   - `node scripts/portal-check.mjs` — every portal page, desktop + mobile, console-clean
   - `node scripts/portal-functional-check.mjs` — add-pet, profile saves, cross-client 404
     (ownership scoping)
   - `node scripts/admin-check.mjs` — full admin workflow: photo+note complete, manual payment,
     refund, price edit, settings, owner-only gating
   - `node scripts/mobile-check.mjs` — every page at a 390px mobile viewport, layout-overflow +
     console check
   - `node scripts/screenshot.mjs` / `node scripts/console-check.mjs` — general-purpose capture
     and console-error checking utilities
   All of these need `npm run dev` (or `npm run start`) running in another terminal first, and
   they **mutate real seeded data** — run `npm run db:seed` afterward to reset to a clean state
   before a real demo/walkthrough.
5. Before any code change, the project's own convention (from `AGENTS.md`/`CLAUDE.md`) is:
   ```
   npx tsc --noEmit && npm run lint && npx vitest run
   ```
   then the relevant Playwright script(s) above.

## Currently running (as of this handoff)

Verified live via `Get-NetTCPConnection` / `Get-Process` / `Get-CimInstance Win32_Process`:

- **Production server** (`npm run start`) — `node.exe`, listening on port 3000.
- **Embedded Postgres** — `postgres.exe` (from the scratchpad's `embedded-postgres` package),
  listening on port 5433.
- **Cloudflare quick tunnel** — `cloudflared.exe`, exposing port 3000 publicly (URL rotates on
  restart; last known: `https://flux-zum-scores-long.trycloudflare.com`).

If any of these have stopped by the time you resume work, restart them using the Quick Start and
tunnel sections above. Remember the embedded-Postgres helper script lives in a **session-scoped
scratchpad** that will not exist in a new chat session — you'll need to recreate it (or switch to
a normal/managed Postgres instance) if it's gone.
