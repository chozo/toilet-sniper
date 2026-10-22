// 複数の画像を横に並べた1枚を作る。node tools/contact.mjs 出力.png 入力1.png 入力2.png ...
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const [out, ...files] = process.argv.slice(2);
const imgs = files.map((f) => `<img src="data:image/png;base64,${readFileSync(f).toString('base64')}">`).join('');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 300 * files.length, height: 650 } });
await page.setContent(`<style>body{margin:0;display:flex;background:#000}img{width:300px;height:650px;object-fit:contain}</style>${imgs}`);
await page.screenshot({ path: out });
await browser.close();
