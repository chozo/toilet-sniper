// 便器の見た目を撮る（確認用）。ゲームの視点と、斜め前からの視点
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 693 }, deviceScaleFactor: 2 });
const tag = process.argv[2] || 'u';
await page.goto('http://127.0.0.1:5195/?all'); await page.waitForTimeout(500);
await page.evaluate(() => { window.__game.manual(true); window.__game.play(1); document.getElementById('ready').hidden = true; window.__game.step(0.01); });
await page.screenshot({ path: `artifacts/${tag}-game.png` });
for (const [name, pos] of [['front', [0.55, 0.9, 0.6]], ['low', [0.25, 0.45, 0.55]], ['side', [0.9, 0.55, -0.1]]]) {
  await page.evaluate((pos) => { window.__game.debugCam(pos, [0, 0.5, -0.3]); window.__game.step(0.01); }, pos);
  await page.screenshot({ path: `artifacts/${tag}-${name}.png` });
}
await browser.close();
