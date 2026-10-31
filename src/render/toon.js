// Cel-shading helpers: stepped gradient ramps and inverted-hull ink outlines.
import * as THREE from 'three';

const rampCache = new Map();
export function gradientMap(steps = 3) {
  if (rampCache.has(steps)) return rampCache.get(steps);
  // Hand-tuned ramps: dark band is not black so shadows stay colorful (comic look).
  const presets = {
    2: [110, 255],
    3: [95, 175, 255],
    4: [80, 140, 200, 255],
  };
  const vals = presets[steps] || presets[3];
  const data = new Uint8Array(vals.length * 4);
  vals.forEach((v, i) => { data.set([v, v, v, 255], i * 4); });
  const tex = new THREE.DataTexture(data, vals.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  rampCache.set(steps, tex);
  return tex;
}

// A cel-stepped rim light for the fighters, its colour and strength set by the weather
// (render/weather.js): it keeps them apart from a dark city at night or in a storm.
export const rimLight = {
  uRimColor: { value: new THREE.Color(1, 0.9, 0.75) },
  uRim: { value: 0.2 },
};
export const RIM_GLSL = /* glsl */`
  { float rim = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
    outgoingLight += uRimColor * uRim * smoothstep(0.58, 0.64, rim); }
  #include <opaque_fragment>`;

export function toonMat(color, opts = {}) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: gradientMap(opts.steps || 3),
    ...opts.params,
  });
}

// Inverted hull outline: back faces pushed out along normals, thickness roughly constant on screen.
export function outlineMaterial(thickness = 0.02, color = 0x0a0a12) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uThickness: { value: thickness },
      uColor: { value: new THREE.Color(color) },
      fogColor: { value: new THREE.Color() },
      fogNear: { value: 1 },
      fogFar: { value: 1000 },
    },
    vertexShader: /* glsl */`
      uniform float uThickness;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        float dist = -mv.z;
        // grow a bit with distance so far characters keep a readable silhouette
        float t = uThickness * clamp(dist * 0.08, 1.0, 6.0);
        mv.xyz += n * t;
        vec4 mvPosition = mv;
        gl_Position = projectionMatrix * mv;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <fog_fragment>
      }`,
    side: THREE.BackSide,
    fog: true,
  });
}

export function addOutline(mesh, mat) {
  const o = new THREE.Mesh(mesh.geometry, mat);
  o.name = 'outline';
  o.castShadow = false;
  o.receiveShadow = false;
  o.renderOrder = -1;
  mesh.add(o);
  return o;
}
