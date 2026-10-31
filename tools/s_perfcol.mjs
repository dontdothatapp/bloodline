export default async function (page) {
  const r = await page.evaluate(() => {
    const G = window.__G;
    const acc = {};
    const wrap = (obj, name, label) => { const f = obj[name].bind(obj); obj[name] = (...a) => { const t = performance.now(); const r = f(...a); acc[label] = (acc[label] || 0) + performance.now() - t; return r; }; };
    wrap(G.physics, 'step', 'phys'); wrap(G.debris, 'update', 'debris'); wrap(G.destruction, 'update', 'destr'); wrap(G.fx, 'update', 'fx');
    window.__test.collapseTower(3, 0);
    const frames = [];
    for (let i = 0; i < 480; i++) {
      for (const k in acc) acc[k] = 0;
      const t = performance.now();
      window.__test.advance(1 / 60);
      frames.push({ total: performance.now() - t, ...acc, bodies: G.debris.activeCount });
    }
    const pct = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return +s[Math.floor(s.length * p)].toFixed(1); };
    const tot = frames.map((f) => f.total);
    const worst = frames.map((f, i) => ({ i, ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, +v.toFixed(1)])) })).sort((a, b) => b.total - a.total).slice(0, 5);
    const sec = [];
    for (let s = 0; s < 8; s++) { const sl = frames.slice(s * 60, s * 60 + 60); sec.push({ s, avg: +(sl.reduce((a, f) => a + f.total, 0) / 60).toFixed(1), phys: +(sl.reduce((a, f) => a + f.phys, 0) / 60).toFixed(1), bodies: sl[59].bodies }); }
    return { p50: pct(tot, 0.5), p90: pct(tot, 0.9), p99: pct(tot, 0.99), worst, sec };
  });
  console.log(JSON.stringify(r));
}
