import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 360, height: 640 } });
await p.goto('http://127.0.0.1:5195/?all'); await p.waitForTimeout(800);
for (const id of ['select','ready','result']) {
  const over = await p.evaluate((id) => { document.querySelectorAll('.screen').forEach(s => s.hidden = s.id !== id); document.getElementById('btn-next').hidden=false;
    if (id==='select') document.getElementById('btn-play').click();
    if (id==='ready') document.querySelector('.stage-btn').click();
    return [...document.querySelectorAll('button')].filter(e=>e.offsetParent && (e.scrollWidth>e.clientWidth+1 || e.getBoundingClientRect().right>innerWidth)).map(e=>e.textContent.trim()); }, id);
  console.log(id, over);
  await p.waitForTimeout(300); await p.screenshot({ path: `artifacts/btn-${id}.png` });
}
await b.close();
