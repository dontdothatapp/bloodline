// Procedural toon superheroes: primitive-built rig, pose library, layered pose blending,
// anime smear frames, hit flash + squash, and a verlet-cloth cape.
import * as THREE from 'three';
import { gradientMap, outlineMaterial, addOutline, rimLight, RIM_GLSL } from '../render/toon.js';
import { clamp, damp } from '../core/math.js';

const D = THREE.MathUtils.degToRad;

// joint -> [x, y, z] degrees. Character faces +Z, its left is +X.
export const POSES = {
  idle: {
    spine: [4, 0, 0], chest: [4, 0, 0], head: [-6, 0, 0],
    shL: [8, 0, 16], elL: [-28, 0, 0], shR: [8, 0, -16], elR: [-28, 0, 0],
    hipL: [-22, 0, 4], knL: [38, 0, 0], ftL: [28, 0, 0], hipR: [-4, 0, -4], knR: [16, 0, 0], ftR: [32, 0, 0],
  },
  guard: {
    spine: [8, 0, 0], chest: [6, -18, 0], head: [-4, 12, 0],
    shL: [-72, 0, 14], elL: [-100, 0, 0], shR: [-48, 0, -22], elR: [-125, 0, 0],
    hipL: [-34, 0, 6], knL: [55, 0, 0], ftL: [30, 0, 0], hipR: [6, 0, -6], knR: [35, 0, 0], ftR: [35, 0, 0],
  },
  taunt: {
    spine: [-4, 0, 0], chest: [-6, 0, 0], head: [-12, 0, 0],
    shL: [-58, -10, -48], elL: [-118, 0, 0], shR: [-54, 10, 48], elR: [-122, 0, 0],
    hipL: [-8, 0, 3], knL: [12, 0, 0], ftL: [30, 0, 0], hipR: [-2, 0, -3], knR: [8, 0, 0], ftR: [30, 0, 0],
  },
  fly: {
    spine: [0, 0, 0], chest: [0, 0, 0], head: [-62, 0, 0],
    shL: [14, 0, 8], elL: [-8, 0, 0], shR: [-172, 0, -6], elR: [-4, 0, 0],
    hipL: [2, 0, 3], knL: [8, 0, 0], ftL: [48, 0, 0], hipR: [-6, 0, -3], knR: [18, 0, 0], ftR: [48, 0, 0],
  },
  flyBoth: {
    spine: [0, 0, 0], chest: [0, 0, 0], head: [-62, 0, 0],
    shL: [-170, 0, 8], elL: [-4, 0, 0], shR: [-170, 0, -8], elR: [-4, 0, 0],
    hipL: [0, 0, 2], knL: [4, 0, 0], ftL: [50, 0, 0], hipR: [0, 0, -2], knR: [4, 0, 0], ftR: [50, 0, 0],
  },
  jabW: { chest: [4, -28, 0], shL: [-62, 0, 10], elL: [-112, 0, 0], shR: [-45, 0, -22], elR: [-125, 0, 0] },
  jabS: { chest: [6, -42, 0], spine: [6, -8, 0], shL: [-92, 0, 4], elL: [-4, 0, 0], shR: [-40, 0, -24], elR: [-128, 0, 0], head: [-4, 30, 0] },
  crossW: { chest: [4, -24, 0], shL: [-70, 0, 14], elL: [-104, 0, 0], shR: [-40, 0, -22], elR: [-132, 0, 0] },
  crossS: { chest: [8, 46, 0], spine: [8, 10, 0], shR: [-92, 0, -4], elR: [-4, 0, 0], shL: [-38, 0, 18], elL: [-124, 0, 0], head: [-4, -34, 0] },
  hookW: { chest: [4, 30, 0], shL: [-40, 0, 60], elL: [-90, 0, 0], shR: [-50, 0, -20], elR: [-120, 0, 0] },
  hookS: { chest: [10, -62, 0], spine: [6, -14, 0], shL: [-84, 0, 62], elL: [-84, 0, 0], shR: [-40, 0, -24], elR: [-126, 0, 0], head: [0, 35, 0] },
  smashW: { spine: [-12, -10, 0], chest: [-16, -38, 0], shR: [-150, 0, -10], elR: [-105, 0, 0], shL: [-60, 0, 30], elL: [-60, 0, 0], head: [-10, 30, 0] },
  smashS: { spine: [18, 12, 0], chest: [26, 52, 0], shR: [-100, 0, -2], elR: [-8, 0, 0], shL: [-20, 0, 40], elL: [-90, 0, 0], head: [6, -40, 0], hipL: [-50, 0, 6], knL: [70, 0, 0] },
  chargeW: {
    spine: [-6, -20, 0], chest: [-4, -48, 0], head: [-4, 46, 0],
    shR: [-6, 0, -28], elR: [-132, 0, 0], shL: [-82, 0, 22], elL: [-24, 0, 0],
    hipL: [-48, 0, 10], knL: [70, 0, 0], hipR: [18, 0, -8], knR: [40, 0, 0],
  },
  chargeS: {
    spine: [14, 16, 0], chest: [14, 58, 0], head: [-4, -44, 0],
    shR: [-94, 0, -2], elR: [0, 0, 0], shL: [24, 0, 34], elL: [-70, 0, 0],
    hipL: [-60, 0, 8], knL: [40, 0, 0], hipR: [30, 0, -4], knR: [20, 0, 0],
  },
  upperW: { spine: [28, 0, 0], chest: [18, -20, 0], shR: [24, 0, -18], elR: [-95, 0, 0], shL: [-60, 0, 20], elL: [-100, 0, 0], hipL: [-60, 0, 0], knL: [90, 0, 0], hipR: [-40, 0, 0], knR: [80, 0, 0] },
  upperS: { spine: [-22, 10, 0], chest: [-14, 30, 0], shR: [-172, 0, -10], elR: [-30, 0, 0], shL: [-20, 0, 30], elL: [-80, 0, 0], head: [-25, 0, 0], hipL: [-10, 0, 0], knL: [20, 0, 0], hipR: [10, 0, 0], knR: [10, 0, 0] },
  meteorW: { spine: [-20, 0, 0], chest: [-20, 0, 0], shL: [-175, 0, -8], elL: [-70, 0, 0], shR: [-175, 0, 8], elR: [-70, 0, 0], head: [-20, 0, 0], hipL: [-40, 0, 0], knL: [80, 0, 0], hipR: [-40, 0, 0], knR: [80, 0, 0] },
  meteorS: { spine: [40, 0, 0], chest: [30, 0, 0], shL: [-55, 0, -12], elL: [-10, 0, 0], shR: [-55, 0, 12], elR: [-10, 0, 0], head: [10, 0, 0], hipL: [10, 0, 0], knL: [20, 0, 0], hipR: [10, 0, 0], knR: [20, 0, 0] },
  grab: { spine: [10, 0, 0], chest: [10, 0, 0], shL: [-86, 0, -6], elL: [-24, 0, 0], shR: [-86, 0, 6], elR: [-24, 0, 0] },
  hold: { spine: [8, 10, 0], chest: [8, 18, 0], shR: [-92, 0, 0], elR: [-6, 0, 0], shL: [-50, 0, 30], elL: [-95, 0, 0], head: [-6, -10, 0] },
  throw: { spine: [12, 30, 0], chest: [10, 62, 0], shR: [-120, 0, -40], elR: [-10, 0, 0], shL: [10, 0, 50], elL: [-40, 0, 0], head: [0, -40, 0] },
  block: {
    spine: [10, 0, 0], chest: [12, 0, 0], head: [16, 0, 0],
    shL: [-84, 0, -34], elL: [-112, 0, 0], shR: [-84, 0, 34], elR: [-112, 0, 0],
    hipL: [-40, 0, 8], knL: [70, 0, 0], hipR: [-30, 0, -8], knR: [60, 0, 0],
  },
  hitHigh: { spine: [-16, 0, 0], chest: [-22, 0, 0], head: [-38, 0, 0], shL: [24, 0, 46], elL: [-40, 0, 0], shR: [24, 0, -46], elR: [-40, 0, 0], hipL: [10, 0, 0], knL: [30, 0, 0], hipR: [20, 0, 0], knR: [40, 0, 0] },
  hitBody: { spine: [34, 0, 0], chest: [22, 0, 0], head: [18, 0, 0], shL: [-34, 0, 22], elL: [-50, 0, 0], shR: [-34, 0, -22], elR: [-50, 0, 0], hipL: [-50, 0, 0], knL: [70, 0, 0], hipR: [-40, 0, 0], knR: [60, 0, 0] },
  tumble: {
    spine: [-18, 0, 0], chest: [-16, 0, 0], head: [-30, 0, 0],
    shL: [-30, 0, 78], elL: [-38, 0, 0], shR: [-30, 0, -78], elR: [-38, 0, 0],
    hipL: [-26, 0, 14], knL: [44, 0, 0], ftL: [30, 0, 0], hipR: [12, 0, -14], knR: [22, 0, 0], ftR: [30, 0, 0],
  },
  dangle: { spine: [12, 0, 0], chest: [10, 0, 0], head: [30, 0, 0], shL: [12, 0, 12], elL: [-14, 0, 0], shR: [12, 0, -12], elR: [-14, 0, 0], hipL: [-8, 0, 4], knL: [18, 0, 0], ftL: [40, 0, 0], hipR: [4, 0, -4], knR: [10, 0, 0], ftR: [40, 0, 0] },
  down: { spine: [-6, 0, 0], chest: [-4, 0, 0], head: [-14, 20, 0], shL: [-40, 0, 80], elL: [-30, 0, 0], shR: [-120, 0, -70], elR: [-20, 0, 0], hipL: [-6, 0, 18], knL: [12, 0, 0], ftL: [20, 0, 0], hipR: [-30, 0, -10], knR: [50, 0, 0], ftR: [20, 0, 0] },
  recover: { spine: [30, 0, 0], chest: [20, 0, 0], head: [-10, 0, 0], shL: [-20, 0, 60], elL: [-60, 0, 0], shR: [-20, 0, -60], elR: [-60, 0, 0], hipL: [-80, 0, 10], knL: [110, 0, 0], hipR: [-70, 0, -10], knR: [100, 0, 0] },
  // round-intro arrival: plummeting feet first with the arms flared, then the superhero landing
  dive: { spine: [6, 0, 0], chest: [4, 0, 0], head: [-24, 0, 0], shL: [-150, 0, 40], elL: [-20, 0, 0], shR: [-150, 0, -40], elR: [-20, 0, 0], hipL: [-24, 0, 6], knL: [40, 0, 0], ftL: [30, 0, 0], hipR: [-6, 0, -6], knR: [20, 0, 0], ftR: [30, 0, 0] },
  heroLand: { spine: [34, 0, 0], chest: [18, 0, 0], head: [-34, 0, 0], shR: [-30, 0, -8], elR: [-6, 0, 0], shL: [18, 0, 46], elL: [-30, 0, 0], hipL: [-96, 0, 12], knL: [104, 0, 0], ftL: [14, 0, 0], hipR: [28, 0, -8], knR: [118, 0, 0], ftR: [-10, 0, 0] },
  punchL: { chest: [6, -40, 0], shL: [-90, 0, 4], elL: [-4, 0, 0], shR: [-90, 0, 0], elR: [-6, 0, 0] },
  punchR: { chest: [6, 40, 0], shR: [-90, 0, 0], elR: [-4, 0, 0], shL: [-80, 0, 10], elL: [-40, 0, 0] },
};
export const JOINTS = ['spine', 'chest', 'head', 'shL', 'elL', 'shR', 'elR', 'hipL', 'knL', 'ftL', 'hipR', 'knR', 'ftR'];
const POSEQ = {};
for (const [name, p] of Object.entries(POSES)) {
  POSEQ[name] = {};
  for (const j of JOINTS) {
    const e = p[j] || POSES.idle[j] || [0, 0, 0];
    POSEQ[name][j] = new THREE.Quaternion().setFromEuler(new THREE.Euler(D(e[0]), D(e[1]), D(e[2])));
  }
}
// partial poses fall back to the guard stance for unspecified joints
for (const [name, p] of Object.entries(POSES)) {
  if (['idle', 'fly', 'flyBoth', 'tumble', 'down', 'dangle', 'taunt', 'block', 'recover'].includes(name)) continue;
  for (const j of JOINTS) if (!p[j] && POSES.guard[j]) POSEQ[name][j].setFromEuler(new THREE.Euler(...POSES.guard[j].map(D)));
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

function cap(r, len, seg = 10) { return new THREE.CapsuleGeometry(r, len, 4, seg); }

export class CharacterModel {
  constructor(scene, def) {
    this.def = def;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    scene.add(this.root);
    this.mats = [];
    this.flash = 0;
    this.squash = 0;
    this.squashDir = new THREE.Vector3(0, 1, 0);
    this.smearL = 0; this.smearR = 0;
    this.base = 'idle';
    this.action = null;
    this.actionW = 0;
    this.actionWTarget = 0;
    this.rate = 14;
    this.damage = 0;
    this.outline = outlineMaterial(0.016, def.ink || 0x0b0b14);
    const S = def.scale || 1;
    this.body.scale.setScalar(S);

    const mat = (c) => {
      const m = new THREE.MeshToonMaterial({ color: c, gradientMap: gradientMap(3) });
      m.userData.base = new THREE.Color(c);
      const uniforms = { uDamage: { value: 0 } };
      m.userData.u = uniforms;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uDamage = uniforms.uDamage;
        Object.assign(sh.uniforms, rimLight);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjP;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          uniform float uDamage; varying vec3 vObjP;
          uniform vec3 uRimColor; uniform float uRim;
          float hh(vec3 p){ return fract(sin(dot(floor(p), vec3(12.7, 51.3, 97.1))) * 43758.5453); }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
          { float n = hh(vObjP * 18.0) * 0.6 + hh(vObjP * 7.0) * 0.4;
            float bruise = step(1.0 - uDamage * 0.55, n);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.32, 0.34), bruise * 0.75); }`)
          .replace('#include <opaque_fragment>', RIM_GLSL);
      };
      m.customProgramCacheKey = () => 'char-' + def.name;
      this.mats.push(m);
      return m;
    };
    const M = {};
    for (const [k, c] of Object.entries(def.colors)) M[k] = mat(c);
    this.M = M;

    const add = (parent, geo, m, pos, scale, rot) => {
      const mesh = new THREE.Mesh(geo, m);
      if (pos) mesh.position.set(...pos);
      if (scale) mesh.scale.set(...scale);
      if (rot) mesh.rotation.set(...rot);
      mesh.castShadow = true;
      parent.add(mesh);
      addOutline(mesh, this.outline);
      return mesh;
    };
    const grp = (parent, pos) => { const g = new THREE.Group(); g.position.set(...pos); parent.add(g); return g; };
    const bw = def.build || 1;

    const J = {};
    J.pelvis = grp(this.body, [0, 0, 0]);
    add(J.pelvis, cap(0.135, 0.12), M.legs, [0, -0.02, 0], [1.25 * bw, 0.8, 0.85], [0, 0, Math.PI / 2]);
    if (def.belt) add(J.pelvis, cap(0.14, 0.12), M.belt, [0, 0.06, 0], [1.24 * bw, 0.32, 0.88], [0, 0, Math.PI / 2]);
    J.spine = grp(J.pelvis, [0, 0.1, 0]);
    add(J.spine, cap(0.14, 0.1), M.torso, [0, 0.08, 0], [1.05 * bw, 1, 0.8]);
    J.chest = grp(J.spine, [0, 0.16, 0]);
    this.chestMesh = add(J.chest, cap(0.2, 0.12, 12), M.torso, [0, 0.13, 0.0], [1.28 * bw, 1, 0.78]);
    if (def.emblem) add(J.chest, new THREE.CircleGeometry(0.075, 20), M.emblem, [0, 0.16, 0.158], [1, 1, 1]);
    if (def.chestStripe) add(J.chest, cap(0.2, 0.12, 12), M.accent, [0, 0.07, 0.005], [1.29 * bw, 0.35, 0.8]);
    J.neck = grp(J.chest, [0, 0.3, 0]);
    add(J.neck, cap(0.06, 0.06), M.skin, [0, 0.03, 0]);
    J.head = grp(J.neck, [0, 0.07, 0]);
    this.headMesh = add(J.head, new THREE.SphereGeometry(0.135, 20, 16), M.head, [0, 0.12, 0.01], [0.9, 1.08, 1]);
    // hair
    add(J.head, new THREE.SphereGeometry(0.14, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair, [0, 0.135, -0.012], [0.94, 1.1, 1.04]);
    if (def.mask) {
      // white goggle eyes on a blue cowl
      for (const sx of [-1, 1]) {
        const eye = add(J.head, new THREE.SphereGeometry(0.04, 12, 8), M.eyes, [sx * 0.05, 0.13, 0.112], [1.2, 0.75, 0.45], [0, 0, sx * -0.35]);
        eye.castShadow = false;
      }
    } else {
      // face: eyes, brows, mustache
      for (const sx of [-1, 1]) {
        add(J.head, new THREE.SphereGeometry(0.016, 8, 6), M.dark, [sx * 0.045, 0.14, 0.12]);
        add(J.head, new THREE.BoxGeometry(0.06, 0.014, 0.02), M.hair, [sx * 0.047, 0.168, 0.118], [1, 1, 1], [0, 0, sx * 0.25]);
      }
      if (def.mustache) add(J.head, new THREE.BoxGeometry(0.11, 0.028, 0.035), M.hair, [0, 0.075, 0.122], [1, 1, 1], [0, 0, 0]);
    }
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const sh = J['sh' + side] = grp(J.chest, [sx * 0.25 * bw, 0.22, 0]);
      add(sh, new THREE.SphereGeometry(0.095, 12, 10), M.torso, [0, 0, 0]);
      const ua = J['ua' + side] = new THREE.Group(); sh.add(ua);
      add(ua, cap(0.078, 0.2), M.arms, [0, -0.15, 0]);
      const el = J['el' + side] = grp(sh, [0, -0.3, 0]);
      const fa = J['fa' + side] = new THREE.Group(); el.add(fa);
      add(fa, cap(0.068, 0.17), M.gloves, [0, -0.13, 0]);
      const hand = J['hand' + side] = grp(el, [0, -0.28, 0]);
      add(hand, new THREE.SphereGeometry(0.085, 12, 10), M.gloves, [0, -0.02, 0.01], [0.95, 1.05, 1.05]);
      const hip = J['hip' + side] = grp(J.pelvis, [sx * 0.105 * bw, -0.07, 0]);
      add(hip, cap(0.098, 0.28), M.legs, [0, -0.21, 0]);
      const kn = J['kn' + side] = grp(hip, [0, -0.44, 0]);
      add(kn, cap(0.078, 0.3), M.boots, [0, -0.2, 0]);
      const ft = J['ft' + side] = grp(kn, [0, -0.42, 0]);
      add(ft, new THREE.BoxGeometry(0.11, 0.09, 0.24), M.boots, [0, -0.03, 0.05]);
    }
    this.J = J;
    this.cur = {};
    for (const j of JOINTS) { this.cur[j] = POSEQ.idle[j].clone(); J[j].quaternion.copy(this.cur[j]); }

    if (def.cape) this.cape = new Cape(scene, M.cape, this);
  }

  setBase(name) { this.base = name; }
  // Pose override with a blend rate. rate ~60 snaps for strike frames.
  setAction(name, rate = 18) {
    if (name) { this.action = name; this.actionWTarget = 1; this.rate = rate; }
    else { this.actionWTarget = 0; this.rate = rate; }
  }

  hitFlash(v = 1) { this.flash = Math.max(this.flash, v); }
  hitSquash(dir, v = 1) { this.squash = Math.max(this.squash, v); this.squashDir.copy(dir); }
  smear(side, v = 1) { if (side === 'L') this.smearL = v; else this.smearR = v; }
  setDamage(v) { this.damage = v; for (const m of this.mats) m.userData.u.uDamage.value = v; }

  update(dt, realDt, vel, frozen) {
    const J = this.J;
    // action weight
    this.actionW = damp(this.actionW, this.actionWTarget, this.actionWTarget > 0 ? 40 : 10, dt || realDt * 0.0);
    if (this.actionWTarget === 0 && this.actionW < 0.01) this.action = null;
    const baseQ = POSEQ[this.base] || POSEQ.idle;
    const actQ = this.action ? POSEQ[this.action] : null;
    const k = 1 - Math.exp(-this.rate * dt);
    for (const j of JOINTS) {
      _q.copy(baseQ[j]);
      if (actQ) _q.slerp(actQ[j], this.actionW);
      this.cur[j].slerp(_q, k);
      J[j].quaternion.copy(this.cur[j]);
    }
    // smear frames: stretch the striking arm for a couple of frames
    this.smearL = Math.max(0, this.smearL - dt * 9);
    this.smearR = Math.max(0, this.smearR - dt * 9);
    // hit flash (real time so it reads during hitstop)
    this.flash = Math.max(0, this.flash - realDt * 6);
    this.looks(this.smearL, this.smearR, this.flash, this.damage);
    // squash & stretch (decays in real time; jitters during hitstop)
    this.squash = Math.max(0, this.squash - realDt * 5);
    const sq = this.squash;
    const S = this.def.scale || 1;
    const jitter = frozen && sq > 0 ? (Math.random() - 0.5) * 0.06 * sq : 0;
    this.body.scale.set(S * (1 + sq * 0.12 + jitter), S * (1 - sq * 0.16), S * (1 + sq * 0.12 - jitter));
    if (this.cape) this.cape.update(dt, vel);
  }

  // Arm stretch, hit-flash glow and bruises from these values (the match recap drives them too).
  looks(smearL, smearR, flash, damage) {
    const J = this.J;
    J.uaL.scale.set(1, 1 + smearL * 0.45, 1); J.faL.scale.set(1, 1 + smearL * 0.6, 1);
    J.elL.position.y = -0.3 * (1 + smearL * 0.45); J.handL.position.y = -0.28 * (1 + smearL * 0.6);
    J.uaR.scale.set(1, 1 + smearR * 0.45, 1); J.faR.scale.set(1, 1 + smearR * 0.6, 1);
    J.elR.position.y = -0.3 * (1 + smearR * 0.45); J.handR.position.y = -0.28 * (1 + smearR * 0.6);
    for (const m of this.mats) {
      m.emissive.setScalar(flash > 0.5 ? 1 : flash * 0.6);
      m.userData.u.uDamage.value = damage;
    }
  }

  handWorld(side, out) { return this.J['hand' + side].getWorldPosition(out); }
  headWorld(out) { return this.J.head.getWorldPosition(out); }
  chestWorld(out) { return this.J.chest.getWorldPosition(out); }
  setVisible(v) { this.root.visible = v; if (this.cape) this.cape.mesh.visible = v; }
}

// Verlet cloth cape pinned to the shoulders. Simulated relative to the character so
// 150 m/s launches don't explode it; apparent wind from velocity makes it stream.
class Cape {
  constructor(scene, material, model) {
    this.model = model;
    this.W = 7; this.H = 11;
    const W = this.W, H = this.H;
    this.rest = 0.13;
    this.p = []; this.pp = [];
    this.geo = new THREE.PlaneGeometry(1, 1, W - 1, H - 1);
    const mat = material.clone();
    mat.side = THREE.DoubleSide;
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    this.anchorsLocal = [];
    for (let i = 0; i < W; i++) this.anchorsLocal.push(new THREE.Vector3(-0.21 + (i / (W - 1)) * 0.42, 0.28, -0.14));
    this.lastRoot = new THREE.Vector3();
    this.inited = false;
  }

  _init() {
    const W = this.W, H = this.H;
    this.model.root.updateMatrixWorld(true);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const a = this.anchorsLocal[i].clone();
      a.y -= j * this.rest;
      a.z -= 0.02 * j;
      this.model.J.chest.localToWorld(a);
      this.p.push(a.clone()); this.pp.push(a.clone());
    }
    this.lastRoot.copy(this.model.root.position);
    this.inited = true;
  }

  update(dt, vel) {
    if (!this.inited) this._init();
    const W = this.W, H = this.H;
    const root = this.model.root.position;
    const delta = _v.subVectors(root, this.lastRoot);
    if (delta.lengthSq() > 400) delta.set(0, 0, 0); // teleports
    for (let i = 0; i < this.p.length; i++) { this.p[i].add(delta); this.pp[i].add(delta); }
    this.lastRoot.copy(root);
    if (dt <= 0) { this._write(); return; }
    const h = Math.min(dt, 1 / 30);
    const wind = _w.copy(vel || _w.set(0, 0, 0)).multiplyScalar(-0.5);
    const wl = wind.length();
    if (wl > 30) wind.multiplyScalar(30 / wl);
    wind.y -= 9;
    // flutter
    const t = performance.now() * 0.001;
    this.model.J.chest.updateMatrixWorld(true);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (j === 0) {
        this.p[k].copy(this.anchorsLocal[i]);
        this.model.J.chest.localToWorld(this.p[k]);
        this.pp[k].copy(this.p[k]);
        continue;
      }
      const p = this.p[k], pp = this.pp[k];
      const flutter = Math.sin(t * 13 + j * 0.9 + i * 0.6) * Math.min(1, wl / 20) * 6;
      const vx = (p.x - pp.x) * 0.96, vy = (p.y - pp.y) * 0.96, vz = (p.z - pp.z) * 0.96;
      pp.copy(p);
      p.x += vx + (wind.x + flutter * 0.3) * h * h;
      p.y += vy + (wind.y + flutter) * h * h;
      p.z += vz + (wind.z + flutter * 0.3) * h * h;
    }
    const chest = this.model.chestWorld(new THREE.Vector3());
    const S = this.model.def.scale || 1;
    for (let it = 0; it < 4; it++) {
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const k = j * W + i;
        if (i < W - 1) this._con(k, k + 1, this.rest * 0.72 * S, j === 0);
        if (j < H - 1) this._con(k, k + W, this.rest * S, j === 0);
      }
      // keep the cape off the body
      for (let k = W; k < this.p.length; k++) {
        const p = this.p[k];
        _v.subVectors(p, chest);
        const d = _v.length(), r = 0.3 * S;
        if (d < r) p.addScaledVector(_v.normalize(), r - d);
      }
    }
    this._write();
  }

  _con(a, b, rest, pinA) {
    const pa = this.p[a], pb = this.p[b];
    _v.subVectors(pb, pa);
    const d = _v.length() || 1e-6;
    const diff = (d - rest) / d;
    if (pinA) pb.addScaledVector(_v, -diff);
    else { pa.addScaledVector(_v, diff * 0.5); pb.addScaledVector(_v, -diff * 0.5); }
  }

  _write() {
    const pos = this.geo.attributes.position.array;
    for (let k = 0; k < this.p.length; k++) { pos[k * 3] = this.p[k].x; pos[k * 3 + 1] = this.p[k].y; pos[k * 3 + 2] = this.p[k].z; }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

export const HEROES = {
  heir: {
    name: 'heir', display: 'THE HEIR', scale: 1.12, build: 1.0, mask: true, chestStripe: false,
    colors: {
      torso: 0xffd21f, arms: 0xffd21f, gloves: 0x1f4fbf, legs: 0x1d47a8, boots: 0x173c8f,
      head: 0x1f4fbf, hair: 0x15151c, eyes: 0xf4f7ff, skin: 0x1f4fbf, accent: 0x1f4fbf, dark: 0x111111,
      emblem: 0x1f4fbf, belt: 0x1d47a8,
    },
  },
  patriarch: {
    name: 'patriarch', display: 'THE PATRIARCH', scale: 1.2, build: 1.12, mask: false, mustache: true, cape: true, belt: true, emblem: true,
    colors: {
      torso: 0xf3f1ec, arms: 0xf3f1ec, gloves: 0xd21d22, legs: 0xf3f1ec, boots: 0xd21d22,
      head: 0xe2ad85, hair: 0x18161a, eyes: 0xffffff, skin: 0xe2ad85, accent: 0xd21d22, dark: 0x111111,
      cape: 0xd01c24, emblem: 0xd21d22, belt: 0xd21d22,
    },
  },
};
