export default async function (page) {
  const r = await page.evaluate(() => {
    const G = window.__G, W = G.physics.world;
    const s = G.destruction.structs.slice().sort((a, b) => b.chunkIds.length - a.chunkIds.length)[0];
    const c = s.min.clone().add(s.max).multiplyScalar(0.5);
    let events = 0;
    const orig = G.physics.onContactForce;
    G.physics.onContactForce = (a, b, f) => { events++; orig(a, b, f); };
    for (let i = 0; i < 10; i++) G.destruction.impact({ pos: new G.three.Vector3(s.min.x - 2 + i * 3, c.y, c.z), radius: 3.2, power: 1.3, vel: new G.three.Vector3(120, 0, 0) });
    const speeds = G.debris.active.map((r) => { const v = r.body.linvel(); return Math.hypot(v.x, v.y, v.z); });
    const out = { n: G.debris.activeCount, maxSpeed: Math.max(...speeds).toFixed(0), avgSpeed: (speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(0) };
    W.timestep = 1 / 60;
    let t = performance.now(); W.step(G.physics.events); out.step1 = +(performance.now() - t).toFixed(1);
    t = performance.now(); G.physics.events.drainContactForceEvents((e) => { events++; }); out.drain1 = +(performance.now() - t).toFixed(1);
    out.events1 = events;
    // test: disable CCD-ish by slowing everything
    for (const r of G.debris.active) { const v = r.body.linvel(); r.body.setLinvel({ x: v.x * 0.2, y: v.y * 0.2, z: v.z * 0.2 }, true); }
    t = performance.now(); W.step(G.physics.events); out.stepSlow = +(performance.now() - t).toFixed(1);
    G.physics.events.drainContactForceEvents(() => {});
    for (const r of G.debris.active) { const v = r.body.linvel(); r.body.setLinvel({ x: v.x * 5, y: v.y * 5, z: v.z * 5 }, true); }
    t = performance.now(); W.step(G.physics.events); out.stepFastAgain = +(performance.now() - t).toFixed(1);
    G.physics.events.drainContactForceEvents(() => {});
    return out;
  });
  console.log(JSON.stringify(r));
}
