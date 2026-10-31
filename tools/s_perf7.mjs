export default async function (page) {
  const variant = process.env.VARIANT;
  const r = await page.evaluate((variant) => {
    const G = window.__G, W = G.physics.world, R = G.physics.R;
    if (variant === 'nohf') {
      W.removeCollider(G.physics.groundCollider, false);
      G.physics.groundCollider = W.createCollider(R.ColliderDesc.cuboid(300, 1, 300).setTranslation(0, -1, 0));
      G.ground.update = () => {};
    }
    if (variant === 'nointact') {
      for (const s of G.destruction.structs) if (s.intactCollider) { W.removeCollider(s.intactCollider, false); s.intactCollider = null; }
    }
    if (variant === 'nocars') { for (const car of G.props.cars) { W.removeRigidBody(car.body); car.alive = false; } }
    W.timestep = 1 / 60;
    for (let i = 0; i < 3; i++) W.step(G.physics.events);
    const s = G.destruction.structs.slice().sort((a, b) => b.chunkIds.length - a.chunkIds.length)[0];
    const c = s.min.clone().add(s.max).multiplyScalar(0.5);
    for (let i = 0; i < 10; i++) G.destruction.impact({ pos: new G.three.Vector3(s.min.x - 2 + i * 3, c.y, c.z), radius: 3.2, power: 1.3, vel: new G.three.Vector3(120, 0, 0) });
    const ts = [];
    for (let i = 0; i < 6; i++) { const t = performance.now(); W.step(G.physics.events); ts.push(+(performance.now() - t).toFixed(1)); G.physics.events.drainContactForceEvents(() => {}); }
    return { variant, n: G.debris.activeCount, colliders: W.colliders.len(), ts };
  }, variant);
  console.log(JSON.stringify(r));
}
