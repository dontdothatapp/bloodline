export default async function (page, out) {
  const snap = async (tag) => page.screenshot({ path: out.replace('.png', `_${tag}.png`), timeout: 120000 });
  const adv = (s) => page.evaluate((s) => window.__test.advance(s), s);
  const st = () => page.evaluate(() => JSON.stringify(window.__test.state()));
  await adv(2.3);
  await snap('0idle');
  await page.keyboard.down('KeyK');
  await adv(0.05);
  await adv(1.0);
  await snap('1charge');
  await page.keyboard.up('KeyK');
  await adv(0.05);
  await adv(0.12);
  await snap('2hit');
  console.log('after hit', await st());
  await adv(0.6);
  await snap('3fly');
  console.log('fly', await st());
  await adv(2.5);
  await snap('4after');
  console.log('after', await st());
}
