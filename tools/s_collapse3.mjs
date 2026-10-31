export default async function (page, out) {
  const snap = async (tag) => page.screenshot({ path: out.replace('.png', `_${tag}.png`), timeout: 120000 });
  const info = await page.evaluate(() => {
    const r = window.__test.collapseTower(3, 0);
    const [x, y, z] = r.c;
    window.__test.cam(x - 90, 75, z - 100, x, r.top * 0.3, z);
    return r;
  });
  for (const [t, tag] of [[2.0, 'a'], [2.0, 'b'], [8, 'c']]) {
    await page.evaluate((t) => window.__test.advance(t), t);
    await snap(tag);
  }
  await page.evaluate((c) => window.__test.cam(c[0] - 40, 35, c[2] - 45, c[0], 0, c[2]), info.c);
  await page.evaluate(() => window.__test.advance(0.05));
  await snap('d');
}
