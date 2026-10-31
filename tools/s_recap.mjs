// Match recap check: bots fight for a while, then the highlight recap plays through.
// node tools/shot.mjs "http://localhost:5173/?auto&norender" /tmp/recap.png 9000 tools/s_recap.mjs
// SNAPS=1 saves a frame every STEP seconds of the recap (default 0.5); FIGHT=<s> how long they
// fight first; COLLAPSE=<s> brings the tallest tower down beside them at that point.
export default async function (page, out) {
  await page.evaluate(() => window.__test.hold()); // only our own steps move time
  const fight = +(process.env.FIGHT || 45), step = +(process.env.STEP || 0.5);
  for (let t = 0; t < fight; t += 5) {
    // COLLAPSE=<seconds>: bring the tallest tower down next to them at that point of the fight
    if (process.env.COLLAPSE && t === +process.env.COLLAPSE) {
      console.log('collapse', JSON.stringify(await page.evaluate(() => { window.__test.fightAtTower(0); return window.__test.collapseTower(3, 0); })));
    }
    const st = await page.evaluate(() => { window.__test.advance(5); return { s: window.__test.state(), r: window.__test.recorder() }; });
    console.log(`t=${t + 5} ${st.s.game} r${st.s.round} wins=${st.s.wins} hp=${st.s.player.hp}/${st.s.bot.hp} collapsed=${st.s.collapsed} rec=${JSON.stringify(st.r)}`);
  }
  // END=1: fight the match out instead, and catch the recap that starts by itself
  if (process.env.END) {
    const perf = await page.evaluate(() => {
      const R = window.__G.recorder, up = R.update.bind(R);
      let ms = 0, n = 0;
      R.update = () => { const t = performance.now(); up(); ms += performance.now() - t; n++; };
      for (let i = 0; i < 400 && window.__G.game.state !== 'recap'; i++) window.__test.advance(0.5);
      return { recorderMsPerFrame: +(ms / n).toFixed(3), frames: n, state: window.__G.game.state, rec: window.__test.recorder() };
    });
    console.log('match played out:', JSON.stringify(perf));
  }
  const ok = process.env.END ? true : await page.evaluate(() => window.__test.recap());
  const rs0 = await page.evaluate(() => window.__test.recapState());
  console.log('recap', ok, JSON.stringify(rs0));
  let last = -1, n = 0;
  while (n < 400) {
    const rs = await page.evaluate((st) => { window.__test.advance(st); return window.__test.recapState(); }, step);
    n++;
    if (rs.seg !== last) { console.log(`  ${(n * step).toFixed(1)}s seg ${rs.seg}/${rs.of} ${rs.type} T=${rs.T} speed=${rs.speed}`); last = rs.seg; }
    const want = process.env.SNAPS; // 1 = every step, or a list of shot types (tower,finale)
    if (want && (want === '1' || want.split(',').includes(rs.type))) {
      await page.evaluate(() => window.__test.render()); // for ?norender runs
      await page.screenshot({ path: out.replace('.png', `_${String(n).padStart(3, '0')}.png`), timeout: 180000 });
    }
    if (!rs.active) break;
  }
  console.log('after', JSON.stringify(await page.evaluate(() => window.__test.state())));
}
