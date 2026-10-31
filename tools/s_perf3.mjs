export default async function (page) {
  const r = await page.evaluate(() => {
    const G = window.__G, W = G.physics.world;
    const time = (n) => { const ts = []; for (let i = 0; i < n; i++) { const a = performance.now(); G.physics.step(1 / 60); ts.push(performance.now() - a); } return +(ts.reduce((a, b) => a + b, 0) / n).toFixed(2); };
    const out = { bodies0: W.bodies.len(), colliders0: W.colliders.len(), idle: time(30) };
    const s = G.destruction.structs.slice().sort((a, b) => b.chunkIds.length - a.chunkIds.length)[0];
    const c = s.min.clone().add(s.max).multiplyScalar(0.5);
    for (let i = 0; i < 10; i++) G.destruction.impact({ pos: new G.three.Vector3(s.min.x - 2 + i * 3, c.y, c.z), radius: 3.2, power: 1.3, vel: new G.three.Vector3(120, 0, 0) });
    out.afterImpact = { bodies: W.bodies.len(), colliders: W.colliders.len(), active: G.debris.activeCount };
    out.step = time(30);
    let awake = 0; W.forEachRigidBody((b) => { if (!b.isSleeping() && b.isDynamic()) awake++; }); out.awake = awake;
    // remove cars
    for (const car of G.props.cars) { W.removeRigidBody(car.body); car.alive = false; }
    out.noCars = time(30);
    // remove debris
    for (const rec of G.debris.active.slice()) G.debris._kill(rec);
    out.noDebris = time(30);
    return out;
  });
  console.log(JSON.stringify(r));
}
