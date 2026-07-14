# Getting Trims & Bubbles live on trimsandbubbles.com.au

_Written 2026-07-13. Plain-English deployment guide for the domain your sister bought at GoDaddy._

## The situation (from the GoDaddy dashboard)

Your sister **owns the domain `trimsandbubbles.com.au`** at GoDaddy, but **no website is published on it yet**. GoDaddy keeps offering its own drag-and-drop site builder — **ignore that.** We built a real custom web application, which GoDaddy's builder can't run. Instead we:

1. **Host our app** on a platform that runs Next.js apps (Vercel — free tier is fine to start).
2. **Point the GoDaddy domain at that host** by changing a couple of DNS settings.

GoDaddy just stays the "address registrar" — the site itself lives on Vercel. This is normal and how most custom sites work.

## What you'll need (all have free tiers)

| Thing | Why | Cost |
|---|---|---|
| A **GitHub** account | Vercel deploys the code from here | Free |
| A **Vercel** account | Runs/hosts the website | Free to start |
| A hosted **Postgres** database (**Neon** or **Supabase**) | The app needs a real database (bookings, clients, shop) | Free tier fine |
| (Optional) **Resend** account | To actually send booking/cancellation emails | Free tier |
| GoDaddy login | To point the domain (you already have this) | — |

## Step-by-step

### 1. Put the code on GitHub
The code is **already a git repository** (initialised and committed in `extracted/`). To publish it:
- Create a new **private** repo on github.com (e.g. `trims-and-bubbles`).
- Then, from the `extracted/` folder, connect and push:
  ```
  git remote add origin https://github.com/<your-username>/trims-and-bubbles.git
  git branch -M main
  git push -u origin main
  ```
  (I can run these for you once you've created the empty repo and I have push access — just say the word.)

### 2. Create the database (Neon)
- Sign up at neon.tech → create a project → copy the **connection string** (starts with `postgresql://…`). That's your `DATABASE_URL`.

### 3. Deploy to Vercel
- Sign in to vercel.com with GitHub → **Add New → Project** → import the repo.
- Under **Environment Variables**, add:
  - `DATABASE_URL` = the Neon connection string
  - `BETTER_AUTH_SECRET` = a long random value (generate one — I can give you a fresh one)
  - `BETTER_AUTH_URL` = `https://trimsandbubbles.com.au`
  - `NEXT_PUBLIC_APP_URL` = `https://trimsandbubbles.com.au`
  - `RESEND_API_KEY` + `EMAIL_FROM` = only if you set up Resend (otherwise leave blank; emails just log)
  - `OWNER_NOTIFICATION_EMAIL` = your sister's email (where "new booking" alerts go)
  - `BLOB_READ_WRITE_TOKEN` = from a Vercel Blob store (see Step 4)
  - Leave all `STRIPE_*` **blank** (we're cash-only for now — see Payments below)
  - (Your generated `BETTER_AUTH_SECRET` is in `DEPLOY-SECRETS.txt` in the parent folder — keep it private.)
- Deploy. **Database migrations run automatically on every deploy** — the project's `vercel-build` script runs `prisma migrate deploy` before building, so the Neon database sets itself up. After the first successful deploy, seed the starter content once by running **`npx tsx scripts/seed-production.ts`** (with `OWNER_EMAIL`/`OWNER_PASSWORD` set — creates business hours, services, and the single owner login; **no demo data**), then `npx tsx scripts/seed-products.ts` and `scripts/seed-gallery.ts` — I can do this step for you.
- ⚠️ Never run `npm run db:seed` against the production database — that's the dev/demo seed (it wipes data and creates demo logins). It now refuses to run against a non-localhost database as a safety net. To change the owner's email/password later, run `scripts/set-owner-credentials.ts`.

### 4. Cloud photo storage — DONE (just add the token)
Uploaded photos (gallery, products, edit-mode images) now **automatically use Vercel Blob** in production — the code change is already made (`src/lib/uploads.ts` detects `BLOB_READ_WRITE_TOKEN` and switches from local disk to Blob storage; `next.config.ts` and the security policy already allow Blob-hosted images). All you do:
- In Vercel: **Storage → Create → Blob** → it gives you a `BLOB_READ_WRITE_TOKEN`.
- Add that token to the project's Environment Variables (Step 3).
That's it — photos will then persist properly in production. In local/preview (no token) it keeps using local disk, unchanged.

### 5. Point the GoDaddy domain at Vercel
- In Vercel: **Project → Settings → Domains → Add** `trimsandbubbles.com.au`. Vercel shows you the exact DNS records to set (typically an **A record** for `@` and a **CNAME** for `www`).
- In GoDaddy: **My Products → Domain → DNS → Manage DNS**, and enter exactly those records. **Do NOT use GoDaddy's "Forwarding"** option — use real DNS records so the padlock (HTTPS) works.
- Wait 10–60 minutes for it to take effect. Vercel sets up the free SSL certificate automatically. Done — the site is live at `https://trimsandbubbles.com.au`.

## Payments — cash only for now (recommended: add card later)
- The site is set to **cash on the day** right now: booking says "Payment is cash on the day", and the online shop is switched off ("Coming in 2028"). Nothing takes card payments, which is exactly what you asked for.
- **We kept all the card-payment plumbing in the code** (gated so it's dormant). To turn card payments on later, we connect **Stripe** (create a Stripe account, add the keys, and I wire the shop/deposit checkout to it). **Recommended once she's busy** — it lets people pay deposits/orders online and reduces no-shows.
- Note: GoDaddy's dashboard also advertises a **free POS card terminal** ("Get My Free Device"). That's a separate, *in-person* card reader for the grooming table — unrelated to the website, but genuinely worth considering for taking card in person. Your call; no rush.

## The QR code
I generated a QR code that opens the website:
- `Trims and bubbless/trimsandbubbles-qr.png` (high-res, for print/flyers)
- `Trims and bubbless/trimsandbubbles-qr.svg` (scales to any size)

It points to `https://trimsandbubbles.com.au`, so it will work **once the site is live** (Step 5). Put it on flyers, the shopfront, business cards, Instagram.

## Want me to do the hands-on parts?
I can: push the code to GitHub, generate the auth secret, prepare the auto-migrate/seed on deploy, and make the Vercel Blob photo-storage change — so all you'd do is click through the Vercel/Neon/GoDaddy sign-ups and paste a couple of values. Just tell me when you're ready and I'll take it step by step.
