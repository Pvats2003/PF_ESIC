import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@pfesic.app");
  await page.getByLabel("Password", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText("Wage month")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("desktop: Call / WhatsApp sheet offers the right messages", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop flow");
  await signIn(page);
  await page.goto("/?month=2026-10");
  await page.getByRole("tab", { name: /^Overdue/ }).click();
  await page.getByRole("button", { name: /^Call or WhatsApp / }).first().click();
  await expect(page.getByText("Send a ready message")).toBeVisible();
  await expect(page.getByRole("button", { name: /Overdue reminder.*Suggested|Overdue reminder/ }).first()).toBeVisible();
  const call = page.getByRole("link", { name: "Call", exact: true });
  if (await call.count()) await expect(call).toHaveAttribute("href", /^tel:\+91\d{10}$/);
  await page.getByRole("button", { name: /Overdue reminder/ }).first().click();
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue(/\S/);
});

test("desktop: type phones in one list; they save and come back", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop flow");
  await signIn(page);
  await page.goto("/clients/phones");
  await expect(page.getByRole("heading", { name: "Client phones" })).toBeVisible();
  await page.getByRole("radio", { name: "All" }).click();
  const first = page.getByRole("textbox", { name: /^Phone for / }).first();
  const label = (await first.getAttribute("aria-label"))!;
  await first.fill("98765 43210");
  await first.press("Enter"); // moves to the next client and saves this one
  await expect(page.locator('[aria-label="Saved"]:visible').first()).toBeVisible();
  await first.fill("12345");
  await first.press("Tab");
  await expect(page.getByText(/isn't a valid Indian mobile number/)).toBeVisible();
  await page.reload();
  await page.getByRole("radio", { name: "All" }).click();
  await expect(page.getByRole("textbox", { name: label })).toHaveValue("98765 43210");
});

test("phone: the call button on a board row opens Call / WhatsApp", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone flow");
  await signIn(page);
  await page.goto("/?month=2026-10");
  await page.getByRole("button", { name: /^Call or WhatsApp / }).first().click();
  await expect(page.getByText("Send a ready message")).toBeVisible();
});
