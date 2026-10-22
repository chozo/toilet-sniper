import { AIM, FLOW_DEFAULT, GEOM, SCORE, type StageDef } from './config';
import { Bladder, makeRng, type FlowOutput, type Rng } from './flow';
import { aimDir, solvePitch, surfaceCoord, targetPoint } from './physics';
import { Stream, type StreamHit } from './stream';
import { Target } from './targets';

export type SessionState = 'ready' | 'playing' | 'finished';

export interface GameEvent {
  type: 'hit' | 'targetOn' | 'targetOff' | 'second' | 'clear' | 'finish' | 'flee' | 'land';
  /** flee / land のときの的の番号 */
  target?: number;
  hit?: StreamHit;
  onTarget?: boolean;
  value?: number;
}

export interface Result {
  cleared: boolean;
  hitTime: number;
  goal: number;
  /** こぼした割合（本流だけ） */
  spillRate: number;
  /** こぼした量（ml、本流だけ） */
  spillMl: number;
}

/** 1回のステージ。描画とは切り離してあり、テストでもそのまま動かせる */
export class Session {
  readonly stage: StageDef;
  readonly bladder: Bladder;
  readonly stream = new Stream();
  readonly targets: Target[];
  state: SessionState = 'ready';
  yaw = 0;
  pitch = AIM.startPitch;
  /** 自動で的を狙う（確認用） */
  autoAim = false;
  time = 0;
  hitTime = 0;
  cleared = false;
  onTarget = false;
  lastTargetHit = -1;
  volTotal = 0;
  volSpill = 0;
  volTarget = 0;
  flow: FlowOutput;
  events: GameEvent[] = [];
  result: Result | null = null;
  private rng: Rng;
  private wob: number[];

  constructor(stage: StageDef, seed = 1) {
    this.stage = stage;
    this.rng = makeRng(seed);
    this.bladder = new Bladder({ ...FLOW_DEFAULT, ...stage.flow }, this.rng);
    this.flow = this.bladder.update(0);
    this.wob = Array.from({ length: 6 }, () => this.rng() * Math.PI * 2);
    this.targets = stage.targets.map((d) => new Target(d, this.rng));
  }

  start(): void {
    if (this.state !== 'ready') return;
    this.state = 'playing';
    this.bladder.start();
  }

  addAim(dyaw: number, dpitch: number): void {
    this.setAim(this.yaw + dyaw, this.pitch + dpitch);
  }

  setAim(yaw: number, pitch: number): void {
    this.yaw = Math.max(-AIM.yawMax, Math.min(AIM.yawMax, yaw));
    this.pitch = Math.max(AIM.pitchMin, Math.min(AIM.pitchMax, pitch));
  }

  /** 手ぶれを足した、実際に出る向き */
  effectiveAim(): { yaw: number; pitch: number } {
    const t = this.time;
    const end = this.flow.phase === 'dribble' ? 1 : Math.max(0, 1 - this.flow.power / 0.45);
    const amp = (AIM.wobble + (AIM.wobbleEnd - AIM.wobble) * end) * (this.stage.wobble ?? 1);
    const w = this.wob;
    const ny = Math.sin(t * 2.1 + w[0]) * 0.6 + Math.sin(t * 5.3 + w[1]) * 0.3 + Math.sin(t * 11.7 + w[2]) * 0.1;
    const np = Math.sin(t * 1.7 + w[3]) * 0.6 + Math.sin(t * 4.9 + w[4]) * 0.3 + Math.sin(t * 12.3 + w[5]) * 0.1;
    return { yaw: this.yaw + ny * amp, pitch: this.pitch + np * amp };
  }

  /** 確認用: いまの勢いで、狙える的（止まっていて届くもの）の中心に届く角度 */
  solveAimToTarget(): { yaw: number; pitch: number } | null {
    if (this.flow.speed <= 0) return null;
    // いま当てている的を優先し、なければ届く的のうち最初のもの
    const order = [...this.targets].sort((a, b) => Number(b.cont > 0) - Number(a.cont > 0));
    for (const tg of order) {
      if (!tg.active) continue;
      const c = tg.center(this.time);
      const s = solvePitch(this.flow.speed, targetPoint(tg.surface, c.u, c.v));
      if (s.reachable) return { yaw: s.yaw, pitch: s.pitch };
    }
    // 届かないときは受け皿の手前寄りを狙う
    const U = GEOM.urinal;
    const b = solvePitch(this.flow.speed, { x: 0, y: U.yBasin, z: U.zFrontInner - 0.06 });
    return { yaw: b.yaw, pitch: b.pitch };
  }

  update(dt: number): void {
    if (this.state === 'ready') return;
    if (this.state === 'finished') {
      // 終わったあとも、的は動き続ける（水を流したときに飛んでいくハエなど）
      this.time += dt;
      for (const t of this.targets) t.update(dt, this.time);
      return;
    }
    this.time += dt;
    this.flow = this.bladder.update(dt);
    if (this.autoAim) {
      const a = this.solveAimToTarget();
      if (a) this.setAim(a.yaw, a.pitch);
    }
    const aim = this.effectiveAim();
    const dir = aimDir(aim.yaw, aim.pitch);
    this.stream.step(dt, { flowing: this.flow.flowing, speed: this.flow.speed, q: this.flow.q, dir, drip: this.flow.phase === 'dribble' }, (h) => this.onHit(h));
    this.targets.forEach((t, i) => {
      const ev = t.update(dt, this.time);
      if (ev) this.events.push({ type: ev, target: i });
    });

    const wasOn = this.onTarget;
    this.onTarget = this.lastTargetHit >= 0 && this.time - this.lastTargetHit <= SCORE.hitGrace;
    if (this.onTarget !== wasOn) this.events.push({ type: this.onTarget ? 'targetOn' : 'targetOff' });
    if (this.onTarget && !this.cleared) {
      const before = Math.floor(this.hitTime);
      this.hitTime = Math.min(this.stage.goalSec, this.hitTime + dt);
      const after = Math.floor(this.hitTime);
      if (after > before && this.hitTime < this.stage.goalSec) this.events.push({ type: 'second', value: after });
      if (this.hitTime >= this.stage.goalSec) {
        this.cleared = true;
        this.events.push({ type: 'clear' });
      }
    } else if (this.onTarget && this.cleared) {
      this.hitTime += dt; // クリア後も、当てた分だけ得点になる
    }

    if (this.flow.phase === 'done' && this.stream.aliveCount === 0) this.finish();
  }

  private onHit(h: StreamHit): void {
    // こぼした割合は本流だけで数える（最後のポタポタは狙っても止められない）
    if (!h.drip) {
      this.volTotal += h.vol;
      if (h.region === 'spill') this.volSpill += h.vol;
    }
    let onT = false;
    for (const tg of this.targets) {
      if (!tg.active) continue;
      const c = surfaceCoord(tg.surface, h);
      const m = tg.center(this.time);
      if (c && Math.hypot(c[0] - m.u, c[1] - m.v) <= tg.def.radius) {
        onT = true;
        tg.hit = true;
        tg.lastHit = this.time;
      }
    }
    if (onT) {
      this.volTarget += h.vol;
      this.lastTargetHit = this.time;
    }
    this.events.push({ type: 'hit', hit: h, onTarget: onT });
  }

  private finish(): void {
    this.state = 'finished';
    const spillRate = this.volTotal > 0 ? this.volSpill / this.volTotal : 0;
    this.result = { cleared: this.cleared, hitTime: this.hitTime, goal: this.stage.goalSec, spillRate, spillMl: this.volSpill };
    this.events.push({ type: 'finish' });
  }

  /** 水を流す: ハエはどこかへ飛んでいく。飛んでいったハエの数を返す */
  flush(): number {
    let n = 0;
    for (const t of this.targets) if (t.flyAway(this.rng)) n++;
    return n;
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
