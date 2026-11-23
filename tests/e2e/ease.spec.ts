import { expect, test, type Page } from "@playwright/test";

// Ease-of-use guards: things that stop a new user from making expensive mistakes.
async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@pfesic.app");
  await page.getByLabel("Password", { exact: true }).fill("demo1234");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText("Wage month")).toBeVisible();
}

test.describe.configure({ mode: "serial" });
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "desktop flow"));

test("a mistyped big amount needs a tick before it becomes advance", async ({ page }) => {
  await signIn(page);
  await page.goto("/?month=2026-10");
  await page.getByRole("button", { name: /^Record payment for/ }).first().click();
  await page.locator("#pay-amount").fill("999999");
  await expect(page.getByText(/more than they owe/)).toBeVisible();
  const save = page.getByRole("button", { name: /^Save ₹9,99,999/ });
  await expect(save).toBeDisabled();
  await page.locator("#pay-amount").fill("100");
  await expect(page.getByText(/more than they owe/)).toBeHidden();
});

test("every client row says the next step in words", async ({ page }) => {
  await signIn(page);
  await page.goto("/?month=2026-11");
  await expect(page.getByRole("columnheader", { name: "Next step" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Send reminder to / }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^Enter PF\/ESIC: / }).first()).toBeVisible();
});

test("adding a client that already exists shows a warning with a link", async ({ page }) => {
  await signIn(page);
  await page.goto("/clients");
  const existing = (await page.locator("main a[href^='/clients/'] span.truncate").first().textContent())!.trim();
  await page.getByRole("button", { name: "Add client" }).click();
  await page.locator("#c-firm").fill(existing.toLowerCase());
  await expect(page.getByText(`${existing} is already a client.`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open them instead" })).toBeVisible();
});

test("the five-step guide is one click from the board", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => localStorage.removeItem("pfesic:welcome"));
  await page.reload();
  await page.getByRole("link", { name: "How it works" }).first().click();
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  await expect(page.getByText("Start the month")).toBeVisible();
});

test("a wrong link explains itself", async ({ page }) => {
  await signIn(page);
  await page.goto("/clients/not-a-client");
  await expect(page.getByText("This page isn't here")).toBeVisible();
});

test("settings errors are plain words", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  await page.locator("#s-due").fill("40");
  await page.getByRole("button", { name: "Save business details" }).click();
  await expect(page.getByText("Due day must be a number from 1 to 28")).toBeVisible();
});
