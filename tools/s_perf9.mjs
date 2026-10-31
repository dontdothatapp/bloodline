export default async function (page) {
  const r = await page.evaluate(() => {
    const G = window.__G, R = G.physics.R;
    const lib = G.debris.lib;
    const runIn = (world, useEvents) => {
      const S = [3, 3.6, 1]; let n = 0;
      for (let c = 0; c < 12; c++) {
        const base = [c * 3 + 100, 40, 100];
        for (const p of lib[c % 4]) {
          const wp = [base[0] + p.centroid.x * S[0], base[1] + p.centroid.y * S[1], base[2] + p.centroid.z * S[2]];
          const b = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...wp).setLinvel(60, 5, 0));
          const pts = new Float32Array(p.hull.length); for (let i = 0; i < pts.length; i++) pts[i] = p.hull[i] * S[i % 3] * 0.86;
          const d = R.ColliderDesc.convexHull(pts);
          if (useEvents) d.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(200);
          world.createCollider(d, b); n++;
        }
      }
      const ts = []; const q = new R.EventQueue(true);
      for (let i = 0; i < 5; i++) { const t = performance.now(); world.timestep = 1 / 60; world.step(q); ts.push(+(performance.now() - t).toFixed(1)); }
      return ts;
    };
    const fresh = new R.World({ x: 0, y: -13, z: 0 }); fresh.numSolverIterations = 2;
    fresh.createCollider(R.ColliderDesc.cuboid(300, 1, 300).setTranslation(0, -1, 0));
    const a = runIn(fresh, false);
    const fresh2 = new R.World({ x: 0, y: -13, z: 0 }); fresh2.numSolverIterations = 2;
    fresh2.createCollider(R.ColliderDesc.cuboid(300, 1, 300).setTranslation(0, -1, 0));
    const b = runIn(fresh2, true);
    const c = runIn(G.physics.world, false);
    return { freshNoEvents: a, freshEvents: b, gameWorld: c, version: R.version() };
  });
  console.log(JSON.stringify(r));
}
