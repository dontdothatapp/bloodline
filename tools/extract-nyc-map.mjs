// Cut a fight map out of real Manhattan.
//
// Usage: node tools/extract-nyc-map.mjs <path to a mrdoob/slop-newyork checkout> [out.json]
//
// Reads Slop New York's processed NYC Open Data (building footprints + roof heights in its
// NYB1 binary, curb-line blocks, street centrelines, parks and shorelines in nyc-geodata.js)
// and writes the area around one point as src/world/maps/<id>.json in this game's world frame:
// 1 unit = 1 m, x = Manhattan-grid east, z = grid south (north = -z), origin at MAP.origin.
// Slop New York's frame is turned 29.02° from true north so the street grid is axis-aligned,
// which is what lets real footprints drop straight onto the destruction engine's box cells.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL, fileURLToPath } from 'node:url';

const MAP = {
  id: 'flatiron',
  name: 'Madison Square · Flatiron',
  // centre of the loop 5th Ave / 26th St / Madison Ave / 23rd St (Madison Square Park)
  origin: [77.8, 1394.5],
  detailHalf: 250,      // footprints kept as polygons (destructible candidates) inside this square
  skylineRadius: 1800,  // other buildings, as boxes, out to here
  groundHalf: 2048,     // blocks, parks and shorelines painted out to here
  roadHalf: 600,        // street centrelines (lane markings) out to here
  landmarks: ['Empire State Building', 'Flatiron Building'],
  handBuilt: ['Empire State Building'], // the survey's one-height box on these lots is replaced in-game
  park: 'Madison Square Park',
  // round intro (game/intro.js): the Patriarch drops onto the plaza at the Flatiron's prow, the
  // Heir onto the park's SW lawn ~80 m north, and the establishing shot looks up 5th Ave at the
  // Empire State
  landing: { heir: [52.8, 1454.5], patriarch: [22.8, 1527.5] },
  vista: 'Empire State Building',
  caption: ['NEW YORK CITY', 'Madison Square · Flatiron District'],
  track: { avenues: ['5', 'madison'], streets: [26, 23] }, // elevated train loop around the park
};

const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/extract-nyc-map.mjs <slop-newyork checkout> [out.json]');
  process.exit(1);
}
const out = process.argv[3] || fileURLToPath(new URL(`../src/world/maps/${MAP.id}.json`, import.meta.url));
const { GEO } = await import(pathToFileURL(path.join(src, 'js/nyc-geodata.js')).href);
const [OX, OZ] = MAP.origin;
const r1 = (v) => Math.round(v * 10) / 10;

// --- NYB1: metadata stream + zigzag-varint X / Z delta streams, 0.5 m grid (see slop-newyork tools/build-buildings.py)
function decodeBuildings(file) {
  const data = zlib.gunzipSync(fs.readFileSync(file));
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (dv.getUint32(0, true) !== 0x3142594e) throw new Error('not an NYB1 file');
  const xStart = 12 + dv.getUint32(4, true), zStart = xStart + dv.getUint32(8, true);
  const stream = (start) => {
    let c = start;
    return () => { let v = 0, s = 0, b; do { b = data[c++]; v |= (b & 127) << s; s += 7; } while (b & 128); return v; };
  };
  const meta = stream(12), xs = stream(xStart), zs = stream(zStart);
  const zz = (v) => (v >>> 1) ^ -(v & 1);
  const list = [];
  let x = 0, z = 0;
  for (let n = meta(); n > 0; n--) {
    const height = meta(), decade = meta(), polygons = [];
    for (let p = meta(); p > 0; p--) {
      const rings = [];
      for (let r = meta(); r > 0; r--) {
        const ring = [];
        for (let k = meta(); k > 0; k--) { x += zz(xs()); z += zz(zs()); ring.push([x * 0.5 - OX, z * 0.5 - OZ]); }
        rings.push(ring);
      }
      polygons.push(rings);
    }
    const all = polygons.flat(2);
    list.push({
      height, year: decade ? (decade + 159) * 10 : 0, polygons,
      minX: Math.min(...all.map((q) => q[0])), maxX: Math.max(...all.map((q) => q[0])),
      minZ: Math.min(...all.map((q) => q[1])), maxZ: Math.max(...all.map((q) => q[1])),
    });
  }
  return list;
}

const pairs = (flat) => { const o = []; for (let i = 0; i < flat.length; i += 2) o.push([flat[i] - OX, flat[i + 1] - OZ]); return o; };
const flatten = (pts) => pts.flatMap(([x, z]) => [r1(x), r1(z)]);
const bboxOf = (pts) => pts.reduce((b, [x, z]) => [Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z)], [Infinity, Infinity, -Infinity, -Infinity]);
const within = (b, h) => b[2] > -h && b[0] < h && b[3] > -h && b[1] < h;

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, az] = pts[0], [bx, bz] = pts[pts.length - 1];
  const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
  let worst = -1, wd = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / l;
    if (d > wd) { wd = d; worst = i; }
  }
  if (wd <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, worst + 1), eps).slice(0, -1), ...rdp(pts.slice(worst), eps)];
}
// closed ring: split at the point farthest from the first, so neither half is degenerate
function rdpRing(ring, eps) {
  let f = 0, fd = -1;
  ring.forEach(([x, z], i) => { const d = Math.hypot(x - ring[0][0], z - ring[0][1]); if (d > fd) { fd = d; f = i; } });
  return [...rdp(ring.slice(0, f + 1), eps).slice(0, -1), ...rdp([...ring.slice(f), ring[0]], eps).slice(0, -1)];
}

function inRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const inPolygon = (rings, x, z) => inRing(rings[0], x, z) && !rings.slice(1).some((h) => inRing(h, x, z));

// Footprint -> a few axis-aligned boxes: rasterise on a world-aligned grid (claimed cells are
// never reused, so neighbours tile without overlapping), then greedily merge into rectangles.
const claimed = new Set();
function boxes(b, cell) {
  const i0 = Math.floor(b.minX / cell), i1 = Math.ceil(b.maxX / cell), k0 = Math.floor(b.minZ / cell), k1 = Math.ceil(b.maxZ / cell);
  const w = i1 - i0, h = k1 - k0;
  const occ = new Uint8Array(w * h);
  for (let k = 0; k < h; k++) for (let i = 0; i < w; i++) {
    const x = (i0 + i + 0.5) * cell, z = (k0 + k + 0.5) * cell, key = `${cell}:${i0 + i},${k0 + k}`;
    if (!claimed.has(key) && b.polygons.some((p) => inPolygon(p, x, z))) { occ[k * w + i] = 1; claimed.add(key); }
  }
  const rects = [];
  for (let k = 0; k < h; k++) for (let i = 0; i < w; i++) {
    if (!occ[k * w + i]) continue;
    let iw = 1;
    while (i + iw < w && occ[k * w + i + iw]) iw++;
    let kh = 1;
    while (k + kh < h) {
      let full = true;
      for (let t = 0; t < iw; t++) if (!occ[(k + kh) * w + i + t]) { full = false; break; }
      if (!full) break;
      kh++;
    }
    for (let kk = 0; kk < kh; kk++) for (let t = 0; t < iw; t++) occ[(k + kk) * w + i + t] = 0;
    rects.push([(i0 + i) * cell, (k0 + k) * cell, (i0 + i + iw) * cell, (k0 + k + kh) * cell]);
  }
  // slivers smaller than a cell: keep their bounding box
  if (!rects.length && (b.maxX - b.minX) * (b.maxZ - b.minZ) > 12) rects.push([b.minX, b.minZ, b.maxX, b.maxZ]);
  return rects;
}

// ---------------------------------------------------------------------------------------------------------------------
const buildings = decodeBuildings(path.join(src, 'js/building-geodata.bin.gz'));
const reserved = MAP.handBuilt.map((name) => pairs(GEO.landmarks[name].ring));
const detail = [], skyline = [];
for (const b of buildings) {
  const bb = [b.minX, b.minZ, b.maxX, b.maxZ];
  if (reserved.some((ring) => inRing(ring, (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2))) continue;
  if (within(bb, MAP.detailHalf)) {
    detail.push([b.height, b.year, b.polygons.map((rings) => rings.map(flatten))]);
    continue;
  }
  const d = Math.hypot((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
  if (d > MAP.skylineRadius || b.height < 8) continue;
  if (d > 1000 && b.height < 30) continue; // lost in the haze anyway
  const rects = boxes(b, d < 700 ? 3 : 6);
  if (rects.length) skyline.push([b.height, b.year, rects.flat().map(r1)]); // [h, year, [x0, z0, x1, z1, ...]]
}

const blocks = [];
for (const blk of GEO.blocks) {
  const ring = pairs(blk[0]);
  if (!within(bboxOf(ring), MAP.groundHalf)) continue;
  blocks.push([flatten(ring), blk[3] || '']);
}

const roads = [];
for (const [name, w, dir, lanes, , pts] of GEO.roads) {
  const p = pairs(pts);
  if (!within(bboxOf(p), MAP.roadHalf)) continue;
  roads.push([name, w, dir === 'TW' ? 2 : 1, lanes, flatten(p)]); // 2: two-way, 1: one-way
}

const parks = [];
for (const p of GEO.parks) {
  const rings = p.rings.map(pairs);
  if (!within(bboxOf(rings[0]), MAP.groundHalf)) continue;
  parks.push([p.name, rings.map((r) => flatten(rdpRing(r, 1)))]);
}

// Sutherland-Hodgman against the square |x|, |z| <= h (fine for concave rings that only get filled)
function clipSquare(ring, h) {
  let pts = ring;
  for (const [axis, sign] of [[0, 1], [0, -1], [1, 1], [1, -1]]) {
    const inside = (p) => p[axis] * sign <= h;
    const cut = (a, b) => { const t = (sign * h - a[axis]) / (b[axis] - a[axis]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (inside(a)) { next.push(a); if (!inside(b)) next.push(cut(a, b)); } else if (inside(b)) next.push(cut(a, b));
    }
    pts = next;
    if (!pts.length) break;
  }
  return pts;
}
const land = [];
const addLand = (name, flat) => {
  const ring = clipSquare(pairs(flat), MAP.groundHalf * 1.25);
  if (ring.length >= 3) land.push([name, flatten(rdpRing(ring, 3))]);
};
addLand('manhattan', GEO.manhattan);
for (const [name, polys] of Object.entries(GEO.boroughs)) for (const flat of polys) addLand(name, flat);
for (const [name, flat] of Object.entries(GEO.islands)) addLand(name, flat);

const landmarks = {};
for (const name of MAP.landmarks) {
  const l = GEO.landmarks[name];
  if (l) landmarks[name] = { h: l.h, ring: flatten(pairs(l.ring)) };
}

const aveX = (id) => GEO.avenues.find((a) => a.id === id).x - OX;
const streetZ = (n) => GEO.streets.find((st) => st.n === n).z - OZ;
const [xa, xb] = MAP.track.avenues.map(aveX), [za, zb] = MAP.track.streets.map(streetZ);
const track = { x0: r1(Math.min(xa, xb)), x1: r1(Math.max(xa, xb)), z0: r1(Math.min(za, zb)), z1: r1(Math.max(za, zb)) };

const result = {
  id: MAP.id,
  name: MAP.name,
  frame: { origin: MAP.origin, bearingDeg: GEO.frame.bearingDeg, note: 'x = Manhattan-grid east, z = grid south, metres' },
  attribution: 'Building footprints & roof heights, street centrelines (CSCL), parks and borough boundaries: NYC Open Data. '
    + 'Processed by Slop New York (github.com/mrdoob/slop-newyork, MIT).',
  buildings: detail,
  skyline,
  blocks,
  roads,
  parks,
  land,
  landmarks,
  park: MAP.park,
  landing: Object.fromEntries(Object.entries(MAP.landing).map(([k, [x, z]]) => [k, [r1(x - OX), r1(z - OZ)]])),
  vista: pairs(GEO.landmarks[MAP.vista].ring).reduce((a, [x, z], i, all) => [a[0] + x / all.length, a[1] + z / all.length], [0, 0]).map(r1),
  caption: MAP.caption,
  track,
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result));
const kb = (v) => (JSON.stringify(v).length / 1024).toFixed(0) + ' KB';
console.log(`[map] ${MAP.id}: ${detail.length} footprints, ${skyline.length} skyline buildings, ${blocks.length} blocks, ${roads.length} roads, `
  + `${parks.length} parks, ${land.length} land polygons -> ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
for (const k of ['buildings', 'skyline', 'blocks', 'roads', 'parks', 'land']) console.log(`  ${k}: ${kb(result[k])}`);
