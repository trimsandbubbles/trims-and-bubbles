import type { NextConfig } from "next";

// Content-Security-Policy. Notes (verified against this app's real usage):
//  - Fonts are self-hosted by next/font at build time — no fonts.gstatic.com needed.
//  - Stripe is used via a server-side Checkout redirect (window.location), NOT
//    Stripe.js/Elements, so no js.stripe.com allowance is required today. If
//    embedded card fields are added later, add script-src https://js.stripe.com,
//    frame-src https://js.stripe.com https://hooks.stripe.com, connect-src
//    https://api.stripe.com.
//  - Base UI / shadcn popovers/selects/dialogs and FullCalendar set inline style
//    attributes at runtime, so style-src must allow 'unsafe-inline' (CSP nonces
//    cannot cover the style HTML attribute). script 'unsafe-inline' is required
//    for Next's own hydration/RSC inline scripts unless we move to a nonce-based
//    CSP (which would force every page to dynamic rendering — not worth it while
//    the app has no known XSS sink).
//  - img-src allows data: (next/image placeholders) and blob: (client-side
//    upload previews).
const isProd = process.env.NODE_ENV === "production";

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://*.public.blob.vercel-storage.com;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

const nextConfig: NextConfig = {
  // Don't advertise the framework/version.
  poweredByHeader: false,
  images: {
    // Allow next/image to optimize photos served from Vercel Blob storage in
    // production. Local-disk uploads (dev) are same-origin and need no entry.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  experimental: {
    // Default is 1MB; the admin appointment photo upload sends a real phone
    // camera photo through a Server Action, which can easily be several MB.
    //
    // This MUST stay comfortably above MAX_INPUT_BYTES in src/lib/uploads.ts
    // (12MB). If it sits at or below that limit, an oversized photo is
    // truncated by Next before the upload code ever runs, and the user gets an
    // uncaught "Unexpected end of form" 500 instead of the friendly
    // "keep it under 12MB" message. Modern phone photos routinely exceed 10MB.
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
