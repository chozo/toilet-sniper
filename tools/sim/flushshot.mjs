// 水を流す演出を撮る（確認用）。node tools/sim/flushshot.mjs <ステージ>
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 693 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const id = Number(process.argv[2] || 7);
await page.goto('http://127.0.0.1:5195/?all'); await page.waitForTimeout(500);
const g = (fn, ...a) => page.evaluate(([f, a]) => window.__game[f](...a), [fn, a]);
await g('manual', true); await g('play', id); await g('start'); await g('autoAim', true);
for (let i = 0; i < 200 && (await g('state')).session !== 'finished'; i++) await g('step', 0.25);
const shots = [];
for (const [name, dt] of [['f0', 0.6], ['f1', 0.3], ['f2', 0.35], ['f3', 0.5], ['f4', 0.6]]) {
  await g('step', dt);
  const p = `artifacts/flush-${id}-${name}.png`;
  await page.screenshot({ path: p });
  shots.push(p);
  console.log(name, (await g('state')).screen, JSON.stringify((await g('targets')).map((t) => t.kind + ':' + (t.active ? 'on' : 'off'))));
}
await g('step', 1.5);
console.log('end', (await g('state')).screen, errors);
await browser.close();
console.log(shots.join(' '));
