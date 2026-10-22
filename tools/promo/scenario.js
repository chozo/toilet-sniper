// トイレスナイパーの告知動画の台本（縦型・約30秒）。npm run promo で撮影から MP4 まで作る。
// 流れ: つかみ → タイトル → 「男子トイレの便器で狙い撃ち！」→ いろいろな標的（的・消臭剤・動く的・ハエ・ハエの群れ）
//       → 最後に水を流してエンディング。使える操作はスキルの references/scenario-api.md。

const LAYOUT = { centerX: 0.47, centerY: 0.46, maxW: 0.8, maxH: 0.76 }; // ゲーム画面を大きめに置く

export const config = {
  slug: 'toilet-sniper',
  url: 'https://game.chozo.net/toilet-sniper/',
  orientation: 'portrait',
  game: { width: 390, height: 693 }, // 9:16
  serveDir: 'dist', // npm run build の出力（dist/toilet-sniper/）
  gamePath: '/toilet-sniper/',
  layout: LAYOUT,
  music: { pop: { bpm: 140, gain: 0.3, fadeOut: 1.2 } }, // tools/promo/stage.js の popMusic
};

// ゲームの座標 → 動画の画面の割合（record.mjs の layout と同じ計算）
const W = 540, H = 960;
const S = Math.min((W * LAYOUT.maxW) / config.game.width, (H * LAYOUT.maxH) / config.game.height);
const toFrac = (gx, gy) => ({
  x: LAYOUT.centerX + (gx / config.game.width - 0.5) * (config.game.width * S) / W,
  y: LAYOUT.centerY + (gy / config.game.height - 0.5) * (config.game.height * S) / H,
});

/** 目標の計算は Web Worker で実時間かかるので、撮らずに実時間で待つ（最大20秒） */
async function waitReady(p) {
  const ok = await p.eval(() => new Promise((resolve) => {
    const t0 = Date.now();
    const check = () => (window.__game.state().ready ? resolve(true) : Date.now() - t0 > 20000 ? resolve(false) : setTimeout(check, 30));
    check();
  }));
  if (!ok) throw new Error('ステージの準備が20秒以内に終わりませんでした');
}

/** n ステージ目を始め、狙いが標的に合うまで撮らずに進める */
async function playStage(p, n, { lead = 1.4, hint = false } = {}) {
  await p.call('play', n);
  await waitReady(p);
  await p.call('start');
  if (!hint) await p.eval(() => (document.getElementById('hint').hidden = true)); // 操作の案内は最初だけ見せる
  await p.call('autoAim', true);
  if (lead > 0) await p.skip(lead);
}

/** いま狙っている標的の、動画の画面での位置 */
async function targetFrac(p) {
  const pos = await p.eval((_, win) => {
    const g = win.__game;
    const t = g.targets().find((x) => x.active) ?? g.targets()[0];
    return g.toScreen(t.pos.x, t.pos.y, t.pos.z);
  });
  return toFrac(pos.x, pos.y);
}

const CAP = { y: 0.13, size: 50 };

export default async function scenario(p) {
  await p.seed(5);

  let lastHit = -9;
  let fxOn = false;
  p.on('targetOn', () => {
    if (!fxOn || p.time - lastHit < 1.4) return;
    lastHit = p.time;
    p.fx('命中！', { x: 0.72, y: 0.3, rot: 8, size: 60, color: '#ff4d5e' });
  });

  // ---- 0〜2秒: つかみ。ハエに当てている瞬間をスローとズームで ----
  await playStage(p, 7, { lead: 1.6 });
  p.zoom(1.25, 0.01, await targetFrac(p));
  p.speed(0.45, { badge: false });
  p.fx('ジョボボ！', { x: 0.36, y: 0.26, rot: -10, size: 72 });
  await p.wait(2.0);
  p.speed(1);
  p.zoom(1, 0.3);
  p.flash({ dur: 0.25, strength: 0.8 });

  // ---- 2〜5秒: タイトル ----
  p.title({ title: 'トイレ\nスナイパー', sub: '狙って当てろ！', dur: 3.2 });
  await p.wait(3.3);

  // ---- 5〜9秒: 男子トイレの便器で狙い撃ち（ドラッグで狙う） ----
  await playStage(p, 1, { lead: 0, hint: true });
  await p.call('autoAim', false);
  p.caption('男子トイレの便器で\n狙い撃ち！', { ...CAP, dur: 2.5 });
  await p.drag([[195, 540], [205, 480], [195, 440]], 0.6);
  await p.call('autoAim', true);
  await p.wait(1.9);
  fxOn = true;
  p.caption('的に当てろ！', { ...CAP, size: 58, dur: 2.1 });
  await p.wait(2.2);

  // ---- 9〜22秒: いろいろな標的を次々に ----
  const shots = [
    { n: 3, text: '消臭剤も！' },
    { n: 4, text: '動く的も！' },
    { n: 5, text: 'ハエも！' },
  ];
  for (const s of shots) {
    await playStage(p, s.n, { lead: 1.6 });
    p.flash({ dur: 0.18, strength: 0.5 });
    p.caption(s.text, { ...CAP, size: 58, dur: 3.0 });
    await p.wait(3.2);
  }
  await playStage(p, 7, { lead: 2.2 });
  p.flash({ dur: 0.18, strength: 0.5 });
  p.caption('ハエの群れも！', { ...CAP, size: 58, dur: 3.0 });
  await p.wait(3.2);

  // ---- 22〜26秒: 最後に水を流して、エンディングへ ----
  fxOn = false;
  await p.until((s, ev) => ev.some((e) => e.type === 'finish'), { max: 30, record: false }); // 出し終わりまでは撮らない
  await p.until((s, ev) => ev.some((e) => e.type === 'flush'), { max: 4, record: false });
  p.fx('ジャー！', { x: 0.47, y: 0.3, rot: -6, size: 90, dur: 1.6, color: '#3fc1b0' });
  p.shake(6, 0.6);
  await p.wait(2.6);

  // ---- 26〜29秒: エンドカード ----
  p.endCard({ title: 'トイレ\nスナイパー', sub: '狙って当てろ！', cta: '今すぐ遊べる！', dur: 3.5 });
  await p.wait(3.5);
}
