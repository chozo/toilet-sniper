import * as THREE from 'three';
import type { Target } from '../targets';
import { canvasTex, stickerTex, toon } from './scene';

/** 的の見た目。シール・消臭剤・ハエ */
interface View {
  target: Target;
  root: THREE.Object3D;
  glow: THREE.Mesh;
  wings?: [THREE.Object3D, THREE.Object3D];
  /** 飛んでいるときの向きを決めるための、前の位置 */
  last: THREE.Vector3;
  flapPhase: number;
}

let stickerMat: THREE.Material | null = null;
let cakeTopMat: THREE.Material | null = null;

function cakeTex(): THREE.CanvasTexture {
  const S = 128;
  return canvasTex(S, S, (c) => {
    c.fillStyle = '#9adfff';
    c.fillRect(0, 0, S, S);
    c.fillStyle = '#5bb8e8';
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = i === 0 ? 0 : S * 0.28;
      c.beginPath();
      c.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, S * 0.07, 0, Math.PI * 2);
      c.fill();
    }
  });
}

function buildFly(): { root: THREE.Group; wings: [THREE.Object3D, THREE.Object3D] } {
  // 手元の座標: 上 = +Y（面の法線）、前 = +Z
  const root = new THREE.Group();
  const black = toon('#33333f');
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), black);
  body.scale.set(0.0085, 0.0068, 0.0125);
  body.position.set(0, 0.0065, -0.002);
  root.add(body);
  const stripe = toon('#5a5a6a');
  for (const z of [-0.006, -0.0105]) {
    const st = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 20), stripe);
    st.scale.setScalar(0.0079 - Math.abs(z) * 0.2);
    st.position.set(0, 0.0068, z);
    root.add(st);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 16, 12), black);
  head.position.set(0, 0.008, 0.0115);
  root.add(head);
  // 大きな目（白目と黒目）
  const white = toon('#ffffff');
  const pupil = new THREE.MeshBasicMaterial({ color: '#111111' });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0058, 16, 12), white);
    eye.position.set(sx * 0.0052, 0.0128, 0.0148);
    root.add(eye);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.0027, 12, 8), pupil);
    p.position.set(sx * 0.0048, 0.0142, 0.0196);
    root.add(p);
  }
  // 足（細い棒を左右3本ずつ）
  const legMat = new THREE.MeshBasicMaterial({ color: '#222228' });
  const legGeo = new THREE.CylinderGeometry(0.0007, 0.0007, 0.008, 4);
  for (const sx of [-1, 1])
    for (const z of [-0.005, 0.001, 0.007]) {
      // 体の横から外向きに、少し下へ広げる
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(sx * 0.0105, 0.0022, z);
      leg.rotation.set(0, sx * (z * 40), -sx * (Math.PI / 2 + 0.35));
      root.add(leg);
    }
  // 羽（付け根を回して羽ばたく）
  const wingMat = new THREE.MeshBasicMaterial({ color: '#d9f1ff', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const wingGeo = new THREE.CircleGeometry(1, 20);
  const wings: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.003, 0.0125, 0.002);
    const w = new THREE.Mesh(wingGeo, wingMat);
    w.scale.set(0.0062, 0.0125, 1);
    w.rotation.x = -Math.PI / 2; // 面に沿って寝かせる
    w.position.set(sx * 0.0055, 0, -0.0105);
    w.rotation.z = sx * 0.35;
    pivot.add(w);
    root.add(pivot);
    wings.push(pivot);
  }
  root.scale.setScalar(1.5);
  return { root, wings: wings as [THREE.Object3D, THREE.Object3D] };
}

export class TargetViews {
  readonly group = new THREE.Group();
  private views: View[] = [];
  private m = new THREE.Matrix4();
  private xa = new THREE.Vector3();
  private ya = new THREE.Vector3();
  private za = new THREE.Vector3();

  build(targets: Target[]): void {
    this.group.clear();
    this.views = [];
    stickerMat ??= toon('#ffffff', { map: stickerTex(), transparent: true });
    cakeTopMat ??= toon('#ffffff', { map: cakeTex() });
    for (const t of targets) {
      const r = t.def.radius;
      let root: THREE.Object3D;
      let wings: View['wings'];
      if (t.def.kind === 'sticker') {
        root = new THREE.Mesh(new THREE.CircleGeometry(r, 40), stickerMat);
        root.rotation.x = -Math.PI / 2; // 手元の +Y が面の法線になるように
        const g = new THREE.Group();
        g.add(root);
        root = g;
      } else if (t.def.kind === 'cake') {
        const g = new THREE.Group();
        const h = 0.014;
        const side = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, 32), toon('#79c9f2'));
        side.position.y = h / 2;
        g.add(side);
        const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 32), cakeTopMat);
        top.rotation.x = -Math.PI / 2;
        top.position.y = h + 0.0005;
        g.add(top);
        root = g;
      } else {
        const f = buildFly();
        root = f.root;
        wings = f.wings;
      }
      const glow = new THREE.Mesh(
        new THREE.RingGeometry(r * 1.05, r * 1.45, 40),
        new THREE.MeshBasicMaterial({ color: '#fff27a', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
      );
      glow.rotation.x = -Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(root, glow);
      glow.position.y = 0.0015;
      this.group.add(holder);
      this.views.push({ target: t, root: holder, glow, wings, last: new THREE.Vector3(t.pos.x, t.pos.y, t.pos.z), flapPhase: Math.random() * 10 });
    }
  }

  update(time: number, dt: number): void {
    for (const v of this.views) {
      const t = v.target;
      const p = new THREE.Vector3(t.pos.x, t.pos.y, t.pos.z);
      v.root.visible = t.mode !== 'gone';
      if (t.mode === 'gone') continue;
      const hitNow = t.active && t.cont > 0;
      if (t.active) {
        // 面の上: 上 = 法線、前 = 歩く向き
        const n = t.normal();
        this.ya.set(n.x, n.y, n.z);
        if (t.surface === 'back') this.za.set(Math.cos(t.heading), Math.sin(t.heading), 0);
        else this.za.set(Math.cos(t.heading), 0, Math.sin(t.heading));
        if (t.def.kind !== 'fly') this.za.set(0, 1, 0).sub(this.ya.clone().multiplyScalar(this.ya.y)).normalize();
        if (this.za.lengthSq() < 0.5) this.za.set(0, 0, -1);
      } else {
        // 飛んでいる: 上 = 真上、前 = 進む向き
        this.ya.set(0, 1, 0);
        const d = p.clone().sub(v.last);
        d.y = 0;
        if (d.lengthSq() > 1e-10) this.za.copy(d.normalize());
      }
      this.xa.crossVectors(this.ya, this.za).normalize();
      this.za.crossVectors(this.xa, this.ya).normalize();
      this.m.makeBasis(this.xa, this.ya, this.za);
      v.root.quaternion.setFromRotationMatrix(this.m);
      // 当てられているハエは、ぷるぷる震える
      const shake = hitNow && t.def.kind === 'fly' ? 0.0015 : 0;
      v.root.position.set(p.x + (Math.random() - 0.5) * shake, p.y + (Math.random() - 0.5) * shake, p.z + (Math.random() - 0.5) * shake);
      v.last.copy(p);

      // 羽ばたき
      if (v.wings) {
        v.flapPhase += dt;
        const flying = !t.active;
        const a = flying ? 0.4 + Math.sin(v.flapPhase * 70) * 0.9 : hitNow ? 0.3 + Math.sin(v.flapPhase * 45) * 0.35 : 0.08;
        v.wings[0].rotation.z = a;
        v.wings[1].rotation.z = -a;
      }

      const gm = v.glow.material as THREE.MeshBasicMaterial;
      gm.opacity += ((hitNow ? 0.9 : 0) - gm.opacity) * 0.3;
      v.glow.visible = t.active;
      v.glow.scale.setScalar(1 + (hitNow ? Math.sin(time * 20) * 0.08 : 0));
    }
  }

  /** 飛んでいるハエの数（羽音に使う） */
  get flying(): number {
    return this.views.filter((v) => v.target.def.kind === 'fly' && v.target.mode === 'flying').length;
  }
}
