export default async function (page, out) {
  const snap = async (tag) => page.screenshot({ path: out.replace('.png', `_${tag}.png`), timeout: 120000 });
  await page.evaluate(() => window.__test.advance(2.0));
  const p = await page.evaluate(() => { const c = window.__G.train.cars[1].mesh.position; window.__test.cam(c.x + 18, 18, c.z + 22, c.x, 7, c.z); return c.toArray(); });
  await page.evaluate(() => window.__test.advance(0.05));
  await snap('a');
  // smash a fighter through the train
  await page.evaluate(() => {
    const G = window.__G, car = G.train.cars[2].mesh.position;
    const b = G.bot;
    b.pos.set(car.x - 25, car.y + 2, car.z - 25);
    b.launch(new G.three.Vector3(1, 0, 1).normalize(), 120, G.player);
  });
  await page.evaluate(() => window.__test.advance(0.5));
  await snap('b');
  await page.evaluate(() => window.__test.advance(2.0));
  await snap('c');
  console.log(JSON.stringify(await page.evaluate(() => ({ derailed: window.__G.train.derailed, cars: window.__G.train.cars.map((c) => c.mesh.position.toArray().map((v) => +v.toFixed(1))) }))));
}
