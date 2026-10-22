import { LIVES, SCORE, TITLES } from './config';
import type { Result } from './session';

export interface StageScore {
  /** 的に当てた分（画面の秒数と同じ 0.1秒刻み） */
  hit: number;
  clear: number;
  /** こぼした分の減点（正の数） */
  spill: number;
  /** このステージの得点（0より下がらない） */
  total: number;
}

/** 1ステージの得点 */
export function stageScore(r: Result): StageScore {
  const hit = Math.floor(r.hitTime * 10 + 1e-6) * (SCORE.perSec / 10);
  const clear = r.cleared ? SCORE.clearBonus : 0;
  const spill = Math.round(r.spillMl) * SCORE.spillPerMl;
  return { hit, clear, spill, total: Math.max(0, hit + clear - spill) };
}

/** クリアしたステージの数に応じた称号 */
export function titleFor(cleared: number): string {
  let name = TITLES[0].name;
  for (const t of TITLES) if (cleared >= t.cleared) name = t.name;
  return name;
}

export interface StageOutcome {
  score: StageScore;
  gameOver: boolean;
}

/** 1回の通しプレイ。クリアすれば次のステージへ、失敗するとライフが減って同じステージをやり直す */
export class Run {
  stage: number;
  lives = LIVES;
  score = 0;
  cleared = 0;
  /** 当てた時間の合計 */
  hitTotal = 0;
  over = false;

  constructor(startStage = 1) {
    this.stage = startStage;
  }

  get title(): string {
    return titleFor(this.cleared);
  }

  record(r: Result): StageOutcome {
    const sc = stageScore(r);
    this.score += sc.total;
    this.hitTotal += Math.floor(r.hitTime * 10 + 1e-6) / 10; // 画面に出した秒数（0.1秒刻み）を足す
    if (r.cleared) {
      this.cleared++;
      this.stage++;
    } else {
      this.lives--;
      if (this.lives <= 0) this.over = true;
    }
    return { score: sc, gameOver: this.over };
  }

  /** 途中でやめる */
  quit(): void {
    this.over = true;
  }
}

export interface Best {
  score: number;
  cleared: number;
}

const BEST_KEY = 'toilet-sniper:best';

export function loadBest(): Best {
  try {
    const b = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
    return { score: Number(b.score) || 0, cleared: Number(b.cleared) || 0 };
  } catch {
    return { score: 0, cleared: 0 };
  }
}

/** 記録を保存する。得点の記録を更新したら true */
export function saveBest(run: Run): boolean {
  const b = loadBest();
  const better = run.score > b.score;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify({ score: Math.max(b.score, run.score), cleared: Math.max(b.cleared, run.cleared) }));
  } catch {
    /* 保存できなくても遊べる */
  }
  return better;
}
