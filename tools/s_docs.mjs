// Captures the README screenshots.
export default async function (page, out) {
  const dir = out.replace(/[^/]+$/, '');
  const snap = async (name) => page.screenshot({ path: dir + name, timeout: 180000 });
  const adv = (s) => page.evaluate((s) => window.__test.advance(s), s);
  await page.evaluate(() => window.__G.hud.hint(''));
  await adv(2.3);
  await page.evaluate(() => { window.__G.hud.hint(''); window.__G.game.hintClear = 0; });
  // 1) charged heavy at the moment of impact
  await page.evaluate(() => { const G = window.__G; G.bot.pos.copy(G.player.pos).add(new G.three.Vector3(3.5, 0.6, -1)); });
  await page.keyboard.down('KeyK');
  await adv(1.05);
  await page.keyboard.up('KeyK');
  await adv(0.11);
  await page.evaluate(() => window.__G.hud.hint(''));
  await snap('shot-hit.png');
  await adv(1.2);
  await snap('shot-launch.png');
  // 2) tower collapse, mid-lean
  const info = await page.evaluate(() => {
    const r = window.__test.collapseTower(3, 0);
    const [x, , z] = r.c;
    window.__test.cam(x - 95, 70, z - 105, x, r.top * 0.35, z);
    return r;
  });
  await adv(1.9);
  await snap('shot-collapse.png');
  // 3) the train
  await page.evaluate(() => { const c = window.__G.train.cars[1].mesh.position; window.__test.cam(c.x + 20, 16, c.z + 26, c.x - 6, 8, c.z); });
  await adv(0.05);
  await snap('shot-train.png');
  // 4) rubble after the dust settles
  await adv(9);
  await page.evaluate((c) => window.__test.cam(c[0] - 42, 34, c[2] - 46, c[0], 0, c[2]), info.c);
  await adv(0.05);
  await snap('shot-rubble.png');
}
