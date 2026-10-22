import { HUMAN_SIM, type StageTemplate } from './config';
import { Session } from './session';

export type SimMode = 'auto' | 'human' | 'fixed' | 'idle';

/**
 * ステージを自動で遊ばせて、当てた時間を測る。目標の秒数の計算とテストで使う。
 * auto: すぐ追従 / human: delay 秒遅れで、狙いを動かせる速さに上限あり / fixed: 狙いを固定 / idle: 何もしない
 */
export function simulate(stage: StageTemplate, mode: SimMode, seed: number, opt: { yaw?: number; pitch?: number; delay?: number } = {}): Session {
  const s = new Session({ ...stage, goalSec: 999 }, seed);
  if (mode === 'fixed') s.setAim(opt.yaw ?? 0, opt.pitch ?? 0);
  s.autoAim = mode === 'auto';
  s.start();
  const delay = opt.delay ?? 0.3;
  const hist: { t: number; yaw: number; pitch: number }[] = [];
  const dt = 1 / 60;
  while (s.state !== 'finished') {
    if (mode === 'human') {
      const want = s.solveAimToTarget();
      if (want) hist.push({ t: s.time, ...want });
      while (hist.length > 1 && hist[1].t <= s.time - delay) hist.shift();
      const old = hist[0];
      if (old && old.t <= s.time - delay) {
        const cl = (x: number, m: number) => Math.max(-m * dt, Math.min(m * dt, x));
        s.addAim(cl(old.yaw - s.yaw, HUMAN_SIM.yawRate), cl(old.pitch - s.pitch, HUMAN_SIM.pitchRate));
      }
    }
    s.update(dt);
    s.drainEvents();
  }
  return s;
}
