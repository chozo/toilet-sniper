import { FLY_AREA, GEOM, GOAL, STAGES, type FlowParams, type StageDef, type StageTemplate, type TargetDef } from './config';
import { makeRng, type Rng } from './flow';
import { targetPoint } from './physics';
import { simulate } from './sim';

const U = GEOM.urinal;

/** ステージの乱数の種。同じステージは、誰が何回遊んでも同じ中身になる */
export function stageSeed(n: number): number {
  return n * 101 + 7;
}

/** 目標の秒数にかける割合。ステージが進むほど上がる */
export function goalRatio(n: number): number {
  const g = GOAL;
  return g.ratioStart + (g.ratioMax - g.ratioStart) * (1 - Math.exp(-(n - 1) / g.ratioScale));
}

type Kind = 'sticker' | 'slide' | 'cake' | 'fly' | 'walk' | 'flies';

const KIND_TEXT: Record<Kind, { name: string; desc: string; tip: string }> = {
  sticker: { name: 'ねらいの的', desc: '奥の的に当てろ！', tip: '勢いが落ちたら、狙いを上げて追いかけよう' },
  slide: { name: 'うごく的', desc: '左右に動く的に当てろ！', tip: '左右の動きと、勢いの低下を同時に追いかけよう' },
  cake: { name: '消臭剤', desc: '受け皿の消臭剤に当てろ！', tip: 'はじめは下向きに。弱くなったら少しずつ上げよう' },
  fly: { name: 'とまったハエ', desc: 'ハエに当てろ！当て続けると逃げるぞ', tip: 'ハエが逃げたら、止まった場所をすぐ狙おう' },
  walk: { name: 'あるくハエ', desc: '歩き回るハエに当てろ！', tip: 'ハエの行く先を読んで狙おう' },
  flies: { name: 'ハエの群れ', desc: 'ハエがたくさん！次々に狙え', tip: '当てたハエは飛んでいく。次のハエへ素早く移ろう' },
};

const FLOW_TEXT = {
  normal: { name: '', desc: '' },
  strong: { name: '（がまんの限界）', desc: 'がまんの限界！勢いが強い。' },
  short: { name: '（ちょびっと）', desc: '量が少ない。' },
};

function weighted<T extends string>(rng: Rng, w: Record<T, number>): T {
  const keys = Object.keys(w) as T[];
  let r = rng() * keys.reduce((a, k) => a + w[k], 0);
  for (const k of keys) {
    r -= w[k];
    if (r <= 0) return k;
  }
  return keys[keys.length - 1];
}

/**
 * 9ステージ目からの中身を、的・ハエ・勢い・手ぶれの組み合わせで作る。
 * variant を変えると別の組み合わせになる（作ったステージが難しすぎたときの作り直し用）。
 */
export function generateTemplate(n: number, variant = 0): StageTemplate {
  const L = n - STAGES.length; // 1, 2, 3, ...
  const rng = makeRng(stageSeed(n) * 31 + variant * 977);
  const between = (a: number, b: number) => a + (b - a) * rng();
  const k = Math.min(1, L / 25); // 難しさ 0 → 1
  const r = 1 - 0.3 * k; // 的の大きさの倍率

  const flowKind = weighted(rng, { normal: 2, strong: 1, short: 1 });
  const flow: Partial<FlowParams> =
    flowKind === 'strong' ? { vMax: 3.8, qMax: 30, volumeMl: Math.round(between(270, 320)) }
      : flowKind === 'short' ? { volumeMl: Math.round(between(215, 240)) }
        : { volumeMl: Math.round(between(240, 290)) };

  const kind = weighted<Kind>(rng, { sticker: 1, slide: 1.2, cake: flowKind === 'strong' ? 1.5 : 0.6, fly: 1 + k, walk: 1 + k, flies: 0.5 + 2 * k });
  const back = () => ({ u: between(-0.1, 0.1), v: between(0.48, 0.68) });
  const flyBack = () => ({ surface: 'back' as const, u: between(...FLY_AREA.back.u) * 0.8, v: between(0.48, 0.64) });
  const flyBasin = () => ({ surface: 'basin' as const, u: between(-0.08, 0.08), v: between(U.zBack + 0.06, U.zBack + 0.11) });
  const flee = (a: number, b: number) => a + (b - a) * k;
  const targets: TargetDef[] = [];
  switch (kind) {
    case 'sticker':
      targets.push({ kind: 'sticker', surface: 'back', ...back(), radius: 0.042 * r });
      break;
    case 'slide':
      targets.push({ kind: 'sticker', surface: 'back', u: 0, v: between(0.5, 0.62), radius: 0.044 * r, slide: { amp: between(0.05, 0.09), period: between(4, 2.6 + 1.4 * (1 - k)) } });
      break;
    case 'cake':
      targets.push({ kind: 'cake', surface: 'basin', u: between(-0.07, 0.07), v: U.zBack + between(0.05, 0.08), radius: 0.04 * r });
      break;
    case 'fly':
      targets.push({ kind: 'fly', ...(rng() < 0.6 ? flyBack() : flyBasin()), radius: 0.03 * r, fly: { behavior: 'stay', fleeAfter: flee(1.6, 0.9), flight: [0.5, 0.9] } });
      break;
    case 'walk':
      targets.push({ kind: 'fly', ...(rng() < 0.5 ? flyBack() : flyBasin()), radius: 0.032 * r, fly: { behavior: 'walk', speed: flee(0.03, 0.055), fleeAfter: flee(2.2, 1.2), flight: [0.5, 0.9] } });
      break;
    case 'flies': {
      const count = rng() < 0.3 + 0.4 * k ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const walk = rng() < 0.3 + 0.5 * k;
        targets.push({ kind: 'fly', ...(rng() < 0.6 ? flyBack() : flyBasin()), radius: 0.03 * r,
          fly: { behavior: walk ? 'walk' : 'stay', speed: walk ? flee(0.03, 0.05) : undefined, fleeAfter: flee(1.1, 0.8), flight: [1.2, 2.2] } });
      }
      break;
    }
  }
  const wobble = 1 + 1.1 * k + between(0, 0.2);
  const t = KIND_TEXT[kind], f = FLOW_TEXT[flowKind];
  const shaky = wobble > 1.6 ? '手もふるえる…' : '';
  return {
    id: n,
    name: `${t.name}${f.name}`,
    desc: `${f.desc}${shaky}${t.desc}`,
    tip: t.tip,
    flow,
    wobble,
    targets,
  };
}

export function templateFor(n: number, variant = 0): StageTemplate {
  return n <= STAGES.length ? STAGES[n - 1] : generateTemplate(n, variant);
}

/** 狙いを固定したまま、いちばん長く当てられる時間（的の方向ごとに、上下の角度を粗く調べる） */
export function fixedBest(t: StageTemplate, seed: number): number {
  const yaws = [...new Set(t.targets.map((d) => {
    const p = targetPoint(d.surface, d.u, d.v);
    return Math.round(Math.atan2(p.x, -p.z) * 20) / 20;
  }))];
  let best = 0;
  for (const yaw of yaws) for (let pitch = -0.7; pitch <= 0.8; pitch += 0.1) best = Math.max(best, simulate(t, 'fixed', seed, { yaw, pitch }).hitTime);
  return best;
}

/**
 * 目標の秒数を計算する。人に近いプレイヤーが3回遊んで、いちばん少なかった当てた時間に割合を掛ける。
 * ただし、狙いを固定したままクリアできないよう、固定でいちばん当たる時間より GOAL.overFixed 以上長くする。
 */
export function computeGoal(t: StageTemplate, n: number): { goal: number; botHit: number } {
  const seed = stageSeed(n);
  const botHit = Math.min(...[0, 1, 2].map((i) => simulate(t, 'human', seed + i).hitTime));
  const step = (x: number) => Math.round(x / GOAL.step) * GOAL.step;
  const byRatio = Math.floor((botHit * goalRatio(n)) / GOAL.step) * GOAL.step;
  const byFixed = step(Math.ceil((fixedBest(t, seed) + GOAL.overFixed) / GOAL.step) * GOAL.step);
  return { goal: Math.max(GOAL.min, byRatio, byFixed), botHit };
}

const cache = new Map<number, StageDef>();

/** n ステージ目（1から）。目標の秒数まで決めたもの */
export function getStage(n: number): StageDef {
  const hit = cache.get(n);
  if (hit) return hit;
  let best: StageDef | null = null;
  for (let variant = 0; variant < 6; variant++) {
    const t = templateFor(n, variant);
    const { goal, botHit } = computeGoal(t, n);
    best = { ...t, goalSec: goal };
    // 人に近いプレイヤーでも目標に届かない組み合わせは作り直す（手で作ったステージはそのまま）
    if (n <= STAGES.length || botHit >= goal + 1) break;
  }
  cache.set(n, best!);
  return best!;
}
