import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@pfesic.app");
  await page.getByLabel("Password", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText("Wage month")).toBeVisible();
}

test("desktop: switch the screens to Hindi and back", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop flow");
  await signIn(page);

  await page.getByRole("button", { name: "Change screen language" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.getByText("वेतन माह")).toBeVisible();
  await expect(page.getByRole("link", { name: "ग्राहक", exact: true })).toBeVisible();

  // The choice survives a reload and a page change
  await page.reload();
  await page.getByRole("link", { name: "रिपोर्ट", exact: true }).click();
  await expect(page.getByRole("heading", { name: "रिपोर्ट" })).toBeVisible();

  // Settings shows the same choice and can switch back
  await page.goto("/settings");
  await expect(page.getByText("स्क्रीन की भाषा")).toBeVisible();
  await page.getByRole("radiogroup", { name: "स्क्रीन की भाषा" }).getByRole("radio", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("phone: Hindi from the top bar, payment sheet in Hindi", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone flow");
  await signIn(page);
  await page.getByRole("button", { name: "Change screen language" }).click();
  await expect(page.getByRole("link", { name: "इस महीने" })).toBeVisible();
  await page.getByRole("button", { name: /का भुगतान दर्ज करें$/ }).first().click();
  await expect(page.getByText("अभी मिली राशि")).toBeVisible();
  await expect(page.getByRole("button", { name: /सेव करें और रसीद बनाएँ/ })).toBeVisible();
});
