import "server-only";
import Stripe from "stripe";

// Pinned to match the installed `stripe` package's own declared default
// (node_modules/stripe/cjs/apiVersion.d.ts) — explicit on purpose, so a
// future `npm update` of the SDK can't silently shift request behavior.
const STRIPE_API_VERSION = "2026-06-24.dahlia";

let cachedClient: Stripe | null = null;

/**
 * True once real Stripe test-mode keys are in .env. Every payment-related
 * action checks this first and falls back to the pre-Stripe behavior
 * (confirm the booking immediately; show a "coming soon" note for balances)
 * when it's false — so the prototype stays fully clickable without an
 * external account, and nothing breaks before the client wires Stripe up.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function isStripeWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured — set STRIPE_SECRET_KEY in .env first.");
  }
  if (!cachedClient) {
    cachedClient = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
  }
  return cachedClient;
}

/** Base URL for Stripe Checkout success/cancel redirects. */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
