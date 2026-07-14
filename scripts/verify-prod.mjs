import { chromium, request } from "playwright";

const BASE = "https://trims-and-bubbles.vercel.app";
const OWNER = { email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD };
const results = [];
const log = (ok, msg) => { results.push(`${ok ? "PASS" : "FAIL"}: ${msg}`); console.log(`${ok ? "PASS" : "FAIL"}: ${msg}`); };

// --- 1. Homepage + security headers ---
const api = await request.newContext();
const home = await api.get(`${BASE}/`);
log(home.ok(), `homepage HTTP ${home.status()}`);
const h = home.headers();
log(!!h["content-security-policy"], "CSP header present");
log(!!h["strict-transport-security"], "HSTS header present");
log(h["x-frame-options"] === "DENY", "X-Frame-Options DENY");
log(h["x-content-type-options"] === "nosniff", "nosniff present");
log(!h["x-powered-by"], "x-powered-by hidden");

// --- 2. Old demo owner login must FAIL (no demo accounts in prod) ---
const demo = await api.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: "owner@trimsandbubbles.example", password: "OwnerPass123!" },
  headers: { origin: BASE, "content-type": "application/json" },
});
log(!demo.ok(), `demo owner login rejected (HTTP ${demo.status()})`);

// --- 3. Real owner sign-in with NEW credentials ---
const resp = await api.post(`${BASE}/api/auth/sign-in/email`, {
  data: OWNER,
  headers: { origin: BASE, "content-type": "application/json" },
});
log(resp.ok(), `owner sign-in with new credentials (HTTP ${resp.status()})`);
const storageState = await api.storageState();

const browser = await chromium.launch();

// --- 4. Logged-out visitor sees no edit toolbar ---
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const toolbar = await page.getByText("Edit page text & photos").count();
  log(toolbar === 0, `logged-out visitor sees NO edit toolbar (found ${toolbar})`);
  await ctx.close();
}

// --- 5. Owner sees the edit toolbar; edit mode reveals targets (no save) ---
const ctx = await browser.newContext({ storageState });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const toggle = page.getByRole("button", { name: /Edit page text/i });
await toggle.waitFor({ timeout: 15000 });
log(await toggle.isVisible(), "owner sees 'Edit page text & photos' toolbar");
await toggle.click();
await page.waitForTimeout(600);
const editable = await page.locator('[title="Click to edit"]').count();
log(editable > 0, `edit mode shows ${editable} click-to-edit text targets`);
const changePhoto = await page.getByRole("button", { name: /Change photo|Add photo/i }).count();
log(changePhoto > 0, `edit mode shows ${changePhoto} photo controls`);

// --- 6. Admin reachable for owner ---
await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
log(!page.url().includes("/login"), `owner reaches /admin (at ${page.url()})`);

// --- 7. Store shows Coming in 2028 / out of stock ---
await page.goto(`${BASE}/store`, { waitUntil: "networkidle" });
const badge2028 = await page.getByText("Coming in 2028").count();
const outOfStock = await page.getByText("Out of stock").count();
log(badge2028 > 0, `store shows ${badge2028} 'Coming in 2028' badges`);
log(outOfStock > 0, `store shows ${outOfStock} 'Out of stock' overlays`);

// --- 8. Gallery page + section present ---
await page.goto(`${BASE}/gallery`, { waitUntil: "networkidle" });
const friends = await page.getByText(/Dog friends over the years/i).count();
log(friends > 0, "'Dog friends over the years' section present");

// --- 9. Admin login page rejects wrong password (sanity) ---
const bad = await api.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: OWNER.email, password: "WrongPassword999!" },
  headers: { origin: BASE, "content-type": "application/json" },
});
log(!bad.ok(), `wrong password rejected (HTTP ${bad.status()})`);

await api.dispose();
await browser.close();
console.log("\n===== SUMMARY =====");
console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${failed === 0 ? "ALL PASSED" : failed + " FAILED"}`);
process.exit(failed === 0 ? 0 : 1);
