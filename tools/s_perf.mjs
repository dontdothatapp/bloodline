export default async function (page) {
  const r = await page.evaluate(() => {
    const G = window.__G;
    const s = G.destruction.structs.slice().sort((a, b) => b.chunkIds.length - a.chunkIds.length)[0];
    const t0 = performance.now();
    G.destruction.ensureColliders(s);
    const t1 = performance.now();
    const steps = [];
    for (let i = 0; i < 5; i++) { const a = performance.now(); G.physics.step(1 / 60); steps.push(+(performance.now() - a).toFixed(2)); }
    // big impact: punch through the middle
    const c = s.min.clone().add(s.max).multiplyScalar(0.5);
    const t2 = performance.now();
    let n = 0;
    for (let i = 0; i < 10; i++) n += G.destruction.impact({ pos: new G.three.Vector3(s.min.x - 2 + i * 3, c.y, c.z), radius: 3.2, power: 1.3, vel: new G.three.Vector3(120, 0, 0) }).count;
    const t3 = performance.now();
    const steps2 = [];
    for (let i = 0; i < 90; i++) { const a = performance.now(); window.__test.advance(1 / 60); steps2.push(+(performance.now() - a).toFixed(1)); }
    return { chunks: s.chunkIds.length, ensureMs: +(t1 - t0).toFixed(1), stepsAfterRefine: steps, impactMs: +(t3 - t2).toFixed(1), broke: n, bodies: G.debris.activeCount,
      simFrames: steps2.filter((_, i) => i % 6 === 0), maxFrame: Math.max(...steps2), collapsing: G.destruction.collapses.length, collapsed: G.stats.buildingsCollapsed };
  });
  console.log(JSON.stringify(r, null, 1));
}
