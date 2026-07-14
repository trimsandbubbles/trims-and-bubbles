// Exercises the interactive parts of the new portal pages (not just
// rendering): adding a pet, saving phone/marketing prefs, and — critically —
// confirming a logged-in client CANNOT view another client's pet or
// appointment by guessing/pasting a URL (ownership isolation).
import { chromium } from "playwright";

const baseUrl = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

let failures = 0;
function check(label, cond) {
  console.log(`${cond ? "PASS" : "FAIL"} — ${label}`);
  if (!cond) failures++;
}

page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));

// James Chen's IDs (a different client account) — looked up directly from the DB.
const OTHER_PET_ID = "cmrecqqh60013w57dfrvzbeki";
const OTHER_APPOINTMENT_ID = "cmrecqr3b001mw57dtnae2szc";

console.log("1. Log in as Sarah Thompson");
await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
await page.fill("#email", "sarah.thompson@example.com");
await page.fill("#password", "ClientPass123!");
await page.click('button[type="submit"]');
await page.waitForURL(/\/portal$/, { timeout: 15000 });

console.log("2. Add a new dog via the dialog");
await page.goto(`${baseUrl}/portal/pets`, { waitUntil: "networkidle" });
await page.click('button:has-text("Add a dog")');
await page.fill("#new-pet-name", "Biscuit");
await page.fill("#new-pet-breed", "Beagle");
await page.click('button:has-text("Add dog")');
await page.waitForTimeout(1500); // dialog closes + router.refresh()
const petCount = await page.locator('a[href^="/portal/pets/"]').count();
check("New dog 'Biscuit' appears in the list", (await page.getByText("Biscuit").count()) > 0);
check("Pet list now has 2 dogs", petCount === 2);

console.log("3. Update phone number");
await page.goto(`${baseUrl}/portal/profile`, { waitUntil: "networkidle" });
await page.fill("#profile-phone", "0499 999 999");
await page.click('button:has-text("Save")');
await page.waitForTimeout(1000);
await page.reload({ waitUntil: "networkidle" });
const phoneVal = await page.inputValue("#profile-phone");
check("Phone number persisted after reload", phoneVal === "0499 999 999");

console.log("4. Toggle marketing opt-in");
const switchEl = page.locator('[role="switch"]');
const before = await switchEl.getAttribute("aria-checked");
await switchEl.click();
await page.waitForTimeout(1000);
await page.reload({ waitUntil: "networkidle" });
const after = await page.locator('[role="switch"]').getAttribute("aria-checked");
check("Marketing opt-in toggle persisted after reload", before !== after);

console.log("5. Security: try another client's pet by direct URL");
const petResp = await page.goto(`${baseUrl}/portal/pets/${OTHER_PET_ID}`, { waitUntil: "networkidle" });
check("Other client's pet URL returns 404", petResp.status() === 404);

console.log("6. Security: try another client's appointment by direct URL");
const aptResp = await page.goto(`${baseUrl}/portal/appointments/${OTHER_APPOINTMENT_ID}`, { waitUntil: "networkidle" });
check("Other client's appointment URL returns 404", aptResp.status() === 404);

await browser.close();
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures > 0 ? 1 : 0);
