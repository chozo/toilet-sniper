import { describe, expect, it } from 'vitest';
import { FLOW_DEFAULT } from '../src/config';
import { Bladder, makeRng } from '../src/flow';

function run(p = FLOW_DEFAULT) {
  const b = new Bladder(p, makeRng(3));
  b.start();
  const out = [];
  let vol = 0;
  for (let i = 0; i < 60 * 120; i++) {
    const o = b.update(1 / 60);
    vol += o.q / 60;
    out.push({ t: (i + 1) / 60, ...o });
    if (o.phase === 'done') break;
  }
  return { out, vol };
}

describe('膀胱と勢い', () => {
  it('出した量の合計は、本流の分と最後の数滴', () => {
    const { vol } = run();
    const P = FLOW_DEFAULT;
    const main = P.volumeMl * (1 - P.dribbleAt * P.dribbleAt);
    expect(vol).toBeGreaterThan(main - 1);
    expect(vol).toBeLessThan(main + P.dribbleMl + 1);
  });
  it('出始めは弱く、立ち上がったあとは勢いが下がり続ける', () => {
    const { out } = run();
    expect(out[0].power).toBeLessThan(0.6);
    const main = out.filter((o) => o.phase === 'main' && o.t > FLOW_DEFAULT.rampTime);
    for (let i = 1; i < main.length; i++) expect(main[i].speed).toBeLessThanOrEqual(main[i - 1].speed + 1e-9);
    expect(main[0].power).toBeGreaterThan(0.95);
  });
  it('速さは残量の平方根に比例する', () => {
    const { out } = run();
    for (const o of out.filter((o) => o.phase === 'main' && o.t > 1)) {
      expect(o.power).toBeCloseTo(Math.sqrt(o.remaining), 1);
    }
  });
  it('本流は16秒前後、最後は途切れ途切れの数滴で短く終わる', () => {
    const { out } = run();
    const mainEnd = out.filter((o) => o.phase === 'main').at(-1)!.t;
    const end = out.at(-1)!.t;
    expect(mainEnd).toBeGreaterThan(14);
    expect(mainEnd).toBeLessThan(18);
    const drib = out.filter((o) => o.phase === 'dribble');
    expect(drib.some((o) => !o.flowing)).toBe(true);
    expect(end - mainEnd).toBeGreaterThan(0.2);
    expect(end - mainEnd).toBeLessThan(1.2);
  });
});
