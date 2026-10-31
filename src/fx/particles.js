// Non-physics particles. The "every scale at once" rule: physics bodies carry the big pieces,
// these carry the hundreds of small bits that sell the volume of a break.
import * as THREE from 'three';
import { gradientMap } from '../render/toon.js';
import { G } from '../core/context.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// Upload elements 0..n of each attribute at the next render, not the whole array (three.js
// uploads everything when needsUpdate is set without update ranges, and drops the ranges itself
// once it has uploaded them). Live particles are always packed into 0..n, so this covers every
// index that changed, including a slot reused by a spawn when the pool is full.
export function uploadLive(n, ...attrs) {
  if (n <= 0) return; // nothing drawn (count is 0): whatever the GPU still holds doesn't matter
  for (const a of attrs) {
    a.clearUpdateRanges();
    a.addUpdateRange(0, n * a.itemSize);
    a.needsUpdate = true;
  }
}

// Tumbling instanced shards that bounce on the (cratered) ground.
export class ShardSystem {
  constructor(scene, geometry, material, capacity, opts = {}) {
    this.cap = capacity;
    this.n = 0;
    this.gravity = opts.gravity ?? 20;
    this.drag = opts.drag ?? 0.1;
    this.bounce = opts.bounce ?? 0.35;
    this.flutter = opts.flutter ?? 0;
    this.restLife = opts.restLife ?? 1.5;
    const F = (k) => new Float32Array(capacity * k);
    this.pos = F(3); this.vel = F(3); this.rot = F(3); this.ang = F(3);
    this.size = F(1); this.life = F(1); this.max = F(1); this.rest = new Uint8Array(capacity);
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    // colours live straight in the instance colour buffer: written at spawn, moved on a kill
    this.col = this.mesh.instanceColor.array;
    this.colDirty = false;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = !!opts.castShadow;
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);
  }

  spawn(x, y, z, vx, vy, vz, size, life, color) {
    let i;
    if (this.n < this.cap) i = this.n++;
    else i = Math.floor(Math.random() * this.cap); // overwrite randomly when saturated
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.rot[i * 3] = Math.random() * 6; this.rot[i * 3 + 1] = Math.random() * 6; this.rot[i * 3 + 2] = Math.random() * 6;
    const a = 4 + Math.random() * 14;
    this.ang[i * 3] = (Math.random() - 0.5) * a; this.ang[i * 3 + 1] = (Math.random() - 0.5) * a; this.ang[i * 3 + 2] = (Math.random() - 0.5) * a;
    this.size[i] = size; this.life[i] = life; this.max[i] = life; this.rest[i] = 0;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.colDirty = true;
  }

  _kill(i) {
    const j = --this.n;
    if (i === j) return;
    this.colDirty = true;
    for (const arr of [this.pos, this.vel, this.rot, this.ang, this.col]) { arr[i * 3] = arr[j * 3]; arr[i * 3 + 1] = arr[j * 3 + 1]; arr[i * 3 + 2] = arr[j * 3 + 2]; }
    this.size[i] = this.size[j]; this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.rest[i] = this.rest[j];
  }

  update(dt) {
    const ground = G.ground;
    const drag = Math.exp(-this.drag * dt);
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this._kill(i); continue; }
      const k = i * 3;
      if (!this.rest[i]) {
        this.vel[k + 1] -= this.gravity * dt;
        this.vel[k] *= drag; this.vel[k + 1] *= drag; this.vel[k + 2] *= drag;
        if (this.flutter) {
          const t = this.life[i] * 7 + i;
          this.vel[k] += Math.sin(t) * this.flutter * dt;
          this.vel[k + 2] += Math.cos(t * 1.3) * this.flutter * dt;
        }
        this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
        this.rot[k] += this.ang[k] * dt; this.rot[k + 1] += this.ang[k + 1] * dt; this.rot[k + 2] += this.ang[k + 2] * dt;
        const gh = ground.heightAt(this.pos[k], this.pos[k + 2]) + this.size[i] * 0.3;
        if (this.pos[k + 1] < gh) {
          this.pos[k + 1] = gh;
          if (Math.abs(this.vel[k + 1]) < 2.5) {
            this.rest[i] = 1;
            this.life[i] = Math.min(this.life[i], this.restLife + Math.random() * this.restLife);
          } else {
            this.vel[k + 1] = -this.vel[k + 1] * this.bounce;
            this.vel[k] *= 0.6; this.vel[k + 2] *= 0.6;
            this.ang[k] *= 0.6; this.ang[k + 1] *= 0.6; this.ang[k + 2] *= 0.6;
          }
        }
      }
      const t = this.life[i];
      const shrink = Math.min(1, t / 0.5);
      const s = this.size[i] * shrink;
      _e.set(this.rot[k], this.rot[k + 1], this.rot[k + 2]);
      _q.setFromEuler(_e);
      _p.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]);
      _s.set(s, s, s);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.count = this.n;
    uploadLive(this.n, this.mesh.instanceMatrix);
    if (this.colDirty) { uploadLive(this.n, this.mesh.instanceColor); this.colDirty = false; }
  }
}

export function makePebbleSystem(scene, pieceGeo, capacity) {
  const geo = pieceGeo.clone();
  geo.computeBoundingBox();
  const sz = new THREE.Vector3();
  geo.boundingBox.getSize(sz);
  const k = 1 / Math.max(sz.x, sz.y, sz.z);
  geo.scale(k, k, k);
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3) });
  return new ShardSystem(scene, geo, mat, capacity, { gravity: 22, drag: 0.15, bounce: 0.3, castShadow: false, restLife: 2.5 });
}

export function makeGlassSystem(scene, capacity) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.4, 0, 0.5, -0.3, 0, -0.1, 0.6, 0], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(2), side: THREE.DoubleSide, emissive: 0x000000 });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', /* glsl */`
      #include <emissivemap_fragment>
      float face = abs(normalize(vNormal).z);
      totalEmissiveRadiance += vec3(0.7, 0.9, 1.0) * (pow(face, 10.0) * 2.5 + 0.15);
    `);
  };
  mat.customProgramCacheKey = () => 'glass-shard';
  return new ShardSystem(scene, geo, mat, capacity, { gravity: 16, drag: 0.9, bounce: 0.2, flutter: 14, restLife: 1.2 });
}

export function makeBloodSystem(scene, capacity) {
  const geo = new THREE.IcosahedronGeometry(0.5, 0);
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(2) });
  return new ShardSystem(scene, geo, mat, capacity, { gravity: 18, drag: 0.4, bounce: 0.05, restLife: 0.5 });
}

// Additive velocity-aligned streaks (hit sparks, embers, speed flecks).
export class SparkSystem {
  constructor(scene, capacity) {
    this.cap = capacity;
    this.n = 0;
    const F = (k) => new Float32Array(capacity * k);
    this.pos = F(3); this.vel = F(3); this.life = F(1); this.max = F(1);
    this.width = F(1); this.len = F(1); this.drag = F(1); this.grav = F(1);
    this.aPos = new THREE.InstancedBufferAttribute(F(3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(F(3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(F(4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(F(2), 2).setUsage(THREE.DynamicDrawUsage);
    this.cols = F(3);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 2, 1, 3]);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iVel', this.aVel);
    geo.setAttribute('iCol', this.aCol);
    geo.setAttribute('iSize', this.aSize);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iCol; attribute vec2 iSize;
        varying vec4 vCol; varying float vX;
        void main() {
          vec4 a = viewMatrix * vec4(iPos, 1.0);
          vec4 b = viewMatrix * vec4(iPos - iVel * iSize.y, 1.0);
          vec2 d = b.xy - a.xy;
          float l = length(d);
          vec2 dir = l > 1e-5 ? d / l : vec2(0.0, 1.0);
          vec2 perp = vec2(-dir.y, dir.x);
          vec4 p = mix(a, b, position.y);
          p.xy += perp * position.x * iSize.x * (1.0 - position.y * 0.7);
          vCol = iCol; vX = position.x;
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: /* glsl */`
        varying vec4 vCol; varying float vX;
        void main() {
          float a = 1.0 - vX * vX;
          gl_FragColor = vec4(vCol.rgb * vCol.a * a, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  spawn(x, y, z, vx, vy, vz, width, len, life, color, drag = 3, grav = 6) {
    let i = this.n < this.cap ? this.n++ : Math.floor(Math.random() * this.cap);
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life; this.max[i] = life; this.width[i] = width; this.len[i] = len;
    this.drag[i] = drag; this.grav[i] = grav;
    this.cols.set([color.r, color.g, color.b], i * 3);
  }

  update(dt) {
    const P = this.aPos.array, V = this.aVel.array, C = this.aCol.array, S = this.aSize.array;
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const j = --this.n;
        if (i !== j) {
          for (const arr of [this.pos, this.vel, this.cols]) { arr[i * 3] = arr[j * 3]; arr[i * 3 + 1] = arr[j * 3 + 1]; arr[i * 3 + 2] = arr[j * 3 + 2]; }
          this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.width[i] = this.width[j]; this.len[i] = this.len[j];
          this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j];
        }
        continue;
      }
    }
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= dr; this.vel[k + 1] = this.vel[k + 1] * dr - this.grav[i] * dt; this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = this.life[i] / this.max[i];
      P[k] = this.pos[k]; P[k + 1] = this.pos[k + 1]; P[k + 2] = this.pos[k + 2];
      V[k] = this.vel[k]; V[k + 1] = this.vel[k + 1]; V[k + 2] = this.vel[k + 2];
      C[i * 4] = this.cols[k]; C[i * 4 + 1] = this.cols[k + 1]; C[i * 4 + 2] = this.cols[k + 2]; C[i * 4 + 3] = Math.min(1, t * 1.6);
      S[i * 2] = this.width[i] * (0.4 + 0.6 * t); S[i * 2 + 1] = this.len[i];
    }
    this.geo.instanceCount = this.n;
    uploadLive(this.n, this.aPos, this.aVel, this.aCol, this.aSize);
  }
}
