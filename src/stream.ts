import { GEOM, PHYS } from './config';
import { collide, type Hit, type Vec3 } from './physics';

export interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number;
  vol: number; // ml
  q: number; // 出たときの流量（太さの計算に使う）
  /** 一つ前に出た粒とつながっているか（途切れ目では false） */
  linked: boolean;
  /** ぶつかった直後のフレームだけ true（その点まで水流を描くため） */
  hit: boolean;
  /** 最後のポタポタで出た粒 */
  drip: boolean;
}

export interface StreamHit extends Hit {
  vol: number;
  drip: boolean;
  vel: Vec3;
}

export interface EmitInput {
  flowing: boolean;
  speed: number;
  q: number;
  dir: Vec3;
  drip: boolean;
}

/** 尿の粒。出た順に並べ、ぶつかったら消す */
export class Stream {
  parts: Particle[] = [];
  private acc = 0;
  private wasFlowing = false;
  private prevDir: Vec3 | null = null;

  get aliveCount(): number {
    return this.parts.length;
  }

  step(dt: number, e: EmitInput, onHit: (h: StreamHit) => void): void {
    // 前のフレームでぶつかった粒を消す
    if (this.parts.some((p) => p.hit)) this.parts = this.parts.filter((p) => !p.hit);

    const g = PHYS.g;
    // 進める
    for (const p of this.parts) this.advance(p, dt, g, onHit);

    // 出す（フレームの途中で出た粒は、その分だけ先に進めておく）
    if (e.flowing && e.speed > 0) {
      this.acc += PHYS.emitRate * dt;
      const n = Math.floor(this.acc);
      this.acc -= n;
      const pd = this.prevDir ?? e.dir;
      for (let i = 0; i < n; i++) {
        const frac = (i + 1) / n; // 0 に近いほど古い
        const lead = dt * (1 - frac);
        const d = lerpDir(pd, e.dir, frac);
        const o = GEOM.origin;
        const p: Particle = {
          x: o.x, y: o.y, z: o.z,
          vx: d.x * e.speed, vy: d.y * e.speed, vz: d.z * e.speed,
          age: 0,
          vol: e.q / PHYS.emitRate,
          q: e.q,
          linked: this.wasFlowing || i > 0,
          hit: false,
          drip: e.drip,
        };
        this.parts.push(p);
        if (lead > 0) this.advance(p, lead, g, onHit);
      }
      this.wasFlowing = true;
    } else {
      this.wasFlowing = false;
      this.acc = 0;
    }
    this.prevDir = e.dir;
  }

  private advance(p: Particle, dt: number, g: number, onHit: (h: StreamHit) => void): void {
    if (p.hit) return;
    const a = { x: p.x, y: p.y, z: p.z };
    const b = { x: p.x + p.vx * dt, y: p.y + p.vy * dt - 0.5 * g * dt * dt, z: p.z + p.vz * dt };
    const h = collide(a, b);
    p.age += dt;
    if (h) {
      const vy = p.vy - g * dt * h.t;
      p.x = h.point.x; p.y = h.point.y; p.z = h.point.z;
      p.hit = true;
      onHit({ ...h, vol: p.vol, drip: p.drip, vel: { x: p.vx, y: vy, z: p.vz } });
      return;
    }
    p.x = b.x; p.y = b.y; p.z = b.z;
    p.vy -= g * dt;
    if (p.age > PHYS.maxLife) p.hit = true;
  }
}

function lerpDir(a: Vec3, b: Vec3, t: number): Vec3 {
  const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}
