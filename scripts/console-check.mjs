import { chromium } from "playwright";

const pages = process.argv[2] ? process.argv[2].split(",") : ["/"];
const baseUrl = process.env.SCREENSHOT_BASE_URL || "http://localhost:3000";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

let totalIssues = 0;

page.on("console", (msg) => {
  const type = msg.type();
  if (type === "error" || type === "warning") {
    console.log(`[${type}] ${msg.text()}`);
    totalIssues++;
  }
});
page.on("pageerror", (err) => {
  console.log(`[pageerror] ${err.message}`);
  totalIssues++;
});

for (const p of pages) {
  const url = baseUrl + p;
  console.log(`--- Visiting ${url} ---`);
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
}

await browser.close();
console.log(`\nTotal console issues across all pages: ${totalIssues}`);
