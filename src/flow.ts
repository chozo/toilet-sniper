import type { FlowParams } from './config';

export type Rng = () => number;

/** 再現できる乱数（mulberry32） */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type FlowPhase = 'idle' | 'main' | 'dribble' | 'done';

export interface FlowOutput {
  phase: FlowPhase;
  /** いま尿が出ているか（途切れ途切れの「切れ目」では false） */
  flowing: boolean;
  /** 出口の速さ（m/秒） */
  speed: number;
  /** 流量（ml/秒） */
  q: number;
  /** 残量の割合 0..1 */
  remaining: number;
  /** 勢いの割合 0..1（vMax に対する） */
  power: number;
}

/**
 * 膀胱。update(dt) で時間を進め、その瞬間の勢いを返す。
 * 本流: v = vMax * ramp * sqrt(V/V0)、Q = qMax * ramp * sqrt(V/V0)
 * → sqrt(V/V0) は時間に対して一定の速さで下がる（トリチェリの式と同じ形）。
 */
export class Bladder {
  readonly p: FlowParams;
  private rng: Rng;
  volume: number;
  t = 0;
  phase: FlowPhase = 'idle';
  private pulseLeft = 0;
  private pulseOnNow = false;
  private pulseSpeed = 0;

  constructor(p: FlowParams, rng: Rng) {
    this.p = p;
    this.rng = rng;
    this.volume = p.volumeMl;
  }

  start(): void {
    if (this.phase === 'idle') this.phase = 'main';
  }

  get remaining(): number {
    return Math.max(0, this.volume / this.p.volumeMl);
  }

  private ramp(): number {
    const p = this.p;
    if (this.t >= p.rampTime) return 1;
    const x = this.t / p.rampTime;
    const s = x * x * (3 - 2 * x);
    return p.rampStart + (1 - p.rampStart) * s;
  }

  update(dt: number): FlowOutput {
    const p = this.p;
    if (this.phase === 'idle' || this.phase === 'done') {
      return { phase: this.phase, flowing: false, speed: 0, q: 0, remaining: this.remaining, power: 0 };
    }
    this.t += dt;
    const s = Math.sqrt(this.remaining);

    if (this.phase === 'main') {
      if (s <= p.dribbleAt) {
        this.phase = 'dribble';
        this.volume = Math.min(this.volume, p.dribbleMl); // 残りは最後の数滴だけ
        this.pulseOnNow = false;
        this.pulseLeft = 0.08;
      } else {
        const r = this.ramp();
        const q = p.qMax * r * s;
        const speed = p.vMax * r * s;
        this.volume -= q * dt;
        return { phase: 'main', flowing: true, speed, q, remaining: this.remaining, power: speed / p.vMax };
      }
    }

    // 途切れ途切れ（最後のポタポタ）
    this.pulseLeft -= dt;
    if (this.pulseLeft <= 0) {
      this.pulseOnNow = !this.pulseOnNow;
      const [a, b] = this.pulseOnNow ? p.pulseOn : p.pulseOff;
      this.pulseLeft = a + (b - a) * this.rng();
      // 残りが少ないほど弱い
      const left = this.remaining / (p.dribbleAt * p.dribbleAt);
      this.pulseSpeed = p.vMax * p.dribbleAt * (0.95 + 0.5 * this.rng()) * (0.7 + 0.3 * Math.min(1, left));
    }
    if (this.volume <= 0) {
      this.phase = 'done';
      this.volume = 0;
      return { phase: 'done', flowing: false, speed: 0, q: 0, remaining: 0, power: 0 };
    }
    if (!this.pulseOnNow) {
      return { phase: 'dribble', flowing: false, speed: 0, q: 0, remaining: this.remaining, power: 0 };
    }
    const q = Math.min(p.dribbleQ, this.volume / dt);
    this.volume -= q * dt;
    return { phase: 'dribble', flowing: true, speed: this.pulseSpeed, q, remaining: this.remaining, power: this.pulseSpeed / p.vMax };
  }

  /** 本流が続く時間の目安（立ち上がりを除く） */
  static mainDuration(p: FlowParams): number {
    return ((1 - p.dribbleAt) * 2 * p.volumeMl) / p.qMax;
  }
}
