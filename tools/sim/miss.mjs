// 外したとき・横に振ったときの画面を撮る（確認用）。npm run dev のあとで node tools/sim/miss.mjs
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 693 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:5195/'); await page.waitForTimeout(500);
const g = (fn, ...a) => page.evaluate(([f, a]) => window.__game[f](...a), [fn, a]);
await g('manual', true); await g('play'); await g('start');
await g('setAim', 0.8, 0); await g('step', 2.5);
await page.screenshot({ path: 'artifacts/m1-side.png' });
console.log('side', JSON.stringify(await g('state')));
await g('setAim', 0, 1.1); await g('step', 1.5);
await page.screenshot({ path: 'artifacts/m2-high.png' });
console.log('high', JSON.stringify(await g('state')));
await g('setAim', -0.3, -0.2); await g('step', 0.6);
for (let i = 0; i < 6; i++) { await g('setAim', -0.3 + i * 0.12, -0.2); await g('step', 1 / 60); }
await page.screenshot({ path: 'artifacts/m3-whip.png' });
await browser.close();
