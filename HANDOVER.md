# Trims & Bubbles — Website Handover & Maintenance Guide

_Last updated: 2026-08-19. Written for whoever maintains this site next (hi! 👋). It explains what
the site is, how it's hosted, what you can change from the admin panel with **no code**, and how to
make and ship code changes when you need to._

> There's also a deeper, developer-oriented doc at **`HANDOFF.md`** and a fast-reference at
> **`AGENTS.md`** in this same folder. This file is the practical "how do I run and maintain it"
> guide; those two cover architecture history and "bit us once" gotchas in more detail.

---

## 1. What the site is

**Trims & Bubbles** is a full website for a home-based dog-grooming business in Dunlop, Canberra
(ACT). It is a real, live [Next.js](https://nextjs.org) application — not a template — with:

- A public marketing site (home, services & pricing, gallery, reviews, contact, a small shop).
- **Live appointment booking** with a real availability calendar.
- A **client portal** (customers log in to see their dogs, appointments, and leave reviews).
- An **owner/staff admin panel** at `/admin` (calendar, bookings, clients, services, availability,
  gallery, reviews, settings, etc.).
- Transactional **emails** (booking confirmations, reminders, cancellations) from the business's own
  domain.

Live site: **https://trimsandbubbles.com.au**

---

## 2. The accounts & services it runs on

| Thing | Where | Notes |
|---|---|---|
| **Source code** | GitHub: `github.com/trimsandbubbles/trims-and-bubbles` | `main` branch is production. |
| **Hosting** | [Vercel](https://vercel.com) — project `trims-and-bubbles` (team `trims-deploy`) | Auto-builds & serves the site. |
| **Database** | [Neon](https://neon.tech) Postgres — project `trims-and-bubbles` (Sydney, `ap-southeast-2`) | Managed Postgres. |
| **Email** | [Resend](https://resend.com) — domain `trimsandbubbles.com.au` (verified) | Sends all automatic emails. |
| **Photo storage** | Vercel Blob (attached to the Vercel project) | Where uploaded photos actually live. |
| **Domain / DNS** | GoDaddy | Domain + the DNS records that make email work. |
| **Owner login** | https://trimsandbubbles.com.au/admin/login | Email `trimsandbubbles@gmail.com`. Password is in `DEPLOY-SECRETS.txt` (kept OUTSIDE the repo). |

All the secret keys/passwords are in **`DEPLOY-SECRETS.txt`** in the parent folder (NOT committed to
git). Keep that file safe.

---

## 3. Things you can change with NO code (just log in)

Most day-to-day changes are done by the owner in the admin panel — **no developer needed**:

- **Availability** (`/admin/availability`): each weekday can be **Open hours**, **Drop-off slots**,
  or **Closed**. "Drop-off slots" are the exact one-hour times customers can book. There's also a
  **one-off days** section for a single date (a holiday closure, different hours, or special slots
  for just that day).
- **New booking** (`/admin/bookings/new`): add a booking yourself for someone who called or emailed
  — existing customer or a brand-new one (name + phone, email optional).
- **Services & pricing** (`/admin/services`): edit names, prices by dog size, the customer-facing
  "approximate time" label, and photos. **Keep "Booking slot length" at 60 minutes** so slots line
  up (see gotchas).
- **Reviews** (`/admin/reviews`): reviews post **automatically** when a customer submits them. You
  can **hide** or **delete** any review, and reply to it.
- **Gallery** (`/admin/gallery`): upload/remove photos shown on the public gallery.
- **Settings** (`/admin/settings`): business name, contact phone/email, deposit %, public address
  (keep general — suburb only), and the **private drop-off address** (shown only after someone
  books, and in their confirmation email).
- **Store products, social links, site text**: various `/admin/*` pages; much of the marketing copy
  is editable inline on the public pages when logged in as owner.

---

## 4. How the code is laid out

Everything lives in **`extracted/`** (run all commands from there). Key folders:

```
extracted/
├─ src/app/                     # Pages & routes (Next.js App Router)
│  ├─ (marketing)/              #   public pages: home, services, gallery, reviews, contact, book…
│  ├─ portal/                   #   logged-in customer pages
│  ├─ admin/(protected)/        #   owner/staff admin panel
│  ├─ api/                      #   API routes (availability, cron, webhooks…)
│  └─ layout.tsx                #   site-wide <head>, fonts, favicon/OG metadata
├─ src/components/              # React components (booking wizard, admin widgets, UI kit…)
├─ src/lib/                     # Server logic
│  ├─ actions/                  #   server actions (booking, reviews, admin, settings…)
│  ├─ availability.ts           #   the slot-generation engine (pure, unit-tested)
│  ├─ email.ts                  #   email sending (Resend)
│  └─ …
├─ prisma/
│  ├─ schema.prisma             # the database schema (the source of truth for tables)
│  ├─ migrations/               # ordered SQL migrations (auto-applied on deploy)
│  └─ seed*.ts / seed-data.ts   # seed scripts + the real service menu
├─ public/                      # static assets (logos, images)
├─ vercel.json                  # Vercel cron schedule (the reminder job)
└─ package.json                 # scripts & dependencies
```

**Tech:** Next.js 16 (App Router — note: it has breaking changes vs older Next; read
`AGENTS.md`), React 19, Prisma 7 (Postgres), Better Auth (login), Tailwind CSS, FullCalendar (admin
calendar), Resend (email), sharp (image processing).

---

## 5. Running it locally

You need [Node.js](https://nodejs.org) (v20+) and a Postgres database.

```bash
cd extracted
npm install
```

Create a **`.env`** file in `extracted/` (it's gitignored). At minimum:

```
DATABASE_URL="postgres://…"          # a Postgres connection string (local or a free Neon/Supabase DB)
BETTER_AUTH_SECRET="…"               # any long random string for local
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Then:

```bash
npx prisma migrate deploy    # create the tables
npx prisma generate          # generate the DB client (also runs automatically on install)
npm run db:seed              # OPTIONAL: fill with demo data (wipes existing!)
npm run dev                  # http://localhost:3000
```

Useful scripts (`package.json`): `npm run dev`, `npm run build`, `npm run start`, `npm test`
(unit tests), `npm run lint`, `npm run db:studio` (visual DB browser).

> **Prisma client is generated code** at `src/generated/prisma` and is gitignored. If you change
> `schema.prisma`, run `npx prisma generate`. If TypeScript complains about missing DB types after a
> fresh clone, run `npx prisma generate`.

---

## 6. Making a change and shipping it

1. **Branch/edit** the code in `extracted/`.
2. **Check it locally**: `npm test` (unit tests), `npx tsc --noEmit` (types), `npm run build`
   (full build). All three should pass.
3. **Commit** to git.
4. **Deploy to Vercel** (production):
   ```bash
   npx vercel --prod --token=<VERCEL_TOKEN>
   ```
   (A Vercel deploy token is created in the Vercel dashboard → Account → Tokens. Or, if the Vercel
   project is connected to the GitHub repo for auto-deploy — check Vercel → Project → Settings →
   Git — then simply **pushing to `main` deploys automatically** and you can skip the CLI.)
5. **Push to GitHub** so the source of truth stays in sync:
   ```bash
   git push origin main
   ```

**Database migrations apply automatically on deploy.** The Vercel build command is
`prisma migrate deploy && next build` (see `package.json` → `vercel-build`), so any new file in
`prisma/migrations/` runs against the production DB during deploy. To add a schema change: edit
`schema.prisma`, hand-write a matching SQL file under `prisma/migrations/<timestamp>_name/migration.sql`,
run `npx prisma generate`, then deploy.

> Migrations need a **direct** (non-pooled) DB connection. Production uses `DIRECT_DATABASE_URL`
> (Neon's direct endpoint) — it's already set in Vercel. `DATABASE_URL` is the pooled endpoint used
> at runtime.

---

## 7. Environment variables (set in Vercel → Project → Settings → Environment Variables)

| Variable | What it's for |
|---|---|
| `DATABASE_URL` | Runtime DB connection (Neon **pooled**). |
| `DIRECT_DATABASE_URL` | Migrations DB connection (Neon **direct**). |
| `BETTER_AUTH_SECRET` | Signs login sessions. Keep secret & stable. |
| `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` | `https://trimsandbubbles.com.au`. |
| `RESEND_API_KEY` | Sends emails via Resend. |
| `EMAIL_FROM` | The "from" address: `Trims and Bubbles <support@trimsandbubbles.com.au>`. |
| `OWNER_NOTIFICATION_EMAIL` | Where owner alerts + customer replies go: `trimsandbubbles@gmail.com`. |
| `BLOB_READ_WRITE_TOKEN` | Lets photo uploads save to Vercel Blob (persists across deploys). |
| `CRON_SECRET` | Protects the reminder cron endpoint (Vercel sends it automatically to the cron). |
| `STRIPE_*` | Left blank — the business is cash-only for now. |

After changing an env var, **redeploy** for it to take effect.

---

## 8. Email — how it works

- All automatic emails send through **Resend** from `support@trimsandbubbles.com.au` (a verified
  domain — DKIM/SPF/MX all set up in GoDaddy DNS).
- The address can **send** but is not set up to **receive**. So every **customer** email sets
  "reply-to" to the owner's Gmail (`OWNER_NOTIFICATION_EMAIL`) — customer replies land there.
- Emails are **best-effort**: if a send fails it is logged but never breaks a booking.
- Emails sent: booking confirmation (online + manual), owner new-booking alert, **2-day reminder**,
  cancellation, reschedule, and the contact-form message.
- To change wording, edit the relevant file in `src/lib/actions/` (e.g. `booking.ts`,
  `manual-booking.ts`, `admin-appointments.ts`) or `src/app/api/cron/reminders/route.ts`.

### The 2-day reminder job
- A **Vercel Cron** runs daily (see `vercel.json`, `0 21 * * *` UTC ≈ 7–8am Sydney) and calls
  `/api/cron/reminders`.
- It emails a friendly reminder (with the drop-off address) to every customer whose appointment is
  **2 days away**, then marks those appointments so it never double-sends (`reminderSentAt`).
- It's protected by `CRON_SECRET`; a request without the secret is rejected.

---

## 9. Photos & uploads

- Uploads (gallery, service photos, appointment photos, review photos) are processed by
  `src/lib/uploads.ts`: the image is re-encoded with **sharp** (this strips location/EXIF data —
  important for a home business) and stored in **Vercel Blob**.
- Accepted formats: **JPEG, PNG, WebP** (max 12 MB). On phones, choosing a photo from the library
  works normally (the earlier "it only opened the camera" bug was a `capture` attribute — now
  removed).
- **iPhone note:** iPhones save photos as HEIC. When picking from the Photos app the phone usually
  hands over a JPEG automatically, so it works. If a customer ever gets "that doesn't look like a
  photo", ask them to pick from Photos (not Files), or take a fresh photo — those come through as
  JPEG. (Full HEIC support would need extra image libraries; not needed so far.)

---

## 10. Branding / favicon

- The favicon (the little logo in the browser tab and Google results) and the social-share image are
  generated from **`public/logo.svg`** / **`public/logo-horizontal.svg`** into
  `src/app/favicon.ico`, `src/app/apple-icon.png`, `src/app/icon.png`,
  `src/app/opengraph-image.png`.
- To regenerate them after a logo change, use `sharp` to rasterize the SVG at the sizes above and
  overwrite those files (there was a one-off script for this; the sizes are 16/32/48 for the .ico,
  180 for apple, 512 for icon.png, 1200×630 for the OG image, logo centered on a white/cream
  background).
- Google can take days/weeks to refresh a favicon in search results even after it's changed.

---

## 11. Gotchas (things that have bitten us)

- **This is Next.js 16** — some APIs differ from what you may know (e.g. `params` is a Promise). See
  `AGENTS.md` / `node_modules/next/dist/docs/`.
- **Keep every service's "Booking slot length" at 60 minutes** and the between-booking **buffer at
  0**. The salon runs fixed **hourly drop-off slots**; if a service is longer than the slot, or a
  buffer is added, adjacent slots silently disappear. Combining several services on one dog is fine
  — the booking still takes one slot (it uses the longest service, not the sum).
- **Double-booking is impossible by design**: a Postgres exclusion constraint
  (`no_overlapping_appointments`) rejects any overlapping appointment even if two people book at the
  exact same instant. Don't remove it.
- **Times are Sydney time.** The DB stores UTC; the app converts to `Australia/Sydney`. The DB
  connection is pinned to UTC. Don't "fix" timestamps that look offset — check the timezone first.
- **Public vs private address:** the exact street address must only ever appear **after** booking
  (confirmation screen + email). The public site shows suburb only. Keep it that way.
- **Uploaded images don't persist without `BLOB_READ_WRITE_TOKEN`** — on Vercel the local filesystem
  is wiped between deploys; the Blob token is what makes uploads stick.

---

## 12. Security housekeeping

- **Never commit secrets.** `.env`, `DEPLOY-SECRETS.txt`, and the Prisma client are gitignored.
- Deploy tokens (GitHub PAT, Vercel token) are **temporary** — revoke them in GitHub/Vercel once
  you're done deploying, and create fresh ones when you next need to.
- If a secret leaks, rotate it: Neon (DB password), Better Auth secret, Resend key, Blob token.
- The owner can change their admin password from the portal after logging in.

---

## 13. Getting help / common tasks cheat-sheet

| I want to… | Do this |
|---|---|
| Change opening hours / slots | Owner logs in → `/admin/availability`. No code. |
| Close a specific date | `/admin/availability` → one-off days → Closed. |
| Add a phone/email booking | `/admin/bookings/new`. |
| Change a price or service | `/admin/services`. |
| Remove a bad review | `/admin/reviews` → Hide or Delete. |
| Change the drop-off address | `/admin/settings` → Drop-off address. |
| Change email wording | Edit files in `src/lib/actions/` or `src/app/api/cron/reminders/`, then deploy. |
| Change the reminder timing (e.g. 3 days) | `src/app/api/cron/reminders/route.ts` (`REMIND_DAYS_AHEAD`) + `vercel.json` schedule. |
| Deploy a code change | `npm test && npm run build`, commit, `vercel --prod`, `git push`. |

Welcome aboard, and good luck! 🐾
