export default async function (page, out) {
  const snap = async (tag) => page.screenshot({ path: out.replace('.png', `_${tag}.png`), timeout: 120000 });
  const info = await page.evaluate(() => {
    const r = window.__test.collapseTower(3, 0);
    const [x, y, z] = r.c;
    window.__test.cam(x - 70, 60, z - 80, x, r.top * 0.35, z);
    return r;
  });
  for (const [t, tag] of [[1.3, 'a'], [0.8, 'b'], [5, 'c']]) {
    await page.evaluate((t) => window.__test.advance(t), t);
    await snap(tag);
  }
  await page.evaluate((c) => window.__test.cam(c[0] + 25, 30, c[2] + 35, c[0], 2, c[2]), info.c);
  await page.evaluate(() => window.__test.advance(0.1));
  await snap('d');
  console.log(JSON.stringify(await page.evaluate(() => window.__test.state())));
}
