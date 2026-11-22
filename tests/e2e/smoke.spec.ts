import { expect, test } from "@playwright/test";

// Phase 0 smoke test. The full happy path (enter amounts → record payment →
// share receipt) is added in Phase 2 when those screens exist.

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByText(/sign up/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /sign up|register/i })).toHaveCount(0);
});

test("style guide renders both receipt languages without horizontal scroll", async ({ page }) => {
  await page.goto("/design");
  await expect(page.getByRole("heading", { name: "Receipt" })).toBeVisible();
  await expect(page.getByText("This is a payment receipt, not a tax invoice.").first()).toBeVisible();
  await page.getByRole("radio", { name: "हिंदी" }).last().click();
  await expect(page.getByText("यह भुगतान रसीद है, कर बीजक नहीं।").first()).toBeVisible();
  await expect(page.getByText("तीस हज़ार रुपये मात्र")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("receipts never mention GST or tax invoices", async ({ page }) => {
  await page.goto("/design");
  const text = (await page.locator("[data-receipt]").allInnerTexts()).join("\n");
  expect(text).not.toMatch(/GST|Tax Invoice|GSTIN/);
});

test("PWA manifest is served", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.display).toBe("standalone");
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
});
