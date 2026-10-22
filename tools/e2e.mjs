// 実際のマウス操作で、ゲームの流れと操作を確かめる。npm run dev のあとで node tools/e2e.mjs
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const URL = process.env.GAME_URL || 'http://127.0.0.1:5195/';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const errors = [];
const report = {};
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(500);
  const g = (fn, ...a) => page.evaluate(([f, a]) => window.__game[f](...a), [fn, a]);
  const st = () => g('state');
  /** 開始画面で、ステージの準備ができる（スタートが押せる）まで待つ */
  const readyFor = async (n) => {
    await page.locator('#btn-start:not([disabled])').waitFor();
    for (let i = 0; i < 50 && (await st()).stage !== n; i++) await page.waitForTimeout(50);
  };

  // 音はボタンを押すまで鳴らさない。音ボタンの設定は再読み込み後も残る
  assert.equal((await g('sound')).started, false, 'タイトルでは音を鳴らさない');
  assert.equal(await page.locator('#title-best').isVisible(), false, '記録がないときはベストを出さない');
  await page.getByRole('button', { name: 'あそぶ' }).click();
  await readyFor(1);
  let s = await st();
  assert.equal(s.screen, 'ready', 'あそぶ → ステージ1の開始画面');
  assert.equal(s.stage, 1);
  assert.equal(await page.locator('#ready-lives').textContent(), '♥♥♥', 'ライフは3');
  assert.equal(await page.locator('#ready-goal').textContent(), String(s.goal), '目標の秒数を出す');
  await page.screenshot({ path: 'artifacts/e2e-ready.png' });
  await page.locator('#sound').click();
  assert.equal((await g('sound')).enabled, false, '音を消せる');
  await page.reload(); await page.waitForTimeout(400);
  assert.equal((await g('sound')).enabled, false, '音の設定を覚えている');
  await page.getByRole('button', { name: 'あそぶ' }).click();
  await page.locator('#sound').click();
  assert.equal((await g('sound')).enabled, true, '音を戻せる');

  // 1) スタートすると出はじめる。画面のどこでもドラッグで狙う（なぞった分だけ動く）
  await g('manual', true);
  await page.getByRole('button', { name: 'スタート' }).click();
  await g('step', 0.5);
  s = await st();
  assert.equal(s.screen, 'play');
  assert.equal(s.phase, 'main');
  assert.ok(s.particles > 20, '尿が出ている');
  const box = await page.locator('#stage').boundingBox();
  const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.6;
  const f0 = (await st()).pitch;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(cx, cy - i * 10);
  const f1 = (await st()).pitch;
  assert.ok(f1 > f0 + 0.05, `上にドラッグすると狙いが上がる ${f0} → ${f1}`);
  await g('step', 0.5);
  assert.equal((await st()).pitch, f1, '指を止めれば動かない');
  await page.mouse.up();
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(cx + i * 10, cy);
  await page.mouse.up();
  assert.ok((await st()).yaw > 0.03, '右にドラッグすると右を狙う');
  const before = await st();
  const sb = await page.locator('#sound').boundingBox();
  await page.mouse.move(sb.x + 5, sb.y + 5); await page.mouse.down(); await page.mouse.move(sb.x + 5, sb.y + 60); await g('step', 0.3); await page.mouse.up();
  assert.equal((await st()).pitch, before.pitch, 'ボタンの上では操作しない');
  if ((await g('sound')).enabled === false) await page.locator('#sound').click();

  // 2) 追いかければクリア。クリアしたあとも当てた時間と得点が増える → 水を流す → 結果
  await g('autoAim', true);
  for (let i = 0; i < 200 && !(await st()).cleared; i++) await g('step', 0.25);
  const sc1 = Number((await page.locator('#hud-score').textContent()).replace(/,/g, ''));
  assert.ok(sc1 > 0, `得点が出る ${sc1}`);
  await g('step', 2);
  const sc2 = Number((await page.locator('#hud-score').textContent()).replace(/,/g, ''));
  assert.ok(sc2 > sc1, `クリアしたあとも当てれば得点が増える ${sc1} → ${sc2}`);
  await page.screenshot({ path: 'artifacts/e2e-play.png' });
  for (let i = 0; i < 200 && (await st()).session !== 'finished'; i++) await g('step', 0.25);
  assert.equal((await st()).screen, 'play', '出し終わってすぐには結果を出さない');
  await g('step', 0.8);
  assert.equal((await g('flush')).running, true, '出し終わったら水を流す');
  for (let i = 0; i < 20 && (await st()).screen !== 'result'; i++) await g('step', 0.5);
  s = await st();
  assert.equal(s.screen, 'result', '水が引いたら結果が出る');
  assert.equal(s.result.cleared, true);
  assert.match(await page.locator('#result-title').textContent(), /クリア/);
  assert.equal(await page.locator('#banner').isVisible(), false, '結果画面ではクリアの文字を消す');
  assert.ok(s.run.score > 0 && s.run.cleared === 1, '得点とクリア数を記録する');
  assert.equal(await page.locator('#result-lives').count(), 0, '結果画面にハートを出さない');
  assert.doesNotMatch(await page.locator('#result').textContent(), /称号/, '途中で称号を出さない');
  await page.screenshot({ path: 'artifacts/e2e-result.png' });
  report.autoResult = { ...s.result, score: s.run.score };

  // 3) 次のステージ → 何もしないと失敗、ライフが減って同じステージ。3回失敗で終わり
  await page.getByRole('button', { name: '次のステージ' }).click();
  await readyFor(2);
  assert.equal((await st()).stage, 2, '次のステージへ進む');
  assert.equal((await g('flush')).running, false, '次のステージでは水の演出は消える');
  for (let k = 1; k <= 3; k++) {
    await page.getByRole('button', { name: 'スタート' }).click();
    await g('setAim', 0, 0);
    for (let i = 0; i < 80 && (await st()).screen !== 'result'; i++) await g('step', 0.5);
    s = await st();
    assert.equal(s.result.cleared, false, '何もしないとクリアできない');
    assert.match(await page.locator('#result-title').textContent(), /しっぱい/);
    assert.equal(s.run.lives, 3 - k, 'ライフが減る');
    if (k < 3) {
      await page.getByRole('button', { name: 'もう一回' }).click();
      await readyFor(2);
      assert.equal((await st()).stage, 2, '失敗したら同じステージをやり直す');
    }
  }
  assert.equal(await page.getByRole('button', { name: '結果を見る' }).isVisible(), true, '3回失敗したら終わり');
  await page.getByRole('button', { name: '結果を見る' }).click();
  assert.equal((await st()).screen, 'over');
  assert.equal(await page.locator('#over-title').textContent(), 'はじめてのトイレ', '称号を出す');
  assert.equal(await page.locator('#over-cleared').textContent(), '1');
  assert.equal(await page.locator('#over-newbest').isVisible(), true, 'ベスト更新');
  await page.screenshot({ path: 'artifacts/e2e-over.png' });
  await page.getByRole('button', { name: 'タイトルへ' }).click();
  assert.equal((await st()).screen, 'title');
  assert.match(await page.locator('#title-best').textContent(), /ベスト [\d,]+点・はじめてのトイレ/, 'タイトルにベストを出す');
  await page.reload(); await page.waitForTimeout(300);
  assert.match(await page.locator('#title-best').textContent(), /ベスト [\d,]+点・はじめてのトイレ/, 'ベストを覚えている');

  // 4) 10ステージを通してクリアする（9ステージ目からは組み合わせで作ったステージ）
  await g('manual', true);
  await page.getByRole('button', { name: 'あそぶ' }).click();
  report.allStages = [];
  for (let id = 1; id <= 10; id++) {
    await readyFor(id);
    assert.equal((await st()).stage, id);
    await page.getByRole('button', { name: 'スタート' }).click();
    await g('autoAim', true);
    for (let i = 0; i < 100 && (await st()).screen !== 'result'; i++) await g('step', 0.5);
    s = await st();
    assert.equal(s.result?.cleared, true, `ステージ${id}をクリア`);
    const flies = (await g('targets')).filter((t) => t.kind === 'fly');
    assert.ok(flies.every((t) => t.mode === 'gone'), `水を流すとハエは飛んでいく ${JSON.stringify(flies)}`);
    report.allStages.push(`${id}:${s.run.score}`);
    await page.getByRole('button', { name: '次のステージ' }).click();
  }
  assert.equal((await st()).run.title, 'トイレ初心者', '10クリアで「トイレ初心者」');
  await page.getByRole('button', { name: 'やめる' }).click();
  assert.equal((await st()).screen, 'over', '途中でやめると結果を出す');
  await page.getByRole('button', { name: 'もう一回' }).click();
  await readyFor(1);
  assert.equal((await st()).stage, 1, 'もう一回で1から');

  // 5) 実時間でのフレームレート（ハエのステージ）
  await g('manual', false);
  await g('play', 7);
  await readyFor(7);
  await page.getByRole('button', { name: 'スタート' }).click();
  await page.waitForTimeout(2500);
  report.fpsHeadless = Math.round(await g('fps'));
  await page.close();

  // 6) 画面の大きさ: 9:16 が切れずに収まる
  for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const p = await browser.newPage({ viewport: vp });
    await p.goto(URL, { waitUntil: 'networkidle' }); await p.waitForTimeout(300);
    const b = await p.locator('#stage').boundingBox();
    assert.ok(b.x >= -0.5 && b.y >= -0.5 && b.x + b.width <= vp.width + 0.5 && b.y + b.height <= vp.height + 0.5, `収まる ${JSON.stringify(vp)}`);
    assert.ok(Math.abs(b.width / b.height - 9 / 16) < 0.01, '9:16');
    await p.getByRole('button', { name: 'あそぶ' }).click();
    await p.locator('#btn-start:not([disabled])').waitFor();
    const card = await p.locator('#ready .card').boundingBox();
    assert.ok(card.y >= b.y, `開始画面のカードが上で切れない ${JSON.stringify(card)}`);
    await p.screenshot({ path: `artifacts/vp-${vp.width}x${vp.height}.png` });
    const sbtn = await p.getByRole('button', { name: 'スタート' }).boundingBox();
    if (vp.width === 360) {
      // 小さい画面でも結果画面とゲームオーバー画面が収まる
      await p.evaluate(() => window.__game.manual(true));
      await p.getByRole('button', { name: 'スタート' }).click();
      await p.evaluate(() => window.__game.autoAim(true));
      for (let i = 0; i < 100 && (await p.evaluate(() => window.__game.state().screen)) !== 'result'; i++) await p.evaluate(() => window.__game.step(0.5));
      const rb = await p.getByRole('button', { name: '次のステージ' }).boundingBox();
      const rc = await p.locator('#result .card').boundingBox();
      await p.screenshot({ path: 'artifacts/vp-360-result.png' });
      assert.ok(rc.y >= b.y && rb.y + rb.height <= b.y + b.height, `結果画面が収まる ${JSON.stringify(rc)} ${JSON.stringify(rb)}`);
      await p.getByRole('button', { name: '次のステージ' }).click();
      await p.locator('#btn-start:not([disabled])').waitFor();
      await p.getByRole('button', { name: 'やめる' }).click();
      const ob = await p.getByRole('button', { name: 'もう一回' }).boundingBox();
      const oc = await p.locator('#over .card').boundingBox();
      await p.screenshot({ path: 'artifacts/vp-360-over.png' });
      assert.ok(oc.y >= b.y && ob.y + ob.height <= b.y + b.height, 'ゲームオーバー画面が収まる');
      await p.close();
      continue;
    }
    assert.ok(sbtn.y + sbtn.height <= b.y + b.height, `スタートボタンが見える ${JSON.stringify(vp)} ${JSON.stringify(sbtn)} ${JSON.stringify(b)}`);
    await p.close();
  }
  assert.deepEqual(errors, [], 'エラーなし');
  console.log('OK', JSON.stringify(report));
} catch (e) {
  console.error('NG', e.message, errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
