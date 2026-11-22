import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);
const sandboxChromium = "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${PORT}`,
    trace: "off",
    launchOptions: existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {},
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
  // A fresh local database with made-up clients (never real data), then a production build against it.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npx tsx scripts/dev-local.ts --db=pfesic_e2e && npm run build && npx next start -p ${PORT}`,
        port: PORT,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        env: {
          LOCAL_DATABASE_URL: `${(process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres").replace(/\/[^/]*$/, "")}/pfesic_e2e`,
          LOCAL_DEMO_USER_ID: "00000000-0000-4000-8000-00000000000a",
        },
      },
});
