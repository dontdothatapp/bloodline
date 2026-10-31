// Round openers, shot like a film. Round 1: a letterboxed aerial establishing shot of the city
// with a location card, then the Patriarch drops out of the sky in front of his landmark and the
// Heir lands across from him. Later rounds: a quick flyover of the wrecked arena and a double
// landing. Any key or tap skips. Shots drive FightCamera.override and hand back to the lock-on
// camera, which starts wide because the fighters land ~80 m apart.
import * as THREE from 'three';
import { G } from '../core/context.js';
import { clamp, UP } from '../core/math.js';

const SKY = 410;         // fighters wait up here, out of shot, until their drop
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// The city remembers, so by round 2 a landing mark is usually last round's crater (or a rubble
// pile), and landing in it sinks the fighter below the street. Land on the flattest open ground
// near the mark instead: rings out to ~36 m, skipping anything under or inside a structure.
function landingSpot(mark) {
  const p = new THREE.Vector3(), best = mark.clone().setY(G.ground.heightAt(mark.x, mark.z));
  let bestScore = Infinity;
  for (let r = 0; r <= 36; r += 6) {
    const n = r ? Math.round(r * 0.9) : 1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      p.set(mark.x + Math.cos(a) * r, 0, mark.z + Math.sin(a) * r);
      let rough = 0;
      for (const [dx, dz] of [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5], [3.5, 3.5], [-3.5, -3.5]]) rough = Math.max(rough, Math.abs(G.ground.heightAt(p.x + dx, p.z + dz)));
      if (rough > bestScore) continue;
      let blocked = false;
      for (let y = 2; y <= 14 && !blocked; y += 4) G.destruction.forChunksInSphere(p.setY(y), 3.5, () => { blocked = true; });
      if (blocked) continue;
      const score = rough + r * 0.01; // the mark itself wins a tie
      if (score < bestScore) { bestScore = score; best.set(p.x, G.ground.heightAt(p.x, p.z), p.z); }
    }
    if (bestScore < 0.3) break; // flat enough: don't wander further from the mark
  }
  return best;
}

export class Intro {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.override = { pos: this.camPos, look: this.camLook };
    this._skip = () => this.skip();
  }

  start(full) {
    const L = G.layout.landing, g = this.game;
    this.full = full;
    this.t = 0;
    this.active = true;
    this.heir = landingSpot(L.heir);
    this.pat = landingSpot(L.patriarch);
    this.mid = this.heir.clone().lerp(this.pat, 0.5);
    this.dir = this.pat.clone().sub(this.heir).setY(0).normalize(); // Heir -> Patriarch
    this.side = new THREE.Vector3().crossVectors(this.dir, UP).normalize();
    for (const [f, at] of [[g.player, this.heir], [g.bot, this.pat]]) {
      f.pos.set(at.x, SKY, at.z);
      f.vel.set(0, 0, 0);
      f.setState('intro');
    }
    this.events = (full ? this._full() : this._short()).sort((a, b) => a.t - b.t);
    this.shots = full ? this._fullShots() : this._shortShots();
    this.end = this.shots[this.shots.length - 1].t1;
    G.post.letterboxTarget = 1;
    G.hud.showHUD(false);
    G.hud.skipHint(true);
    G.fightCam.override = this.override;
    // touch screens: the on-screen controls are hidden now, so listen for any tap ourselves
    setTimeout(() => this.active && window.addEventListener('pointerdown', this._skip), 250);
  }

  _drop(f, at, height) {
    f.pos.set(at.x, at.y + height, at.z);
    f.vel.set(0, -70, 0);
    f.setState('land');
    G.audio.whoosh(1, at.clone().setY(at.y + 30));
  }

  // ---------------------------------------------------------------- round 1
  _full() {
    const g = this.game, [title, sub] = G.layout.caption || [];
    return [
      { t: 0.5, fn: () => G.hud.location(title, sub) },
      { t: 3.3, fn: () => { G.hud.location(null); this._drop(g.bot, this.pat, 230); } },
      { t: 6.1, fn: () => this._drop(g.player, this.heir, 210) },
    ];
  }

  _fullShots() {
    const { heir, pat, mid, dir, side } = this, g = this.game;
    const vista = G.layout.vista;
    const toVista = vista.clone().sub(mid).setY(0).normalize();
    const vSide = new THREE.Vector3().crossVectors(toVista, UP).normalize();
    const v = (o, x, y, z) => o.clone().addScaledVector(vSide, x).addScaledVector(UP, y).addScaledVector(toVista, z);
    const d = (o, along, up, across) => o.clone().addScaledVector(dir, along).addScaledVector(UP, up).addScaledVector(side, across);
    // tilt up toward a falling fighter, but no further than ~35 m: he drops into the frame past
    // the rooftops instead of the shot turning into empty sky
    const track = (f, at, lift) => at.y + Math.max(lift, Math.min(35, (f.pos.y - at.y) * 0.45));
    return [
      // establishing: high over the arena, pushing in toward the skyline (the Empire State)
      {
        t0: 0, t1: 3.3,
        pos: (k) => v(mid, 70, 230, -300).lerp(v(mid, 35, 135, -170), ease(k)),
        look: (k) => vista.clone().lerp(v(mid, 0, 40, 160), ease(k) * 0.55),
      },
      // the Patriarch drops onto his mark: low angle from the street ahead of him (on the real
      // map: Broadway, beside the Flatiron's prow), the Heir's side of town behind him
      {
        t0: 3.3, t1: 6.1,
        pos: (k) => d(pat, 7 + 2 * k, 4, -14),
        look: () => this.camLook.set(pat.x, track(g.bot, pat, 2.5), pat.z),
      },
      // crane: high over the Heir's mark as he plummets into the frame and craters it, then down
      // behind him to where the fight camera picks up, the Patriarch across the street
      {
        t0: 6.1, t1: 9.0,
        pos: () => {
          const high = d(heir, -32, 24, -9), low = d(heir, -20, 7, -3);
          return this.heirLandedAt ? high.lerp(low, ease((this.t - this.heirLandedAt) / 1.1)) : high;
        },
        look: () => {
          const mark = d(heir, 2, 13, 0);
          return this.heirLandedAt ? mark.lerp(d(mid, 0, 6, 0), ease((this.t - this.heirLandedAt) / 1.1)) : mark;
        },
      },
    ];
  }

  // ---------------------------------------------------------------- rounds 2 and 3
  _short() {
    const g = this.game;
    return [
      { t: 0.5, fn: () => this._drop(g.bot, this.pat, 190) },
      { t: 0.7, fn: () => this._drop(g.player, this.heir, 190) },
    ];
  }

  _shortShots() {
    const { mid, side, dir } = this;
    return [
      // flyover of the (by now wrecked) arena
      {
        t0: 0, t1: 1.9,
        pos: (k) => mid.clone().addScaledVector(side, 120 - 40 * k).addScaledVector(dir, -60 + 30 * k).addScaledVector(UP, 120 - 30 * ease(k)),
        look: () => this.camLook.copy(mid).addScaledVector(UP, 10),
      },
      // both land: wide two-shot from the side, above the elevated train
      {
        t0: 1.9, t1: 3.8,
        pos: (k) => mid.clone().addScaledVector(side, 50 + 4 * k).addScaledVector(UP, 17),
        look: () => this.camLook.copy(mid).addScaledVector(UP, 3),
      },
    ];
  }

  // ---------------------------------------------------------------- run
  // Returns true once the opener is over (played out or skipped).
  update(realDt) {
    if (!this.active) return true;
    this.t += realDt;
    const g = this.game;
    for (const e of this.events) if (!e.done && this.t >= e.t) { e.done = true; e.fn(); }
    if (g.bot.state === 'landed' && !this.patLanded) {
      this.patLanded = true;
      G.time.slowmo(0.4, 0.2, 0.5);
      if (this.full) setTimeout(() => this.active && g.brain.say('start'), 450);
    }
    // time slows as the hero comes in (at 150 m/s he'd cross the shot in a blink), then lands
    if (this.full && g.player.state === 'land' && g.player.pos.y - this.heir.y < 70 && !this.heirSlowed) {
      this.heirSlowed = true;
      G.time.slowmo(0.22, 0.35, 0.3);
    }
    if (g.player.state === 'landed' && !this.heirLandedAt) {
      this.heirLandedAt = this.t;
      G.time.slowmo(0.3, 0.3, 0.8); // the dust and the shockwave in slow motion
    }
    const shot = this.shots.find((s) => this.t < s.t1) || this.shots[this.shots.length - 1];
    const k = clamp((this.t - shot.t0) / (shot.t1 - shot.t0), 0, 1);
    this.camPos.copy(shot.pos(k));
    const look = shot.look(k);
    if (look !== this.camLook) this.camLook.copy(look);
    // a scripted spot can land inside a building (or under the train) on some map: lift it clear
    let inside = 0;
    G.destruction.forChunksInSphere(this.camPos, 2.5, (id) => { inside = Math.max(inside, G.destruction.defs[id].c.y + 4); });
    if (inside) this.camPos.y = Math.max(this.camPos.y, inside);
    // the last shot holds until both have landed (slow motion stretches the arrival), plus a beat
    const landed = g.player.state === 'landed' && g.bot.state === 'landed';
    if ((this.t >= this.end && landed && this.t >= (this.heirLandedAt || 0) + (this.full ? 1.3 : 0.8)) || this.t > this.end + 4) this.finish();
    return !this.active;
  }

  skip() {
    if (this.active && this.t > 0.25) this.finish();
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener('pointerdown', this._skip);
    const g = this.game;
    // skipped before someone landed: put them on their marks
    for (const [f, at] of [[g.player, this.heir], [g.bot, this.pat]]) {
      if (f.state === 'landed') continue;
      f.pos.set(at.x, at.y + 0.6, at.z);
      f.vel.set(0, 0, 0);
      f.setState('landed');
    }
    G.fightCam.override = null;
    G.post.letterboxTarget = 0;
    G.hud.location(null);
    G.hud.skipHint(false);
    this.patLanded = false;
    this.heirLandedAt = 0;
    this.heirSlowed = false;
  }
}
