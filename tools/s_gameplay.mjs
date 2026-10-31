export default async function (page, out) {
  const snap = async (tag) => page.screenshot({ path: out.replace('.png', `_${tag}.png`), timeout: 120000 });
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.__test.advance(2.3 + Math.random()));
    await snap('g' + i);
  }
}
