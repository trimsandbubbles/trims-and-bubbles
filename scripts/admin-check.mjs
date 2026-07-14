// Verifies the new admin panel pages: renders console-clean at desktop +
// mobile, and exercises the interactive flows (complete-with-photo, manual
// payment recording, mark-paid, refund, service price edit, settings save,
// owner-only gating).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const baseUrl = "http://localhost:3000";
const outDir = "/tmp/admin-screens";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

let totalIssues = 0;
let failures = 0;
function check(label, cond) {
  console.log(`${cond ? "PASS" : "FAIL"} — ${label}`);
  if (!cond) failures++;
}

/** Below-the-fold `loading="lazy"` images don't even start fetching until
 * scrolled near the viewport, so waiting on "load" without scrolling first
 * can hang forever. Scroll through the page first, then race load/error/
 * timeout per image as a backstop so one broken image can't hang the run. */
async function waitForImages(page, timeoutMs = 8000) {
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

async function loginAs(page, email, password) {
  await page.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin$/, { timeout: 15000 });
}

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
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

console.log("=== Log in as owner ===");
await loginAs(page, "owner@trimsandbubbles.example", "OwnerPass123!");

console.log("\n=== Clients ===");
await page.goto(`${baseUrl}/admin/clients`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${outDir}/clients-list.png`, fullPage: true });
check("Clients list shows Sarah Thompson", (await page.getByText("Sarah Thompson").count()) > 0);
await page.fill('input[placeholder="Search clients..."]', "sarah");
await page.waitForTimeout(300);
check("Search filters to 1 client row", (await page.locator("tbody tr").count()) === 1);
await page.click('a:has-text("Sarah Thompson")');
await page.waitForURL(/\/admin\/clients\/.+/);
await page.waitForLoadState("networkidle");
await waitForImages(page);
await page.screenshot({ path: `${outDir}/client-detail.png`, fullPage: true });
check("Client detail shows Bella", (await page.getByText("Bella").count()) > 0);

console.log("\n=== Client notes save ===");
await page.fill("textarea", "Prefers a gentle brush, a little nervous about clippers.");
await page.click('button:has-text("Save notes")');
await page.waitForTimeout(1000);
await page.reload({ waitUntil: "networkidle" });
check("Client notes persisted after reload", (await page.locator("textarea").inputValue()).includes("nervous about clippers"));

console.log("\n=== Pet detail (via client page) ===");
await page.click('a:has-text("Bella")');
await page.waitForURL(/\/admin\/pets\/.+/);
await page.waitForLoadState("networkidle");
await waitForImages(page);
await page.screenshot({ path: `${outDir}/pet-detail.png`, fullPage: true });
check("Admin pet detail shows grooming history", (await page.getByText("Grooming history").count()) > 0);

console.log("\n=== Appointment detail: complete a CONFIRMED appointment with photo ===");
await page.goto(`${baseUrl}/admin/calendar`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
// Switch to month view to reliably see events regardless of "today".
await page.click('button:has-text("month")');
await page.waitForTimeout(500);
const eventCountBefore = await page.locator(".fc-event").count();
check("Calendar shows at least one event", eventCountBefore > 0);
await page.locator(".fc-event").first().click();
await page.waitForURL(/\/admin\/appointments\/.+/);
await page.waitForLoadState("networkidle");
await waitForImages(page);
await page.screenshot({ path: `${outDir}/appointment-detail-before.png`, fullPage: true });

const photoInput = page.locator("#photo-input");
await photoInput.setInputFiles("public/seed-images/bella-cavoodle.jpg");
await page.fill("#note", "Playwright verification note — trimmed nicely, no issues.");
await page.click('button:has-text("Save & Mark Complete"), button:has-text("Save")');
await page.waitForTimeout(2000);
await waitForImages(page);
await page.screenshot({ path: `${outDir}/appointment-detail-after.png`, fullPage: true });
check("Appointment now shows Completed status", (await page.getByText("Completed", { exact: true }).count()) > 0);
check("Groomer note appears", (await page.getByText("Playwright verification note").count()) > 0);

console.log("\n=== Record a manual cash payment on a PENDING_PAYMENT appointment ===");
await page.goto(`${baseUrl}/admin/clients`, { waitUntil: "networkidle" });
await page.fill('input[placeholder="Search clients..."]', "luna");
// Luna belongs to Emma Wilson.
await page.fill('input[placeholder="Search clients..."]', "emma");
await page.waitForTimeout(300);
await page.click('a:has-text("Emma Wilson")');
await page.waitForURL(/\/admin\/clients\/.+/);
await page.waitForLoadState("networkidle");
await page.locator('a:has-text("Full Groom")').first().click();
await page.waitForURL(/\/admin\/appointments\/.+/);
await page.waitForLoadState("networkidle");
const beforeBalance = await page.locator("text=Balance owing").locator("..").innerText();
console.log("Balance row before:", beforeBalance.replace(/\s+/g, " "));
await page.click('button:has-text("Record payment")');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/manual-payment-recorded.png`, fullPage: true });
check("Payment recorded — appointment now Confirmed", (await page.getByText("Confirmed", { exact: true }).count()) > 0);

console.log("\n=== Admin payments list: mark-paid + refund ===");
await page.goto(`${baseUrl}/admin/payments`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${outDir}/payments-list.png`, fullPage: true });
const pendingBadgeCountBefore = await page.getByText("Pending", { exact: true }).count();
console.log("Pending payment rows before:", pendingBadgeCountBefore);
const markPaidBtn = page.locator('button:has-text("Mark paid (cash)")').first();
if (await markPaidBtn.count()) {
  await markPaidBtn.click();
  await page.waitForTimeout(1200);
  const pendingBadgeCountAfter = await page.getByText("Pending", { exact: true }).count();
  check("Mark paid (cash) reduced pending count", pendingBadgeCountAfter < pendingBadgeCountBefore);
} else {
  console.log("SKIP — no pending payment row available to mark paid");
}
const refundBtn = page.locator('button:has-text("Refund")').first();
if (await refundBtn.count()) {
  page.once("dialog", (d) => d.accept());
  await refundBtn.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outDir}/payments-after-refund.png`, fullPage: true });
  check("A Refund row now appears", (await page.getByText("Refund", { exact: true }).count()) > 0);
} else {
  console.log("SKIP — no paid payment row available to refund");
}

console.log("\n=== Services editor ===");
await page.goto(`${baseUrl}/admin/services`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${outDir}/services-list.png`, fullPage: true });
// Field order per service card is [duration, price x N] — index 1 is the
// first *price* field (index 0 is duration, also type="number").
const firstPriceInput = page.locator('input[type="number"]').nth(1);
const originalValue = await firstPriceInput.inputValue();
await firstPriceInput.fill("123.45");
await page.locator('button:has-text("Save")').first().click();
await page.waitForTimeout(1200);
await page.reload({ waitUntil: "networkidle" });
const reloadedValue = await page.locator('input[type="number"]').nth(1).inputValue();
check("Service price change persisted", reloadedValue === "123.45");
// restore original value so seed data stays representative
await page.locator('input[type="number"]').nth(1).fill(originalValue);
await page.locator('button:has-text("Save")').first().click();
await page.waitForTimeout(1000);

console.log("\n=== Settings ===");
await page.goto(`${baseUrl}/admin/settings`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${outDir}/settings.png`, fullPage: true });
await page.fill("#contact-phone", "02 6100 1234");
await page.click('button:has-text("Save settings")');
await page.waitForTimeout(1200);
await page.reload({ waitUntil: "networkidle" });
check("Settings phone persisted after reload", (await page.inputValue("#contact-phone")) === "02 6100 1234");

console.log("\n=== Owner-only gating: staff account redirected away ===");
await page.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
await page.click('button[aria-label="Sign out"], a:has-text("Sign out")').catch(() => {});
await context.clearCookies();
await loginAs(page, "staff@trimsandbubbles.example", "StaffPass123!");
await page.goto(`${baseUrl}/admin/settings`, { waitUntil: "networkidle" });
check("Staff redirected away from /admin/settings", page.url().endsWith("/admin"));
await page.goto(`${baseUrl}/admin/services`, { waitUntil: "networkidle" });
check("Staff redirected away from /admin/services", page.url().endsWith("/admin"));

await context.close();
await browser.close();

console.log(`\nTotal console issues: ${totalIssues}`);
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures > 0 || totalIssues > 0 ? 1 : 0);
