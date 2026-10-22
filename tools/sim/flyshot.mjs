// ハエを拡大して撮る（確認用）
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 693 }, deviceScaleFactor: 4 });
await page.goto('http://127.0.0.1:5195/?all'); await page.waitForTimeout(500);
const g = (fn, ...a) => page.evaluate(([f, a]) => window.__game[f](...a), [fn, a]);
await g('manual', true);
await g('play', 7); await g('start'); await g('setAim', 0.8, 1.1); await g('step', 0.3);
for (const [i, t] of (await g('targets')).entries()) {
  const p = await g('toScreen', t.pos.x, t.pos.y, t.pos.z);
  await page.screenshot({ path: `artifacts/fly${i}.png`, clip: { x: p.x - 40, y: p.y - 40, width: 80, height: 80 } });
}
await browser.close();
