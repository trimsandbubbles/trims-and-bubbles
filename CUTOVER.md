# Cutover checklist — applying this round of security fixes + owner features

_Written 2026-07-11. This round hardened the app's security and added owner-manageable
shop products, a manageable gallery, appointment rescheduling, email notifications, and
editable business details. All of it is **code + one additive DB migration** — none of it is
live yet, because the running preview server serves the previously-built app._

## What changed (high level)

**Security fixes (all landed, typecheck/lint/tests green):**
- Security headers + CSP + `poweredByHeader:false` (`next.config.ts`).
- `trustedOrigins` is now env-driven — the `*.trycloudflare.com` wildcard only applies in
  development; production trusts only `BETTER_AUTH_URL` (`src/lib/auth.ts`).
- Better Auth rate limiting switched to DB storage (survives serverless) — needs the new
  `rate_limit` table (in the migration below).
- Open-redirect fixed on login/register (`src/lib/safe-redirect.ts`).
- Stored-XSS via photo upload closed — all uploads now go through `src/lib/uploads.ts`
  (magic-byte validation, sharp re-encode, EXIF/GPS stripped, server-chosen extension).
- Booking server action now re-validates the requested slot against real business hours /
  closures / lead time / grid (not just overlap).
- Store checkout + booking now **fail closed** in production if payment isn't wired.
- Refunds are owner-only, capped so cumulative refunds can't exceed what was paid, in a
  serializable transaction. Manual "mark paid" is owner-only too.
- Order confirmation page no longer leaks PII — requires session-ownership or the
  unguessable `?token=` issued at checkout.
- Input length bounds added across public/authenticated actions.
- `prisma` moved to devDependencies; `sharp` added to dependencies.

**Owner features (all landed):**
- **Shop products** are now a DB table with an admin CRUD page at `/admin/products`
  (owner-only): add/edit/reprice, sold-out toggle, photo upload.
- **Gallery** is manageable at `/admin/gallery`: upload/caption/remove standalone photos,
  and toggle which appointment photos appear publicly.
- **Reschedule** an appointment from its admin detail page.
- **Email notifications**: owner emailed on a new booking; customer emailed a confirmation,
  and on cancellation/reschedule. (Fires only once `RESEND_API_KEY` is set; logs to console
  until then — nothing breaks in the meantime.)
- **Business details** (address, service-area note, credentials, socials) are editable in
  admin Settings instead of a code file.
- Safety nets: confirm-before-delete on closures, owner-only payment buttons, de-jargoned labels.

## To make it live (run in order, when you're ready to stop the current preview)

1. **Back up the database** (or snapshot it) first — always, before any migration.
2. **Install new dependencies:** `npm install` (picks up `sharp`).
3. **Apply the migration** (additive — new tables + nullable columns, does not touch existing
   rows): `npx prisma migrate deploy` then `npx prisma generate`.
4. **Seed the catalogue + gallery from the old hardcoded content** (idempotent — safe, does
   NOT wipe anything):
   - `npx tsx scripts/seed-products.ts`  (imports the 6 existing products)
   - `npx tsx scripts/seed-gallery.ts`   (imports the 4 existing showcase photos)
5. **Build and start:** `npm run build` then `npm run start` (or redeploy on Vercel).
6. **Click-through test (important — this round was verified by typecheck/lint/tests only,
   not yet run in a browser):**
   - `/admin/products`: add a product with a photo, mark one sold out, check `/store` reflects it.
   - `/admin/gallery`: upload a photo, toggle an appointment photo, check `/gallery`.
   - Reschedule an appointment from its admin page.
   - Place a test store order → the confirmation page should only open with its `?token=`.
   - Edit business details in Settings → check they show on the About/Contact pages.
   - Load the site and watch the browser console for any Content-Security-Policy violations
     (FullCalendar, popovers/dropdowns, image uploads are the things to watch).

## Environment variables to set for production

- `NODE_ENV=production` (Vercel sets this automatically).
- `BETTER_AUTH_URL` = your real https origin (this is now the ONLY trusted auth origin in prod).
- `RESEND_API_KEY` + `EMAIL_FROM` (verified sending domain) to actually send notification emails.
- `OWNER_NOTIFICATION_EMAIL` (optional) = where new-booking emails go; otherwise falls back to
  the business contact email in Settings, then `src/config/business.ts`.
- Stripe keys remain optional — until they're set, deposits/orders are "pay in person"; if you
  set `STRIPE_SECRET_KEY` in production, the store checkout will (deliberately) refuse until a
  store payment flow is wired, so bookings and store payment need finishing together.

## Known follow-ups (deliberately not done this round)

- **Warn before closing a day that already has bookings** — availability edits don't yet warn
  if a confirmed appointment falls on a day being closed. Recommended next.
- **Global tap-target sizing** — admin inputs/buttons are a touch small for phone use; deferred
  because it's a global visual change best done with a browser open to verify layouts.
- **Persistent photo storage on Vercel** — uploads currently write to `public/uploads` (local
  disk), which does NOT persist on serverless. Swap `saveImage`/`deleteImage` in
  `src/lib/uploads.ts` to Vercel Blob / S3 before relying on uploads in production.
- **Owner notification on Stripe-confirmed bookings** — when Stripe is enabled, add the owner
  email to the webhook handler (deposit bookings confirm there, not in the booking action).
- **`npm audit`** reports dev/build-only advisories; do NOT run `npm audit fix --force` (it
  would downgrade Next to v9 / Prisma to v6).
