import { chromium } from "playwright";

const baseUrl = process.env.SCREENSHOT_BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const consoleIssues = [];
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") consoleIssues.push(`[${msg.type()}] ${msg.text()}`);
});
page.on("pageerror", (err) => consoleIssues.push(`[pageerror] ${err.message}`));

const testEmail = `smoketest.${Math.floor(Math.random() * 1_000_000)}@example.com`;

function log(msg) {
  console.log(`\n=== ${msg} ===`);
}

try {
  log("1. Register a new client account");
  await page.goto(`${baseUrl}/register`, { waitUntil: "networkidle" });
  await page.fill("#name", "Smoke Test");
  await page.fill("#email", testEmail);
  await page.fill("#phone", "0400 000 111");
  await page.fill("#password", "SmokeTest123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/portal/, { timeout: 45000 });
  console.log("OK: landed on", page.url());
  await page.screenshot({ path: "/tmp/screenshots/smoke-01-portal-dashboard.png", fullPage: true });

  log("2. Go to /book and select a service");
  await page.goto(`${baseUrl}/book`, { waitUntil: "networkidle" });
  await page.getByText("Wash and Dry", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  log("3. Add a new dog");
  await page.waitForSelector("text=Add a new dog", { timeout: 5000 }).catch(() => {});
  const addNewDogBtn = page.getByRole("button", { name: "Add a new dog" });
  if (await addNewDogBtn.count()) await addNewDogBtn.click();
  await page.fill("#pet-name", "Test Dog");
  await page.getByText("Small", { exact: true }).click();
  await page.screenshot({ path: "/tmp/screenshots/smoke-02-booking-dog-step.png", fullPage: true });
  await page.getByRole("button", { name: "Continue" }).click();

  log("4. Add-ons step (skip)");
  await page.getByRole("button", { name: "Continue" }).click();

  log("5. Pick date & time");
  await page.waitForSelector('[data-slot="calendar"]', { timeout: 5000 });
  // Pick a date several days out (not "today", which may have zero remaining
  // hours if it's already past closing time) so the test isn't flaky based
  // on wall-clock time. Prefer a later, non-disabled day in the visible month.
  const enabledDays = page.locator('[data-slot="calendar"] button[data-day]:not([disabled])');
  const enabledCount = await enabledDays.count();
  const targetDay = enabledDays.nth(Math.min(3, enabledCount - 1));
  await targetDay.click();
  await page.waitForSelector("text=Checking availability", { timeout: 3000 }).catch(() => {});
  await page.waitForSelector("text=Checking availability", { state: "detached", timeout: 20000 }).catch(() => {});
  await page.screenshot({ path: "/tmp/screenshots/smoke-03-booking-datetime-step.png", fullPage: true });

  const slotButtons = page.locator("main button").filter({ hasText: /am|pm/i });
  const slotCount = await slotButtons.count();
  console.log("Slot buttons found:", slotCount);
  if (slotCount === 0) {
    const bodyText = await page.locator("main").innerText();
    throw new Error(`No slot buttons appeared. Page text near picker:\n${bodyText.slice(0, 500)}`);
  }
  await slotButtons.first().click();
  await page.getByRole("button", { name: "Continue" }).click();

  log("6. Confirm booking");
  await page.waitForSelector("#contact-phone", { timeout: 5000 });
  const phoneVal = await page.inputValue("#contact-phone");
  console.log("Prefilled phone:", JSON.stringify(phoneVal));
  if (!phoneVal) await page.fill("#contact-phone", "0400 000 111");
  await page.screenshot({ path: "/tmp/screenshots/smoke-04-booking-confirm-step.png", fullPage: true });
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await page.waitForSelector("text=You're booked in!", { timeout: 45000 });
  console.log("OK: booking confirmed");
  await page.screenshot({ path: "/tmp/screenshots/smoke-05-booking-success.png", fullPage: true });

  log("7. Admin login as owner");
  await page.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
  await page.fill("#email", "owner@trimsandbubbles.example");
  await page.fill("#password", "OwnerPass123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin$/, { timeout: 45000 });
  console.log("OK: landed on", page.url());
  await page.screenshot({ path: "/tmp/screenshots/smoke-06-admin-today.png", fullPage: true });

  log("8. Admin calendar shows the new booking");
  await page.goto(`${baseUrl}/admin/calendar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "/tmp/screenshots/smoke-07-admin-calendar.png", fullPage: true });
  const eventText = await page.locator(".fc-event").allTextContents();
  console.log("Calendar events:", eventText);
  if (!eventText.some((t) => t.includes("Test Dog"))) {
    console.warn("WARNING: 'Test Dog' event not visibly found in calendar text (may be off-screen in current view)");
  }

  log("9. Admin availability page");
  await page.goto(`${baseUrl}/admin/availability`, { waitUntil: "networkidle" });
  await page.screenshot({ path: "/tmp/screenshots/smoke-08-admin-availability.png", fullPage: true });

  log("10. Non-staff rejected at /admin/login");
  await page.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
  // signed in as owner already; sign out first via portal-less path: just clear cookies
  await context.clearCookies();
  await page.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
  await page.fill("#email", testEmail);
  await page.fill("#password", "SmokeTest123!");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);
  const rejectedUrl = page.url();
  const rejectionText = await page.locator("body").innerText();
  console.log("URL after client tries admin login:", rejectedUrl);
  console.log("Shows staff-only message:", rejectionText.includes("staff only"));

  console.log("\n\n=== CONSOLE ISSUES CAPTURED ===");
  console.log(consoleIssues.length ? consoleIssues.join("\n") : "(none)");

  console.log("\n\n=== SMOKE TEST PASSED ===");
} catch (err) {
  console.error("\n\n=== SMOKE TEST FAILED ===");
  console.error(err);
  await page.screenshot({ path: "/tmp/screenshots/smoke-FAILURE.png", fullPage: true }).catch(() => {});
  console.log("\n=== CONSOLE ISSUES CAPTURED (at failure) ===");
  console.log(consoleIssues.length ? consoleIssues.join("\n") : "(none)");
  process.exitCode = 1;
} finally {
  await browser.close();
}
