import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@pfesic.app");
  await page.getByLabel("Password", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText("Wage month")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.describe("desktop", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "desktop flow"));

  test("walk-in work, paid now, gives a receipt", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Walk-in work" }).click();
    await page.getByLabel("Name").fill("Sanjeev Kumar Dey");
    await page.getByRole("button", { name: "PF claim" }).click();
    await expect(page.getByLabel("Amount")).toHaveValue("200");
    await page.getByRole("button", { name: "Save and issue receipt" }).click();
    await expect(page.locator("[data-receipt]:visible")).toContainText("Sanjeev Kumar Dey");
    await expect(page.locator("[data-receipt]:visible")).toContainText("₹200");
  });

  test("Ctrl+K finds a client and opens them", async ({ page }) => {
    await signIn(page);
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder(/Client \(any spelling\)/).fill("sanjeev");
    await page.getByRole("option", { name: /Sanjeev Kumar Dey/ }).first().click();
    await expect(page.getByRole("heading", { name: "Sanjeev Kumar Dey" })).toBeVisible();
  });

  test("a shared expense counts in the settlement", async ({ page }) => {
    await signIn(page);
    await page.goto("/reports?tab=settle");
    await page.getByRole("button", { name: "Add expense" }).click();
    await page.getByLabel("What for").fill("Printer ink");
    await page.getByLabel("Amount").fill("1850");
    await page.getByRole("radio", { name: "Rajeev" }).click();
    await page.getByRole("button", { name: "Save expense" }).click();
    await expect(page.getByText("Printer ink")).toBeVisible();
    await expect(page.getByText(/minus shared expenses/)).toBeVisible();
    const card = page.locator("div", { has: page.getByText("Rajeev · 50%") }).last();
    await expect(page.getByText("₹1,850").first()).toBeVisible();
    void card;
  });

  test("client statement downloads as a PDF", async ({ page }) => {
    await signIn(page);
    await page.goto("/?month=2026-10");
    await page.getByRole("row").filter({ has: page.locator("td:nth-child(6) span.tabular") }).first().getByRole("link").first().click();
    await page.getByRole("link", { name: "Statement" }).click();
    await expect(page.locator("[data-statement]")).toContainText("खाता विवरण");
    await page.getByRole("radio", { name: "English" }).click();
    await expect(page.locator("[data-statement]")).toContainText("Account Statement");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PDF" }).click()]);
    expect(dl.suggestedFilename()).toMatch(/^Statement-.*-en\.pdf$/);
    expect(readFileSync((await dl.path())!).subarray(0, 5).toString()).toBe("%PDF-");
  });
});

test("phone: swipe a client right to record a payment", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone only");
  await signIn(page);
  await page.goto("/?month=2026-10");
  await expect(page.getByText(/Tip: swipe a client/)).toBeVisible();
  const row = page.locator("li").filter({ has: page.getByRole("button", { name: /Record payment for/ }) }).first();
  await row.scrollIntoViewIfNeeded();
  const box = (await row.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 30, y);
  await page.mouse.down();
  for (let x = 40; x <= 220; x += 20) await page.mouse.move(box.x + x, y);
  await page.mouse.up();
  await expect(page.locator("#pay-amount")).toBeVisible();
  await expect(page).toHaveURL(/\/\?month=2026-10$/); // stayed on the board: the swipe wasn't also a tap
});
