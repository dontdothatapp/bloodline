// Free-flight feel: how abruptly the view, the body and the flight path turn when the keyboard
// steers (docs/BACKLOG.md, item 4). Scripted: cruise forward, tap left, tap right, then alternate
// quick taps; the numbers are the worst per-frame changes, as rates. Lower is smoother.
// node tools/shot.mjs "http://localhost:5173/?fight&norender&mute" /tmp/flight.png 4000 tools/s_flight.mjs
export const measure = () => {
  const G = window.__G, T = window.__test, THREE = G.three, inp = G.input;
  T.hold();
  T.freeCam();
  if (G.game.state !== 'explore') { G.game.state = 'end'; G.game.explore(); }
  const p = G.player;
  p.pos.y = Math.max(p.pos.y, 320); p.vel.set(0, 0, 0); // above the skyline: no collisions in the trace
  const yawOf = () => { const d = G.camera.getWorldDirection(new THREE.Vector3()); return Math.atan2(d.x, d.z); };
  const bodyYaw = () => new THREE.Euler().setFromQuaternion(p.quat, 'YXZ').y;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const cam = [], body = [], head = [];
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      T.advance(1 / 60);
      cam.push(yawOf()); body.push(bodyYaw());
      head.push(Math.hypot(p.vel.x, p.vel.z) > 8 ? Math.atan2(p.vel.x, p.vel.z) : NaN); // crawling, the heading means nothing
    }
  };
  const tap = (a, frames) => { inp.press(a); step(frames); inp.release(a); };
  inp.press('fwd'); step(120);
  tap('left', 30); step(90);
  tap('right', 30); step(90);
  for (let i = 0; i < 4; i++) { tap('left', 15); tap('right', 15); }
  step(90);
  inp.release('fwd'); step(60);
  // worst per-frame turn (deg/s) and worst change of turn between frames (deg/s²)
  const stats = (s) => {
    let v = 0, a = 0, prev = NaN, prevD = NaN;
    for (const x of s) {
      if (!isNaN(prev) && !isNaN(x)) {
        const d = wrap(x - prev);
        v = Math.max(v, Math.abs(d));
        if (!isNaN(prevD)) a = Math.max(a, Math.abs(d - prevD));
        prevD = d;
      } else prevD = NaN;
      prev = x;
    }
    return { maxDegPerS: Math.round(v * 60 * 180 / Math.PI), maxJerkDegPerS2: Math.round(a * 3600 * 180 / Math.PI) };
  };
  T.hold(false);
  return { camera: stats(cam), body: stats(body), heading: stats(head) };
};

export default async function (page) {
  const r = await page.evaluate(`(${measure.toString()})()`);
  console.log(JSON.stringify(r));
}
