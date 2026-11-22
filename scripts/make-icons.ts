/** Renders public/icons/icon.svg into the PNG sizes the PWA manifest and iOS need. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const svg = readFileSync("public/icons/icon.svg", "utf8");
const targets: Array<[string, number, boolean]> = [
  // [file, size, rounded corners (non-maskable)]
  ["public/icons/icon-192.png", 192, true],
  ["public/icons/icon-512.png", 512, true],
  ["public/icons/maskable-512.png", 512, false],
  ["public/icons/apple-touch-icon.png", 180, false],
  ["src/app/icon.png", 64, true],
];

(async () => {
  const exe = ["/opt/pw-browsers/chromium-1243/chrome-linux64/chrome"].find((p) => existsSync(p));
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage();
  for (const [file, size, rounded] of targets) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;overflow:hidden;border-radius:${rounded ? size * 0.22 : 0}px">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</div></body></html>`,
    );
    await page.screenshot({ path: file, omitBackground: true });
    console.log("✓", file);
  }
  await browser.close();
  // favicon.ico: an ICO container holding the 64 px PNG
  const png = readFileSync("src/app/icon.png");
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(64, 6);
  header.writeUInt8(64, 7);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  writeFileSync("src/app/favicon.ico", Buffer.concat([header, png]));
  console.log("✓ src/app/favicon.ico");
})();
