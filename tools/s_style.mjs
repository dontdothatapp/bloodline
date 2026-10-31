// new-style checks: fight with dust (auto), and a view out past the arena edge
export default async function (page, out) {
  const snap = async (tag) => page.screenshot({ path: out.replace('.png', `_${tag}.png`), timeout: 180000 });
  for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__test.advance(3.2)); await snap('fight' + i); }
  console.log(JSON.stringify(await page.evaluate(() => ({ smoke: window.__G.fx.smoke.n, s: window.__test.state() }))));
  await page.evaluate(() => window.__test.cam(-200, 70, -200, -400, 30, -380));
  await page.evaluate(() => window.__test.advance(0.05));
  await snap('edge');
  await page.evaluate(() => window.__test.cam(0, 260, 380, 0, 0, 0));
  await page.evaluate(() => window.__test.advance(0.05));
  await snap('aerial');
}
