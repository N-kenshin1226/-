import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:4173/");
await page.waitForTimeout(1500);
// タイトル→新規
const startBtn = await page.$('[data-testid="choice-new"]');
console.log("choice-new:", !!startBtn);
await page.screenshot({ path: "e2e/artifacts/inspect-title.png", fullPage: true });
const ids = await page.evaluate(() =>
  [...document.querySelectorAll("[data-testid]")].map((e) => e.dataset.testid).slice(0, 30),
);
console.log("ids:", ids.join(","));
await page.getByTestId("origin-wanderer").click();
await page.waitForTimeout(1200);
await page.screenshot({ path: "e2e/artifacts/inspect-intro1.png", fullPage: true });
// イントロを進める
for (let i = 0; i < 8; i++) {
  const vis = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="menu"], [data-testid="place"]');
    return el ? (el as HTMLElement).dataset.testid : null;
  });
  if (vis) { console.log("reached:", vis); break; }
  const next = await page.$('[data-testid^="intro-"], [data-testid="incident-next"]');
  if (next) await next.click();
  else await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
}
await page.screenshot({ path: "e2e/artifacts/inspect-intro2.png", fullPage: true });
const body = (await page.evaluate(() => document.body.innerText)).slice(0, 500);
console.log("body:", body);
await browser.close();
