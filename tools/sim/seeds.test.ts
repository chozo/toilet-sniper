// 反応の遅れを変えて、どこまでクリアできるかを見る。npx vitest run --config tools/sim/vitest.config.ts tools/sim/seeds
import { it } from 'vitest';
import { simulate } from '../../src/sim';
import { getStage, stageSeed } from '../../src/stages';

const N = Number(process.env.N || 30);
it('delays', () => {
  for (const delay of [0.2, 0.3, 0.4, 0.5, 0.6]) {
    // 3回失敗するまで進めたら、何ステージクリアできるか
    let lives = 3, cleared = 0, n = 1, tries = 0;
    while (lives > 0 && n <= N) {
      const st = getStage(n);
      const s = simulate(st, 'human', stageSeed(n) + tries * 13, { delay });
      if (s.hitTime >= st.goalSec) { cleared++; n++; tries = 0; } else { lives--; tries++; }
    }
    console.log(`遅れ ${delay}秒: ${n > N ? `${N}ステージ全部` : `${cleared}ステージ`}クリア`);
  }
});
