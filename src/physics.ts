import { GEOM, PHYS, urinalEllipse, urinalHalfWidth, urinalRoundZ, urinalSideTop, type Surface } from './config';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 狙いの角度（yaw: 右が正、pitch: 上が正）から向きの単位ベクトル */
export function aimDir(yaw: number, pitch: number): Vec3 {
  const c = Math.cos(pitch);
  return { x: Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
}

export type HitRegion = 'bowl' | 'spill';
export type HitSurface = Surface | 'side' | 'frontInner' | 'urinalFront' | 'urinalSide' | 'wall' | 'floor';

export interface Hit {
  t: number; // 線分上の位置 0..1
  region: HitRegion;
  surface: HitSurface;
  point: Vec3;
  normal: Vec3;
}

interface PlaneCollider {
  axis: 'x' | 'y' | 'z';
  value: number;
  /** 法線の向き（+1 / -1）。法線の側から入ってきた線分だけ当たる */
  sign: 1 | -1;
  region: HitRegion;
  surface: HitSurface;
  within: (p: Vec3) => boolean;
}

const U = GEOM.urinal;
const EPS = 1e-4;

const ZR = urinalRoundZ();

function buildColliders(): PlaneCollider[] {
  // 左右のまっすぐな壁は、手前の丸い部分が始まるところまで
  const insideZ = (p: Vec3) => p.z >= U.zBack - EPS && p.z <= ZR + EPS;
  const outerZ = (p: Vec3) => p.z >= U.zBack - 0.04 && p.z <= ZR + EPS;
  const list: PlaneCollider[] = [
    // 便器の内側
    { axis: 'z', value: U.zBack, sign: 1, region: 'bowl', surface: 'back',
      within: (p) => Math.abs(p.x) <= U.hwInner && p.y >= U.yBasin && p.y <= U.yBackTop },
    { axis: 'y', value: U.yBasin, sign: 1, region: 'bowl', surface: 'basin',
      within: (p) => p.z >= U.zBack - EPS && Math.abs(p.x) <= urinalHalfWidth(p.z) + EPS },
    { axis: 'x', value: U.hwInner, sign: -1, region: 'bowl', surface: 'side',
      within: (p) => insideZ(p) && p.y >= U.yBasin && p.y <= urinalSideTop(p.z) },
    { axis: 'x', value: -U.hwInner, sign: 1, region: 'bowl', surface: 'side',
      within: (p) => insideZ(p) && p.y >= U.yBasin && p.y <= urinalSideTop(p.z) },
    // 便器の外側（こぼれ）
    { axis: 'x', value: U.hwOuter, sign: 1, region: 'spill', surface: 'urinalSide',
      within: (p) => outerZ(p) && p.y >= U.yBottomOuter && p.y <= urinalSideTop(p.z) },
    { axis: 'x', value: -U.hwOuter, sign: -1, region: 'spill', surface: 'urinalSide',
      within: (p) => outerZ(p) && p.y >= U.yBottomOuter && p.y <= urinalSideTop(p.z) },
    // 便器の上の壁（便器の奥の面より上）、便器の横の壁
    { axis: 'z', value: GEOM.zWall, sign: 1, region: 'spill', surface: 'wall', within: () => true },
    { axis: 'y', value: 0, sign: 1, region: 'spill', surface: 'floor', within: () => true },
  ];
  return list;
}

const COLLIDERS = buildColliders();

/** 手前の丸い壁（上から見て半分の楕円）。inner は内から外へ、outer は外から内へ抜けたときに当たる */
interface CurveCollider {
  side: 'inner' | 'outer';
  region: HitRegion;
  surface: HitSurface;
  yMin: number;
}
const CURVES: CurveCollider[] = [
  { side: 'inner', region: 'bowl', surface: 'frontInner', yMin: U.yBasin },
  { side: 'outer', region: 'spill', surface: 'urinalFront', yMin: U.yBottomOuter },
];

function collideCurve(c: CurveCollider, a: Vec3, b: Vec3): Hit | null {
  const e = urinalEllipse(c.side);
  const ia = 1 / (e.a * e.a), ib = 1 / (e.b * e.b);
  const x0 = a.x, z0 = a.z - e.zc, dx = b.x - a.x, dz = b.z - a.z;
  // F(t) = x²/a² + z²/b² - 1。内側から外へ出るのは大きい方の解、外から入るのは小さい方の解
  const qa = dx * dx * ia + dz * dz * ib;
  if (qa < 1e-14) return null;
  const qb = 2 * (x0 * dx * ia + z0 * dz * ib);
  const qc = x0 * x0 * ia + z0 * z0 * ib - 1;
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t = c.side === 'inner' ? (-qb + sq) / (2 * qa) : (-qb - sq) / (2 * qa);
  if (t < 0 || t > 1) return null;
  const point = { x: a.x + dx * t, y: a.y + (b.y - a.y) * t, z: a.z + dz * t };
  if (point.z < e.zc || point.y < c.yMin || point.y > urinalSideTop(point.z)) return null;
  const nx = point.x * ia, nz = (point.z - e.zc) * ib;
  const len = Math.hypot(nx, nz) || 1;
  const s = c.side === 'inner' ? -1 : 1; // 内側の壁の法線は便器の内向き
  return { t, region: c.region, surface: c.surface, point, normal: { x: (s * nx) / len, y: 0, z: (s * nz) / len } };
}

/** 線分 a→b が最初にぶつかる面。ぶつからなければ null */
export function collide(a: Vec3, b: Vec3): Hit | null {
  let best: Hit | null = null;
  for (const c of COLLIDERS) {
    const av = a[c.axis] - c.value;
    const bv = b[c.axis] - c.value;
    // 法線側（sign の側）から反対側へ抜けたときだけ
    if (av * c.sign < 0 || bv * c.sign > 0) continue;
    const denom = av - bv;
    if (Math.abs(denom) < 1e-12) continue;
    const t = av / denom;
    if (t < 0 || t > 1) continue;
    if (best && t >= best.t) continue;
    const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    point[c.axis] = c.value;
    if (!c.within(point)) continue;
    const normal = { x: 0, y: 0, z: 0 };
    normal[c.axis] = c.sign;
    best = { t, region: c.region, surface: c.surface, point, normal };
  }
  for (const c of CURVES) {
    const h = collideCurve(c, a, b);
    if (h && (!best || h.t < best.t)) best = h;
  }
  return best;
}

/**
 * 速さ v で出口から撃ったとき、点 target に届く低い方の仰角（pitch）。
 * 届かないときは、いちばん遠くへ飛ぶ角度を返す。
 */
export function solvePitch(v: number, target: Vec3, origin: Vec3 = GEOM.origin): { pitch: number; yaw: number; reachable: boolean } {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const d = Math.hypot(dx, dz);
  const h = target.y - origin.y;
  const yaw = Math.atan2(dx, -dz);
  const g = PHYS.g;
  const v2 = v * v;
  const disc = v2 * v2 - g * (g * d * d + 2 * h * v2);
  if (disc < 0 || v <= 0) return { pitch: Math.PI / 4, yaw, reachable: false };
  const pitch = Math.atan((v2 - Math.sqrt(disc)) / (g * d));
  return { pitch, yaw, reachable: true };
}

/** 的の中心の3D座標 */
export function targetPoint(surface: Surface, u: number, v: number): Vec3 {
  return surface === 'back' ? { x: u, y: v, z: U.zBack } : { x: u, y: U.yBasin, z: v };
}

/** 当たった点の、的の面での2D座標。違う面なら null */
export function surfaceCoord(surface: Surface, hit: Hit): [number, number] | null {
  if (hit.surface !== surface) return null;
  return surface === 'back' ? [hit.point.x, hit.point.y] : [hit.point.x, hit.point.z];
}
