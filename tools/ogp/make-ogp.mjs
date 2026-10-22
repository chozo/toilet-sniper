// SNS共有用のOGP画像（1200×630）を作る。npm run dev のあとで npm run ogp
// 1. 確認用の入口（window.__game）でステージ6（ハエ）を進め、HUDを隠したプレイ画面を撮る
// 2. その画面をスマホの枠に入れ、タイトル・一言・URLを重ねて public/ogp.png に書き出す
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const URL = process.env.GAME_URL || 'http://127.0.0.1:5195/';
const OUT = process.argv[2] || 'public/ogp.png';
const STAGE = 6;
const STEP_SEC = 3; // スタートから何秒進めて撮るか

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});

// 1. ゲーム画面
const game = await browser.newPage({ viewport: { width: 450, height: 800 }, deviceScaleFactor: 2 });
await game.goto(URL);
await game.waitForTimeout(800);
const g = (fn, ...a) => game.evaluate(([f, a]) => window.__game[f](...a), [fn, a]);
await g('play', STAGE);
await game.locator('#btn-start:not([disabled])').waitFor();
await g('manual', true);
await game.locator('#btn-start').click();
await g('autoAim', true);
await g('step', STEP_SEC);
await game.addStyleTag({ content: '#hud, #hint { display: none !important; }' });
await game.waitForTimeout(150);
const shot = await game.screenshot({ type: 'png' });
await game.close();

// 2. 合成
const icon = readFileSync(new globalThis.URL('../../public/favicon.svg', import.meta.url), 'utf8');
const shotUrl = `data:image/png;base64,${shot.toString('base64')}`;
const iconUrl = `data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}`;
const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@800;900&display=block" rel="stylesheet">
<style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: 'M PLUS Rounded 1c', sans-serif; font-weight: 900; color: #1f3b4d; }
  .bg { position: absolute; inset: 0; background:
      radial-gradient(circle at 76% 50%, #fff6c9 0 18%, transparent 18.2%),
      repeating-conic-gradient(from 0deg at 76% 50%, #ffd84d 0 7.5deg, #ffe680 7.5deg 15deg); }
  .dots { position: absolute; inset: 0; background-image: radial-gradient(#ffffff 3.5px, transparent 4px); background-size: 34px 34px; opacity: 0.45;
      mask-image: linear-gradient(90deg, #000 0 48%, transparent 62%); }
  .left { position: absolute; left: 64px; top: 0; bottom: 60px; width: 660px; display: flex; flex-direction: column; justify-content: center; }
  .catch { align-self: flex-start; background: #ff4d5e; color: #fff; font-size: 40px; padding: 8px 28px 12px; white-space: nowrap; border-radius: 99px;
      border: 6px solid #1f3b4d; box-shadow: 0 8px 0 #1f3b4d; transform: rotate(-4deg); margin-bottom: 22px; letter-spacing: 0.04em; }
  h1 { font-size: 104px; line-height: 1.08; white-space: nowrap; letter-spacing: 0.02em; color: #fff;
      -webkit-text-stroke: 14px #1f3b4d; paint-order: stroke fill; text-shadow: 0 12px 0 #1f3b4d; }
  h1 .a { color: #3fc1b0; }
  h1 .b { color: #ff4d5e; display: inline-block; }
  .how { margin-top: 28px; font-size: 30px; white-space: nowrap; font-weight: 800; background: #fff; border: 5px solid #1f3b4d; border-radius: 22px; padding: 12px 24px;
      align-self: flex-start; box-shadow: 0 6px 0 #1f3b4d; }
  .url { position: absolute; left: 64px; bottom: 34px; font-size: 26px; white-space: nowrap; font-weight: 800; display: flex; align-items: center; gap: 12px; }
  .url img { width: 44px; height: 44px; }
  .phone { position: absolute; left: 772px; top: 26px; width: 326px; height: 574px; border-radius: 46px; background: #1f3b4d; padding: 12px;
      transform: rotate(5deg); box-shadow: 18px 22px 0 rgba(31,59,77,0.25); }
  .phone .screen { width: 100%; height: 100%; border-radius: 36px; overflow: hidden; background: url(${shotUrl}) 50% 100% / 150% auto no-repeat #b3dcd8; }
  .pop { position: absolute; white-space: nowrap; font-size: 54px; color: #fff; -webkit-text-stroke: 10px #1f3b4d; paint-order: stroke fill; text-shadow: 0 6px 0 #1f3b4d; }
  .pop.p1 { left: 690px; top: 64px; color: #ffd84d; transform: rotate(-12deg); }
  .pop.p2 { left: 990px; top: 500px; color: #ff4d5e; transform: rotate(10deg); font-size: 60px; }
  .drop { position: absolute; width: 38px; height: 38px; background: #ffd23f; border: 5px solid #1f3b4d; border-radius: 0 50% 50% 50%; }
  .d1 { left: 700px; top: 420px; transform: rotate(30deg); }
  .d2 { left: 1128px; top: 150px; transform: rotate(60deg) scale(0.8); }
  .d3 { left: 710px; top: 250px; transform: rotate(20deg) scale(0.6); }
</style></head><body>
<div class="bg"></div><div class="dots"></div>
<div class="phone"><div class="screen"></div></div>
<div class="pop p1">ジョボボ！</div>
<div class="pop p2">命中！</div>
<div class="drop d1"></div><div class="drop d2"></div><div class="drop d3"></div>
<div class="left">
  <div class="catch">狙って当てろ！</div>
  <h1><span class="a">トイレ</span><br><span class="b">スナイパー</span></h1>
  <div class="how">ドラッグで狙って、的やハエに当て続けろ！</div>
</div>
<div class="url"><img src="${iconUrl}" alt="">game.chozo.net/toilet-sniper/</div>
</body></html>`;

const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: OUT, type: 'png' });
await browser.close();
console.log('wrote', OUT);
