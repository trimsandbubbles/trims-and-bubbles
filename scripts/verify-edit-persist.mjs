import { chromium, request } from "playwright";
const BASE = "http://localhost:3000";
const OWNER = { email: "owner@trimsandbubbles.example", password: "OwnerPass123!" };
const browser = await chromium.launch();
const api = await request.newContext();
await api.post(`${BASE}/api/auth/sign-in/email`, { data: OWNER, headers: { origin: BASE, "content-type": "application/json" } });
const storageState = await api.storageState();
// Desktop viewport so header nav links are visible (not behind hamburger).
const ctx = await browser.newContext({ storageState, viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Edit page text/i }).click();
await page.waitForTimeout(400);
const before = await page.locator('[title="Click to edit"]').count();
// Client-side navigation via a real in-app link (not a hard load).
await page.getByRole("link", { name: "About", exact: true }).first().click();
await page.waitForURL("**/about", { timeout: 8000 });
await page.waitForTimeout(500);
const after = await page.locator('[title="Click to edit"]').count();
const ok = after > 0;
console.log(`home edit targets: ${before}, /about after client-nav: ${after}`);
console.log(ok ? "PASS: edit mode persists across in-app navigation" : "FAIL: edit mode lost on nav");
await api.dispose();
await browser.close();
process.exit(ok ? 0 : 1);
