// Verifies the client portal depth pages (pets, pet detail, appointments,
// appointment detail, payments, profile): logs in as a seeded demo client
// with rich data (Sarah Thompson — completed appointment w/ photo, note,
// payments), visits every new page at desktop + mobile viewports, captures
// console/pageerror issues, and screenshots each.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const baseUrl = process.env.SCREENSHOT_BASE_URL || "http://localhost:3000";
const outDir = "/tmp/portal-screens";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

let totalIssues = 0;

/** next/image lazy-loads by default; networkidle can resolve before the
 * image finish event fires and paints, producing a false-positive "blank
 * image" in a screenshot even though the request succeeded. Wait for every
 * <img> on the page to actually finish decoding first. */
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

async function checkViewport(name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      console.log(`[${name}][${type}] ${msg.text()}`);
      totalIssues++;
    }
  });
  page.on("pageerror", (err) => {
    console.log(`[${name}][pageerror] ${err.message}`);
    totalIssues++;
  });

  console.log(`\n=== ${name} (${viewport.width}x${viewport.height}) ===`);
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", "sarah.thompson@example.com");
  await page.fill("#password", "ClientPass123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/portal$/, { timeout: 15000 });

  const pages = [
    { path: "/portal", file: "1-dashboard" },
    { path: "/portal/pets", file: "2-pets" },
    { path: "/portal/appointments", file: "4-appointments" },
    { path: "/portal/payments", file: "5-payments" },
    { path: "/portal/profile", file: "6-profile" },
  ];

  for (const p of pages) {
    await page.goto(`${baseUrl}${p.path}`, { waitUntil: "networkidle" });
    await waitForImages(page);
    await page.screenshot({ path: `${outDir}/${name}-${p.file}.png`, fullPage: true });
  }

  // Drill into a pet detail page and an appointment detail page (need real IDs).
  await page.goto(`${baseUrl}/portal/pets`, { waitUntil: "networkidle" });
  const firstPetLink = page.locator('a[href^="/portal/pets/"]').first();
  await firstPetLink.click();
  await page.waitForURL(/\/portal\/pets\/.+/);
  await page.waitForLoadState("networkidle");
  await waitForImages(page);
  await page.screenshot({ path: `${outDir}/${name}-3-pet-detail.png`, fullPage: true });

  await page.goto(`${baseUrl}/portal/appointments`, { waitUntil: "networkidle" });
  const firstAptLink = page.locator('a[href^="/portal/appointments/"]').first();
  await firstAptLink.click();
  await page.waitForURL(/\/portal\/appointments\/.+/);
  await page.waitForLoadState("networkidle");
  await waitForImages(page);
  await page.screenshot({ path: `${outDir}/${name}-7-appointment-detail.png`, fullPage: true });

  await context.close();
}

await checkViewport("desktop", { width: 1440, height: 900 });
await checkViewport("mobile", { width: 390, height: 844 });

await browser.close();
console.log(`\nTotal console issues across all pages/viewports: ${totalIssues}`);
process.exit(totalIssues > 0 ? 1 : 0);
