export default async function (page) {
  const adv = (s) => page.evaluate((s) => window.__test.advance(s), s);
  const st = () => page.evaluate(() => { const G = window.__G; return `P:${G.player.state} B:${G.bot.state}/${G.bot.hp.toFixed(0)} chunks=${G.stats.chunksDestroyed} dist=${G.player.pos.distanceTo(G.bot.pos).toFixed(1)}`; });
  const close = () => page.evaluate(() => { const G = window.__G; G.bot.pos.copy(G.player.pos).add(new G.three.Vector3(2.2, 0.2, 0.5)); G.bot.vel.set(0, 0, 0); G.bot.setState('free'); });
  await adv(2.3);
  const log = [];
  // grab -> drag -> throw
  await close(); await adv(0.05);
  await page.keyboard.press('KeyE');
  await adv(0.2); log.push('grab+0.2  ' + await st());
  await adv(0.6); log.push('drag      ' + await st());
  await adv(1.2); log.push('thrown    ' + await st());
  await adv(2.5);
  // super
  await page.evaluate(() => { window.__G.player.meter = 100; });
  await close(); await adv(0.05);
  await page.keyboard.press('KeyR');
  await adv(0.4); log.push('super     ' + await st());
  await adv(1.4); log.push('barrage   ' + await st());
  await adv(1.2); log.push('finisher  ' + await st());
  await adv(3);
  // parry: bot jabs while player taps block just before
  await close(); await adv(0.05);
  await page.evaluate(() => { const G = window.__G; G.bot.startMove('jab'); });
  await adv(0.02);
  await page.keyboard.down('KeyQ');
  await adv(0.12);
  await page.keyboard.up('KeyQ');
  log.push('parry     ' + await st());
  console.log(log.join('\n'));
}
