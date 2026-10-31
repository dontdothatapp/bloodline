export default async function (page) {
  const r = await page.evaluate(() => {
    const G = window.__G;
    let breaks = 0, kills = 0, freezes = 0, crush = 0;
    const ob = G.debris._breakRec.bind(G.debris); G.debris._breakRec = (rec) => { breaks++; return ob(rec); };
    const ok = G.debris._kill.bind(G.debris); G.debris._kill = (rec) => { kills++; if (rec.body) { const t = rec.body.translation(); if (kills < 6) console.log('kill at', t.x.toFixed(1), t.y.toFixed(1), t.z.toFixed(1), 'frozen', rec.frozen); } return ok(rec); };
    const of = G.debris._freeze.bind(G.debris); G.debris._freeze = (rec) => { freezes++; return of(rec); };
    const oc = G.destruction.crushChunk.bind(G.destruction); G.destruction.crushChunk = (a, b) => { crush++; return oc(a, b); };
    const info = window.__test.collapseTower(3, 0);
    const log = [];
    for (let i = 0; i < 12; i++) {
      window.__test.advance(0.25);
      const ys = G.debris.active.map((r) => r.body.translation().y);
      log.push({ t: (i + 1) * 0.25, active: G.debris.activeCount, breaks, kills, freezes, crush, minY: ys.length ? Math.min(...ys).toFixed(1) : null, maxY: ys.length ? Math.max(...ys).toFixed(1) : null });
    }
    let frozenVisible = 0;
    for (const sh of G.debris.shapes) frozenVisible += sh.frozenQ.filter((r) => r.frozen && !r.dead).length;
    return { info, log, frozenVisible };
  });
  console.log(JSON.stringify(r, null, 0));
}
