import { FLY_AREA, urinalHalfWidth, type Surface, type TargetDef } from './config';
import type { Rng } from './flow';
import { targetPoint, type Vec3 } from './physics';

/** gone: 水を流したときに飛んでいって、もういない */
export type TargetMode = 'landed' | 'flying' | 'gone';

/** 続けて当たっているとみなす間隔（これより長く外れたら、続けて当てた時間を戻す） */
const CONT_GAP = 0.25;
/** 当てられているハエが慌てて歩く速さの倍率 */
const PANIC = 1.8;

/** 1つの的（シール・消臭剤・ハエ）の、いまの状態 */
export class Target {
  readonly def: TargetDef;
  surface: Surface;
  u: number;
  v: number;
  mode: TargetMode = 'landed';
  /** 歩く向き（面の上の角度） */
  heading: number;
  /** 当たっている */
  hit = false;
  lastHit = -1;
  /** 続けて当てられている時間 */
  cont = 0;
  /** 飛んでいるときの位置と、出発・到着 */
  pos: Vec3;
  private from: Vec3 = { x: 0, y: 0, z: 0 };
  private to = { surface: 'back' as Surface, u: 0, v: 0 };
  /** 飛んでいく先（水を流したとき）。あるときは止まらずに消える */
  private away: Vec3 | null = null;
  private flyT = 0;
  private flyDur = 0;
  private turnT = 0;
  private rng: Rng;

  constructor(def: TargetDef, rng: Rng) {
    this.def = def;
    this.rng = rng;
    this.surface = def.surface;
    this.u = def.u;
    this.v = def.v;
    this.heading = rng() * Math.PI * 2;
    this.pos = targetPoint(this.surface, this.u, this.v);
  }

  /** 当たり判定に使えるか（飛んでいるハエには当たらない） */
  get active(): boolean {
    return this.mode === 'landed';
  }

  /** 面の上での、いまの中心 */
  center(time: number): { u: number; v: number } {
    const s = this.def.slide;
    if (s) return { u: this.def.u + s.amp * Math.sin((time * Math.PI * 2) / s.period), v: this.v };
    return { u: this.u, v: this.v };
  }

  /** 戻り値: 'flee'（逃げはじめた）/ 'land'（止まった）/ null */
  update(dt: number, time: number): 'flee' | 'land' | null {
    const fly = this.def.fly;
    let ev: 'flee' | 'land' | null = null;
    // 当たり続けているか
    if (this.lastHit >= 0 && time - this.lastHit <= CONT_GAP && this.mode === 'landed') this.cont += dt;
    else this.cont = 0;

    if (fly && this.mode === 'landed') {
      if (this.cont >= fly.fleeAfter) {
        this.takeOff();
        ev = 'flee';
      } else if (fly.behavior === 'walk' || this.hit) {
        // 歩く。当てられているときは、じっとしているハエも慌てて少し動く
        const base = fly.behavior === 'walk' ? (fly.speed ?? 0.03) : 0;
        const sp = this.hit ? Math.max(base * PANIC, 0.03) : base;
        this.turnT -= dt;
        if (this.turnT <= 0) {
          this.heading += (this.rng() - 0.5) * 2.2;
          this.turnT = 0.4 + this.rng() * 0.9;
        }
        this.u += Math.cos(this.heading) * sp * dt;
        this.v += Math.sin(this.heading) * sp * dt;
        // 範囲の端では向きを変える
        const a = FLY_AREA[this.surface];
        if (this.u < a.u[0] || this.u > a.u[1]) this.heading = Math.PI - this.heading;
        if (this.v < a.v[0] || this.v > a.v[1]) this.heading = -this.heading;
        this.u = clamp(this.u, a.u[0], a.u[1]);
        this.v = clamp(this.v, a.v[0], a.v[1]);
        this.keepInside();
      }
    } else if (this.mode === 'flying') {
      this.flyT += dt;
      const k = Math.min(1, this.flyT / this.flyDur);
      const end = this.away ?? targetPoint(this.to.surface, this.to.u, this.to.v);
      // 手前へふくらむ弧を描いて飛ぶ。小刻みに揺れる
      const lift = Math.sin(k * Math.PI);
      const wig = Math.sin(this.flyT * 23) * 0.012 * lift;
      this.pos = {
        x: lerp(this.from.x, end.x, k) + Math.sin(this.flyT * 9) * 0.05 * lift + wig,
        y: lerp(this.from.y, end.y, k) + lift * 0.22,
        z: lerp(this.from.z, end.z, k) + lift * 0.12,
      };
      if (k >= 1 && this.away) {
        this.mode = 'gone';
      } else if (k >= 1) {
        this.mode = 'landed';
        this.surface = this.to.surface;
        this.u = this.to.u;
        this.v = this.to.v;
        this.cont = 0;
        this.lastHit = -1;
        ev = 'land';
      }
    }
    if (this.mode === 'landed') {
      const c = this.center(time);
      this.pos = targetPoint(this.surface, c.u, c.v);
    }
    this.hit = false;
    return ev;
  }

  private takeOff(): void {
    const fly = this.def.fly!;
    this.mode = 'flying';
    this.from = { ...this.pos };
    this.flyT = 0;
    this.flyDur = fly.flight[0] + (fly.flight[1] - fly.flight[0]) * this.rng();
    // 今いる場所から離れたところに止まる
    for (let i = 0; i < 12; i++) {
      const surface: Surface = this.rng() < 0.4 ? 'back' : 'basin';
      const a = FLY_AREA[surface];
      const v = lerp(a.v[0], a.v[1], this.rng());
      const u = surface === 'basin' ? lerp(-1, 1, this.rng()) * basinU(v) : lerp(a.u[0], a.u[1], this.rng());
      const p = targetPoint(surface, u, v);
      this.to = { surface, u, v };
      if (Math.hypot(p.x - this.from.x, p.y - this.from.y, p.z - this.from.z) > 0.12) break;
    }
    this.cont = 0;
  }

  /** 受け皿の手前は丸いので、ふちからはみ出さないようにする */
  private keepInside(): void {
    if (this.surface !== 'basin') return;
    const m = basinU(this.v);
    if (Math.abs(this.u) > m) {
      this.u = Math.sign(this.u) * m;
      this.heading = Math.PI - this.heading;
    }
  }

  /** 水を流したとき: 止まっているハエは、画面の外へ飛んでいく */
  flyAway(rng: Rng): boolean {
    if (!this.def.fly || this.mode === 'gone') return false;
    const side = rng() < 0.5 ? -1 : 1;
    this.away = { x: side * (0.7 + rng() * 0.4), y: 1.2 + rng() * 0.4, z: -0.1 + rng() * 0.3 };
    this.from = { ...this.pos };
    this.mode = 'flying';
    this.flyT = 0;
    this.flyDur = 0.9 + rng() * 0.5;
    this.cont = 0;
    return true;
  }

  /** 面の法線（ハエや的の向きに使う） */
  normal(): Vec3 {
    return this.surface === 'back' ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  }
}

/** 受け皿で、ハエの中心が動ける左右の幅（半分） */
function basinU(v: number): number {
  return Math.min(FLY_AREA.basin.u[1], urinalHalfWidth(v) - 0.045);
}

function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

