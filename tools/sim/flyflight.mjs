// ハエが飛び立つ場面を撮る（確認用）
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 693 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:5195/?all'); await page.waitForTimeout(500);
const g = (fn, ...a) => page.evaluate(([f, a]) => window.__game[f](...a), [fn, a]);
await g('manual', true);
await g('play', 7); await g('start'); await g('autoAim', true);
let n = 0;
for (let i = 0; i < 300 && n < 2; i++) {
  await g('step', 1 / 30);
  const fl = (await g('targets')).filter((t) => !t.active).length;
  if (fl > 0 && i % 9 === 0) await page.screenshot({ path: `artifacts/flight${n++}.png` });
}
await browser.close();
