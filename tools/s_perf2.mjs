export default async function (page) {
  const r = await page.evaluate(() => {
    const G = window.__G;
    const wrap = (obj, name, label, acc) => { const f = obj[name].bind(obj); obj[name] = (...a) => { const t = performance.now(); const r = f(...a); acc[label] = (acc[label] || 0) + performance.now() - t; return r; }; };
    const acc = {};
    wrap(G.physics, 'step', 'physics', acc); wrap(G.debris, 'update', 'debris', acc); wrap(G.destruction, 'update', 'destruction', acc);
    wrap(G.fx, 'update', 'fx', acc); wrap(G.props, 'update', 'props', acc); wrap(G.ground, 'update', 'ground', acc); wrap(G.game, 'update', 'game', acc); wrap(G.hud, 'update', 'hud', acc);
    const s = G.destruction.structs.slice().sort((a, b) => b.chunkIds.length - a.chunkIds.length)[0];
    const c = s.min.clone().add(s.max).multiplyScalar(0.5);
    for (let i = 0; i < 10; i++) G.destruction.impact({ pos: new G.three.Vector3(s.min.x - 2 + i * 3, c.y, c.z), radius: 3.2, power: 1.3, vel: new G.three.Vector3(120, 0, 0) });
    const frames = [];
    for (let i = 0; i < 4; i++) { for (const k in acc) acc[k] = 0; window.__test.advance(1 / 60); frames.push(Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, +v.toFixed(1)]))); }
    return frames;
  });
  console.log(JSON.stringify(r));
}
