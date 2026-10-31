export default async function (page) {
  const r = await page.evaluate(() => {
    const G = window.__G, W = G.physics.world, R = G.physics.R;
    const time = (n) => { const ts = []; for (let i = 0; i < n; i++) { const a = performance.now(); G.physics.step(1 / 60); ts.push(performance.now() - a); } return +(ts.reduce((a, b) => a + b, 0) / n).toFixed(2); };
    const s = G.destruction.structs.slice().sort((a, b) => b.chunkIds.length - a.chunkIds.length)[0];
    const c = s.min.clone().add(s.max).multiplyScalar(0.5);
    for (let i = 0; i < 10; i++) G.destruction.impact({ pos: new G.three.Vector3(s.min.x - 2 + i * 3, c.y, c.z), radius: 3.2, power: 1.3, vel: new G.three.Vector3(120, 0, 0) });
    const out = { step: time(20) };
    const sleeping = G.props.cars.filter((c) => c.body.isSleeping()).length;
    out.carsSleeping = sleeping;
    // variant A: cars only collide with ground + chars
    const groups = (m, f) => ((m & 0xffff) << 16) | (f & 0xffff);
    for (const car of G.props.cars) car.col.setCollisionGroups(groups(16, 1 | 32));
    out.carsNoDebris = time(20);
    for (const car of G.props.cars) car.col.setCollisionGroups(groups(16, 0xffff));
    out.restored = time(20);
    // variant B: convert cars to fixed temporarily
    for (const car of G.props.cars) car.body.setBodyType(R.RigidBodyType.Fixed, false);
    out.carsFixed = time(20);
    return out;
  });
  console.log(JSON.stringify(r));
}
