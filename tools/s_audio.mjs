export default async function (page) {
  await page.click('#fightBtn');
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const G = window.__G;
    // drive the player with a brain too, to exercise everything
    G.game.playerBrain = new (G.game.brain.constructor)(G.player, 'brutal', { lines: false });
    const errs = [];
    try { for (let i = 0; i < 20; i++) window.__test.advance(1); } catch (e) { errs.push(e.message + ' ' + e.stack); }
    try { window.__test.collapseTower(3, 1); window.__test.advance(4); } catch (e) { errs.push(e.message); }
    return { ctx: G.audio.ctx ? G.audio.ctx.state : 'none', voices: G.audio.voices, errs, state: window.__test.state().game };
  });
  console.log(JSON.stringify(r));
}
