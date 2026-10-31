// Pre-computed Voronoi fracture of a unit cube. At load we cut a few variants into convex
// cells by clipping the cube with bisector planes; at runtime a breaking chunk just picks a
// variant and spawns its cells scaled to the chunk size (instancing-friendly, zero runtime CSG).
import * as THREE from 'three';
import { makeRng } from '../core/math.js';

const EPS = 1e-6;

function cubeFaces() {
  const h = 0.5;
  const v = (x, y, z) => new THREE.Vector3(x * h, y * h, z * h);
  // CCW seen from outside
  return [
    [v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), v(1, -1, 1)],     // +x
    [v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1), v(-1, -1, -1)], // -x
    [v(-1, 1, -1), v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1)],     // +y
    [v(-1, -1, 1), v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1)], // -y
    [v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)],     // +z
    [v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1)], // -z
  ];
}

// Keep the half-space n.p <= d. Returns new face list with a cap polygon.
function clip(faces, n, d) {
  const out = [];
  const capPts = [];
  for (const poly of faces) {
    const res = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = n.dot(a) - d, db = n.dot(b) - d;
      if (da <= EPS) res.push(a);
      if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) {
        const t = da / (da - db);
        const p = a.clone().lerp(b, t);
        res.push(p);
        capPts.push(p);
      } else if (Math.abs(da) <= EPS) {
        capPts.push(a);
      }
    }
    if (res.length >= 3) out.push(res);
  }
  if (capPts.length >= 3) {
    // dedupe
    const uniq = [];
    for (const p of capPts) if (!uniq.some((q) => q.distanceToSquared(p) < 1e-9)) uniq.push(p);
    if (uniq.length >= 3) {
      const c = new THREE.Vector3();
      uniq.forEach((p) => c.add(p));
      c.divideScalar(uniq.length);
      const t = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const u = new THREE.Vector3().crossVectors(n, t).normalize();
      const w = new THREE.Vector3().crossVectors(n, u);
      uniq.sort((p, q) => {
        const ap = Math.atan2(w.dot(p.clone().sub(c)), u.dot(p.clone().sub(c)));
        const aq = Math.atan2(w.dot(q.clone().sub(c)), u.dot(q.clone().sub(c)));
        return ap - aq;
      });
      // ensure CCW around +n (outward)
      const e1 = uniq[1].clone().sub(uniq[0]), e2 = uniq[2].clone().sub(uniq[0]);
      if (e1.cross(e2).dot(n) < 0) uniq.reverse();
      out.push(uniq);
    }
  }
  return out;
}

function facesToPiece(faces) {
  const verts = [];
  for (const f of faces) for (const p of f) if (!verts.some((q) => q.distanceToSquared(p) < 1e-9)) verts.push(p);
  // volume-weighted centroid via tetra decomposition
  const ref = verts[0];
  let vol = 0;
  const cen = new THREE.Vector3();
  for (const f of faces) {
    for (let i = 1; i < f.length - 1; i++) {
      const a = f[0], b = f[i], c = f[i + 1];
      const v = Math.abs(a.clone().sub(ref).dot(b.clone().sub(ref).cross(c.clone().sub(ref)))) / 6;
      vol += v;
      cen.addScaledVector(ref.clone().add(a).add(b).add(c).multiplyScalar(0.25), v);
    }
  }
  if (vol < 1e-5) return null;
  cen.divideScalar(vol);

  const pos = [], nor = [];
  for (const f of faces) {
    const n = f[1].clone().sub(f[0]).cross(f[2].clone().sub(f[0])).normalize();
    for (let i = 1; i < f.length - 1; i++) {
      for (const p of [f[0], f[i], f[i + 1]]) {
        pos.push(p.x - cen.x, p.y - cen.y, p.z - cen.z);
        nor.push(n.x, n.y, n.z);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.computeBoundingSphere();
  const hull = new Float32Array(verts.length * 3);
  const bmin = new THREE.Vector3(Infinity, Infinity, Infinity), bmax = bmin.clone().negate();
  verts.forEach((p, i) => {
    hull[i * 3] = p.x - cen.x; hull[i * 3 + 1] = p.y - cen.y; hull[i * 3 + 2] = p.z - cen.z;
    bmin.min(p); bmax.max(p);
  });
  return { geometry: geo, centroid: cen, hull, volume: vol, half: bmax.sub(bmin).multiplyScalar(0.5) };
}

export function voronoiCube(nSeeds, seed) {
  const rng = makeRng(seed);
  const seeds = [];
  for (let i = 0; i < nSeeds; i++) {
    // bias towards the surface so pieces are slab-like shards, not just cubes
    seeds.push(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(0.95));
  }
  const pieces = [];
  for (let i = 0; i < seeds.length; i++) {
    let faces = cubeFaces();
    for (let j = 0; j < seeds.length; j++) {
      if (i === j) continue;
      const n = seeds[j].clone().sub(seeds[i]).normalize();
      const mid = seeds[j].clone().add(seeds[i]).multiplyScalar(0.5);
      faces = clip(faces, n, n.dot(mid));
      if (faces.length < 4) break;
    }
    if (faces.length >= 4) {
      const p = facesToPiece(faces);
      if (p) pieces.push(p);
    }
  }
  return pieces;
}

// Library: several variants so neighbouring chunks never break identically.
export function buildFractureLibrary() {
  const variants = [];
  const cfg = [[7, 11], [6, 23], [8, 37], [5, 51]];
  for (const [n, s] of cfg) variants.push(voronoiCube(n, s));
  return variants;
}
