import { describe, expect, it } from 'vitest';
import { getStage } from '../src/stages';
import { Session } from '../src/session';

const DT = 1 / 60;
function play(setup: (s: Session) => void, perFrame?: (s: Session) => void, seed = 1) {
  const s = new Session(getStage(1), seed);
  setup(s);
  s.start();
  for (let i = 0; i < 60 * 60 && s.state !== 'finished'; i++) {
    perFrame?.(s);
    s.update(DT);
  }
  return s;
}

describe('ステージ1', () => {
  it('勢いに合わせて狙いを追いかければクリアできる', () => {
    const s = play((s) => (s.autoAim = true));
    expect(s.state).toBe('finished');
    expect(s.result!.cleared).toBe(true);
    expect(s.result!.spillRate).toBeLessThan(0.05);
  });
  it('狙いを固定したままでは、どの角度でもクリアできない', () => {
    let best = 0, bestP = 0;
    for (let p = -0.7; p <= 0.8; p += 0.01) {
      const s = play((s) => s.setAim(0, p));
      if (s.hitTime > best) { best = s.hitTime; bestP = p; }
      expect(s.result!.cleared).toBe(false);
    }
    expect(bestP).toBeDefined();
  });
  it('何もしないとクリアできない', () => {
    const s = play(() => {});
    expect(s.result!.cleared).toBe(false);
  });
});


describe('クリアしたあと', () => {
  it('クリアしたあとも、当てた時間を数え続ける（得点になる）', () => {
    const s = play((s) => (s.autoAim = true));
    expect(s.result!.hitTime).toBeGreaterThan(getStage(1).goalSec + 2);
  });
});
