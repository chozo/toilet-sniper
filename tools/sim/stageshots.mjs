// 全ステージのプレイ中の画面を撮る（確認用）。node tools/sim/stageshots.mjs
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 693 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5195/?all'); await page.waitForTimeout(500);
const g = (fn, ...a) => page.evaluate(([f, a]) => window.__game[f](...a), [fn, a]);
await g('select'); await page.waitForTimeout(100);
await page.screenshot({ path: 'artifacts/st-select.png' });
await g('manual', true);
for (let id = 1; id <= 8; id++) {
  await g('play', id); await g('start'); await g('autoAim', true);
  await g('step', id >= 5 ? 1.75 : 4);
  await page.screenshot({ path: `artifacts/st${id}.png` });
}
console.log('errors', errors);
await browser.close();
