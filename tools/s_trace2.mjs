export default async function (page) {
  const r = await page.evaluate(() => {
    const G = window.__G;
    window.__test.collapseTower(3, 0);
    window.__test.advance(2.6);
    const under = G.debris.active.filter((r) => r.body.translation().y < -1).slice(0, 8).map((r) => {
      const t = r.body.translation(), v = r.body.linvel();
      return { y: +t.y.toFixed(1), x: +t.x.toFixed(1), z: +t.z.toFixed(1), gh: +G.ground.heightAt(t.x, t.z).toFixed(1), vy: +v.y.toFixed(1), size: r.scale.toArray().map((a) => +a.toFixed(1)), shape: r.shape, age: +r.age.toFixed(2), crusher: !!r.crusher, cells: r.cells };
    });
    const groundOk = !!G.physics.groundCollider && G.physics.world.getCollider(G.physics.groundCollider.handle) != null;
    return { under, nUnder: G.debris.active.filter((r) => r.body.translation().y < -1).length, groundOk, groundHandle: G.physics.groundCollider.handle };
  });
  console.log(JSON.stringify(r));
}
