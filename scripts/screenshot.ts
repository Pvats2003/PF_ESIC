/**
 * Design self-review screenshots: phone (390×844) and desktop (1440×900),
 * light and dark. Usage: npx tsx scripts/screenshot.ts <path> [outDir] [--full] [--scale=2]
 */
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

/** Use PW_CHROMIUM, else the sandbox's pre-installed Chromium, else Playwright's own. */
function launchOptions() {
  const candidates = [process.env.PW_CHROMIUM, "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome"];
  const executablePath = candidates.find((p) => p && existsSync(p));
  return executablePath ? { executablePath } : {};
}

const [path = "/design", outDir = "docs/screenshots"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const full = process.argv.includes("--full");
const scale = Number(process.argv.find((a) => a.startsWith("--scale="))?.split("=")[1] ?? 1);
const base = process.env.BASE_URL ?? "http://localhost:3100";
const name = path.replace(/^\//, "").replace(/[/#?]/g, "_") || "home";

const viewports = [
  { tag: "phone", width: 390, height: 844 },
  { tag: "desktop", width: 1440, height: 900 },
];

(async () => {
  const browser = await chromium.launch(launchOptions());
  for (const vp of viewports) {
    for (const scheme of ["light", "dark"] as const) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: scale,
        colorScheme: scheme,
        reducedMotion: "reduce",
      });
      const page = await ctx.newPage();
      await page.goto(base + path, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const file = `${outDir}/${name}-${vp.tag}-${scheme}.png`;
      await page.screenshot({ path: file, fullPage: full });
      console.log(`${file}${overflow > 0 ? `  ⚠ horizontal overflow ${overflow}px` : ""}`);
      await ctx.close();
    }
  }
  await browser.close();
})();
