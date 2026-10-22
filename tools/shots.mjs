// 画面を撮って見た目を確かめる。node tools/shots.mjs [出力先]
import { chromium } from 'playwright-core';
const URL = process.env.GAME_URL || 'http://127.0.0.1:5195/';
const OUT = process.argv[2] || 'artifacts/shots';
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL);
await page.waitForTimeout(800);
const g = (fn, ...a) => page.evaluate(([f, a]) => window.__game[f](...a), [fn, a]);
await page.screenshot({ path: `${OUT}/1-title.png` });
await page.getByRole('button', { name: 'あそぶ' }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/2-ready.png` });
await g('manual', true);
await page.getByRole('button', { name: 'スタート' }).click();
await g('autoAim', true);
for (const [t, name] of [[1.5, '3-early'], [6, '4-mid'], [7, '5-late'], [6.5, '6-dribble']]) {
  await g('step', t);
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name, JSON.stringify(await g('state')));
}
await g('autoAim', false);
await g('step', 8);
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/7-result.png` });
console.log('errors', errors);
await browser.close();
