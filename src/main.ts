import * as THREE from 'three';
import './style.css';
import { Sound } from './audio';
import { AIM, FLUSH, GEOM, LIVES, PHYS, SCORE, STAGES, TITLES, type StageDef } from './config';
import { makeRng } from './flow';
import { Puddles, Splash, StreamView } from './render/fx';
import { FlushView } from './render/flush';
import { buildScene } from './render/scene';
import { TargetViews } from './render/targets';
import { loadBest, Run, saveBest, stageScore, titleFor } from './run';
import { Session, type GameEvent } from './session';
import { getStage, stageSeed } from './stages';
import type { StreamHit } from './stream';

type Screen = 'title' | 'ready' | 'play' | 'result' | 'over';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const stageEl = $('stage');
const canvas = $<HTMLCanvasElement>('c');

// ---------- 描画 ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const parts = buildScene();
const { scene, camera } = parts;
const streamView = new StreamView();
const splash = new Splash();
const puddles = new Puddles();
const targetViews = new TargetViews();
const flushView = new FlushView();
scene.add(streamView.mesh, splash.mesh, puddles.group, targetViews.group, flushView.group);
const buttonRestZ = parts.flushButton.position.z;

function resize(): void {
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stageEl);
resize();

// ---------- 状態 ----------
const sound = new Sound();
const fxRng = makeRng(7);
let screen: Screen = 'title';
/** URL に ?stage=N を付けると、N ステージ目から始められる（確認用） */
const startStage = Math.max(1, Number(new URLSearchParams(location.search).get('stage')) || 1);
let run = new Run(startStage);
// タイトル画面の背景用の仮のステージ。遊ぶステージは Worker で作る（目標の秒数の計算が重い）
let stage: StageDef = { ...STAGES[0], goalSec: 99 };
let session = new Session(stage, stageSeed(stage.id));
let manual = false;
let timeScale = 1;
let resultTimer = -1;
/** 水を流す演出の進み具合。-1 = まだ、0 以上 = ボタンを押すまでの待ちを含む経過時間 */
let flushT = -1;
let fliesGone = false;
let popTimer = 0;
let popSide = 1;
let hintTimer = 0;
let dragged = false;

function show(next: Screen): void {
  screen = next;
  $('title').hidden = next !== 'title';
  $('ready').hidden = next !== 'ready';
  $('result').hidden = next !== 'result';
  $('over').hidden = next !== 'over';
  $('hud').hidden = next === 'title' || next === 'over';
  // ライフと得点は、開始画面と結果画面ではカードの中に出す
  $('hud-status').hidden = next !== 'play';
  if (next !== 'play') dragId = null;
}

const fmtScore = (n: number) => n.toLocaleString('ja-JP');
const hearts = (n: number) => '♥'.repeat(Math.max(0, n)) + '♡'.repeat(Math.max(0, LIVES - n));

/** 同じステージは、何回やり直しても同じ中身（ハエの動きなども同じ乱数の種から始まる） */
function newSession(): void {
  session = new Session(stage, stageSeed(stage.id));
  targetViews.build(session.targets);
  splash.clear();
  puddles.clear();
  $('popups').replaceChildren();
  $('banner').hidden = true;
  $('hint').hidden = true;
  resultTimer = -1;
  flushT = -1;
  fliesGone = false;
  flushView.stop();
  parts.flushButton.position.z = buttonRestZ;
  dragged = false;
  $('hud-stage').textContent = `ST.${stage.id}`;
  $('target-goal').textContent = `/ ${stage.goalSec}秒`;
  $('ready-stage').textContent = `STAGE ${stage.id}`;
  $('ready-name').textContent = stage.name;
  $('ready-desc').textContent = stage.desc;
  $('ready-goal').textContent = String(stage.goalSec);
  $('ready-tip').textContent = `コツ: ${stage.tip}`;
  $('ready-lives').textContent = hearts(run.lives);
  $('ready-score').textContent = `${fmtScore(run.score)}点`;
  updateHud();
}

// ---------- ステージの準備 ----------
// 目標の秒数の計算は重いので Web Worker で行い、次のステージはプレイ中に先に作っておく
const stageCache = new Map<number, StageDef>();
const waiting = new Map<number, ((st: StageDef) => void)[]>();
let worker: Worker | null = null;
try {
  worker = new Worker(new URL('./stageWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<StageDef>) => {
    const st = e.data;
    stageCache.set(st.id, st);
    for (const fn of waiting.get(st.id) ?? []) fn(st);
    waiting.delete(st.id);
  };
  worker.onerror = () => {
    worker = null;
  };
} catch {
  worker = null;
}

function requestStage(n: number, fn?: (st: StageDef) => void): void {
  const hit = stageCache.get(n);
  if (hit) {
    fn?.(hit);
    return;
  }
  if (!worker) {
    // Worker が使えないときは、その場で計算する
    const st = getStage(n);
    stageCache.set(n, st);
    fn?.(st);
    return;
  }
  const list = waiting.get(n);
  if (list) {
    if (fn) list.push(fn);
    return;
  }
  waiting.set(n, fn ? [fn] : []);
  worker.postMessage(n);
}

/** 先に作っておく */
function prefetch(n: number): void {
  requestStage(n);
}

let readyToken = 0;
function goReady(): void {
  const token = ++readyToken;
  const btn = $<HTMLButtonElement>('btn-start');
  if (!stageCache.has(run.stage)) {
    btn.disabled = true;
    btn.textContent = '準備中…';
  }
  requestStage(run.stage, (st) => {
    if (token !== readyToken) return;
    stage = st;
    newSession();
    btn.disabled = false;
    btn.textContent = 'スタート';
    show('ready');
  });
}

function startRun(): void {
  run = new Run(startStage);
  goReady();
}

function paintTitle(): void {
  const b = loadBest();
  const el = $('title-best');
  el.hidden = b.score <= 0 && b.cleared <= 0;
  el.textContent = `ベスト ${fmtScore(b.score)}点・${titleFor(b.cleared)}`;
}

function goTitle(): void {
  paintTitle();
  newSession();
  show('title');
}

function goOver(): void {
  const newBest = saveBest(run);
  $('over-title').textContent = run.title;
  $('over-cleared').textContent = `${run.cleared}`;
  $('over-score').textContent = `${fmtScore(run.score)}点`;
  $('over-hit').textContent = `${(Math.floor(run.hitTotal * 10 + 1e-6) / 10).toFixed(1)}秒`;
  $('over-best').textContent = `${fmtScore(loadBest().score)}点`;
  $('over-newbest').hidden = !newBest;
  sound.setFlow(0, 'none');
  sound.setBuzz(0);
  show('over');
}

/** やめる: 1ステージも遊んでいなければタイトルへ、遊んでいれば結果を出す */
function quitRun(): void {
  run.quit();
  if (run.cleared === 0 && run.score === 0 && run.lives === LIVES) goTitle();
  else goOver();
}

function startPee(): void {
  if (screen !== 'ready') return;
  session.start();
  show('play');
  prefetch(stage.id + 1); // クリアしたときの次のステージ
  $('hint').hidden = false;
  hintTimer = 0;
}

// ---------- 入力 ----------
// 画面のどこでもドラッグ。なぞった分だけ狙いが動く
let dragId: number | null = null;
let lastX = 0, lastY = 0;

/** 指を置く。座標はゲーム画面の CSS ピクセル（告知動画の撮影もこの関数を通す） */
function touchDown(x: number, y: number, id = 0): boolean {
  if (screen !== 'play' || dragId !== null) return false;
  dragId = id;
  lastX = x;
  lastY = y;
  return true;
}
function touchMove(x: number, y: number, id = 0): void {
  if (id !== dragId) return;
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  const dx = x - lastX, dy = y - lastY;
  lastX = x;
  lastY = y;
  if (session.state === 'playing') session.addAim((dx / w) * AIM.yawPerScreen, (-dy / h) * AIM.pitchPerScreen);
  if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true;
}
function touchUp(_x = 0, _y = 0, id = 0): void {
  if (id === dragId) dragId = null;
}
stageEl.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('button')) return;
  if (touchDown(e.clientX, e.clientY, e.pointerId)) stageEl.setPointerCapture(e.pointerId);
});
stageEl.addEventListener('pointermove', (e) => touchMove(e.clientX, e.clientY, e.pointerId));
const endDrag = (e: PointerEvent) => touchUp(e.clientX, e.clientY, e.pointerId);
stageEl.addEventListener('pointerup', endDrag);
stageEl.addEventListener('pointercancel', endDrag);

function bindButton(id: string, fn: () => void): void {
  $(id).addEventListener('click', () => {
    sound.unlock();
    sound.click();
    fn();
  });
}
bindButton('btn-play', startRun);
bindButton('btn-start', startPee);
bindButton('btn-retry', goReady);
bindButton('btn-next', goReady);
bindButton('btn-to-over', goOver);
bindButton('btn-quit', quitRun);
bindButton('btn-again', startRun);
bindButton('btn-over-title', goTitle);
const soundBtn = $('sound');
const paintSound = () => soundBtn.classList.toggle('off', !sound.enabled);
soundBtn.addEventListener('click', () => {
  sound.unlock();
  sound.setEnabled(!sound.enabled);
  paintSound();
});
paintSound();

// ---------- 演出 ----------
const U = GEOM.urinal;
const SCORE_CLEAR = SCORE.clearBonus;
const tmpV = new THREE.Vector3();
function toScreen(x: number, y: number, z: number): { x: number; y: number } {
  tmpV.set(x, y, z).project(camera);
  return { x: ((tmpV.x + 1) / 2) * stageEl.clientWidth, y: ((1 - tmpV.y) / 2) * stageEl.clientHeight };
}

function popup(text: string, x: number, y: number, z: number, cls = ''): void {
  const p = toScreen(x, y, z);
  const el = document.createElement('div');
  el.className = `pop ${cls}`;
  el.textContent = text;
  popSide = -popSide;
  el.style.left = `${p.x + popSide * stageEl.clientWidth * (0.1 + fxRng() * 0.06)}px`;
  el.style.top = `${p.y - 10}px`;
  $('popups').append(el);
  popEls.push({ el, t: 0 });
}
/** 擬音の吹き出しは、ゲーム内の時間で 0.8秒たったら消す */
const popEls: { el: HTMLElement; t: number }[] = [];
function updatePopups(dt: number): void {
  for (let i = popEls.length - 1; i >= 0; i--) {
    const p = popEls[i];
    p.t += dt;
    if (p.t >= 0.8 || !p.el.isConnected) {
      p.el.remove();
      popEls.splice(i, 1);
    }
  }
}

const WORDS_BOWL = ['ジョボボ', 'ジョロロ', 'ジョー'];
const WORDS_TARGET = ['ジョボボ！', 'ナイス！', 'ヒット！'];
const WORDS_SPILL = ['ビチャ', 'ピチャッ', 'ポタタ'];

function handleEvents(evs: GameEvent[], dt: number): void {
  let lastBowl: StreamHit | null = null, lastSpill: StreamHit | null = null, lastTarget: StreamHit | null = null;
  const count = { ceramic: 0, water: 0, floor: 0 };
  for (const e of evs) {
    if (e.type === 'hit' && e.hit) {
      const h = e.hit;
      if (fxRng() < 0.4) splash.emit(h, fxRng, session.flow.power + 0.3);
      if (h.region === 'spill') {
        lastSpill = h;
        count.floor++;
        // 便器の外側や壁に当たった分は、その真下の床にたまる
        const px = h.point.x + h.normal.x * 0.03;
        const pz = h.surface === 'floor' ? h.point.z : h.point.z + Math.max(0.02, h.normal.z * 0.04);
        puddles.add(px, pz, h.vol);
      } else {
        lastBowl = h;
        if (h.surface === 'basin') count.water++;
        else count.ceramic++;
      }
      if (e.onTarget) lastTarget = h;
    } else if (e.type === 'targetOn') {
      sound.targetOn();
    } else if (e.type === 'second') {
      sound.second(e.value ?? 1);
    } else if (e.type === 'clear') {
      sound.clear();
      $('banner').hidden = false;
      $('banner').textContent = 'クリア！';
      popup(`+${SCORE_CLEAR}`, 0, U.yBackTop - 0.25, U.zBack, 'target');
    } else if (e.type === 'finish') {
      flushT = 0; // 少し待ってから水を流す
      $('hint').hidden = true;
    } else if (e.type === 'flee' && e.target !== undefined) {
      const t = session.targets[e.target];
      popup(['ピャッ！', 'にげた！', 'ブーン'][Math.floor(fxRng() * 3)], t.pos.x, t.pos.y + 0.05, t.pos.z, 'flee');
      sound.flee();
      popTimer = Math.max(popTimer, 0.5);
    }
  }

  // 水の音: いちばん多く当たっている場所で音色を変える
  const total = count.ceramic + count.water + count.floor;
  const surf = total === 0 ? 'none' : count.floor >= Math.max(count.ceramic, count.water) ? 'floor' : count.water > count.ceramic ? 'water' : 'ceramic';
  sound.setFlow(Math.min(1, session.flow.q / 25 + 0.25), surf);
  sound.setBuzz(screen === 'play' ? targetViews.flying : 0);
  if (screen === 'play' && session.state === 'finished') sound.setFlow(0, 'none');

  // 擬音
  popTimer -= dt;
  if (popTimer <= 0) {
    const pick = (a: string[]) => a[Math.floor(fxRng() * a.length)];
    if (lastTarget) {
      popup(pick(WORDS_TARGET), lastTarget.point.x, lastTarget.point.y + 0.04, lastTarget.point.z, 'target');
      popTimer = 1.0;
    } else if (lastSpill) {
      popup(pick(WORDS_SPILL), lastSpill.point.x, lastSpill.point.y + 0.03, lastSpill.point.z, 'spill');
      popTimer = 0.6;
    } else if (lastBowl) {
      if (session.flow.phase === 'dribble') {
        popup('ポタッ', lastBowl.point.x, lastBowl.point.y + 0.03, lastBowl.point.z, 'drip');
        sound.drip();
        popTimer = 0.35;
      } else {
        popup(pick(WORDS_BOWL), lastBowl.point.x, lastBowl.point.y + 0.04, lastBowl.point.z);
        popTimer = 1.1;
      }
    }
  }
}

/** いまのステージの、ここまでの得点（こぼれの減点を含む） */
function liveStageScore(): number {
  return stageScore({ cleared: session.cleared, hitTime: session.hitTime, goal: stage.goalSec, spillRate: 0, spillMl: session.volSpill }).total;
}

function updateHud(): void {
  $('bladder-fill').style.width = `${(session.bladder.remaining * 100).toFixed(1)}%`;
  const ratio = Math.min(1, session.hitTime / stage.goalSec);
  $('target-fill').style.width = `${(ratio * 100).toFixed(1)}%`;
  // 表示は小数1桁の切り捨て。クリア判定も同じ秒数に届いたときなので、表示と判定はずれない。
  // クリアしたあとも、当てた分だけ得点になるので数え続ける
  $('target-sec').textContent = (Math.floor(session.hitTime * 10 + 1e-6) / 10).toFixed(1);
  const tEl = $('target-fill').closest('.meter')!;
  tEl.classList.toggle('on', session.onTarget && !session.cleared);
  tEl.classList.toggle('done', session.cleared);
  tEl.classList.toggle('done-on', session.cleared && session.onTarget);
  $('hud-lives').textContent = hearts(run.lives);
  $('hud-score').textContent = fmtScore(run.score + (session.result ? 0 : liveStageScore()));
}

function showResult(): void {
  const r = session.result!;
  const out = run.record(r);
  const sc = out.score;
  $('result-stage').textContent = `STAGE ${stage.id}`;
  $('result-title').textContent = r.cleared ? 'クリア！' : 'しっぱい…';
  $('result-hit').textContent = `${(Math.floor(r.hitTime * 10 + 1e-6) / 10).toFixed(1)}秒 / ${r.goal}秒`;
  $('result-spill').textContent = `${Math.round(r.spillMl)}ml`;
  $('score-hit').textContent = `+${fmtScore(sc.hit)}`;
  $('score-clear').textContent = `+${fmtScore(sc.clear)}`;
  $('score-spill').textContent = `-${fmtScore(sc.spill)}`;
  $('score-stage').textContent = `${fmtScore(sc.total)}点`;
  $('score-total').textContent = `${fmtScore(run.score)}点`;
  let c = '';
  if (out.gameOver) c = 'ライフがなくなった…';
  else if (!r.cleared) c = `${r.hitTime > r.goal * 0.6 ? 'おしい！' : ''}同じステージにもう一回。コツ: ${stage.tip}`;
  else if (sc.spill > 0) c = 'こぼさなければ、もっと高得点！';
  else c = 'こぼさず完ぺき！';
  $('result-comment').textContent = c;
  $('btn-next').hidden = !r.cleared;
  $('btn-retry').hidden = r.cleared || out.gameOver;
  $('btn-to-over').hidden = !out.gameOver;
  if (!r.cleared) sound.fail();
  if (manual) promoEvents.push({ type: 'result', cleared: r.cleared, score: run.score, gameOver: out.gameOver });
  sound.setFlow(0, 'none');
  sound.setBuzz(0);
  $('banner').hidden = true;
  $('popups').replaceChildren();
  show('result');
}

// ---------- ループ ----------
let clock = 0;
function simulate(dt: number): void {
  const evs: GameEvent[] = [];
  let left = dt;
  while (left > 1e-9) {
    const h = Math.min(1 / 60, left);
    session.update(h);
    splash.update(h);
    evs.push(...session.drainEvents());
    left -= h;
    clock += h;
  }
  handleEvents(evs, dt);
  updatePopups(dt);
  if (manual) for (const e of evs) if (e.type !== 'hit') promoEvents.push({ type: e.type, value: e.value, target: e.target });
  if (screen === 'play') {
    hintTimer += dt;
    if (dragged || hintTimer > 6) $('hint').hidden = true;
  }
  updateFlush(dt);
  if (resultTimer > 0) {
    resultTimer -= dt;
    if (resultTimer <= 0) {
      resultTimer = -1;
      showResult();
    }
  }
}

/** 出し終わったら水を流す。ハエはどこかへ飛んでいき、水が引いたら結果を出す */
function updateFlush(dt: number): void {
  if (flushT < 0) return;
  const before = flushT;
  flushT += dt;
  const t = flushT - FLUSH.delay; // ボタンを押してからの時間
  const tb = before - FLUSH.delay;
  if (tb < 0 && t >= 0) {
    flushView.start();
    sound.flush(FLUSH.duration);
    if (manual) promoEvents.push({ type: 'flush' });
    $('popups').replaceChildren();
    $('banner').hidden = true;
    popup('ジャー！', 0, U.yBackTop - 0.12, U.zBack);
  }
  if (t >= 0) {
    // ボタンを押しこんで戻す
    const press = t < 0.25 ? Math.sin((t / 0.25) * Math.PI) : 0;
    parts.flushButton.position.z = buttonRestZ - press * 0.012;
    flushView.update(dt);
  }
  if (!fliesGone && t >= FLUSH.fliesAt) {
    fliesGone = true;
    if (session.flush() > 0) {
      const f = session.targets.find((x) => x.def.kind === 'fly');
      if (f) popup('ブーン', f.pos.x, f.pos.y + 0.05, f.pos.z, 'flee');
      sound.flee();
    }
  }
  if (tb < FLUSH.duration * 0.7 && t >= FLUSH.duration * 0.7) popup('ゴボボ…', 0, U.yBasin + 0.03, U.zBack + 0.08, 'drip');
  if (t >= FLUSH.duration + FLUSH.resultAfter && resultTimer < 0) {
    flushT = -1;
    resultTimer = 0.01;
  }
}

/** 告知動画の撮影用: ゲームの出来事（命中しはじめ・1秒ごと・クリア・逃げた・水を流す・結果） */
let promoEvents: Record<string, unknown>[] = [];

let lastRenderDt = 1 / 60;
function render(): void {
  streamView.update(session.stream);
  targetViews.update(clock, lastRenderDt);
  updateHud();
  renderer.render(scene, camera);
}

let last = performance.now();
let frames = 0, fpsT = 0, fps = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frames++;
  fpsT += dt;
  if (fpsT >= 1) {
    fps = frames / fpsT;
    frames = 0;
    fpsT = 0;
  }
  if (!manual) simulate(dt * timeScale);
  lastRenderDt = manual ? 1 / 60 : dt * timeScale;
  render();
  requestAnimationFrame(frame);
}
paintTitle();
newSession();
show('title');
prefetch(startStage);
requestAnimationFrame(frame);

// ---------- 確認用の入口 ----------
declare global {
  interface Window { __game: unknown }
}
window.__game = {
  config: { GEOM, PHYS, AIM, STAGES, TITLES },
  state: () => ({
    screen,
    stage: stage.id,
    session: session.state,
    phase: session.flow.phase,
    power: session.flow.power,
    remaining: session.bladder.remaining,
    hitTime: session.hitTime,
    onTarget: session.onTarget,
    cleared: session.cleared,
    yaw: session.yaw,
    pitch: session.pitch,
    particles: session.stream.aliveCount,
    spill: session.volTotal ? session.volSpill / session.volTotal : 0,
    result: session.result,
    run: { stage: run.stage, lives: run.lives, score: run.score, cleared: run.cleared, title: run.title, over: run.over },
    goal: stage.goalSec,
    /** 開始画面で、ステージの準備ができてスタートを押せる */
    ready: screen === 'ready' && !($('btn-start') as HTMLButtonElement).disabled,
  }),
  /** 確認用: n ステージ目の中身（目標の秒数を含む）と、作るのにかかった時間（ミリ秒） */
  stageInfo: (n: number) => {
    const t0 = performance.now();
    const st = getStage(n);
    return { ...st, ms: performance.now() - t0 };
  },
  /** 確認用: n ステージ目から通しプレイを始める */
  play: (n = 1) => {
    run = new Run(n);
    goReady();
  },
  targets: () => session.targets.map((t) => ({ kind: t.def.kind, surface: t.surface, mode: t.mode, active: t.active, pos: t.pos, cont: t.cont })),
  flush: () => ({ running: flushView.running, t: flushT }),
  start: () => startPee(),
  setAim: (y: number, p: number) => session.setAim(y, p),
  autoAim: (on: boolean) => (session.autoAim = on),
  manual: (on: boolean) => (manual = on),
  step: (sec: number) => {
    simulate(sec);
    render();
  },
  timeScale: (s: number) => (timeScale = s),
  toScreen,
  scene: () => scene,
  /** 確認用: カメラを別の場所に動かす */
  debugCam: (pos: [number, number, number], look: [number, number, number]) => {
    camera.position.set(...pos);
    camera.lookAt(...look);
  },
  fps: () => fps,
  sound: () => sound.debug,
  touchDown,
  touchMove,
  touchUp,
  /** ボタンと同じ処理 */
  next: () => goReady(),
  quit: () => quitRun(),
  drainEvents: () => {
    const e = promoEvents;
    promoEvents = [];
    return e;
  },
  audio: {
    capture: (on: boolean) => sound.capture(on),
    drain: () => sound.drain(),
    render: (ctx: BaseAudioContext, name: string, args: unknown[], when: number) => sound.render(ctx, name, args, when),
  },
};
