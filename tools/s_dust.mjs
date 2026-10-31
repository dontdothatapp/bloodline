// dust readability: brawl at the foot of a collapsing tower, normal gameplay camera
export default async function (page, out) {
  const snap = async (tag) => page.screenshot({ path: out.replace('.png', `_${tag}.png`), timeout: 180000 });
  await page.evaluate(() => window.__test.advance(2.3));
  await page.evaluate(() => { window.__test.fightAtTower(0); window.__test.advance(0.3); window.__test.collapseTower(2, 0); });
  for (const [t, tag] of [[1.6, 'a'], [1.5, 'b'], [2.5, 'c']]) {
    await page.evaluate((t) => { window.__test.fightAtTower(0); window.__test.advance(t); }, t);
    await snap(tag);
  }
  console.log(JSON.stringify(await page.evaluate(() => ({ smoke: window.__G.fx.smoke.n, cap: window.__G.fx.smoke.cap }))));
}
