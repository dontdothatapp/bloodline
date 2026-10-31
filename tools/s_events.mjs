export default async function (page) {
  const r = await page.evaluate(() => {
    const G = window.__G;
    let ev = 0;
    const orig = G.physics.onContactForce;
    G.physics.onContactForce = (a, b, f) => { ev++; orig(a, b, f); };
    window.__test.collapseTower(3, 0);
    const out = [];
    for (let s = 0; s < 6; s++) { ev = 0; window.__test.advance(1); out.push({ s, eventsPerFrame: Math.round(ev / 60), bodies: G.debris.activeCount }); }
    return out;
  });
  console.log(JSON.stringify(r));
}
