// Park trees (real maps): instanced trunks and toon canopies around the open central lawn.
// They don't block anything; a ground blast nearby strips them in a burst of leaves.
import * as THREE from 'three';
import { G } from '../core/context.js';
import { gradientMap } from '../render/toon.js';
import { makeRng } from '../core/math.js';
import { spawnParkLayout } from './ground.js';
import { inRing } from './realCity.js';

const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
const LEAVES = new THREE.Color(0x4f9a45);

function segDist(x, z, [[ax, az], [bx, bz]]) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

// Scattered over the lawns: off the walks, clear of the fountain, the central lawn and the
// sidewalk (6 m in from the curb on every side, the Broadway diagonal included).
export function parkTreeSpots(map, seed) {
  const P = spawnParkLayout(map);
  if (!P) return [];
  const rng = makeRng(seed);
  const spots = [];
  for (let n = 0; n < 1500 && spots.length < 70; n++) {
    const x = rng.range(P.x0, P.x1), z = rng.range(P.z0, P.z1);
    if (![[6, 0], [-6, 0], [0, 6], [0, -6]].every(([dx, dz]) => inRing(P.ring, x + dx, z + dz))) continue;
    const ex = (x - P.cx) / (P.rx + 4), ez = (z - P.cz) / (P.rz + 4);
    if (ex * ex + ez * ez < 1) continue;
    if (P.walks.some((w) => segDist(x, z, w) < 3.5)) continue;
    if (Math.hypot(x - P.fountain[0], z - P.fountain[1]) < 13) continue;
    if (spots.some((t) => Math.hypot(t.x - x, t.z - z) < 7)) continue;
    spots.push({ x, z, s: rng.range(0.85, 1.25), yaw: rng() * Math.PI * 2, tint: rng.range(0.82, 1.1) });
  }
  return spots;
}

export class Trees {
  constructor(scene, spots) {
    this.spots = spots.map((t) => ({ ...t, alive: true }));
    const n = spots.length;
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.42, 4.2, 6);
    trunkGeo.translate(0, 2.1, 0);
    const crownGeo = new THREE.IcosahedronGeometry(3.6, 1);
    crownGeo.scale(1, 0.85, 1);
    crownGeo.translate(0, 6.6, 0);
    this.trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshToonMaterial({ color: 0x5a4030, gradientMap: gradientMap(3) }), n);
    this.crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap(3) }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    this.spots.forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, 0, t.z), q.setFromAxisAngle(up, t.yaw), new THREE.Vector3(t.s, t.s, t.s));
      this.trunks.setMatrixAt(i, m);
      this.crowns.setMatrixAt(i, m);
      this.crowns.setColorAt(i, LEAVES.clone().multiplyScalar(t.tint));
    });
    for (const mesh of [this.trunks, this.crowns]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
    }
  }

  knock(x, z, r) {
    let hit = false;
    this.spots.forEach((t, i) => {
      if (!t.alive || Math.hypot(t.x - x, t.z - z) > r) return;
      t.alive = false;
      hit = true;
      this.trunks.setMatrixAt(i, ZERO_M);
      this.crowns.setMatrixAt(i, ZERO_M);
      const away = new THREE.Vector3(t.x - x, 0, t.z - z).normalize().multiplyScalar(8).setY(6);
      G.fx.pebbleBurst(new THREE.Vector3(t.x, 6 * t.s, t.z), 12, away, LEAVES, 1.6);
    });
    if (hit) {
      this.trunks.instanceMatrix.needsUpdate = true;
      this.crowns.instanceMatrix.needsUpdate = true;
    }
  }
}
