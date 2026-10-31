// The static outer ground must stop at the deformable zone's edge, and in the procedural city at
// the lake shore too: a plane running on under the heightfield lids every crater with its own
// coarse texture and z-fights with the ground from the air (docs/BACKLOG.md, item 2).
// node tools/shot.mjs "http://localhost:5173/?fight&norender&mute" /tmp/ground.png 4000 tools/s_ground.mjs
// node tools/shot.mjs "http://localhost:5173/?fight&norender&mute&map=grid" /tmp/ground.png 4000 tools/s_ground.mjs
export const check = () => {
  const G = window.__G, THREE = G.three;
  const outer = G.scene.getObjectByName('outer-ground');
  const lake = G.scene.getObjectByName('lake');
  const hits = (obj, x, z) => !!obj && new THREE.Raycaster(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0)).intersectObject(obj, false).length > 0;
  const S = G.ground.size / 2; // half the deformable zone
  const map = new URLSearchParams(location.search).get('map') || 'flatiron';
  const r = {
    map,
    zoneHidden: [hits(outer, 0, 0), hits(outer, S - 1, S - 1), hits(outer, -S + 1, 0), hits(outer, 0, -S + 1)], // all must be false
    ringThere: [hits(outer, S + 1, 0), hits(outer, 0, -S - 1), hits(outer, -S - 1, -S - 1), hits(outer, -1500, 1500)], // all true
  };
  if (map === 'grid') {
    r.lakeThere = hits(lake, 1200, 0);     // true
    r.underLake = hits(outer, 1200, 0);    // false: the ring stops at the shore
  }
  r.pass = r.zoneHidden.every((h) => !h) && r.ringThere.every((h) => h) && (map !== 'grid' || (r.lakeThere && !r.underLake));
  return r;
};

export default async function (page) {
  const r = await page.evaluate(`(${check.toString()})()`);
  console.log(r.pass ? 'PASS' : 'FAIL', JSON.stringify(r));
}
