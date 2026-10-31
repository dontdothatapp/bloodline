export default async function (page) {
  const r = await page.evaluate(() => {
    const G = window.__G;
    window.__test.advance(2.5);
    const log = [];
    // force two quick KOs for the player
    for (let k = 0; k < 2; k++) {
      while (G.game.state !== 'fight') window.__test.advance(0.1);
      G.bot.takeDamage(500, G.player, false);
      window.__test.advance(4.5);
      log.push(window.__test.state().game + ' wins=' + G.game.wins);
    }
    window.__test.advance(1);
    log.push('end? ' + G.game.state);
    G.game.rematch();
    window.__test.advance(2.5);
    log.push('after rematch: ' + G.game.state + ' round=' + G.game.round + ' wins=' + G.game.wins + ' botHp=' + G.bot.hp + ' botState=' + G.bot.state);
    return log;
  });
  console.log(r.join('\n'));
}
