import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const outDir = process.argv[2] || "/tmp/screenshots";
fs.mkdirSync(outDir, { recursive: true });

const pages = process.argv[3] ? process.argv[3].split(",") : ["/"];
const baseUrl = process.env.SCREENSHOT_BASE_URL || "http://localhost:3000";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  for (const p of pages) {
    const url = baseUrl + p;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Scroll through the full page first so below-the-fold `loading="lazy"`
    // images actually load before we capture — a fullPage screenshot taken
    // immediately after navigation can outrun lazy-loading and show gaps
    // that don't reflect what a real visitor sees.
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < scrollHeight; y += 400) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(100);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);

    const safeName = (p === "/" ? "home" : p.replace(/\//g, "_").replace(/^_/, "")) + `-${viewport.name}.png`;
    await page.screenshot({ path: path.join(outDir, safeName), fullPage: true });
    console.log(`Captured ${url} -> ${safeName}`);
  }
  await context.close();
}

await browser.close();
