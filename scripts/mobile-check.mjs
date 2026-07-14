// Systematic mobile-viewport (390x844, iPhone-12-ish) pass across every page
// in the app — marketing, portal, and admin. Two things this adds beyond the
// existing per-area scripts (portal-check.mjs already screenshots portal at
// mobile; admin-check.mjs is desktop-only):
//   1. Admin has never been checked at a mobile viewport at all — the FullCalendar
//      widget and the multi-column services/pricing editor are exactly the kind
//      of components that tend to overflow on narrow screens.
//   2. A *programmatic* horizontal-overflow assertion (scrollWidth vs
//      clientWidth) on every page, rather than relying on eyeballing
//      screenshots — catches "a table/grid pushes the page wider than the
//      viewport" even in a spot a reviewer's eye skips past.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const baseUrl = process.env.SCREENSHOT_BASE_URL || "http://localhost:3000";
const outDir = "/tmp/mobile-screens";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

let totalIssues = 0;
let overflowCount = 0;
page.on("console", (msg) => {
  const type = msg.type();
  if (type === "error" || type === "warning") {
    console.log(`[console:${type}] ${msg.text()}`);
    totalIssues++;
  }
});
page.on("pageerror", (err) => {
  console.log(`[pageerror] ${err.message}`);
  totalIssues++;
});

/** Below-the-fold `loading="lazy"` images don't even start fetching until
 * they're scrolled near the viewport, so waiting on their "load" event
 * without scrolling first hangs forever (found by this script hanging for
 * 5+ minutes on the image-heavy home page). Scroll through the page first
 * to trigger them, then race load/error/timeout per image as a backstop so
 * a single genuinely-broken image can never hang the whole run. */
async function waitForImages(timeoutMs = 8000) {
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < scrollHeight; y += 600) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(50);
  }
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.evaluate(async (ms) => {
    const imgs = Array.from(document.querySelectorAll("img"));
    await Promise.all(
      imgs.map((img) => {
        if (img.complete) return Promise.resolve();
        return Promise.race([
          new Promise((resolve) => img.addEventListener("load", resolve, { once: true })),
          new Promise((resolve) => img.addEventListener("error", resolve, { once: true })),
          new Promise((resolve) => setTimeout(resolve, ms)),
        ]);
      }),
    );
  }, timeoutMs);
}

/** Flags elements that genuinely push the PAGE wider than the viewport —
 * deliberately excluding anything inside its own overflow-x:auto/scroll/
 * hidden ancestor. Pages like /services intentionally wrap a too-wide
 * pricing table in an overflow-x-auto div (with a "swipe sideways" hint) so
 * IT scrolls internally; that table's descendants naturally have bounding
 * rects wider than the viewport even though nothing is actually broken —
 * document.documentElement.scrollWidth reports that same raw content extent
 * transitively, regardless of intermediate clipping, so a naive
 * scrollWidth-vs-clientWidth check false-positives on every such table.
 * What actually matters for "did this break the page" is whether anything
 * OUTSIDE a scroll container's own (correctly-clamped) box is too wide. */
async function checkOverflow(label, file) {
  await waitForImages();
  const result = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;

    function hasScrollingAncestor(el) {
      for (let a = el.parentElement; a; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
      }
      return false;
    }

    const culprits = [];
    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect();
      if ((rect.right > vw + 1 || rect.left < -1) && rect.width < 2000 && !hasScrollingAncestor(el)) {
        culprits.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || "").toString().slice(0, 60),
          right: Math.round(rect.right),
        });
      }
      if (culprits.length >= 3) break;
    }
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: vw, culprits };
  });
  await page.screenshot({ path: `${outDir}/${file}.png`, fullPage: true });
  const overflowing = result.culprits.length > 0;
  if (overflowing) overflowCount++;
  console.log(
    `${overflowing ? "FAIL" : "PASS"} — ${label} (scrollWidth ${result.scrollWidth} vs viewport ${result.clientWidth})` +
      (overflowing ? ` — culprits outside any scroll container: ${JSON.stringify(result.culprits)}` : ""),
  );
}

async function visit(path, label, file) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle", timeout: 30000 });
  await checkOverflow(label, file);
}

console.log("=== Marketing (logged out) ===");
for (const [path, file] of [
  ["/", "m-home"],
  ["/services", "m-services"],
  ["/gallery", "m-gallery"],
  ["/about", "m-about"],
  ["/contact", "m-contact"],
  ["/book", "m-book"],
  ["/login", "m-login"],
  ["/register", "m-register"],
  ["/legal/privacy", "m-privacy"],
  ["/legal/terms", "m-terms"],
]) {
  await visit(path, path, file);
}

console.log("\n=== Client portal (logged in as Sarah Thompson) ===");
await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
await page.fill("#email", "sarah.thompson@example.com");
await page.fill("#password", "ClientPass123!");
await page.click('button[type="submit"]');
await page.waitForURL(/\/portal$/, { timeout: 15000 });
await checkOverflow("/portal", "p-dashboard");

for (const [path, file] of [
  ["/portal/pets", "p-pets"],
  ["/portal/appointments", "p-appointments"],
  ["/portal/payments", "p-payments"],
  ["/portal/profile", "p-profile"],
]) {
  await visit(path, path, file);
}

await page.goto(`${baseUrl}/portal/pets`, { waitUntil: "networkidle" });
await page.locator('a[href^="/portal/pets/"]').first().click();
await page.waitForURL(/\/portal\/pets\/.+/);
await page.waitForLoadState("networkidle");
await checkOverflow("/portal/pets/[id]", "p-pet-detail");

await page.goto(`${baseUrl}/portal/appointments`, { waitUntil: "networkidle" });
await page.locator('a[href^="/portal/appointments/"]').first().click();
await page.waitForURL(/\/portal\/appointments\/.+/);
await page.waitForLoadState("networkidle");
await checkOverflow("/portal/appointments/[id]", "p-appointment-detail");

console.log("\n=== Admin panel (logged in as owner) — never checked at mobile before ===");
await page.click('button[aria-label="Sign out"], a:has-text("Sign out")').catch(() => {});
await context.clearCookies();
await page.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
await page.fill("#email", "owner@trimsandbubbles.example");
await page.fill("#password", "OwnerPass123!");
await page.click('button[type="submit"]');
await page.waitForURL(/\/admin$/, { timeout: 15000 });
await checkOverflow("/admin", "a-today");

for (const [path, file] of [
  ["/admin/calendar", "a-calendar"],
  ["/admin/clients", "a-clients"],
  ["/admin/availability", "a-availability"],
  ["/admin/services", "a-services"],
  ["/admin/payments", "a-payments"],
  ["/admin/settings", "a-settings"],
]) {
  await visit(path, path, file);
}

// Also open the mobile hamburger menu itself — the nav sheet is exactly the
// kind of thing that's invisible in a "does the page overflow" check but
// broken if e.g. it doesn't fit or a link is unreachable.
await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
await page.click('button[aria-label="Open menu"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/a-nav-sheet-open.png` });
const navLinkCount = await page.locator('[role="dialog"] nav a, [data-slot="sheet-content"] nav a').count();
console.log(`${navLinkCount >= 6 ? "PASS" : "FAIL"} — admin mobile nav sheet shows all nav links (found ${navLinkCount})`);
await page.keyboard.press("Escape");

await page.goto(`${baseUrl}/admin/clients`, { waitUntil: "networkidle" });
await page.click('a:has-text("Sarah Thompson")');
await page.waitForURL(/\/admin\/clients\/.+/);
await page.waitForLoadState("networkidle");
await checkOverflow("/admin/clients/[id]", "a-client-detail");

await page.click('a:has-text("Bella")');
await page.waitForURL(/\/admin\/pets\/.+/);
await page.waitForLoadState("networkidle");
await checkOverflow("/admin/pets/[id]", "a-pet-detail");

await page.goto(`${baseUrl}/admin/calendar`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.click('button:has-text("month")').catch(() => {});
await page.waitForTimeout(500);
const eventCount = await page.locator(".fc-event").count();
if (eventCount > 0) {
  await page.locator(".fc-event").first().click();
  await page.waitForURL(/\/admin\/appointments\/.+/);
  await page.waitForLoadState("networkidle");
  await checkOverflow("/admin/appointments/[id]", "a-appointment-detail");
} else {
  console.log("SKIP — no calendar event found to drill into on mobile");
}

await context.close();
await browser.close();

console.log(`\nTotal console issues: ${totalIssues}`);
console.log(`Total pages with horizontal overflow: ${overflowCount}`);
console.log(overflowCount === 0 && totalIssues === 0 ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED");
process.exit(overflowCount > 0 || totalIssues > 0 ? 1 : 0);
