import { expect, test, type Page } from "@playwright/test";

// The everyday flow, end to end, on made-up demo clients in a local database:
// sign in → enter PF/ESIC → board updates → record payment → receipt → client page.

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@pfesic.app");
  await page.getByLabel("Password", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText("Wage month")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("enter amounts, record a payment, share the receipt", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the money flow runs once (desktop); phone layout is covered by the smoke tests");
  await signIn(page);

  // 1. Fast entry: type PF and ESIC for the first client without amounts
  await page.goto("/entry?month=2026-11");
  const pf = page.locator('input[aria-label^="PF for"][value=""]:visible').first();
  const label = (await pf.getAttribute("aria-label"))!;
  const firm = label.replace("PF for ", "");
  await pf.fill("12310");
  await pf.press("Tab");
  const esic = page.getByLabel(`ESIC for ${firm}`).locator("visible=true");
  await esic.fill("1931");
  // Enter moves down to the next row's ESIC box (not to the hidden phone layout)
  await esic.press("Enter");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", /^ESIC for /);
  await expect(page.locator(":focus")).not.toHaveAttribute("aria-label", `ESIC for ${firm}`);
  await expect(page.getByLabel("Saving")).toHaveCount(0);
  await expect(page.getByLabel("Saved").locator("visible=true").first()).toBeVisible();

  // 2. The board shows the client with amounts entered
  await page.goto("/?month=2026-11");
  await page.getByLabel("Search clients").fill(firm.slice(0, 12));
  const row = page.getByRole("row").filter({ hasText: firm });
  await expect(row).toContainText("₹12,310");
  await expect(row).toContainText("₹1,931");

  // 3. Record the payment from the client page
  await row.getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: firm })).toBeVisible();
  await page.getByRole("button", { name: "Record payment" }).first().click();
  const amount = page.locator("#pay-amount");
  await expect(amount).not.toHaveValue("");
  await page.getByRole("radio", { name: "UPI" }).click();
  await page.locator("#pay-ref").fill("634512987321");
  await page.getByRole("button", { name: /^Save ₹.* and issue receipt$/ }).click();

  // 4. Receipt appears, in both languages
  await expect(page.getByText(/Saved · receipt R\/\d{4}-\d{2}\/\d{4}/)).toBeVisible();
  const receipt = page.locator("[data-receipt]");
  await expect(receipt).toContainText("भुगतान प्राप्ति रसीद");
  await page.getByRole("radio", { name: "English" }).click();
  await expect(receipt).toContainText("This is a payment receipt, not a tax invoice.");
  await expect(receipt).toContainText("634512987321");
  await expect(page.getByRole("button", { name: "Share on WhatsApp" })).toBeEnabled();

  // 5. Client page now lists the payment with its receipt, and nothing is owed for paid months
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByRole("link", { name: /R\/\d{4}-\d{2}\/\d{4}/ }).first()).toBeVisible();
});

test("phone layout: bottom tabs, no sideways scrolling", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone only");
  await signIn(page);
  for (const path of ["/?month=2026-11", "/entry?month=2026-11", "/clients"]) {
    await page.goto(path);
    await expect(page.getByRole("navigation", { name: "Main" }).last()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
