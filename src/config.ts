// 調整値をまとめる。長さはメートル、時間は秒、量はミリリットル。
// 座標: x = 右、y = 上、z = 手前（便器のある壁は -z 側）。

export const GEOM = {
  /** 尿の出口。カメラのほぼ真下で、画面の下の外にある（お腹の陰にもなる） */
  origin: { x: 0, y: 0.82, z: 0 },
  camera: { pos: [0, 1.5, 0.05] as const, lookAt: [0, 0.781, -0.645] as const, fov: 74 },
  /** 視点の下に映るお腹（楕円体）。尿の出口を隠す役目もある */
  belly: { center: [0, 1.02, 0.07] as const, radius: [0.16, 0.11, 0.12] as const },
  zWall: -0.48,
  urinal: {
    hwInner: 0.18, // 内側の半分の幅
    hwOuter: 0.21, // 外側の半分の幅
    zBack: -0.44, // 奥の面（内側）
    zFrontInner: -0.17,
    zFrontOuter: -0.14,
    yBasin: 0.42, // 受け皿の底
    yLip: 0.62, // 手前のふちの高さ
    yBackTop: 1.12, // 奥の面のてっぺん
    yBottomOuter: 0.3,
    /** 上から見たとき、手前が丸くなっている部分の奥行き（内側）。手前は半分の楕円になる */
    frontRound: 0.14,
  },
};

/** 手前の丸い部分が始まる z（ここより手前が半分の楕円） */
export function urinalRoundZ(): number {
  const u = GEOM.urinal;
  return u.zFrontInner - u.frontRound;
}

/** 上から見た便器の形（楕円の半径）。inner = 内側の面、outer = 外側の面 */
export function urinalEllipse(side: 'inner' | 'outer'): { a: number; b: number; zc: number } {
  const u = GEOM.urinal;
  const zc = urinalRoundZ();
  return side === 'inner' ? { a: u.hwInner, b: u.zFrontInner - zc, zc } : { a: u.hwOuter, b: u.zFrontOuter - zc, zc };
}

/** 奥行き z での、便器の半分の幅（上から見た形） */
export function urinalHalfWidth(z: number, side: 'inner' | 'outer' = 'inner'): number {
  const e = urinalEllipse(side);
  if (z <= e.zc) return e.a;
  const k = (z - e.zc) / e.b;
  return k >= 1 ? 0 : e.a * Math.sqrt(1 - k * k);
}

/** 便器の側面のふちの高さ（奥ほど高い）。見た目と当たり判定の両方でこの形を使う */
export function urinalSideTop(z: number): number {
  const u = GEOM.urinal;
  const t = Math.min(1, Math.max(0, (z - u.zFrontOuter) / (u.zBack - u.zFrontOuter))); // 0 = 手前, 1 = 奥
  return u.yLip + (u.yBackTop - u.yLip) * t * t;
}

export const PHYS = {
  g: 9.8,
  emitRate: 240, // 1秒に出す粒の数
  maxLife: 1.6,
  /** 水流の太さ（半径）。勢いが弱いほど細くなる */
  radiusMax: 0.0065,
  radiusMin: 0.0028,
};

/**
 * 膀胱と勢いのモデル。
 * 出口の速さ v は「残っている量の平方根」に比例する（v = vMax * sqrt(残量/最初の量)）。
 * 流量 Q も v に比例するので、v は時間に対してほぼまっすぐ下がっていく。
 * 出始めは少し弱く、最後は途切れ途切れ（ポタポタ）になる。ポタポタは最後の数滴（dribbleMl）だけ。
 */
export interface FlowParams {
  volumeMl: number;
  qMax: number; // いちばん勢いがあるときの流量（ml/秒）
  vMax: number; // いちばん勢いがあるときの出口の速さ（m/秒）
  rampTime: number; // 出始めの立ち上がり時間
  rampStart: number; // 出始めの勢いの割合
  dribbleAt: number; // 勢いがこの割合を下回ったら、途切れ途切れになる
  dribbleQ: number; // 途切れ途切れのときの流量（出ている間だけ）
  dribbleMl: number; // 途切れ途切れになってから出る量（最後の数滴）
  pulseOn: [number, number];
  pulseOff: [number, number];
}

export const FLOW_DEFAULT: FlowParams = {
  volumeMl: 260, // 本流は約16秒、全体で約17秒
  qMax: 25,
  vMax: 3.2,
  rampTime: 0.55,
  rampStart: 0.5,
  dribbleAt: 0.25,
  dribbleQ: 8,
  dribbleMl: 2.5,
  pulseOn: [0.1, 0.18],
  pulseOff: [0.1, 0.22],
};

export const AIM = {
  /** 画面の高さ分ドラッグしたときの上下の角度（ラジアン） */
  pitchPerScreen: 1.0,
  /** 画面の幅分ドラッグしたときの左右の角度 */
  yawPerScreen: 0.55,
  pitchMin: -0.7,
  pitchMax: 1.1,
  yawMax: 0.8,
  startPitch: 0.0,
  /** 自然な手ぶれ（ラジアン）。終わりぎわは大きくなる */
  wobble: 0.006,
  wobbleEnd: 0.02,
};

/**
 * テストと測定で使う「人に近いプレイヤー」の、狙いを動かせる速さの上限（ラジアン/秒）。
 * 各ステージの目標の秒数は、この速さで 0.3秒遅れて追いかけてもクリアできるように決めてある。
 */
export const HUMAN_SIM = { yawRate: 0.65, pitchRate: 0.5 };

/** 放尿が終わったあとに水を流す演出（秒） */
export const FLUSH = {
  delay: 0.5, // 出し終わってから、ボタンを押すまで
  duration: 2.6, // ボタンを押してから、水が引くまで
  waterAt: 0.15, // ボタンを押してから、奥の面に水が出るまで
  fallTime: 0.45, // 奥の面を上から下まで流れ落ちる時間
  fliesAt: 0.2, // ハエが飛んでいくまで
  resultAfter: 0.2, // 水が引いてから結果を出すまで
};

/** 得点（仮の値。遊びながら調整する） */
export const SCORE = {
  /** 的に当たってからこの時間は「当て続けている」とみなす */
  hitGrace: 0.08,
  /** 的に当てた1秒あたりの得点。クリアしたあとも当てた分だけ増える */
  perSec: 100,
  /** クリアしたときの得点 */
  clearBonus: 200,
  /** こぼした1mlあたりの減点（最後のポタポタは数えない）。ステージの得点は0より下がらない */
  spillPerMl: 10,
};

/** 何回クリアに失敗したら終わりか */
export const LIVES = 3;

/** 称号。クリアしたステージの数で決まる（仮のしきい値。遊びながら調整する） */
export const TITLES: { cleared: number; name: string }[] = [
  { cleared: 0, name: 'はじめてのトイレ' },
  { cleared: 6, name: 'トイレ初心者' },
  { cleared: 11, name: 'トイレ中級' },
  { cleared: 16, name: 'トイレのベテラン' },
  { cleared: 21, name: 'トイレのスナイパー' },
  { cleared: 31, name: 'トイレの上級スナイパー' },
  { cleared: 41, name: 'トイレの天才スナイパー' },
  { cleared: 51, name: 'トイレの神スナイパー' },
  { cleared: 100, name: 'トイレの神様' },
];

/**
 * 目標の秒数の決め方（仮の値）。
 * 「人に近いプレイヤー」（HUMAN_SIM）がそのステージで当てられる時間に、この割合を掛ける。
 * ステージが進むほど割合が上がり、上手な人でもいつかは失敗する。
 */
export const GOAL = {
  ratioStart: 0.55,
  ratioMax: 0.92,
  /** 割合が ratioMax に近づく速さ（ステージ数） */
  ratioScale: 18,
  /** 目標の秒数の刻み */
  step: 0.5,
  min: 2,
  /** 狙いを固定したままいちばん長く当てられる時間より、目標をこの秒数以上長くする */
  overFixed: 0.8,
};

export type Surface = 'back' | 'basin';
export type TargetKind = 'sticker' | 'cake' | 'fly';

export interface FlyDef {
  /** stay: じっとしている、walk: 歩き回る */
  behavior: 'stay' | 'walk';
  /** 歩く速さ（m/秒） */
  speed?: number;
  /** 続けてこの秒数当てられると逃げる */
  fleeAfter: number;
  /** 逃げるときに飛んでいる時間 [最短, 最長]。飛んでいる間は当たらない */
  flight: [number, number];
}

export interface TargetDef {
  kind: TargetKind;
  surface: Surface;
  /** back: (x, y)、basin: (x, z) */
  u: number;
  v: number;
  radius: number;
  /** シールが左右に動く */
  slide?: { amp: number; period: number };
  fly?: FlyDef;
}

/** ステージの中身。目標の秒数は、遊ぶときに計算で決める（src/stages.ts） */
export interface StageTemplate {
  id: number;
  name: string;
  desc: string;
  /** 開始画面に出す一言のコツ */
  tip: string;
  flow?: Partial<FlowParams>;
  /** 手ぶれの倍率 */
  wobble?: number;
  targets: TargetDef[];
}

export interface StageDef extends StageTemplate {
  /** 的に合計この秒数当てたらクリア */
  goalSec: number;
}

/** ハエが止まれる範囲 */
export const FLY_AREA = {
  back: { u: [-0.14, 0.14] as [number, number], v: [0.47, 0.7] as [number, number] },
  basin: { u: [-0.14, 0.14] as [number, number], v: [GEOM.urinal.zBack + 0.04, GEOM.urinal.zFrontInner - 0.08] as [number, number] },
};

const U0 = GEOM.urinal;

/** はじめの8ステージは手で作ってある。9ステージ目からは組み合わせで作る（src/stages.ts） */
export const STAGES: StageTemplate[] = [
  {
    id: 1,
    name: 'まんなかの的',
    desc: '便器の奥の的に当てろ！',
    tip: '勢いが落ちたら、狙いを上げて追いかけよう',
    targets: [{ kind: 'sticker', surface: 'back', u: 0, v: 0.52, radius: 0.045 }],
  },
  {
    id: 2,
    name: 'ちいさな的',
    desc: '高いところの小さな的に当てろ！',
    tip: '高い的は、勢いがあるうちが勝負',
    targets: [{ kind: 'sticker', surface: 'back', u: 0.05, v: 0.62, radius: 0.03 }],
  },
  {
    id: 3,
    name: '消臭剤をねらえ',
    desc: 'がまんの限界！勢いが強すぎる。受け皿の消臭剤に当てろ！',
    tip: 'はじめは下向きに。弱くなったら少しずつ上げよう',
    flow: { vMax: 3.8, qMax: 30, volumeMl: 300 },
    targets: [{ kind: 'cake', surface: 'basin', u: -0.05, v: U0.zBack + 0.06, radius: 0.04 }],
  },
  {
    id: 4,
    name: 'うごく的',
    desc: '左右に動く的に当てろ！',
    tip: '左右の動きと、勢いの低下を同時に追いかけよう',
    targets: [{ kind: 'sticker', surface: 'back', u: 0, v: 0.53, radius: 0.045, slide: { amp: 0.07, period: 4 } }],
  },
  {
    id: 5,
    name: 'とまったハエ',
    desc: '便器にハエが！当て続けると逃げるぞ',
    tip: 'ハエが逃げたら、止まった場所をすぐ狙おう',
    targets: [{ kind: 'fly', surface: 'back', u: 0.04, v: 0.55, radius: 0.03, fly: { behavior: 'stay', fleeAfter: 1.6, flight: [0.5, 0.8] } }],
  },
  {
    id: 6,
    name: 'あるくハエ',
    desc: '歩き回るハエに当てろ！',
    tip: 'ハエの行く先を読んで狙おう',
    targets: [{ kind: 'fly', surface: 'basin', u: 0, v: U0.zBack + 0.1, radius: 0.033, fly: { behavior: 'walk', speed: 0.03, fleeAfter: 2.2, flight: [0.5, 0.8] } }],
  },
  {
    id: 7,
    name: 'ハエが3びき',
    desc: 'コーヒーを飲みすぎた…量が多い！3びきのハエをねらえ',
    tip: '当てたハエは飛んでいく。次のハエへ素早く移ろう',
    flow: { volumeMl: 300 },
    targets: [
      { kind: 'fly', surface: 'back', u: -0.09, v: 0.6, radius: 0.03, fly: { behavior: 'stay', fleeAfter: 0.9, flight: [1.4, 2.4] } },
      { kind: 'fly', surface: 'basin', u: 0.07, v: U0.zBack + 0.07, radius: 0.03, fly: { behavior: 'stay', fleeAfter: 0.9, flight: [1.4, 2.4] } },
      { kind: 'fly', surface: 'back', u: 0.1, v: 0.5, radius: 0.03, fly: { behavior: 'stay', fleeAfter: 0.9, flight: [1.4, 2.4] } },
    ],
  },
  {
    id: 8,
    name: 'ラストスナイプ',
    desc: '残りわずか、手もふるえる…歩く2ひきのハエをねらえ！',
    tip: '量が少ない。一瞬も無駄にするな',
    flow: { volumeMl: 230 },
    wobble: 2,
    targets: [
      { kind: 'fly', surface: 'back', u: -0.06, v: 0.58, radius: 0.028, fly: { behavior: 'walk', speed: 0.04, fleeAfter: 1.1, flight: [0.9, 1.6] } },
      { kind: 'fly', surface: 'basin', u: 0.06, v: U0.zBack + 0.1, radius: 0.028, fly: { behavior: 'walk', speed: 0.04, fleeAfter: 1.1, flight: [0.9, 1.6] } },
    ],
  },
];
