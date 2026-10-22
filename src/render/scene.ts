import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GEOM, urinalEllipse, urinalRoundZ, urinalSideTop } from '../config';

const U = GEOM.urinal;

let gradientMap: THREE.DataTexture | null = null;
/** アニメ調の3段階の陰影 */
export function toon(color: THREE.ColorRepresentation, extra: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  if (!gradientMap) {
    const d = new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
    gradientMap = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
    gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ color, gradientMap, ...extra });
}

export function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 正方形のタイル。1枚の画像にタイル n×n 枚 */
function tileTex(n: number, tile: string, grout: string, accent?: string): THREE.CanvasTexture {
  const S = 512;
  return canvasTex(S, S, (c) => {
    c.fillStyle = grout;
    c.fillRect(0, 0, S, S);
    const s = S / n, gap = Math.max(3, s * 0.06);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        c.fillStyle = accent && (i + j) % 2 === 1 ? accent : tile;
        const x = i * s + gap / 2, y = j * s + gap / 2;
        c.beginPath();
        c.roundRect(x, y, s - gap, s - gap, s * 0.08);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.fillRect(x + s * 0.1, y + s * 0.1, s * 0.25, s * 0.05);
      }
  });
}

export function stickerTex(): THREE.CanvasTexture {
  const S = 256;
  return canvasTex(S, S, (c) => {
    const r = S / 2;
    const rings = ['#ff4d5e', '#ffffff', '#ff4d5e', '#ffffff', '#ff4d5e'];
    rings.forEach((col, i) => {
      c.fillStyle = col;
      c.beginPath();
      c.arc(r, r, r * (1 - i * 0.19), 0, Math.PI * 2);
      c.fill();
    });
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(r, r, r - 2, 0, Math.PI * 2);
    c.stroke();
  });
}

/** シャツ（お腹の楕円体に貼る）。真上から見えるので無地にし、すその帯とズボンだけ描く */
function shirtTex(): THREE.CanvasTexture {
  const W = 512, H = 256;
  return canvasTex(W, H, (c) => {
    c.fillStyle = '#4aa3ff';
    c.fillRect(0, 0, W, H);
    // すその帯（赤道より少し下）
    c.fillStyle = '#ffffff';
    c.fillRect(0, H * 0.5, W, H * 0.06);
    // ベルトとズボン
    c.fillStyle = '#6b3f22';
    c.fillRect(0, H * 0.6, W, H * 0.08);
    c.fillStyle = '#3b5f95';
    c.fillRect(0, H * 0.68, W, H);
  });
}

export interface SceneParts {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** 水を流すボタン（押す演出に使う） */
  flushButton: THREE.Object3D;
}

export function buildScene(): SceneParts {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cfeef0');
  const cam = GEOM.camera;
  const camera = new THREE.PerspectiveCamera(cam.fov, 9 / 16, 0.03, 20);
  camera.position.set(...cam.pos);
  camera.lookAt(new THREE.Vector3(...cam.lookAt));

  scene.add(new THREE.HemisphereLight('#ffffff', '#9aa7b0', 1.4));
  const sun = new THREE.DirectionalLight('#ffffff', 1.8);
  sun.position.set(0.6, 2.2, 1.2);
  scene.add(sun);

  // 壁と床
  const wallT = tileTex(4, '#bfe8e3', '#e9f7f5');
  wallT.wrapS = wallT.wrapT = THREE.RepeatWrapping;
  wallT.repeat.set(10, 7.5); // タイル1枚 = 10cm
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), toon('#ffffff', { map: wallT }));
  wall.position.set(0, 1.5, GEOM.zWall - 0.04);
  scene.add(wall);

  const floorT = tileTex(2, '#9fb5c7', '#7d93a6', '#b6c8d6');
  floorT.wrapS = floorT.wrapT = THREE.RepeatWrapping;
  floorT.repeat.set(10, 10); // 1枚 = 20cm
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), toon('#ffffff', { map: floorT }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0.5);
  scene.add(floor);

  // 両どなりの仕切り板
  const partMat = toon('#ffb86b');
  for (const sx of [-1, 1]) {
    const part = new THREE.Mesh(new RoundedBoxGeometry(0.03, 1.0, 0.45, 3, 0.012), partMat);
    part.position.set(sx * 0.42, 1.0, GEOM.zWall + 0.22);
    scene.add(part);
  }

  const urinal = buildUrinal();
  scene.add(urinal.group);

  // 視点の下のお腹（尿の出口を隠す）
  const b = GEOM.belly;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), toon('#ffffff', { map: shirtTex() }));
  belly.scale.set(...b.radius);
  belly.position.set(...b.center);
  scene.add(belly);

  return { scene, camera, flushButton: urinal.button };
}

/** 上から見た便器の形に沿った点の列（左の奥 → 手前の丸み → 右の奥）。a, b は楕円の半径 */
export function urinalPath(a: number, b: number, zEnd: number, nStraight = 8, nCurve = 40): THREE.Vector2[] {
  const zc = urinalRoundZ();
  const pts: THREE.Vector2[] = []; // (x, z)
  for (let i = 0; i < nStraight; i++) pts.push(new THREE.Vector2(-a, zEnd + ((zc - zEnd) * i) / nStraight));
  for (let i = 0; i <= nCurve; i++) {
    const th = Math.PI - (Math.PI * i) / nCurve;
    pts.push(new THREE.Vector2(a * Math.cos(th), zc + b * Math.sin(th)));
  }
  for (let i = nStraight - 1; i >= 0; i--) pts.push(new THREE.Vector2(a, zEnd + ((zc - zEnd) * i) / nStraight));
  return pts;
}

/** 点の列に沿って立てた壁。上の高さは z ごとに top(z) */
function wallStrip(pts: THREE.Vector2[], yBottom: number, top: (z: number) => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  pts.forEach((p, i) => {
    pos.push(p.x, yBottom, p.y, p.x, top(p.y), p.y);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 内側と外側の点の列のあいだを、上のふちでふさぐ */
function topStrip(inner: THREE.Vector2[], outer: THREE.Vector2[], top: (z: number) => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  inner.forEach((p, i) => {
    const o = outer[i];
    pos.push(p.x, top(p.y), p.y, o.x, top(o.y), o.y);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 上から見た形（x, z）を、ExtrudeGeometry 用の形にする（形の y = -z） */
function planShape(pts: THREE.Vector2[]): THREE.Shape {
  const sh = new THREE.Shape();
  pts.forEach((p, i) => (i === 0 ? sh.moveTo(p.x, -p.y) : sh.lineTo(p.x, -p.y)));
  sh.closePath();
  return sh;
}

function buildUrinal(): { group: THREE.Group; button: THREE.Object3D } {
  const g = new THREE.Group();
  const white = toon('#f7fbff');
  const inner = toon('#e8f1f7');
  const ei = urinalEllipse('inner');
  const eo = urinalEllipse('outer');
  const zBackOuter = U.zBack - 0.02;

  // 奥の板（内側の面が zBack）。下は丸い胴に隠れる
  const backBottom = U.yBasin - 0.02;
  const backH = U.yBackTop + 0.03 - backBottom;
  const backD = U.zBack - (GEOM.zWall - 0.01);
  const back = new THREE.Mesh(new RoundedBoxGeometry(U.hwOuter * 2, backH, backD, 4, 0.012), inner);
  back.position.set(0, backBottom + backH / 2, (U.zBack + GEOM.zWall - 0.01) / 2);
  g.add(back);

  // 下の胴: 上から見た形を押し出し、角を大きく丸める
  const bev = 0.04;
  const bodyPts = urinalPath(eo.a - bev, eo.b - bev, GEOM.zWall + bev, 8, 48);
  const bodyH = U.yBasin - 0.003 - U.yBottomOuter; // 上面は受け皿の底より少し下（重なってちらつかないように）
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(planShape(bodyPts), { depth: Math.max(0.001, bodyH - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 6, curveSegments: 12 }),
    white,
  );
  body.rotation.x = -Math.PI / 2; // 形の (x, y) → 世界の (x, -z)、押し出し → 世界の +y
  body.position.y = U.yBottomOuter + bev;
  g.add(body);

  // 壁: 内側・外側・上のふち。高さは側面のふちの形（手前が低く、奥ほど高い）
  const innerPts = urinalPath(ei.a, ei.b, U.zBack);
  const outerPts = urinalPath(eo.a, eo.b, zBackOuter);
  const top = (z: number) => urinalSideTop(Math.max(z, U.zBack));
  // 点の列は上から見て左回りなので、壁の表は便器の内向きになる。外側の壁は裏面を表として描く
  g.add(new THREE.Mesh(wallStrip(innerPts, U.yBasin - 0.01, top), toon('#eef5fa')));
  g.add(new THREE.Mesh(wallStrip(outerPts, U.yBasin - bev - 0.01, top), toon('#f7fbff', { side: THREE.BackSide })));
  g.add(new THREE.Mesh(topStrip(innerPts, outerPts, top), white));

  // ふちの丸み（壁の上に丸い棒をのせる）
  const rimR = 0.016;
  const midPts = urinalPath((ei.a + eo.a) / 2, (ei.b + eo.b) / 2, U.zBack - 0.01, 10, 48);
  const curve = new THREE.CatmullRomCurve3(midPts.map((p) => new THREE.Vector3(p.x, top(p.y), p.y)));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, rimR, 12, false), white));
  const rimBack = new THREE.Mesh(new THREE.CapsuleGeometry(rimR * 1.2, U.hwOuter * 2 - rimR, 6, 16), white);
  rimBack.rotation.z = Math.PI / 2;
  rimBack.position.set(0, U.yBackTop + 0.02, U.zBack - 0.012);
  g.add(rimBack);

  // 受け皿の底
  const floorPts = urinalPath(ei.a, ei.b, U.zBack - 0.005, 8, 48);
  const basin = new THREE.Mesh(new THREE.ShapeGeometry(planShape(floorPts)), inner);
  basin.rotation.x = -Math.PI / 2;
  basin.position.y = U.yBasin;
  g.add(basin);
  const basinD = U.zFrontInner - U.zBack;

  // 排水口
  const drainZ = U.zBack + basinD * 0.3;
  const drain = new THREE.Mesh(new THREE.CircleGeometry(0.035, 32), toon('#9aa4ad'));
  drain.rotation.x = -Math.PI / 2;
  drain.position.set(0, U.yBasin + 0.001, drainZ);
  g.add(drain);
  const holeMat = toon('#59626b');
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const h = new THREE.Mesh(new THREE.CircleGeometry(0.005, 12), holeMat);
    h.rotation.x = -Math.PI / 2;
    const r = i === 0 ? 0 : 0.02;
    h.position.set(Math.cos(a) * r, U.yBasin + 0.002, drainZ + Math.sin(a) * r);
    g.add(h);
  }

  // 水を流す管
  const chrome = toon('#c9d3db');
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 20), chrome);
  pipe.position.set(0, U.yBackTop + 0.25, GEOM.zWall + 0.03);
  g.add(pipe);
  const valve = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.09, 0.06, 3, 0.012), chrome);
  valve.position.set(0, U.yBackTop + 0.32, GEOM.zWall + 0.04);
  g.add(valve);
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 20), toon('#ff8a3d'));
  button.rotation.x = Math.PI / 2;
  button.position.set(0, U.yBackTop + 0.32, GEOM.zWall + 0.075);
  g.add(button);
  return { group: g, button };
}
