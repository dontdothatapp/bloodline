// Camera-facing ribbon trails (fist swooshes, flight streaks).
import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

export class Trail {
  constructor(scene, { points = 24, width = 0.4, color = 0xffffff, life = 0.2, additive = true } = {}) {
    this.max = points;
    this.width = width;
    this.life = life;
    this.pts = [];
    const geo = new THREE.BufferGeometry();
    this.posArr = new Float32Array(points * 2 * 3);
    this.alphaArr = new Float32Array(points * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphaArr, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < points - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 1 } },
      vertexShader: /* glsl */`attribute float alpha; varying float vA; void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vA = alpha * smoothstep(2.5, 9.0, -mv.z); // never smear across the lens
        gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uAlpha; varying float vA; void main(){ float a = vA * uAlpha; if (a < 0.01) discard; gl_FragColor = vec4(uColor * a, a); }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
    this.emitting = false;
  }

  push(p, t) {
    if (!this.emitting) return;
    const last = this.pts[this.pts.length - 1];
    if (last && last.p.distanceToSquared(p) < 0.0004) { last.t = t; return; }
    this.pts.push({ p: p.clone(), t });
    if (this.pts.length > this.max) this.pts.shift();
  }

  update(t, camera) {
    while (this.pts.length && t - this.pts[0].t > this.life) this.pts.shift();
    const n = this.pts.length;
    this.geo.setDrawRange(0, n > 1 ? (n - 1) * 6 : 0);
    if (n < 2) return;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i].p;
      const prev = this.pts[Math.max(0, i - 1)].p, next = this.pts[Math.min(n - 1, i + 1)].p;
      _a.subVectors(next, prev);
      _b.subVectors(camera.position, p);
      _c.crossVectors(_a, _b).normalize();
      const age = (t - this.pts[i].t) / this.life;
      const k = i / (n - 1);
      const w = this.width * k * (1 - age * 0.5);
      this.posArr.set([p.x + _c.x * w, p.y + _c.y * w, p.z + _c.z * w, p.x - _c.x * w, p.y - _c.y * w, p.z - _c.z * w], i * 6);
      const a = Math.max(0, k * (1 - age));
      this.alphaArr[i * 2] = a; this.alphaArr[i * 2 + 1] = a;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }

  clear() { this.pts.length = 0; }
}
