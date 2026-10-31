export default async function (page) {
  const lines = [];
  const seen = {};
  for (let i = 0; i < 34; i++) {
    const r = await page.evaluate(() => {
      const t0 = performance.now();
      const G = window.__G;
      const states = {};
      for (let k = 0; k < 180; k++) { window.__test.advance(1 / 60); for (const f of G.fighters) states[f.state] = (states[f.state] || 0) + 1; }
      const s = window.__test.state();
      const bad = G.fighters.some((f) => !isFinite(f.pos.x) || !isFinite(f.vel.x));
      return { ms: Math.round(performance.now() - t0), s, states, bad };
    });
    for (const k of Object.keys(r.states)) seen[k] = (seen[k] || 0) + r.states[k];
    lines.push(`t=${(i + 1) * 3}s ${r.ms}ms game=${r.s.game} r${r.s.round} wins=${r.s.wins} P:${r.s.player.state}/${r.s.player.hp} B:${r.s.bot.state}/${r.s.bot.hp} bodies=${r.s.bodies} chunks=${r.s.chunks} col=${r.s.collapsed}${r.bad ? ' NaN!!' : ''}`);
  }
  console.log(lines.join('\n'));
  console.log('state frames', JSON.stringify(seen));
}
