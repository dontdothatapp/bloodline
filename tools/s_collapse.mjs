export default async function (page, out) {
  const snap = async (tag) => page.screenshot({ path: out.replace('.png', `_${tag}.png`), timeout: 120000 });
  const info = await page.evaluate(() => {
    const r = window.__test.collapseTower(3, 0);
    const [x, y, z] = r.c;
    window.__test.cam(x + 95, 45, z + 120, x, r.top * 0.45, z);
    return r;
  });
  console.log('collapse', JSON.stringify(info));
  const st = async () => console.log(JSON.stringify(await page.evaluate(() => ({ s: window.__test.state(), col: window.__G.destruction.collapses.length, sim: window.__stats }))));
  for (const [t, tag] of [[0.4, 'a'], [1.0, 'b'], [1.6, 'c'], [3.0, 'd'], [5, 'e']]) {
    await page.evaluate((t) => window.__test.advance(t), t);
    await snap(tag); await st();
  }
}
