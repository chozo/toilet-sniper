import * as THREE from 'three';
import { FLUSH, GEOM, urinalEllipse } from '../config';
import { canvasTex, urinalPath } from './scene';

const U = GEOM.urinal;

/** 縦の水すじ（下へ流れる） */
function streakTex(): THREE.CanvasTexture {
  const W = 128, H = 256;
  const t = canvasTex(W, H, (c) => {
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 22; i++) {
      const x = (i / 22) * W + Math.sin(i * 7.3) * 3;
      const w = 2 + ((i * 5) % 4);
      for (let k = 0; k < 3; k++) {
        const y = ((i * 37 + k * 91) % H);
        const len = 40 + ((i * 13 + k * 29) % 70);
        const g = c.createLinearGradient(0, y, 0, y + len);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.95)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.fillRect(x, y, w, len);
        if (y + len > H) c.fillRect(x, y - H, w, len); // 上下をつなげる
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 排水口へ向かう渦 */
function swirlTex(): THREE.CanvasTexture {
  const S = 256;
  return canvasTex(S, S, (c) => {
    c.clearRect(0, 0, S, S);
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.fillRect(0, 0, S, S);
    c.translate(S / 2, S / 2);
    c.strokeStyle = 'rgba(255,255,255,0.95)';
    c.lineCap = 'round';
    for (let arm = 0; arm < 5; arm++) {
      c.lineWidth = 5;
      c.beginPath();
      for (let i = 0; i <= 60; i++) {
        const k = i / 60;
        const a = (arm / 5) * Math.PI * 2 + k * Math.PI * 2.2;
        const r = 8 + k * S * 0.44; // 端まで描くと、回したときに端の色が筋になって伸びる
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
  });
}

/** 水を流す演出: 奥の面を水が流れ落ち、受け皿で渦を巻いて排水口へ */
export class FlushView {
  readonly group = new THREE.Group();
  /** 流しはじめてからの時間。流していないときは -1 */
  t = -1;
  private back: THREE.Mesh;
  private backMat: THREE.MeshBasicMaterial;
  private basin: THREE.Mesh;
  private basinMat: THREE.MeshBasicMaterial;
  private streak: THREE.CanvasTexture;
  private swirl: THREE.CanvasTexture;
  private backH = U.yBackTop - U.yBasin;

  constructor() {
    this.streak = streakTex();
    this.backMat = new THREE.MeshBasicMaterial({ color: '#9fdcff', map: this.streak, transparent: true, opacity: 0, depthWrite: false });
    const geo = new THREE.PlaneGeometry(U.hwInner * 2 - 0.004, this.backH);
    geo.translate(0, -this.backH / 2, 0); // 上の辺を原点にして、上から伸ばす
    this.back = new THREE.Mesh(geo, this.backMat);
    this.back.position.set(0, U.yBackTop, U.zBack + 0.004);
    this.group.add(this.back);

    // 受け皿の水: 上から見た形に、0..1 の UV を付け直す
    const e = urinalEllipse('inner');
    const pts = urinalPath(e.a - 0.003, e.b - 0.003, U.zBack + 0.002, 8, 48);
    const shape = new THREE.Shape();
    pts.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, -p.y) : shape.lineTo(p.x, -p.y)));
    const bgeo = new THREE.ShapeGeometry(shape);
    bgeo.computeBoundingBox();
    const bb = bgeo.boundingBox!;
    const pos = bgeo.getAttribute('position');
    const uv = bgeo.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
    }
    this.swirl = swirlTex();
    this.swirl.repeat.set(0.6, 0.6); // 渦を大きめに見せる
    // 渦の中心を排水口に合わせる
    const drainZ = U.zBack + (U.zFrontInner - U.zBack) * 0.3;
    this.swirl.center.set((0 - bb.min.x) / (bb.max.x - bb.min.x), (-drainZ - bb.min.y) / (bb.max.y - bb.min.y));
    this.basinMat = new THREE.MeshBasicMaterial({ color: '#9fdcff', map: this.swirl, transparent: true, opacity: 0, depthWrite: false });
    this.basin = new THREE.Mesh(bgeo, this.basinMat);
    this.basin.rotation.x = -Math.PI / 2;
    this.basin.position.y = U.yBasin + 0.004;
    this.group.add(this.basin);
    this.group.visible = false;
  }

  start(): void {
    this.t = 0;
    this.group.visible = true;
  }

  stop(): void {
    this.t = -1;
    this.group.visible = false;
  }

  get running(): boolean {
    return this.t >= 0 && this.t < FLUSH.duration;
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const t = this.t;
    const F = FLUSH;
    // 奥の面: 上から下へ水が広がり、最後は薄くなって消える
    const reveal = smooth((t - F.waterAt) / F.fallTime);
    this.back.scale.y = Math.max(0.001, reveal);
    this.streak.repeat.set(2, 1.4 * Math.max(0.05, reveal));
    this.streak.offset.y += dt * 2.2;
    this.backMat.opacity = 0.8 * Math.min(reveal * 3, 1) * (1 - smooth((t - (F.duration - 0.7)) / 0.6));
    // 受け皿: 水がたまって渦を巻き、排水口へ吸い込まれる
    const fill = smooth((t - F.waterAt - F.fallTime * 0.6) / 0.35);
    const drain = smooth((t - (F.duration - 0.9)) / 0.8);
    this.basinMat.opacity = 0.85 * fill * (1 - drain);
    this.swirl.rotation += dt * (2 + drain * 5);
    if (t >= F.duration) this.stop();
  }
}

function smooth(x: number): number {
  const k = Math.max(0, Math.min(1, x));
  return k * k * (3 - 2 * k);
}
