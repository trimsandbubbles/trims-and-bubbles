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
Create a new **private** GitHub repo and push the contents of the `extracted/` folder to it. (I can do this part for you — just say the word and give me a repo to push to, or I'll walk you through it.)

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
  - Leave all `STRIPE_*` **blank** (we're cash-only for now — see Payments below)
- Deploy. The first build also needs the database set up: run **`npx prisma migrate deploy`** against the Neon database, then the seed scripts once (`db:seed`, `seed-products.ts`, `seed-gallery.ts`). I can prepare this so it runs automatically on deploy.

### 4. One required code change before real photos: cloud photo storage
Right now uploaded photos (gallery, product, edit-mode images) save to the server's local disk. On Vercel that disk is temporary and wipes between deploys, so uploads wouldn't stick. Before launch we swap this to **Vercel Blob** (free tier) — it's a small, contained change in **one file** (`src/lib/uploads.ts`, the `saveImage`/`deleteImage` functions, which were deliberately written as the single swap point). **I can make this change for you when you're ready to deploy** — it's about 20 minutes of my work, not yours.

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
