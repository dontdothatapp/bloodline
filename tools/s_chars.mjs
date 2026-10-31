export default async function (page, out) {
  const snap = async (tag) => page.screenshot({ path: out.replace('.png', `_${tag}.png`), timeout: 120000 });
  await page.evaluate(() => window.__test.advance(2.2));
  // side view of both fighters
  const cam = () => page.evaluate(() => {
    const G = window.__G, p = G.player.pos, b = G.bot.pos;
    const mid = p.clone().lerp(b, 0.5);
    const ab = b.clone().sub(p).normalize();
    const side = new G.three.Vector3().crossVectors(ab, new G.three.Vector3(0, 1, 0)).normalize();
    window.__test.cam(mid.x + side.x * 5.5, mid.y + 0.8, mid.z + side.z * 5.5, mid.x, mid.y + 0.2, mid.z);
  });
  // bring them close
  await page.evaluate(() => { const G = window.__G; G.bot.pos.copy(G.player.pos).add(new G.three.Vector3(2.6, 0.3, 0.4)); });
  await page.evaluate(() => window.__test.advance(0.4));
  await cam(); await page.evaluate(() => window.__test.advance(0.02));
  await snap('a_idle');
  await page.keyboard.press('KeyJ');
  await page.evaluate(() => window.__test.advance(0.1));
  await cam(); await page.evaluate(() => window.__test.advance(0.01));
  await snap('b_jab');
  await page.keyboard.press('KeyJ');
  await page.evaluate(() => window.__test.advance(0.18));
  await page.keyboard.press('KeyJ');
  await page.evaluate(() => window.__test.advance(0.2));
  await cam(); await page.evaluate(() => window.__test.advance(0.01));
  await snap('c_hook');
  console.log(JSON.stringify(await page.evaluate(() => window.__test.state())));
  // patriarch close-up with cape, flying
  await page.evaluate(() => {
    const G = window.__G, b = G.bot;
    b.vel.set(0, 0, 45); b.boosting = true; b.flyBlend = 1;
    const p = b.pos;
    window.__test.cam(p.x + 4, p.y + 1.5, p.z - 3, p.x, p.y, p.z);
  });
  await page.evaluate(() => window.__test.advance(0.02));
  await snap('d_cape');
}
