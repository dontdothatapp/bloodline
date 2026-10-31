export default async function (page) {
  const r = await page.evaluate(() => {
    const G = window.__G, W = G.physics.world, R = G.physics.R;
    W.timestep = 1 / 60;
    const s = G.destruction.structs.slice().sort((a, b) => b.chunkIds.length - a.chunkIds.length)[0];
    G.destruction.ensureColliders(s);
    const pre = [];
    for (let i = 0; i < 4; i++) { const t = performance.now(); W.step(G.physics.events); pre.push(+(performance.now() - t).toFixed(1)); }
    const c = s.min.clone().add(s.max).multiplyScalar(0.5);
    for (let i = 0; i < 10; i++) G.destruction.impact({ pos: new G.three.Vector3(s.min.x - 2 + i * 3, c.y, c.z), radius: 3.2, power: 1.3, vel: new G.three.Vector3(120, 0, 0) });
    const ts = [];
    for (let i = 0; i < 6; i++) { const t = performance.now(); W.step(G.physics.events); ts.push(+(performance.now() - t).toFixed(1)); G.physics.events.drainContactForceEvents(() => {}); }
    // now: 80 fresh bodies far away in open air
    const t0 = performance.now();
    for (let i = 0; i < 80; i++) {
      const b = W.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(150 + (i % 10) * 3, 80, 150 + Math.floor(i / 10) * 3).setLinvel(50, 10, 0));
      W.createCollider(R.ColliderDesc.cuboid(1, 1, 0.4), b);
    }
    const t1 = performance.now();
    const ts2 = [];
    for (let i = 0; i < 4; i++) { const t = performance.now(); W.step(G.physics.events); ts2.push(+(performance.now() - t).toFixed(1)); G.physics.events.drainContactForceEvents(() => {}); }
    return { preImpact: pre, afterImpact: ts, create80: +(t1 - t0).toFixed(1), after80open: ts2 };
  });
  console.log(JSON.stringify(r));
}
