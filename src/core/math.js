// Small math helpers shared by every system.
import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
// Frame-rate independent exponential approach (lambda ~ "speed").
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

// Seeded RNG (mulberry32) for reproducible city layouts.
export function makeRng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + r() * (hi - lo);
  r.int = (lo, hi) => Math.floor(lo + r() * (hi - lo + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  return r;
}

// Smooth 1D value noise, used for camera shake (Perlin-style shake beats random jitter).
const PERM = new Float32Array(512);
for (let i = 0; i < 512; i++) PERM[i] = Math.random() * 2 - 1;
export function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const a = PERM[i & 511], b = PERM[(i + 1) & 511];
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

// Cheap 3D hash noise for procedural variation.
export function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const UP = new THREE.Vector3(0, 1, 0);

// Random unit vector.
export function randomUnit(out = new THREE.Vector3()) {
  const u = Math.random() * 2 - 1;
  const th = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(th), u, s * Math.sin(th));
}

// Random vector inside a cone around `dir` (unit), half-angle in radians.
export function randomInCone(dir, halfAngle, out = new THREE.Vector3()) {
  const cosA = Math.cos(halfAngle);
  const z = cosA + Math.random() * (1 - cosA);
  const phi = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  const t = Math.abs(dir.y) < 0.99 ? UP : _X;
  const u = _tmpA.crossVectors(t, dir).normalize();
  const v = _tmpB.crossVectors(dir, u);
  return out.copy(dir).multiplyScalar(z).addScaledVector(u, s * Math.cos(phi)).addScaledVector(v, s * Math.sin(phi));
}
const _X = new THREE.Vector3(1, 0, 0);
const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
