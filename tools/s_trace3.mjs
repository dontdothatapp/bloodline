export default async function (page) {
  const r = await page.evaluate(() => {
    const G = window.__G;
    window.__test.collapseTower(3, 0);
    const seen = [];
    for (let i = 0; i < 240 && seen.length < 6; i++) {
      window.__test.advance(1 / 60);
      for (const r of G.debris.active) {
        const t = r.body.translation();
        if (t.y < -0.8 && !r._rep) {
          r._rep = true;
          const v = r.body.linvel();
          seen.push({ frame: i, y: +t.y.toFixed(2), x: +t.x.toFixed(1), z: +t.z.toFixed(1), gh: +G.ground.heightAt(t.x, t.z).toFixed(2), vy: +v.y.toFixed(1), vxz: +Math.hypot(v.x, v.z).toFixed(1), size: r.scale.toArray().map((a) => +a.toFixed(2)), shape: r.shape, age: +r.age.toFixed(2), small: r.small });
        }
      }
    }
    return seen;
  });
  console.log(JSON.stringify(r));
}
