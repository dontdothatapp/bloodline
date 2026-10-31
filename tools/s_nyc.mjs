// Real NYC map check: landmark views, then knock out a storey of the Flatiron and watch it fall.
// node tools/shot.mjs "http://localhost:5173/?fight&map=flatiron" /tmp/nyc.png 9000 tools/s_nyc.mjs
export default async function (page, out) {
  const snap = async (tag) => { await page.waitForTimeout(600); await page.screenshot({ path: out.replace('.png', `_${tag}.png`), timeout: 180000 }); };
  await page.evaluate(() => window.__G.hud.showHUD(false));
  const views = {
    park: [10, 150, 200, 0, 0, -10],             // Madison Square Park, the Flatiron's roof bottom-left
    flatiron: [-62, 28, 70, -48, 50, 175],       // the prow from the park
    metlife: [230, 120, 160, 100, 120, 50],      // Met Life Tower crown
    esb: [-90, 140, -150, -158, 220, -709],      // Empire State up 5th Ave
  };
  for (const [tag, v] of Object.entries(views)) {
    await page.evaluate((v) => { window.__test.cam(...v); window.__test.advance(0.05); }, v);
    await snap(tag);
  }
  const info = await page.evaluate(() => {
    const G = window.__G;
    const s = G.destruction.structs.find((q) => q.min.x < -48 && q.max.x > -48 && q.min.z < 171 && q.max.z > 171);
    window.__test.cam(-20, 40, 60, (s.min.x + s.max.x) / 2, 40, (s.min.z + s.max.z) / 2);
    let n = 0;
    for (const id of s.chunkIds) {
      const d = G.destruction.defs[id];
      if (d.level === 2 && d.alive && d.kind !== 1) { G.destruction.breakChunk(id, 'pulverize', (wp, o) => o.set(0, 2, 0)); n++; }
    }
    return { chunks: s.chunkIds.length, broke: n, top: +s.max.y.toFixed(1) };
  });
  console.log('flatiron', JSON.stringify(info));
  for (let i = 0; i < 3; i++) {
    const st = await page.evaluate(() => { window.__test.advance(0.8); return window.__test.state(); });
    console.log(`t=${((i + 1) * 0.8).toFixed(1)}s bodies=${st.bodies} collapsed=${st.collapsed}`);
    await snap(`collapse${i}`);
  }
}
