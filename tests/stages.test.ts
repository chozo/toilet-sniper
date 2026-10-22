import { describe, expect, it } from 'vitest';
import { STAGES } from '../src/config';
import { simulate } from '../src/sim';
import { generateTemplate, getStage, goalRatio, stageSeed } from '../src/stages';

// ステージが成り立っているかを、1〜30ステージで確かめる（目標の秒数は計算で決まる）
const N = 30;
const ids = Array.from({ length: N }, (_, i) => i + 1);

describe.each(ids)('ステージ%i', (n) => {
  const st = getStage(n);
  const seed = stageSeed(n);
  it('1ステージは15〜20秒くらいで終わる', () => {
    const t = simulate(st, 'auto', seed).time;
    expect(t).toBeGreaterThan(13.5);
    expect(t).toBeLessThan(20.5);
  });
  it('0.3秒遅れで追いかければクリアでき、こぼれも少ない', () => {
    const s = simulate(st, 'human', seed);
    expect(s.hitTime).toBeGreaterThanOrEqual(st.goalSec);
    expect(s.volSpill).toBeLessThan(10);
  });
  it('何もしない・狙いを固定したままではクリアできない', () => {
    expect(simulate(st, 'idle', seed).hitTime).toBeLessThan(st.goalSec);
    for (let yaw = -0.2; yaw <= 0.2001; yaw += 0.1)
      for (let p = -0.7; p <= 0.8; p += 0.05) expect(simulate(st, 'fixed', seed, { yaw, pitch: p }).hitTime).toBeLessThan(st.goalSec);
  });
});

describe('ステージの作り方', () => {
  it('はじめの8ステージは手で作ったもの、そのあとは組み合わせで作る', () => {
    expect(getStage(1).name).toBe(STAGES[0].name);
    expect(getStage(8).name).toBe(STAGES[7].name);
    expect(getStage(9).targets.length).toBeGreaterThan(0);
  });
  it('同じステージは何度作っても同じ中身', () => {
    expect(JSON.stringify(generateTemplate(15))).toBe(JSON.stringify(generateTemplate(15)));
  });
  it('目標の割合はステージが進むほど上がる', () => {
    for (let n = 2; n < 60; n++) expect(goalRatio(n)).toBeGreaterThan(goalRatio(n - 1));
  });
});
