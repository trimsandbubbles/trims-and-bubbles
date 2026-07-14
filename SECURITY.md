# Keeping Trims & Bubbles secure — the plain-English plan

_Written 2026-07-13. For a non-technical owner. Short version: the app is already built to a professional security standard, and paid hosting handles the rest. Here's exactly how client logins, the animal/client database, and (future) card payments stay safe._

## 1. What's ALREADY built into the app (we did a full security audit + fixes)

We ran a professional, multi-angle security review of this site and fixed everything it found. In plain terms:

- **Passwords are never stored as text.** They're hashed (scrambled one-way) by Better Auth, an industry-standard login system. Even we can't see anyone's password.
- **Logins are protected from guessing attacks.** Repeated wrong-password attempts are rate-limited, so a bot can't hammer the login. Sessions use secure, browser-only cookies that expire.
- **Every customer can only see their OWN data.** We specifically audited this: customer A can never reach customer B's dogs, appointments, or payments — the server re-checks ownership on every single request, not just in the browser.
- **Staff vs. Owner permissions are enforced on the server.** Only the owner can do money-moving things (refunds, pricing). A staff/groomer account can't, even if they try to force it.
- **The client & animal database is never public.** It sits behind the login, and every database query is locked to the logged-in person.
- **Photo uploads are safe.** Uploaded photos are checked to be real images (no disguised malicious files), and their hidden **location data is stripped out** — so a photo taken at the home salon can never leak your address.
- **The website itself is hardened.** Security headers (including protection against click-hijacking and forced-HTTPS), no secret keys ever sent to the browser, and strict limits on form inputs.

## 2. Card payments — the most important part

**When card payments are turned on, the card numbers NEVER touch our website or our database.** We use **Stripe** (the same payment system used by huge companies). Here's the flow: the customer types their card on **Stripe's** secure page, Stripe handles it, and we only ever receive a "paid ✓" confirmation and a harmless reference number. We never see, store, or transmit a card number.

This is the single most important fact about payment security, and it's how the app is already designed: **we are not in the business of storing card data — Stripe is, and they're certified (PCI-DSS Level 1) to do it.** That removes almost all of your payment-security risk.

(Right now the site is **cash-only** at your request, so no card data exists anywhere yet. When you're ready, enabling Stripe is a small, safe step.)

## 3. What paid HOSTING adds (the monthly fee is worth it)

Running it on proper managed platforms means security experts handle the infrastructure so you don't have to:

- **Vercel (hosting):** automatic HTTPS padlock, built-in DDoS protection, and there's no traditional "server" sitting exposed for hackers to break into. Security patches are automatic.
- **Managed Postgres database (Neon or Supabase):** your client & animal data is **encrypted** both stored and in transit, with **automatic daily backups** so nothing can be lost, and access is locked down.
- **Resend (email):** authenticated, reliable email so booking notices actually arrive and aren't spoofed.
- **(Optional) Cloudflare in front:** extra DDoS / bad-traffic filtering if you ever want belt-and-braces.

## 4. Realistic monthly cost

Your sister said she's fine with a monthly fee — good, because a little spend buys real security and reliability. Honest numbers (AUD-ish):

| Service | To start | Comfortable production |
|---|---|---|
| Hosting (Vercel) | Free | ~$20–30/mo (Pro) |
| Database (Neon/Supabase) | Free | ~$20–30/mo |
| Email (Resend) | Free (3k/mo) | ~$20/mo |
| Domain (GoDaddy) | already owned | ~$20/**year** |
| Card payments (Stripe) | $0 monthly | ~1.75% + 30¢ **per card sale** only |

**You can genuinely launch at ~$0/month** on free tiers and upgrade as she gets busy. A comfortable, backed-up, headroom-y setup is roughly **$40–70/month**. There's no big server bill and no security team to hire — the platforms include it.

## 5. What your sister needs to do (very little)

- Use a **strong, unique password** for the owner login (a password manager like the one built into her phone/browser is perfect — happy to help set that up).
- **Don't share** the owner login, and don't reuse that password anywhere else.
- Keep the setup "secret keys" private (we handle where they live — she never has to touch them).

That's it. Everything else — encryption, backups, patching, HTTPS, DDoS — is handled by the platforms and the app's built-in protections.

## 6. Ongoing / when you grow

- **Backups:** automatic with managed Postgres (can restore to any point).
- **Updates:** we periodically refresh dependencies (I can do this for you on a schedule).
- **Payments:** enable Stripe when ready — never store cards yourselves.
- **If you ever take lots of card payments or store sensitive notes,** we can add Cloudflare WAF and 2-factor login for the owner. Not needed on day one.

**Bottom line:** the app is built to protect client logins and the animal database properly today, card data is designed to stay with Stripe (never us), and paid managed hosting closes the loop with encryption, backups, and HTTPS — for a small, predictable monthly cost. You're in good shape to be "100%," machan.
