// 無限ステージの中身と難しさを一覧にする。npx vitest run --config tools/sim/vitest.config.ts tools/sim/endless
import { it } from 'vitest';
import { getStage, stageSeed } from '../../src/stages';
import { simulate } from '../../src/sim';

const N = Number(process.env.N || 40);
it('endless', () => {
  for (let n = 1; n <= N; n++) {
    const st = getStage(n);
    const seed = stageSeed(n);
    const h = simulate(st, 'human', seed);
    const h5 = simulate(st, 'human', seed + 5, { delay: 0.5 });
    let best = 0;
    for (let yaw = -0.2; yaw <= 0.2001; yaw += 0.1) for (let p = -0.7; p <= 0.8; p += 0.05) best = Math.max(best, simulate(st, 'fixed', seed, { yaw, pitch: p }).hitTime);
    const ok = best < st.goalSec ? '' : ' ★固定でクリアできる';
    console.log(`ST${n} ${st.name} 目標${st.goalSec}s | 人0.3s ${h.hitTime.toFixed(1)}s 人0.5s ${h5.hitTime.toFixed(1)}s | 固定最高 ${best.toFixed(1)}s | 全体 ${h.time.toFixed(1)}s | こぼれ ${h.volSpill.toFixed(0)}ml${ok}`);
  }
});
