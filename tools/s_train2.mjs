export default async function (page) {
  const r = await page.evaluate(() => {
    const G = window.__G, T = G.train, b = G.bot;
    window.__test.advance(2.0);
    const car = T.cars[2].mesh.position.clone();
    b.pos.set(car.x - 25, car.y + 2, car.z - 25);
    b.launch(new G.three.Vector3(1, 0, 1).normalize(), 120, G.player);
    const log = [];
    let calls = 0;
    const os = T.sweep.bind(T); T.sweep = (p, v) => { calls++; return os(p, v); };
    for (let i = 0; i < 30; i++) {
      window.__test.advance(1 / 60);
      const c = T.cars[2].mesh.position;
      log.push([+b.pos.x.toFixed(1), +b.pos.z.toFixed(1), +(b.pos.x - c.x).toFixed(1), +(b.pos.z - c.z).toFixed(1), b.state, +b.vel.length().toFixed(0)]);
    }
    return { calls, derailed: T.derailed, log: log.filter((_, i) => i % 3 === 0) };
  });
  console.log(JSON.stringify(r));
}
