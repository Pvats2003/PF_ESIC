import ExcelJS from "exceljs";
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

  test("settings: edit a message template and see the preview", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings");
    await page.getByRole("radiogroup", { name: "Language", exact: true }).getByRole("radio", { name: "English" }).click();
    const box = page.getByLabel("Overdue, polite");
    await box.fill("Dear {owner_name}, {firm_name} owes ₹{balance}. {business_name}");
    await expect(page.getByText("Dear Ramesh, UTTAM ENGINEERING owes ₹14,741. Rajeev Kumar Mishra")).toBeVisible();
    await box.locator("xpath=..").getByRole("button", { name: "Save message" }).click();
    await expect(page.getByText("Message saved")).toBeVisible();
    await page.reload();
    await page.getByRole("radiogroup", { name: "Language", exact: true }).getByRole("radio", { name: "English" }).click();
    await expect(page.getByLabel("Overdue, polite")).toHaveValue(/owes ₹\{balance\}/);
  });

  test("reports: reconciliation, settlement and receipts", async ({ page }) => {
    await signIn(page);
    await page.goto("/reports?from=2026-04&to=2026-12");
    await expect(page.getByText(/Everything reconciles|don't add up/)).toBeVisible();
    await expect(page.getByText("Received").first()).toBeVisible();
    await page.getByRole("radio", { name: "Cash / UPI / Bank" }).click();
    await expect(page.getByRole("cell", { name: "Cash" })).toBeVisible();
    await page.getByRole("link", { name: "Partner settlement" }).click();
    await expect(page.getByText("Settlement for this period")).toBeVisible();
    await expect(page.getByText(/All square|Pays the other partner|Receives from the other partner/).first()).toBeVisible();
    await expect(page.getByText(/Government money with Alok/)).toBeVisible();
    await page.getByRole("link", { name: "Receipts", exact: true }).click();
    await expect(page.getByRole("link", { name: /R\/2026-27\/\d{4}/ }).first()).toBeVisible();
  });

  test("Excel export opens with one sheet per month in the old layout", async ({ page }) => {
    await signIn(page);
    await page.goto("/reports?tab=export&from=2026-10&to=2026-11");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Download/ }).click()]);
    expect(download.suggestedFilename()).toBe("PF-ESIC-Desk-2026-10-to-2026-11.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile((await download.path())!);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["NOV 26", "OCT 26", "PAYMENTS"]);
    const nov = wb.getWorksheet("NOV 26")!;
    expect(nov.getRow(2).values).toEqual([, "SL. NO.", "CONTRACTOR", "PF", "ESIC", "TOTAL", "CHARGE", "REMARK"]);
    const totalRow = nov.getColumn(2).values.findIndex((v) => v === "TOTAL");
    expect(String((nov.getCell(`F${totalRow}`).value as { formula: string }).formula)).toMatch(/^SUM\(F3:F\d+\)$/);
  });

  test("reissue a receipt, then void a payment", async ({ page }) => {
    await signIn(page);
    await page.goto("/reports?tab=receipts&from=2026-04&to=2026-12");
    const first = page.getByRole("link", { name: /R\/2026-27\/\d{4}/ }).first();
    const oldNo = (await first.textContent())!.trim();
    await first.click();
    await page.getByRole("button", { name: "Reissue" }).click();
    await page.getByLabel("Why?").fill("PF amount corrected");
    await page.getByRole("button", { name: "Reissue receipt" }).click();
    await expect(page.getByText(/New receipt R\/2026-27\/\d{4}/)).toBeVisible();
    await expect(page.locator("[data-receipt]:visible")).not.toContainText(oldNo);

    // Void a payment from a client page (October: most clients have paid)
    await page.goto("/?month=2026-10");
    const paidRow = page.getByRole("row").filter({ has: page.locator("td:nth-child(6) span.tabular") }).first();
    await paidRow.getByRole("link").first().click();
    const payment = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: /^Void payment of/ }) }).first();
    await payment.getByRole("button", { name: /^Void payment of/ }).click();
    await expect(page.getByRole("button", { name: "Void payment", exact: true })).toBeDisabled(); // reason required
    await page.getByLabel("Why?").fill("entered for the wrong client");
    await page.getByRole("button", { name: "Void payment", exact: true }).click();
    await expect(page.getByText("Payment voided")).toBeVisible();
    await expect(page.getByText(/Void: entered for the wrong client/)).toBeVisible();
  });
});

test("phone: More page links to entry, reports and settings", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone only");
  await signIn(page);
  await page.getByRole("link", { name: "More" }).click();
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: /Reports/ })).toBeVisible();
  await main.getByRole("link", { name: /Settings/ }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
