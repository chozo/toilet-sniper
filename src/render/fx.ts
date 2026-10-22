import * as THREE from 'three';
import { FLOW_DEFAULT, PHYS } from '../config';
import type { Stream } from '../stream';
import type { StreamHit } from '../stream';
import { toon } from './scene';

const URINE = '#ffd93d';
const MAX_SEG = 900;

/** 水流: 出た順に並んだ粒どうしを細い円柱でつなぐ */
export class StreamView {
  readonly mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  private d = new THREE.Vector3();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();

  constructor() {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    const mat = toon(URINE, { transparent: true, opacity: 0.82, emissive: '#6b4a00', emissiveIntensity: 0.25 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_SEG);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  update(stream: Stream): void {
    const ps = stream.parts;
    let n = 0;
    for (let i = 1; i < ps.length && n < MAX_SEG; i++) {
      const a = ps[i - 1], b = ps[i];
      if (!b.linked || a.hit) continue;
      this.d.set(b.x - a.x, b.y - a.y, b.z - a.z);
      const len = this.d.length();
      if (len < 1e-5 || len > 0.08) continue;
      const qq = Math.sqrt(Math.max(0, b.q) / FLOW_DEFAULT.qMax);
      const r = PHYS.radiusMin + (PHYS.radiusMax - PHYS.radiusMin) * Math.min(1, qq);
      this.q.setFromUnitVectors(this.up, this.d.divideScalar(len));
      this.p.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      this.s.set(r, len * 1.15, r);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

interface Drop { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; size: number }

/** しぶき */
export class Splash {
  readonly mesh: THREE.InstancedMesh;
  private drops: Drop[] = [];
  private m = new THREE.Matrix4();
  private max = 400;

  constructor() {
    const mat = new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.9 });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), mat, this.max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  emit(h: StreamHit, rnd: () => number, strength = 1): void {
    if (this.drops.length >= this.max) return;
    const n = h.region === 'bowl' ? 1 : 2;
    const sp = Math.hypot(h.vel.x, h.vel.y, h.vel.z);
    for (let i = 0; i < n; i++) {
      // 面で跳ね返す。勢いは弱め、向きはばらつかせる
      const nx = h.normal.x, ny = h.normal.y, nz = h.normal.z;
      const dot = h.vel.x * nx + h.vel.y * ny + h.vel.z * nz;
      const k = 0.25 * strength;
      const j = sp * 0.35;
      this.drops.push({
        x: h.point.x + nx * 0.004, y: h.point.y + ny * 0.004, z: h.point.z + nz * 0.004,
        vx: (h.vel.x - 2 * dot * nx) * k + (rnd() - 0.5) * j,
        vy: (h.vel.y - 2 * dot * ny) * k + rnd() * j * 0.8,
        vz: (h.vel.z - 2 * dot * nz) * k + (rnd() - 0.5) * j,
        life: 0.18 + rnd() * 0.22,
        size: 0.0018 + rnd() * 0.0022,
      });
    }
  }

  update(dt: number): void {
    const g = PHYS.g;
    let n = 0;
    const keep: Drop[] = [];
    for (const d of this.drops) {
      d.life -= dt;
      if (d.life <= 0 || d.y < 0) continue;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.vy -= g * dt;
      keep.push(d);
      const s = d.size * Math.min(1, d.life * 6);
      this.m.makeScale(s, s, s).setPosition(d.x, d.y, d.z);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.drops = keep;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.drops = [];
    this.mesh.count = 0;
  }
}

/** 床の水たまり。近くにこぼれたら大きくなる */
export class Puddles {
  readonly group = new THREE.Group();
  private items: { x: number; z: number; vol: number; mesh: THREE.Mesh }[] = [];
  private geo = new THREE.CircleGeometry(1, 28);
  private mat = new THREE.MeshBasicMaterial({ color: URINE, transparent: true, opacity: 0.55, depthWrite: false });

  add(x: number, z: number, vol: number): void {
    let best = null as (typeof this.items)[number] | null;
    let bd = 1e9;
    for (const it of this.items) {
      const d = Math.hypot(it.x - x, it.z - z);
      if (d < bd) { bd = d; best = it; }
    }
    const radiusOf = (v: number) => Math.min(0.12, 0.01 + Math.sqrt(v) * 0.012);
    if (best && bd < radiusOf(best.vol) + 0.015) {
      best.vol += vol;
      // 中心を少し寄せる
      best.x += (x - best.x) * 0.02; best.z += (z - best.z) * 0.02;
    } else {
      if (this.items.length > 40) return;
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.rotation.x = -Math.PI / 2;
      best = { x, z, vol, mesh };
      this.items.push(best);
      this.group.add(mesh);
    }
    const r = radiusOf(best.vol);
    best.mesh.scale.set(r, r * (0.8 + 0.2 * Math.sin(best.x * 50)), 1);
    best.mesh.position.set(best.x, 0.0015 + this.items.indexOf(best) * 0.0001, best.z);
  }

  clear(): void {
    this.items = [];
    this.group.clear();
  }
}
