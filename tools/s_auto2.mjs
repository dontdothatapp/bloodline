// advance in steps; screenshot at a few moments
export default async function (page, out) {
  const lines = [];
  for (let i = 0; i < 12; i++) {
    const r = await page.evaluate(() => { window.__test.advance(1.5); return window.__test.state(); });
    lines.push(`t=${((i + 1) * 1.5).toFixed(1)} ${JSON.stringify(r)}`);
    if (i === 5 || i === 9) await page.screenshot({ path: out.replace('.png', `_${i}.png`), timeout: 120000 });
  }
  console.log(lines.join('\n'));
}
