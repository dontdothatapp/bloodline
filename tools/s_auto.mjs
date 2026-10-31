export default async function (page) {
  const out = [];
  for (let i = 0; i < 8; i++) {
    const r = await page.evaluate(() => { const t0 = performance.now(); window.__test.advance(2.0); return { ms: performance.now() - t0, s: window.__test.state() }; });
    out.push(`t=${(i + 1) * 2}s simMs/2s=${r.ms.toFixed(0)} ${JSON.stringify(r.s)}`);
  }
  console.log(out.join('\n'));
}
