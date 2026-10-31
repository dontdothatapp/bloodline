export default async function (page) {
  const r = await page.evaluate(() => {
    const G = window.__G, W = G.physics.world;
    const groups = (m, f) => ((m & 0xffff) << 16) | (f & 0xffff);
    const s = G.destruction.structs.slice().sort((a, b) => b.chunkIds.length - a.chunkIds.length)[0];
    const c = s.min.clone().add(s.max).multiplyScalar(0.5);
    for (let i = 0; i < 10; i++) G.destruction.impact({ pos: new G.three.Vector3(s.min.x - 2 + i * 3, c.y, c.z), radius: 3.2, power: 1.3, vel: new G.three.Vector3(120, 0, 0) });
    for (const r of G.debris.active) r.collider.setCollisionGroups(groups(4, 1 | 4 | 8 | 16 | 32));
    const out = {};
    W.timestep = 1 / 60;
    let t = performance.now(); W.step(G.physics.events); out.step1_noStatic = +(performance.now() - t).toFixed(1);
    t = performance.now(); W.step(G.physics.events); out.step2 = +(performance.now() - t).toFixed(1);
    for (const r of G.debris.active) r.collider.setCollisionGroups(groups(4, 0xffff));
    t = performance.now(); W.step(G.physics.events); out.step3_staticBack = +(performance.now() - t).toFixed(1);
    t = performance.now(); W.step(G.physics.events); out.step4 = +(performance.now() - t).toFixed(1);
    G.physics.events.drainContactForceEvents(() => {});
    return out;
  });
  console.log(JSON.stringify(r));
}
