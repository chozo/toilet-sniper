import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
for (const [w,h] of [[360,640],[375,667],[390,844],[430,932],[1280,800]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto('http://127.0.0.1:5195/?all'); await p.waitForTimeout(800);
  const res = await p.evaluate(async () => {
    const out = [];
    const check = () => document.querySelectorAll('button').forEach(el => {
      if (!el.offsetParent) return;
      const cs = getComputedStyle(el); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize)*1.2;
      const inner = el.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.borderTopWidth)*2;
      if (el.classList.contains('stage-btn')) { const nm = el.querySelector('.nm'); if (nm && nm.getBoundingClientRect().height > parseFloat(getComputedStyle(nm).fontSize)*1.6) out.push('stage:'+nm.textContent); return; }
      if (inner > lh * 1.5) out.push(el.textContent.trim());
    });
    const show = id => { document.querySelectorAll('.screen').forEach(s => s.hidden = s.id !== id); };
    for (const id of ['title','select','ready','result']) { if (id==='select') window.__game.select?.(); show(id); document.getElementById('btn-next').hidden=false; check(); }
    return [...new Set(out)];
  });
  console.log(w,h,res);
}
await b.close();
