import { chromium, request } from "playwright";

const BASE = "http://localhost:3000";
const OWNER = { email: "owner@trimsandbubbles.example", password: "OwnerPass123!" };
const shot = (name) => `C:/Users/AYATAW~1/AppData/Local/Temp/claude/C--Users-ayatawara-Documents-Anjana-Trims-and-bubbless/f05c6593-2b96-40ed-a335-1bd7e34b3be6/scratchpad/${name}`;

const results = [];
const log = (ok, msg) => { results.push(`${ok ? "PASS" : "FAIL"}: ${msg}`); console.log(`${ok ? "PASS" : "FAIL"}: ${msg}`); };

const browser = await chromium.launch();

// --- 1. Logged-OUT visitor must NOT see any edit affordance ---
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const toolbar = await page.getByText("Edit page text & photos").count();
  log(toolbar === 0, `logged-out visitor sees NO edit toolbar (found ${toolbar})`);
  await ctx.close();
}

// --- 2. Authenticate as owner via the API, capture cookies ---
const api = await request.newContext();
const resp = await api.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: OWNER.email, password: OWNER.password },
  headers: { origin: BASE, "content-type": "application/json" },
});
log(resp.ok(), `owner sign-in API ok (HTTP ${resp.status()})`);
const storageState = await api.storageState();

// --- 3. Owner context sees the edit toolbar on home ---
const ctx = await browser.newContext({ storageState, viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const toggle = page.getByRole("button", { name: /Edit page text/i });
await toggle.waitFor({ timeout: 10000 });
log(await toggle.isVisible(), "owner sees 'Edit page text & photos' toolbar on home");
await page.screenshot({ path: shot("edit-01-toolbar.png") });

// --- 4. Enter edit mode → editable affordances appear ---
await toggle.click();
await page.waitForTimeout(500);
const editable = page.locator('[title="Click to edit"]');
const editableCount = await editable.count();
log(editableCount > 0, `edit mode shows ${editableCount} click-to-edit text targets`);
const changePhoto = await page.getByRole("button", { name: /Change photo|Add photo/i }).count();
log(changePhoto > 0, `edit mode shows ${changePhoto} image 'Change/Add photo' controls`);
await page.screenshot({ path: shot("edit-02-editmode.png"), fullPage: true });

// --- 5. Edit a text field and save ---
const marker = `QA edit ${Date.now()}`;
const first = editable.first();
await first.scrollIntoViewIfNeeded();
await first.click();
const textarea = page.getByLabel("Edit text").first();
await textarea.waitFor({ timeout: 5000 });
await textarea.fill(marker);
await page.getByRole("button", { name: /^Save/ }).first().click();
await page.waitForTimeout(1800);
const shownAfterSave = await page.getByText(marker).count();
log(shownAfterSave > 0, `edited text shows immediately after Save (found ${shownAfterSave})`);

// --- 6. Reload → change persisted to DB ---
await page.reload({ waitUntil: "networkidle" });
const persisted = await page.getByText(marker).count();
log(persisted > 0, `edited text PERSISTED after reload (found ${persisted})`);
await page.screenshot({ path: shot("edit-03-persisted.png") });

// --- 7. Edit mode persists across navigation (provider lives in layout) ---
await page.goto(`${BASE}/about`, { waitUntil: "networkidle" });
const stillEditing = await page.locator('[title="Click to edit"]').count();
log(stillEditing > 0, `edit mode persists onto /about (found ${stillEditing} targets)`);

await api.dispose();
await browser.close();

console.log("\n===== SUMMARY =====");
console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${failed === 0 ? "ALL PASSED" : failed + " FAILED"}`);
process.exit(failed === 0 ? 0 : 1);
