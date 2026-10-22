import { describe, expect, it } from 'vitest';
import { LIVES, SCORE, TITLES } from '../src/config';
import { Run, stageScore, titleFor } from '../src/run';
import type { Result } from '../src/session';

const res = (o: Partial<Result>): Result => ({ cleared: true, hitTime: 8, goal: 6, spillRate: 0, spillMl: 0, ...o });

describe('得点', () => {
  it('当てた時間に比例し、クリアすると加点、こぼすと減点', () => {
    expect(stageScore(res({})).total).toBe(8 * SCORE.perSec + SCORE.clearBonus);
    expect(stageScore(res({ hitTime: 9 })).total).toBeGreaterThan(stageScore(res({})).total);
    const s = stageScore(res({ spillMl: 12.4 }));
    expect(s.spill).toBe(12 * SCORE.spillPerMl);
    expect(s.total).toBe(8 * SCORE.perSec + SCORE.clearBonus - 12 * SCORE.spillPerMl);
  });
  it('当てた時間は画面と同じ0.1秒刻みで数える', () => {
    expect(stageScore(res({ hitTime: 6.09 })).hit).toBe(6 * SCORE.perSec);
  });
  it('こぼれはクリアに関係しない。ステージの得点は0より下がらない', () => {
    expect(stageScore(res({ cleared: false, hitTime: 1, spillMl: 100 })).total).toBe(0);
  });
});

describe('通しプレイ', () => {
  it('クリアすると次へ、失敗するとライフが減って同じステージ。3回失敗で終わり', () => {
    const r = new Run();
    r.record(res({}));
    expect(r.stage).toBe(2);
    expect(r.cleared).toBe(1);
    for (let i = 1; i <= LIVES; i++) {
      const o = r.record(res({ cleared: false, hitTime: 2 }));
      expect(r.stage).toBe(2);
      expect(r.lives).toBe(LIVES - i);
      expect(o.gameOver).toBe(i === LIVES);
    }
  });
  it('称号はクリアしたステージの数で決まる', () => {
    const cases: [number, string][] = [
      [0, 'はじめてのトイレ'], [5, 'はじめてのトイレ'], [6, 'トイレ初心者'], [10, 'トイレ初心者'],
      [11, 'トイレ中級'], [15, 'トイレ中級'], [16, 'トイレのベテラン'], [20, 'トイレのベテラン'],
      [21, 'トイレのスナイパー'], [30, 'トイレのスナイパー'], [31, 'トイレの上級スナイパー'], [40, 'トイレの上級スナイパー'],
      [41, 'トイレの天才スナイパー'], [50, 'トイレの天才スナイパー'], [51, 'トイレの神スナイパー'], [99, 'トイレの神スナイパー'],
      [100, 'トイレの神様'], [9999, 'トイレの神様'],
    ];
    for (const [n, name] of cases) expect(titleFor(n), `${n}クリア`).toBe(name);
    expect(TITLES).toHaveLength(9);
    const r = new Run();
    for (let i = 0; i < 6; i++) r.record(res({}));
    expect(r.title).toBe('トイレ初心者');
  });
});
