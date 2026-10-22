import { describe, expect, it } from 'vitest';
import { GEOM } from '../src/config';
import { collide, solvePitch, targetPoint } from '../src/physics';

const U = GEOM.urinal;
describe('当たり判定', () => {
  it('奥の面に当たる', () => {
    const h = collide({ x: 0, y: 0.6, z: U.zBack + 0.05 }, { x: 0, y: 0.6, z: U.zBack - 0.05 });
    expect(h?.surface).toBe('back');
    expect(h?.region).toBe('bowl');
    expect(h?.point.z).toBe(U.zBack);
  });
  it('上から受け皿に落ちる', () => {
    const h = collide({ x: 0.05, y: 0.5, z: -0.3 }, { x: 0.05, y: 0.4, z: -0.31 });
    expect(h?.surface).toBe('basin');
  });
  it('手前のふちより低いと便器の外側に当たってこぼれる', () => {
    const h = collide({ x: 0, y: 0.5, z: U.zFrontOuter + 0.05 }, { x: 0, y: 0.5, z: U.zFrontOuter - 0.05 });
    expect(h?.surface).toBe('urinalFront');
    expect(h?.region).toBe('spill');
  });
  it('便器より上を越えると壁に当たってこぼれる', () => {
    const h = collide({ x: 0, y: 1.3, z: GEOM.zWall + 0.05 }, { x: 0, y: 1.3, z: GEOM.zWall - 0.05 });
    expect(h?.surface).toBe('wall');
  });
  it('手前の床に落ちるとこぼれる', () => {
    const h = collide({ x: 0, y: 0.02, z: 0 }, { x: 0, y: -0.02, z: -0.02 });
    expect(h?.surface).toBe('floor');
  });
});

describe('狙いの計算', () => {
  it('勢いが強ければ奥の的に届き、弱いと届かない', () => {
    const t = targetPoint('back', 0, 0.6);
    expect(solvePitch(3.2, t).reachable).toBe(true);
    expect(solvePitch(0.8, t).reachable).toBe(false);
  });
});
