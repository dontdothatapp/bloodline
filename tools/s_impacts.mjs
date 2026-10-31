export default async function (page) {
  await page.evaluate(() => {
    const G = window.__G;
    // pick a tall building and punch through it
    const s = G.destruction.structs.slice().sort((a, b) => (b.max.y - a.max.y))[0];
    const c = s.min.clone().add(s.max).multiplyScalar(0.5);
    window.__target = { c: c.toArray(), min: s.min.toArray(), max: s.max.toArray() };
    window.__test.cam(c.x + 70, 50, c.z + 90, c.x, 35, c.z);
    for (let i = 0; i < 14; i++) {
      window.__test.impact(s.min.x - 2 + i * 3, 30 + i * 0.3, c.z, 3.2, 1.3, 120, 0, 0);
    }
    window.__test.impact(s.min.x + 4, 12, s.max.z, 6, 1.5, 0, 0, -60);
    window.__test.ground(c.x + 40, c.z + 40, 150);
  });
  await page.waitForTimeout(2500);
}
