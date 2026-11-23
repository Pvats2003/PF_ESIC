import { expect, test, type Page } from "@playwright/test";

// Clients, reminders, challans and Today's queue on made-up demo data.

async function signIn(page: Page) {
  // Record WhatsApp hand-offs instead of opening a real tab
  await page.addInitScript(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((url: string) => { (window as unknown as { __opened: string[] }).__opened.push(String(url)); return null; }) as typeof window.open;
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@pfesic.app");
  await page.getByLabel("Password", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText("Wage month")).toBeVisible();
}

test.describe.configure({ mode: "serial" });
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "desktop flow"));

test("add a client, then edit their charge", async ({ page }) => {
  await signIn(page);
  await page.goto("/clients");
  await page.getByRole("button", { name: "Add client" }).click();
  await page.getByLabel("Firm name", { exact: true }).fill("E2E NEW FIRM");
  await page.getByLabel("Owner name").fill("Test Owner");
  await page.getByLabel("Phone", { exact: true }).fill("094304 49312");
  await page.getByLabel("Usual service charge").fill("750");
  await page.getByRole("button", { name: "Add client", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "E2E NEW FIRM" })).toBeVisible();
  await expect(page.getByText("94304 49312")).toBeVisible(); // stored as +91, shown nicely

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Usual service charge").fill("900");
  await page.getByLabel("Phone", { exact: true }).fill("12345");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/isn't a valid Indian mobile number/)).toBeVisible();
  await page.getByLabel("Phone", { exact: true }).fill("+91 94304 49312");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("₹900")).toBeVisible();
});

test("send a reminder, then file the challan", async ({ page }) => {
  await signIn(page);
  await page.goto("/?month=2026-11");
  await page.getByRole("tab", { name: /Not notified/ }).click();
  const row = page.getByRole("row").filter({ has: page.getByRole("button", { name: /Send reminder to/ }) }).first();
  const firm = (await row.getByRole("link").first().locator("span.truncate").first().textContent())!.trim();
  await row.getByRole("button", { name: /Send reminder to/ }).click();
  const msg = page.getByRole("textbox", { name: "Message" });
  await expect(msg).toHaveValue(/कुल देय राशि/);
  await page.getByRole("radio", { name: "English" }).click();
  await expect(msg).toHaveValue(/Total payable/);
  await page.getByRole("button", { name: "Send on WhatsApp" }).click();
  const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
  expect(opened[0]).toMatch(/^https:\/\/wa\.me\/\d*\?text=Namaste/);
  await expect(page.getByText("Message handed to WhatsApp")).toBeVisible();

  // Now on the client page: record PF challan (we pay → TRRN is enough).
  // The client has left the "Not notified" filter, so look in All.
  await page.getByRole("tab", { name: /^All/ }).click();
  await page.getByLabel("Search clients").fill(firm.slice(0, 14));
  await page.getByRole("row").filter({ hasText: firm }).getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: firm })).toBeVisible();
  const nov = page.getByRole("row").filter({ hasText: "November 2026" });
  await nov.getByRole("button", { name: "Add or correct challan" }).click();
  await page.getByLabel("TRRN").fill("3162612004578");
  await page.getByRole("button", { name: "Save challan" }).click();
  await expect(page.getByText("PF challan saved")).toBeVisible();
  // We paid it, so the app offers to tell the client, with the TRRN in the message
  await page.getByRole("button", { name: "Tell the client" }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue(/3162612004578/);
  await page.getByRole("button", { name: "Send on WhatsApp" }).click();
  await expect(page.getByText("Message handed to WhatsApp")).toBeVisible();
  await expect(nov).toContainText("PF Filed · 3162612004578");
  await expect(page.getByRole("listitem").filter({ hasText: "Dues reminder" }).filter({ hasText: "Shared" }).first()).toBeVisible(); // message history
});

test("client-paid challan needs confirmed proof", async ({ page }) => {
  await signIn(page);
  await page.goto("/?month=2026-11");
  const row = page.getByRole("row").filter({ hasText: "Client pays challan" }).filter({ hasNotText: "Amounts not entered" }).first();
  await row.getByRole("link").first().click();
  const nov = page.getByRole("row").filter({ hasText: "November 2026" });
  await nov.getByRole("button", { name: "Add or correct challan" }).click();
  await page.getByLabel("TRRN").fill("3162612009999");
  await page.getByRole("button", { name: "Save challan" }).click();
  await expect(nov.getByRole("button", { name: "Confirm PF" })).toBeVisible();
  await nov.getByRole("button", { name: "Confirm PF" }).click();
  await page.getByRole("button", { name: "Confirm challan" }).click();
  await expect(page.getByText("Attach the challan proof first")).toBeVisible();
  await page.locator("#v-file").setInputFiles({ name: "challan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 demo challan") });
  await page.getByLabel(/I've checked the TRRN/).check();
  await page.getByRole("button", { name: "Confirm challan" }).click();
  await expect(page.getByText("PF challan confirmed")).toBeVisible();
  await expect(nov).toContainText("PF Verified");
});

test("Today's queue walks through clients one at a time", async ({ page }) => {
  await signIn(page);
  await page.goto("/queue");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  const first = await page.locator("main a[href^='/clients/']").first().textContent();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.locator("main a[href^='/clients/']").first()).not.toHaveText(first!);
  await page.getByRole("button", { name: /^Send reminders/ }).click(); // show only reminders
  await expect(page.getByText(/left in send reminders/)).toBeVisible();
  await page.getByRole("button", { name: "Send reminder", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue(/\S/);
});
