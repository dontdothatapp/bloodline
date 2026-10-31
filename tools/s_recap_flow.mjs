// Match end flow: bots fight a whole match; the recap starts by itself after the winner's banner,
// a key skips it, the results offer WATCH RECAP, which plays it again to the end. Checks that
// the city, debris, cars and train come back exactly as they were.
// node tools/shot.mjs "http://localhost:5173/?auto&norender" /tmp/flow.png 6000 tools/s_recap_flow.mjs
export default async function (page) {
  await page.evaluate(() => window.__test.hold()); // only our own steps move time
  let st;
  for (let i = 0; i < 60; i++) {
    st = await page.evaluate(() => { window.__test.advance(4); return window.__test.state(); });
    if (st.game === 'end' || st.game === 'recap') break;
  }
  console.log('match over:', JSON.stringify(st), JSON.stringify(await page.evaluate(() => window.__test.recorder())));
  for (let i = 0; i < 10; i++) {
    st = await page.evaluate(() => { window.__test.advance(0.5); return window.__test.state(); });
    if (st.game === 'recap') break;
  }
  const rs = await page.evaluate(() => window.__test.recapState());
  console.log('recap started by itself:', st.game === 'recap', `${rs.of} shots, ${rs.total}s`, JSON.stringify(rs.clips));
  await page.evaluate(() => window.__test.advance(3));
  await page.keyboard.press('KeyX');
  await page.evaluate(() => window.__test.advance(0.1));
  st = await page.evaluate(() => window.__test.state());
  console.log('after a key:', st.game);
  await page.evaluate(() => window.__test.advance(1.5));
  const btn = await page.evaluate(() => ({ results: !document.querySelector('#results').classList.contains('hidden'), recapBtn: !document.querySelector('#rRecap').classList.contains('hidden') }));
  console.log('results:', JSON.stringify(btn));
  // exact restore: snapshot, play part of the recap, end it, snapshot again (no live steps between)
  const exact = await page.evaluate(() => {
    const G = window.__G, h = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * ((i % 13) + 1); return s; };
    const snap = () => [h(G.destruction.mesh.instanceMatrix.array), h(G.destruction.attrs.style.array),
      ...G.debris.shapes.map((sh) => h(sh.mesh.instanceMatrix.array) + h(sh.attrs.style.array) + h(sh.mesh.instanceColor.array)),
      h(G.props.mesh.instanceMatrix.array), h(G.props.mesh.instanceColor.array), ...G.train.cars.map((c) => c.mesh.position.x + c.mesh.quaternion.y)];
    const a = snap();
    G.game.playRecap();
    window.__test.advance(6);
    const mid = snap();
    G.recap.finish();
    const b = snap();
    return { same: a.every((v, i) => v === b[i]), changedDuring: a.some((v, i) => v !== mid[i]), diff: a.map((v, i) => (v === b[i] ? 0 : i)).filter(Boolean) };
  });
  console.log('exact restore after a recap:', JSON.stringify(exact));
  await page.evaluate(() => window.__test.advance(1.5));
  await page.evaluate(() => document.querySelector('#rRecap').click());
  await page.evaluate(() => window.__test.advance(0.1));
  console.log('watch recap ->', (await page.evaluate(() => window.__test.state())).game);
  for (let i = 0; i < 120; i++) {
    const r = await page.evaluate(() => { window.__test.advance(1); return window.__test.recapState(); });
    if (!r.active) break;
  }
  st = await page.evaluate(() => { window.__test.advance(1.5); return window.__test.state(); });
  console.log('played through:', st.game, 'results again:', await page.evaluate(() => !document.querySelector('#results').classList.contains('hidden')));
  await page.keyboard.press('Enter');
  st = await page.evaluate(() => { window.__test.advance(3); return window.__test.state(); });
  console.log('rematch:', st.game, st.round, JSON.stringify(await page.evaluate(() => window.__test.recorder())));
}
