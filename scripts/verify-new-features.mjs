/**
 * Playwright smoke test for the 2026-07-14 feature batch:
 * availability breaks + booked-slot display, social media tab, no-deposit
 * wording, client messages, expanded inline edit coverage, service photos.
 * Run against a LOCAL server seeded with the dev seed (demo accounts).
 *   node scripts/verify-new-features.mjs
 */
import { chromium, request } from "playwright";

const BASE = process.env.VERIFY_BASE_URL || "http://localhost:3000";
const OWNER = {
  email: process.env.OWNER_EMAIL || "owner@trimsandbubbles.example",
  password: process.env.OWNER_PASSWORD || "OwnerPass123!",
};
const CLIENT = { email: "sarah.thompson@example.com", password: "ClientPass123!" };

const results = [];
const log = (ok, msg) => { results.push(`${ok ? "PASS" : "FAIL"}: ${msg}`); console.log(`${ok ? "PASS" : "FAIL"}: ${msg}`); };

async function signIn(creds) {
  const api = await request.newContext();
  const resp = await api.post(`${BASE}/api/auth/sign-in/email`, {
    data: creds,
    headers: { origin: BASE, "content-type": "application/json" },
  });
  if (!resp.ok()) throw new Error(`sign-in failed for ${creds.email}: ${resp.status()}`);
  return api.storageState();
}

const browser = await chromium.launch();
const ownerState = await signIn(OWNER);
const ownerCtx = await browser.newContext({ storageState: ownerState, viewport: { width: 1280, height: 900 } });
const page = await ownerCtx.newPage();

// --- 1. Social media tab ---
await page.goto(`${BASE}/admin/social`, { waitUntil: "networkidle" });
log(!page.url().includes("/login"), "owner can open /admin/social");
const tiktokInput = page.locator('input[name="tiktokUrl"], #tiktokUrl').first();
const anyTiktok = await page.getByLabel(/tiktok/i).count() + await tiktokInput.count();
log(anyTiktok > 0, "social page has a TikTok field");
const igField = page.getByLabel(/instagram/i).first();
await igField.fill("https://instagram.com/trimsandbubbles");
await page.getByRole("button", { name: /save/i }).first().click();
await page.waitForTimeout(1500);
log(true, "saved an Instagram link (no crash)");
// Footer shows the icon on the public site
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const igIcon = await page.locator('footer a[href*="instagram.com"]').count();
log(igIcon > 0, "footer shows the Instagram icon after saving");

// --- 2. Availability: multiple windows per day ---
await page.goto(`${BASE}/admin/availability`, { waitUntil: "networkidle" });
const addBtn = page.getByRole("button", { name: /add another time/i }).first();
log((await addBtn.count()) > 0, "availability editor offers 'Add another time'");
// Give Sunday (open 09:00-17:00 in seed) a lunch break: 09:00-12:00 & 15:00-17:00
const sundayRow = page.locator("div.rounded-lg", { hasText: "Sunday" }).first();
const firstEnd = sundayRow.locator('input[type="time"]').nth(1);
await firstEnd.fill("12:00");
await sundayRow.getByRole("button", { name: /add another time/i }).click();
const secondStart = sundayRow.locator('input[type="time"]').nth(2);
const secondEnd = sundayRow.locator('input[type="time"]').nth(3);
await secondStart.fill("15:00");
await secondEnd.fill("17:00");
await page.getByRole("button", { name: /save hours/i }).click();
await page.waitForTimeout(1500);
const toastOk = await page.getByText("Opening hours updated").count();
log(toastOk > 0, "saved Sunday with two time ranges (break 12-3)");

// Contact page shows both ranges
await page.goto(`${BASE}/contact`, { waitUntil: "networkidle" });
const sundayLine = await page.locator("div", { hasText: /^Sunday/ }).last().textContent();
log(!!sundayLine && sundayLine.includes("&"), `contact hours show the split day (${(sundayLine ?? "").trim().slice(0, 60)})`);

// --- 3. /api/availability returns open + booked, honouring the break ---
const api = await request.newContext({ storageState: ownerState });
const bookPage = await api.get(`${BASE}/book`);
const bookHtml = await bookPage.text();
// The RSC payload escapes quotes (\"id\":\"...\"), so match both forms.
const serviceIdMatch = bookHtml.match(/\\?"id\\?":\\?"(c[a-z0-9]{16,})\\?"/);
if (serviceIdMatch) {
  // Next Sunday from today
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  const dateStr = d.toISOString().slice(0, 10);
  const availResp = await api.get(`${BASE}/api/availability?date=${dateStr}&serviceId=${serviceIdMatch[1]}`);
  const avail = await availResp.json();
  log(Array.isArray(avail.booked), "availability API includes a 'booked' array");
  const startsHHMM = (iso) => new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour12: false, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const inBreak = (avail.slots ?? []).filter((s) => { const t = startsHHMM(s.startAt); return t >= "12:00" && t < "15:00"; });
  log(inBreak.length === 0, `no offered Sunday slots inside the 12-3 break (found ${inBreak.length})`);
} else {
  log(false, "could not extract a serviceId from /book HTML");
}

// --- 4. Messages: owner sends, client receives ---
await page.goto(`${BASE}/admin/clients`, { waitUntil: "networkidle" });
await page.getByText("Sarah Thompson").first().click();
await page.waitForTimeout(1200);
const marker = `Bella looked adorable today! ${Date.now()}`;
const msgArea = page.locator("textarea").last();
await msgArea.fill(marker);
await page.getByRole("button", { name: /send message/i }).click();
await page.waitForTimeout(1800);
log((await page.getByText(marker).count()) > 0, "sent message appears in the admin thread");

const clientState = await signIn(CLIENT);
const clientCtx = await browser.newContext({ storageState: clientState, viewport: { width: 390, height: 844 } });
const cpage = await clientCtx.newPage();
await cpage.goto(`${BASE}/portal`, { waitUntil: "networkidle" });
const banner = await cpage.getByText(/unread message/i).count();
log(banner > 0, "client dashboard shows the unread-message banner");
await cpage.goto(`${BASE}/portal/messages`, { waitUntil: "networkidle" });
log((await cpage.getByText(marker).count()) > 0, "client sees the message in /portal/messages");

// --- 5. Booking wizard: no 'pay deposit' wording (stripe off + deposits) ---
await cpage.goto(`${BASE}/book`, { waitUntil: "networkidle" });
const bookBody = await cpage.locator("body").textContent();
log(!!bookBody && !bookBody.includes("pay deposit"), "booking page has no 'pay deposit' wording");

// --- 6. Edit mode: expanded coverage on home + about ---
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Edit page text/i }).click();
await page.waitForTimeout(600);
const homeTargets = await page.locator('[title="Click to edit"]').count();
log(homeTargets >= 10, `home edit mode shows ${homeTargets} text targets (was 6)`);
await page.goto(`${BASE}/about`, { waitUntil: "networkidle" });
// A hard navigation resets edit mode (it persists only across in-app links) —
// switch it back on for this page.
await page.getByRole("button", { name: /Edit page text/i }).click();
await page.waitForTimeout(600);
const aboutPhotoControls = await page
  .getByRole("button", { name: /Change photo|Add photo|Tap to add a photo/i })
  .count();
log(aboutPhotoControls >= 2, `about page shows ${aboutPhotoControls} photo controls (portrait + story photo)`);

// --- 7. Admin services: photo upload control present ---
await page.goto(`${BASE}/admin/services`, { waitUntil: "networkidle" });
const photoBtn = await page.getByText(/service photo|add photo|change photo/i).count();
log(photoBtn > 0, "admin Services page has service-photo controls");

await api.dispose();
await browser.close();
console.log("\n===== SUMMARY =====");
console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${failed === 0 ? "ALL PASSED" : failed + " FAILED"}`);
process.exit(failed === 0 ? 0 : 1);
