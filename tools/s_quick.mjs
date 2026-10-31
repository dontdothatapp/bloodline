export default async function (page) {
  const out = [];
  for (let i = 0; i < 10; i++) out.push(await page.evaluate(() => { window.__test.advance(3); const s = window.__test.state(); return `${s.game} P:${s.player.state}/${s.player.hp} B:${s.bot.state}/${s.bot.hp} chunks=${s.chunks} train=${window.__G.train.derailed}`; }));
  console.log(out.join('\n'));
}
