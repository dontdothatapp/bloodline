// Fighter: movement, state machine, attacks, hit reactions, launches through buildings.
import * as THREE from 'three';
import { G } from '../core/context.js';
import { CharacterModel } from './character.js';
import { MOVES, SPEED } from './moves.js';
import { juiceHit, juiceSmash } from './juice.js';
import { Trail } from '../fx/trail.js';
import { clamp, damp, rand, chance, UP, randomUnit } from '../core/math.js';
import { ARENA } from '../world/boundary.js';
import { AudioEngine } from '../core/audio.js';

// voice line and the odds of saying it as each move starts (see Fighter.startMove)
const SHOUTS = {
  jab: ['attack_light', 0.4], cross: ['attack_light', 0.4], hook: ['attack_mid', 0.7],
  smash: ['attack_heavy', 1], heavy: ['attack_heavy', 1], superRush: ['super_start', 1],
};

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const CEILING = 420;

export class Controller {
  constructor() {
    this.move = new THREE.Vector3();
    this.vert = 0;
    this._p = new Set(); this._h = new Set(); this._r = new Set();
  }
  pressed(a) { return this._p.has(a); }
  held(a) { return this._h.has(a); }
  released(a) { return this._r.has(a); }
  clearEdges() { this._p.clear(); this._r.clear(); }
  press(a) { if (!this._h.has(a)) this._p.add(a); this._h.add(a); }
  release(a) { if (this._h.has(a)) this._r.add(a); this._h.delete(a); }
  tap(a) { this._p.add(a); }
}

export class Fighter {
  constructor(id, def, opts = {}) {
    this.id = id;
    this.def = def;
    this.name = def.display;
    this.model = new CharacterModel(G.scene, def);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.ctrl = new Controller();
    this.maxHp = opts.hp ?? 100;
    this.hp = this.maxHp;
    this.meter = 0;
    this.power = opts.power ?? 1;  // damage multiplier (the father hits harder)
    this.state = 'free';
    this.stateT = 0;
    this.move = null;
    this.moveT = 0;
    this.moveHit = false;
    this.charge = 0;
    this.buffer = null;
    this.invuln = 0;
    this.blockPressT = 99;
    this.comboTaken = 0;
    this.comboTimer = 0;
    this.launchSmashCount = 0;
    this.launchDamage = 0;
    this.flyBlend = 0;
    this.spin = new THREE.Quaternion();
    this.spinAxis = new THREE.Vector3(1, 0, 0);
    this.spinRate = 0;
    this.grab = null;
    this.ko = false;
    this.rushTarget = null;
    this.lastSmashStruct = -1;
    this.trailL = new Trail(G.scene, { width: 0.32, color: 0xfff6d8, life: 0.14 });
    this.trailR = new Trail(G.scene, { width: 0.32, color: 0xfff6d8, life: 0.14 });
    this.trailBody = new Trail(G.scene, { width: 0.9, color: def.trail || 0xbfe3ff, life: 0.35, points: 40 });
    this.kin = G.physics.kinematicBall(1.0);
    this.speedSmooth = 0;
    this.taunting = 0;
    this.lastHitBy = null;
    this.stats = { dealt: 0, hits: 0, maxCombo: 0 };
  }

  get opp() { return this.opponent; }
  get center() { return _u.copy(this.pos).add(_w.set(0, 0.3, 0)); }
  hurtCenter(out) { return out.copy(this.pos).add(_w.set(0, 0.25, 0)); }
  get alive() { return this.hp > 0; }
  get canAct() { return this.state === 'free' || this.state === 'block'; }
  get airborneLaunch() { return this.state === 'launched'; }

  reset(pos, faceTo) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.hp = this.maxHp;
    this.state = 'free'; this.stateT = 0; this.move = null;
    this.ko = false; this.grab = null; this.invuln = 0.5; this.charge = 0;
    this.comboTaken = 0;
    this.model.setAction(null, 30);
    this.model.setDamage(0);
    this.model.root.position.copy(pos);
    _v.subVectors(faceTo, pos); _v.y = 0;
    this.quat.setFromAxisAngle(UP, Math.atan2(_v.x, _v.z));
    this.model.root.quaternion.copy(this.quat);
    this.trailBody.clear(); this.trailL.clear(); this.trailR.clear();
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  // a voice line from public/sfx/voices/<fighter>/ (AudioEngine.VOICE lists them); odds < 1 for
  // the ones that would get repetitive every time
  shout(line, { odds = 1, ...opts } = {}) {
    if (odds < 1 && Math.random() > odds) return;
    const who = this.def.name;
    G.audio && G.audio.voice(`vo_${who}_${line}`, this.pos, { who, prio: AudioEngine.VOICE[line], ...opts });
  }

  // ---------------------------------------------------------------- update
  update(dt, realDt) {
    const frozen = dt <= 0;
    if (!frozen) {
      this.stateT += dt;
      this.invuln = Math.max(0, this.invuln - dt);
      this.blockPressT += dt;
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboTaken = 0;
      if (this.ctrl.pressed('block')) this.blockPressT = 0;
      this._buffer();
      this._think(dt);
      this._integrate(dt);
    }
    this._orient(dt, realDt);
    this.model.root.position.copy(this.pos);
    this.model.update(dt, realDt, this.vel, frozen);
    this.kin.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z });
    this._trails();
    // inputs pressed during hitstop stay queued until the world unfreezes
    if (!frozen) this.ctrl.clearEdges();
  }

  _buffer() {
    for (const a of ['light', 'heavy', 'grab', 'super', 'dash', 'rise']) {
      if (this.ctrl.pressed(a)) this.buffer = { a, t: 0.22 };
    }
    if (this.buffer) { this.buffer.t -= 1 / 60; if (this.buffer.t <= 0) this.buffer = null; }
  }

  _consume(a) {
    if (this.buffer && this.buffer.a === a) { this.buffer = null; return true; }
    return false;
  }

  dirToOpp(out) {
    out.subVectors(this.opp.pos, this.pos);
    const l = out.length();
    if (l < 1e-3) out.set(0, 0, 1); else out.divideScalar(l);
    return out;
  }

  _think(dt) {
    const c = this.ctrl;
    switch (this.state) {
      case 'free': this._free(dt); break;
      case 'dash': this._dash(dt); break;
      case 'rush': this._rush(dt); break;
      case 'homing': this._homing(dt); break;
      case 'skyward': this._skyward(dt); break;
      case 'skyhang': this._skyhang(dt); break;
      case 'skydive': this._skydive(dt); break;
      case 'attack': this._attack(dt); break;
      case 'charge': this._charge(dt); break;
      case 'block': this._block(dt); break;
      case 'hitstun': this._hitstun(dt); break;
      case 'stagger': if (this.stateT > this.staggerT) this.setState('free'); this.vel.multiplyScalar(Math.exp(-5 * dt)); break;
      case 'launched': this._launched(dt); break;
      case 'down': this._down(dt); break;
      case 'grabbing': this._grabbing(dt); break;
      case 'grabbed': break; // driven by the grabber
      case 'super': this._super(dt); break;
      case 'superVictim': break;
      case 'ko': this._ko(dt); break;
      case 'intro': this.vel.multiplyScalar(Math.exp(-4 * dt)); break;
      case 'land': this._land(dt); break;
      case 'landed': this.vel.set(0, 0, 0); break;
    }
  }

  // Round-intro arrival (game/intro.js): a near-vertical dive that ends in a crater.
  _land(dt) {
    this.vel.y = Math.max(this.vel.y - 160 * dt, -150);
    this.vel.x *= Math.exp(-3 * dt); this.vel.z *= Math.exp(-3 * dt);
  }

  // ---------------------------------------------------------------- free movement
  _free(dt) {
    const c = this.ctrl;
    const moving = c.move.lengthSq() > 0.04 || Math.abs(c.vert) > 0.1;
    const boosting = c.held('dash') && moving && this.stateT > 0.05;
    const speed = boosting ? SPEED.boost : SPEED.hover;
    _v.copy(c.move).multiplyScalar(speed);
    _v.y += c.vert * speed * 0.8;
    this.vel.lerp(_v, 1 - Math.exp(-(boosting ? 3.2 : 7) * dt));
    this.boosting = boosting;

    if (this.taunting > 0) this.taunting -= dt;
    // actions (buffered)
    if (this._consume('super') && this.meter >= 100) return this.startMove('superRush');
    if (this._consume('grab')) return this._heavyGo('grab', 0);
    if (this._consume('light')) return this.startMove('jab');
    if (this.ctrl.pressed('heavy') || (this.buffer && this.buffer.a === 'heavy' && c.held('heavy'))) {
      this.buffer = null;
      this.setState('charge');
      this.charge = 0;
      this.chargeDir = c.vert > 0.5 ? 'up' : c.vert < -0.5 ? 'down' : null;
      G.audio && G.audio.chargeStart(this);
      this.shout('charge');
      return;
    }
    if (this._consume('rise')) return this.skyward();
    if (this._consume('dash')) {
      // rush after a launched opponent, otherwise a quick dodge-dash
      if (this.opp.state === 'launched' && this.opp.vel.length() > 30 && (c.move.dot(this.dirToOpp(_w)) > 0.3 || c.move.lengthSq() < 0.04)) {
        this.setState('rush');
        G.audio && G.audio.whoosh(1, this.pos);
        G.fx.shock.ring(this.pos.clone(), this.dirToOpp(_w).clone(), 6, 0xdff3ff, 0.3, 0.2);
        return;
      }
      const d = moving ? _w.copy(c.move).add(_u.set(0, c.vert, 0)).normalize() : this.dirToOpp(_w).negate();
      this.vel.copy(d).multiplyScalar(SPEED.dash);
      this.invuln = Math.max(this.invuln, 0.16);
      this.setState('dash');
      G.audio && G.audio.whoosh(0.7, this.pos);
      this.shout('dash', { odds: 0.5 });
      G.fx.dustPuff(this.pos, 0.8, 2, 'white', _u.copy(d).multiplyScalar(-8), 0.5);
      return;
    }
    if (c.held('block')) { this.setState('block'); return; }
  }

  _dash(dt) {
    this.vel.multiplyScalar(Math.exp(-2.5 * dt));
    if (this.stateT > 0.22) this.setState('free');
  }

  _rush(dt) {
    const o = this.opp;
    const target = _v.copy(o.pos).addScaledVector(o.vel, 0.08);
    const to = target.sub(this.pos);
    const dist = to.length();
    to.divideScalar(dist || 1);
    this.vel.copy(to).multiplyScalar(SPEED.rush);
    G.post && (G.post.speedTarget = 1);
    if (dist < 4.5 || this.stateT > 1.6 || o.state !== 'launched') {
      // arrive: match momentum and open a follow-up window in slow motion
      this.vel.copy(o.vel).multiplyScalar(0.55);
      this.setState('free');
      if (dist < 6) {
        G.time.slowmo(0.4, 0.22, 4);
        G.fx.shock.ring(this.pos.clone(), to.clone(), 5, 0xffffff, 0.25, 0.2);
        // auto follow-up if the button is already buffered
      }
    }
  }

  // ---------------------------------------------------------------- reach and altitude
  // RMB attacks and the grab reach any distance: out of range he flies at the opponent first, fist
  // (or both hands) forward, through whatever is in the way (tracking him if he's flying), and
  // swings or grabs on arrival.
  _heavyGo(name, charge) {
    const m = MOVES[name];
    const reach = m.range + m.lunge + (m.lungeCharge || 0) * charge;
    if (!this.opp.alive || this.pos.distanceTo(this.opp.pos) <= reach + 1) return this.startMove(name, { charge });
    this.pending = { name, charge, reach };
    this.setState('homing');
    G.audio && G.audio.whoosh(1, this.pos);
    G.fx.shock.ring(this.pos.clone(), this.dirToOpp(_w).clone(), 7, 0xfff0c0, 0.35, 0.2);
  }

  _homing(dt) {
    const o = this.opp, p = this.pending;
    const to = _v.copy(o.pos).addScaledVector(o.vel, 0.1).sub(this.pos);
    const dist = to.length();
    to.divideScalar(dist || 1);
    this.vel.lerp(to.multiplyScalar(SPEED.homing * (0.8 + 0.2 * p.charge)), 1 - Math.exp(-10 * dt));
    if (this === G.player) G.post.speedTarget = 1;
    if (dist <= p.reach || this.stateT > 2.2 || !o.alive) {
      this.pending = null;
      this.startMove(p.name, { charge: p.charge });
    }
  }

  // SKYWARD: shoot straight up over the city, hang at the top in slow motion (the camera opens
  // up on the skyline), then any attack dives on him from above.
  skyward() {
    const gh = G.ground.heightAt(this.pos.x, this.pos.z);
    this.skyTop = clamp(this.pos.y + 110, gh + 90, gh + 200);
    this.setState('skyward');
    this.vel.set(this.vel.x * 0.3, SPEED.sky, this.vel.z * 0.3);
    G.audio && G.audio.whoosh(1, this.pos);
    this.shout('skyward');
    G.fx.shock.ring(this.pos.clone(), _w.set(0, 1, 0).clone(), 9, 0xdff3ff, 0.45, 0.25);
    G.fx.shock.flash(this.pos.clone(), 2.5, 0xffffff, 0.15);
    if (this.pos.y - gh < 6) G.fx.dustRing(new THREE.Vector3(this.pos.x, gh + 0.4, this.pos.z), 9, 12);
    if (this === G.player) { G.fightCam.fovKick(6); G.fightCam.addTrauma(0.2); }
  }

  _skyward(dt) {
    const left = this.skyTop - this.pos.y;
    this.vel.y = clamp(left * 2.6, 18, SPEED.sky);
    this.vel.x *= Math.exp(-3 * dt); this.vel.z *= Math.exp(-3 * dt);
    if (left < 3 || this.stateT > 2.5) {
      this.setState('skyhang');
      this.vel.set(0, 0, 0);
      if (this === G.player) G.time.slowmo(0.45, 0.5, 0.6);
    }
  }

  _skyhang(dt) {
    // drift and bob at the top; an attack dives, dash bails out, otherwise it times out
    this.vel.set(this.ctrl.move.x * 4, Math.sin(this.stateT * 3) * 0.6, this.ctrl.move.z * 4);
    if (this._consume('light') || this._consume('heavy') || this._consume('rise')) return this.skyDive();
    if (this._consume('dash') || this.stateT > 2.4) this.setState('free');
  }

  skyDive() {
    this.setState('skydive');
    this.vel.copy(this.dirToOpp(_w)).multiplyScalar(SPEED.dive * 0.5); // kick off, then accelerate
    G.audio && G.audio.whoosh(1, this.pos);
    G.fx.shock.ring(this.pos.clone(), this.dirToOpp(_w).clone(), 8, 0xfff0c0, 0.4, 0.2);
    this.shout('skydive', { duck: 0.25 });
  }

  _skydive(dt) {
    const o = this.opp;
    const to = _v.copy(o.pos).addScaledVector(o.vel, 0.08).sub(this.pos);
    const dist = to.length();
    to.divideScalar(dist || 1);
    // committed on the way in: it steers hard from far away, barely in the last 25 m, so a
    // late sidestep makes it miss (and crater the street instead)
    this.vel.lerp(to.multiplyScalar(SPEED.dive), 1 - Math.exp(-(dist > 25 ? 6 : 1.5) * dt));
    if (this === G.player) G.post.speedTarget = 1;
    if (dist < 4.5 && o.alive) return this.startMove('skyStrike', { charge: 1 });
    if (this.stateT > 3) this.setState('free');
  }

  _block(dt) {
    this.vel.multiplyScalar(Math.exp(-6 * dt));
    _v.copy(this.ctrl.move).multiplyScalar(6);
    this.vel.add(_v.multiplyScalar(dt * 4));
    if (!this.ctrl.held('block')) this.setState('free');
    if (this._consume('grab')) this._heavyGo('grab', 0);
  }

  // ---------------------------------------------------------------- attacks
  startMove(name, extra = {}) {
    const m = MOVES[name];
    // a grunt on some jabs and most hooks, every heavy; the super's scream is a warning even when
    // the lunge misses (charged moves shout on release, grabs when they connect, dives on the way down)
    const line = SHOUTS[name];
    if (line) this.shout(line[0], { odds: line[1], ...(name === 'superRush' ? { duck: 0.45, hold: 1.1 } : {}) });
    this.move = { name, def: m, ...extra };
    this.moveT = 0;
    this.moveHit = false;
    this.moveWhiffed = false;
    this.setState('attack');
    this.model.setAction(m.pose[0], 22);
    if (m.side === 'L') this.trailL.emitting = true; else this.trailR.emitting = true;
    G.audio && G.audio.swing(m.fx, this.pos);
  }

  _moveVal(key) {
    const m = this.move.def;
    const ch = this.move.charge || 0;
    return (m[key] || 0) + (m[key + 'Charge'] || 0) * ch;
  }

  _attack(dt) {
    const mv = this.move;
    const m = mv.def;
    this.moveT += dt;
    const t = this.moveT;
    const o = this.opp;
    const toOpp = this.dirToOpp(_w);
    const dist = this.pos.distanceTo(o.pos);
    if (t < m.startup) {
      // lunge-homing so attacks connect in 3D (arena-fighter convention)
      const lunge = this._moveVal('lunge');
      const want = clamp(dist - 1.7, 0, lunge);
      const remaining = Math.max(0.016, m.startup - t);
      _v.copy(toOpp).multiplyScalar(want / remaining);
      this.vel.lerp(_v, 1 - Math.exp(-25 * dt));
      if (!o.alive && dist > 12) this.vel.multiplyScalar(0.9);
    } else if (t < m.startup + m.active) {
      if (!mv.started) {
        mv.started = true;
        this.model.setAction(m.pose[1], 70);
        this.model.smear(m.side, 1);
      }
      this.vel.multiplyScalar(Math.exp(-14 * dt));
      if (!this.moveHit) this._tryHit(dist, toOpp);
    } else {
      this.vel.multiplyScalar(Math.exp(-8 * dt));
      if (!mv.recover) {
        mv.recover = true;
        this.trailL.emitting = false; this.trailR.emitting = false;
        if (!this.moveHit && !this.moveWhiffed) { this.moveWhiffed = true; this._whiff(); }
      }
      const rel = t - m.startup - m.active;
      // combo chaining
      if (m.next && rel < m.chain && (this.moveHit || rel > 0.02)) {
        if (this._consume('light')) return this.startMove(m.next);
        if (this.moveHit && this.buffer && this.buffer.a === 'heavy') { this.buffer = null; return this.startMove(this.ctrl.vert > 0.5 ? 'uppercut' : this.ctrl.vert < -0.5 ? 'meteor' : 'heavy'); }
      }
      if (rel > m.recovery * 0.4) this.model.setAction(null, 9);
      if (rel > m.recovery) {
        this.move = null;
        this.setState('free');
      }
    }
  }

  _whiff() {
    // missing a big swing still shoves the air: small shockwave forward, breaks windows
    const m = this.move.def;
    if (m.fx > 0.9) {
      _v.copy(this.pos).addScaledVector(this.dirToOpp(_u), 3);
      G.fx.shock.ring(_v.clone(), _u.clone(), 4 + m.fx * 4, 0xffffff, 0.3, 0.15, 0.6);
      G.destruction.impact({ pos: _v, radius: 1.5, power: 0.4, vel: _u.clone().multiplyScalar(30), shatter: 8 });
    }
  }

  _tryHit(dist, toOpp) {
    const m = this.move.def;
    const o = this.opp;
    if (dist > m.range + 0.6) return;
    if (o.invuln > 0 || o.state === 'down' || o.state === 'grabbed' || o.state === 'superVictim' || (o.ko && o.state !== 'launched')) return;
    this.moveHit = true;
    if (m.grab || m.superGrab) return this._startGrab(m.superGrab);
    const outcome = resolveHit(this, o, this.move, toOpp); // 'hit' | 'block' | 'parry' | 'guardBreak'
    G.game && G.game.onHit && G.game.onHit(this, o, this.move, outcome);
  }

  _charge(dt) {
    const c = this.ctrl;
    this.charge = Math.min(1, this.charge + dt / 0.9);
    _v.copy(c.move).multiplyScalar(7);
    _v.y += c.vert * 5;
    this.vel.lerp(_v, 1 - Math.exp(-5 * dt));
    this.model.setAction(this.chargeDir === 'up' ? 'upperW' : this.chargeDir === 'down' ? 'meteorW' : 'chargeW', 12);
    // gathering energy: sparks sucked inward, trembling, rising hum
    if (Math.random() < 0.6) {
      randomUnit(_v).multiplyScalar(rand(2, 4));
      const p = this.pos.clone().add(_v);
      G.fx.sparks.spawn(p.x, p.y, p.z, -_v.x * 3, -_v.y * 3, -_v.z * 3, 0.05, 0.06, 0.25, new THREE.Color(1, 0.85, 0.5), 0, 0);
    }
    if (this.charge >= 1 && !this.chargeFull) {
      this.chargeFull = true;
      G.fx.shock.flash(this.pos.clone(), 1.6, 0xfff0a0, 0.2);
      G.fx.shock.ring(this.pos.clone(), null, 4, 0xfff0a0, 0.3, 0.2);
    }
    G.fightCam && this === G.player && G.fightCam.addTrauma(0.012 * this.charge);
    G.audio && G.audio.chargeUpdate(this, this.charge);
    const release = !c.held('heavy') || this.stateT > 2.4;
    if (release) {
      G.audio && G.audio.chargeStop(this);
      const ch = this.charge;
      this.chargeFull = false;
      const name = this.chargeDir === 'up' ? 'uppercut' : this.chargeDir === 'down' ? 'meteor' : ch < 0.2 ? 'heavy' : 'heavyCharged';
      if (name !== 'heavy') this.shout('charge_release', { duck: 0.25 });
      this._heavyGo(name, name === 'heavy' ? 0 : ch);
    }
  }

  // ---------------------------------------------------------------- grab & super
  _startGrab(isSuper) {
    const o = this.opp;
    o.cancelActions();
    o.setState(isSuper ? 'superVictim' : 'grabbed');
    o.vel.set(0, 0, 0);
    this.setState(isSuper ? 'super' : 'grabbing');
    this.grab = { phase: 'hold', t: 0, punches: 0, dir: null, isSuper, hits: 0 };
    this.model.setAction('hold', 30);
    o.model.setAction('dangle', 20);
    G.time.freeze(0.07);
    G.fightCam && G.fightCam.addTrauma(0.25);
    G.audio && G.audio.grab(this.pos);
    if (!isSuper) this.shout('grab', { duck: 0.25, hold: 0.8 });
    if (isSuper) {
      this.meter = 0;
      G.post.letterboxTarget = 1;
      G.fightCam && G.fightCam.cinematic(this, o, 3.2);
      G.fx.comic('heavy', o.pos.clone().add(new THREE.Vector3(0, 2, 0)), 1);
    }
  }

  _holdVictim(offset = 1.25) {
    const o = this.opp;
    const f = this.dirToOpp(_v);
    f.y = clamp(f.y, -0.4, 0.4);
    f.normalize();
    o.pos.copy(this.pos).addScaledVector(f, offset).add(_w.set(0, 0.25, 0));
    o.vel.copy(this.vel);
  }

  _grabbing(dt) {
    const g = this.grab;
    const o = this.opp;
    g.t += dt;
    if (g.phase === 'hold') {
      this.vel.multiplyScalar(0.8);
      this._holdVictim();
      if (g.t > 0.28) {
        g.phase = 'drag'; g.t = 0;
        g.dir = this._pickDragDir();
        G.audio && G.audio.whoosh(1, this.pos);
        G.fx.shock.ring(this.pos.clone(), g.dir.clone(), 7, 0xffffff, 0.3, 0.2);
      }
    } else if (g.phase === 'drag') {
      // steer the drag (player) / keep heading (bot)
      if (this.ctrl.move.lengthSq() > 0.05) {
        _v.copy(this.ctrl.move).add(_u.set(0, this.ctrl.vert * 0.6, 0)).normalize();
        g.dir.lerp(_v, 1 - Math.exp(-2.5 * dt)).normalize();
      }
      if (this.pos.y < G.ground.heightAt(this.pos.x, this.pos.z) + 3 && g.dir.y < 0) g.dir.y *= 0.5;
      this.vel.copy(g.dir).multiplyScalar(SPEED.drag);
      // victim is held out in front and used as a battering ram
      o.pos.copy(this.pos).addScaledVector(g.dir, 1.6).add(_w.set(0, 0.1, 0));
      o.vel.copy(this.vel);
      const n = o._plow(dt, 2.2, 1.1);
      if (n > 0) { g.hits += n; o.takeDamage(Math.min(0.3 * n, 2), this, true); }
      G.post.speedTarget = 0.9;
      if (g.t > 1.25 || this.ctrl.pressed('grab') || this.ctrl.pressed('heavy') || this.ctrl.pressed('light')) {
        g.phase = 'throw'; g.t = 0;
        this.model.setAction('throw', 50);
        const dir = g.dir.clone(); dir.y += 0.05; dir.normalize();
        o.takeDamage(6 * this.power, this, false);
        o.launch(dir, SPEED.throw, this);
        juiceHit(o.pos.clone(), dir, 1.2, { hitstop: 0.14, sound: 'huge', comic: 'huge', victimIsPlayer: o === G.player });
        this.vel.multiplyScalar(0.15);
        this.meter = Math.min(100, this.meter + 10);
      }
    } else {
      this.vel.multiplyScalar(Math.exp(-6 * dt));
      if (g.t > 0.35) { this.grab = null; this.setState('free'); this.model.setAction(null, 10); }
    }
  }

  _pickDragDir() {
    // aim at the meatiest building in front (bot) or along the camera (player)
    const base = this === G.player && G.camera ? G.camera.getWorldDirection(new THREE.Vector3()) : this.dirToOpp(new THREE.Vector3());
    base.y = clamp(base.y, -0.25, 0.25);
    base.normalize();
    let best = null, bestScore = -1;
    for (const s of G.destruction.structs) {
      if (s.aliveCount < 30) continue;
      const c = _v.copy(s.min).add(s.max).multiplyScalar(0.5);
      c.y = clamp(this.pos.y, s.min.y + 2, s.max.y - 2);
      const to = c.sub(this.pos);
      const d = to.length();
      if (d < 8 || d > 90) continue;
      to.divideScalar(d);
      const align = to.dot(base);
      if (align < 0.55) continue;
      const score = align * 2 - d / 90;
      if (score > bestScore) { bestScore = score; best = to.clone(); }
    }
    return best || base;
  }

  _super(dt) {
    const g = this.grab;
    const o = this.opp;
    g.t += dt;
    this.vel.multiplyScalar(Math.exp(-6 * dt));
    if (g.phase !== 'done') this._holdVictim(1.15);
    if (g.phase === 'hold') {
      if (g.t > 0.3) { g.phase = 'barrage'; g.t = 0; }
    } else if (g.phase === 'barrage') {
      const interval = 0.105;
      if (g.t > interval) {
        g.t = 0;
        g.punches++;
        const side = g.punches % 2 ? 'R' : 'L';
        this.model.setAction(side === 'R' ? 'punchR' : 'punchL', 90);
        this.model.smear(side, 1);
        const hp = o.model.headWorld(new THREE.Vector3());
        const dir = this.dirToOpp(new THREE.Vector3());
        o.takeDamage(1.9 * this.power, this, false);
        o.model.hitFlash(1); o.model.hitSquash(dir, 0.8);
        o.model.setAction(g.punches % 2 ? 'hitHigh' : 'hitBody', 60);
        juiceHit(hp, dir, 0.55, { hitstop: 0.035, sound: 'barrage', comic: g.punches % 3 === 0 ? 'light' : null, victimIsPlayer: o === G.player });
        if (g.punches >= 10) { g.phase = 'windup'; g.t = 0; this.model.setAction('chargeW', 14); G.time.slowmo(0.3, 0.45, 5); G.audio && G.audio.chargeStart(this); this.shout('super_finish', { duck: 0.3 }); }
      }
    } else if (g.phase === 'windup') {
      G.fightCam && G.fightCam.addTrauma(0.02);
      if (g.t > 0.42) {
        G.audio && G.audio.chargeStop(this);
        this.model.setAction('chargeS', 90);
        this.model.smear('R', 1);
        const dir = this.dirToOpp(new THREE.Vector3());
        dir.y -= 0.32; dir.normalize();
        o.takeDamage(12 * this.power, this, false);
        o.launch(dir, SPEED.superLaunch, this);
        if (!o.ko) o.shout('hurt_heavy');
        juiceHit(o.pos.clone(), dir, 2.1, { hitstop: 0.24, impactFrame: true, sound: 'huge', comic: 'huge', slowmo: [0.22, 0.55], flash: 0.6, victimIsPlayer: o === G.player });
        G.post.letterboxTarget = 0;
        g.phase = 'done'; g.t = 0;
      }
    } else if (g.phase === 'done') {
      if (g.t > 0.4) { this.grab = null; this.setState('free'); this.model.setAction(null, 8); G.game && G.game.onSuperEnd(this); }
    }
  }

  cancelActions() {
    if (this.state === 'charge') G.audio && G.audio.chargeStop(this);
    this.move = null;
    this.pending = null;
    this.charge = 0;
    this.chargeFull = false;
    this.trailL.emitting = false; this.trailR.emitting = false;
    if (this.grab) {
      if (this.grab.isSuper) G.post.letterboxTarget = 0;
      this.grab = null;
      if (this.opp.state === 'grabbed' || this.opp.state === 'superVictim') this.opp.setState('free');
    }
  }

  // ---------------------------------------------------------------- receiving
  takeDamage(d, from, env) {
    if (this.ko) return;
    const st = G.game && G.game.state;
    if (st && st !== 'fight' && st !== 'tutorial') return; // no damage during intros / after the bell
    this.hp = Math.max(st === 'tutorial' ? 1 : 0, this.hp - d); // the tutorial knocks nobody out
    this.meter = Math.min(100, this.meter + d * 0.45);
    if (from && from !== this) { from.meter = Math.min(100, from.meter + d * 0.7); from.stats.dealt += d; }
    this.model.setDamage(1 - this.hp / this.maxHp);
    G.hud && G.hud.onDamage(this, d);
    if (this.hp <= 0) {
      this.ko = true;
      G.game && G.game.onKO(this, from);
    }
  }

  launch(dir, speed, from) {
    this.cancelActions();
    this.vel.copy(dir).multiplyScalar(speed);
    this.setState('launched');
    this.launchSmashCount = 0;
    this.launchDamage = 0;
    this.lastSmashStruct = -1;
    this.spinAxis.crossVectors(dir, UP);
    if (this.spinAxis.lengthSq() < 0.01) this.spinAxis.set(1, 0, 0);
    this.spinAxis.normalize();
    this.spinRate = speed * 0.09 * (chance(0.5) ? 1 : -1);
    this.model.setAction('tumble', 30);
    this.lastHitBy = from;
    // the match recap's highlight reel (game/recorder.js)
    if (from && speed >= 70 && G.recorder) {
      const kind = from.state === 'super' ? 'super' : from.move && from.move.name === 'skyStrike' ? 'skydive' : from.state === 'grabbing' ? 'throw' : 'launch';
      G.recorder.mark(kind, { pos: this.pos, dir, by: from, on: this, bonus: (speed - 70) / 25 + (from.move && from.move.charge || 0) * 2 });
    }
  }

  _hitstun(dt) {
    this.vel.multiplyScalar(Math.exp(-4.5 * dt));
    if (this.stateT > this.stunT) { this.setState('free'); this.model.setAction(null, 12); }
  }

  _launched(dt) {
    const sp = this.vel.length();
    this.vel.y -= 7 * dt;
    this.vel.multiplyScalar(Math.exp(-0.45 * dt));
    _q.setFromAxisAngle(this.spinAxis, this.spinRate * dt);
    this.spin.premultiply(_q);
    this.spinRate *= Math.exp(-0.8 * dt);
    G.post && this === G.player && (G.post.speedTarget = clamp((sp - 40) / 90, 0, 1));
    // smoke trail while flying fast
    const chaseCam = this === G.player && G.fightCam && G.fightCam.chase > 0.2;
    if (sp > 45 && !chaseCam && Math.random() < 0.5 && this.stateT > 0.08 && G.camera.position.distanceTo(this.pos) > 12) G.fx.dustPuff(this.pos, 0.35 + sp * 0.003, 1, 'white', _v.copy(this.vel).multiplyScalar(-0.05), 0.5 + Math.random() * 0.4);
    // air recovery
    const canRecover = this.stateT > 0.45 && !this.ko;
    if (canRecover && (this.ctrl.pressed('dash') || this.ctrl.pressed('up') || this.ctrl.pressed('block') || this.ctrl.pressed('light'))) {
      return this._airRecover();
    }
    if (sp < 16 && this.stateT > 0.3) {
      if (this.ko) { this.vel.y -= 20 * dt; return; }
      this._airRecover(true);
    }
  }

  _airRecover(auto) {
    this.vel.multiplyScalar(auto ? 0.4 : 0.12);
    this.setState('free');
    this.spin.identity();
    this.invuln = 0.35;
    this.model.setAction('recover', 30);
    setTimeout(() => this.model.setAction(null, 10), 180);
    G.fx.shock.ring(this.pos.clone(), null, 5, 0xe8f6ff, 0.3, 0.25);
    G.fx.dustPuff(this.pos, 1.2, 3, 'white', null, 0.7);
    G.audio && G.audio.whoosh(0.8, this.pos);
    if (!auto) this.shout('getup', { odds: 0.35 });
  }

  _down(dt) {
    this.vel.multiplyScalar(Math.exp(-6 * dt));
    if (this.ko) return;
    if (this.stateT > 0.85 || (this.stateT > 0.4 && (this.ctrl.pressed('up') || this.ctrl.pressed('dash')))) {
      this.setState('free');
      this.invuln = 0.6;
      this.spin.identity();
      this.vel.set(0, 12, 0);
      this.model.setAction('recover', 25);
      setTimeout(() => this.model.setAction(null, 10), 220);
      G.fx.dustRing(this.pos, 5, 8);
      G.audio && G.audio.whoosh(0.6, this.pos);
      this.shout('getup');
    }
  }

  _ko(dt) {
    this.vel.multiplyScalar(Math.exp(-3 * dt));
  }

  // ---------------------------------------------------------------- integration
  // Plow through buildings along the motion this frame. Returns chunks destroyed.
  _plow(dt, radiusBase = 1.4, powerK = 1) {
    const sp = this.vel.length();
    if (sp < 1) return 0;
    let total = 0;
    const steps = Math.max(1, Math.ceil((sp * dt) / 1.3));
    const r = radiusBase + sp * 0.011;
    for (let i = 1; i <= steps; i++) {
      _v.copy(this.pos).addScaledVector(this.vel, (dt * i) / steps);
      const near = G.destruction.structsNear(_v, r);
      if (!near.length) continue;
      const res = G.destruction.impact({ pos: _v, radius: r, power: clamp(sp / 110, 0.3, 1.6) * powerK, vel: this.vel, shatter: r * 2.4 + sp * 0.04, maxChunks: 40 });
      if (res.count > 0) {
        const sid = near[0].id;
        const first = sid !== this.lastSmashStruct;
        this.lastSmashStruct = sid;
        juiceSmash(_v, this.vel, res.count, first);
        total += res.count;
        if (first) G.audio && G.audio.smashThrough(clamp(sp / 140, 0.3, 1), _v);
        if (first && this.state === 'launched' && sp > 45 && G.recorder) {
          G.recorder.mark('smash', { pos: _v, dir: this.vel, by: this.lastHitBy, on: this, name: near[0].name, bonus: Math.min(3, sp / 60) + (near[0].name ? 3 : 0) });
        }
      }
    }
    if (total > 0) {
      const keep = Math.max(0.72, Math.pow(0.985, total));
      this.vel.multiplyScalar(keep);
    }
    return total;
  }

  _integrate(dt) {
    const sp = this.vel.length();
    const st = this.state;
    const plowing = st === 'launched' || st === 'rush' || (st === 'grabbing' && this.grab && this.grab.phase === 'drag') || sp > SPEED.smash || st === 'dash';
    if (st === 'launched' || st === 'rush' || sp > SPEED.smash) {
      const n = this._plow(dt, st === 'launched' ? 1.5 : 1.15, st === 'launched' ? 1 : 0.8);
      if (n > 0 && st === 'launched') {
        this.launchSmashCount += n;
        if (this.launchDamage < 9) { const d = Math.min(9 - this.launchDamage, n * 0.12); this.launchDamage += d; this.takeDamage(d, this.lastHitBy, true); }
      }
    }
    this.pos.addScaledVector(this.vel, dt);

    // building collision for normal-speed flight: bump instead of passing through
    if (!plowing || st === 'dash') {
      _v.copy(this.pos).add(_w.set(0, 0.2, 0));
      if (G.destruction.resolveSphere(_v, 0.85, _u)) {
        this.pos.add(_u);
        const l = _u.length();
        if (l > 1e-4) {
          _u.divideScalar(l);
          const into = this.vel.dot(_u);
          if (into < 0) this.vel.addScaledVector(_u, -into);
        }
      }
    }

    // ground
    const gh = G.ground.heightAt(this.pos.x, this.pos.z);
    const floor = gh + (st === 'down' || (this.ko && st !== 'launched') ? 0.35 : st === 'landed' ? 0.6 : 1.05);
    if (this.pos.y < floor) {
      if (st === 'land') {
        G.fx.groundImpact(this.pos.clone(), 95); // big, but small enough to still see the pose
        G.fightCam && G.fightCam.addTraumaAt(this.pos, 0.7, 500);
        this.vel.set(0, 0, 0);
        this.setState('landed');
      } else if (st === 'skydive' && this.vel.y < -30) {
        // a dive that missed ends in the street: crater, and a moment to get up
        G.fx.groundImpact(this.pos.clone(), Math.min(130, this.vel.length() * 0.7));
        G.fightCam && G.fightCam.addTraumaAt(this.pos, 0.5, 300);
        this.vel.set(0, 0, 0);
        this.setState('stagger');
        this.staggerT = 0.45;
      } else if (st === 'launched' && this.vel.y < -14) {
        const impactSp = this.vel.length();
        G.fx.groundImpact(this.pos.clone(), impactSp * Math.min(1, (-this.vel.y / impactSp) * 1.6 + 0.2));
        if (impactSp > 70 && G.recorder) G.recorder.mark('slam', { pos: this.pos, dir: this.vel, by: this.lastHitBy, on: this, bonus: (impactSp - 70) / 40 });
        this.takeDamage(clamp(impactSp * 0.03, 1, 6), this.lastHitBy, true);
        this.vel.y = Math.abs(this.vel.y) * 0.22;
        this.vel.x *= 0.5; this.vel.z *= 0.5;
        if (this.vel.length() < 22 || this.ko) {
          this.setState('down');
          this.spin.identity();
          this.model.setAction('down', 20);
        }
      } else if (st === 'launched') {
        // grazing: skid and plow a trench
        const h = Math.hypot(this.vel.x, this.vel.z);
        if (h > 20) {
          G.ground.crater(this.pos.x, this.pos.z, 1.8 + h * 0.012, 0.6 + h * 0.004, { cracks: 0.25 });
          if (Math.random() < 0.5) G.fx.pebbleBurst(this.pos, 4, _v.set(this.vel.x * 0.3, 6, this.vel.z * 0.3), new THREE.Color(0.4, 0.4, 0.42));
          if (Math.random() < 0.5) G.fx.dustPuff(this.pos, 1.2, 1, 'dust', _v.set(this.vel.x * 0.1, 2, this.vel.z * 0.1));
          G.fightCam && G.fightCam.addTraumaAt(this.pos, 0.06, 120);
          G.audio && G.audio.skid(h, this.pos);
        }
        this.vel.x *= Math.exp(-2.2 * dt); this.vel.z *= Math.exp(-2.2 * dt);
        this.vel.y = Math.max(0, this.vel.y);
        if (h < 14) { this.setState('down'); this.spin.identity(); this.model.setAction('down', 20); }
      } else if (this.vel.y < 0) this.vel.y = 0;
      this.pos.y = floor;
    }
    // arena bounds: the square edge of the destructible city (shown as a force field)
    for (const ax of ['x', 'z']) {
      if (Math.abs(this.pos[ax]) > ARENA) {
        this.pos[ax] = Math.sign(this.pos[ax]) * ARENA;
        if (this.vel[ax] * this.pos[ax] > 0) {
          if (st === 'launched' && Math.abs(this.vel[ax]) > 25) {
            G.fx.shock.ring(this.pos.clone(), new THREE.Vector3(ax === 'x' ? 1 : 0, 0, ax === 'z' ? 1 : 0), 10, 0xffe08a, 0.4, 0.15);
            G.audio && G.audio.field(this.pos);
          }
          this.vel[ax] *= st === 'launched' ? -0.35 : 0;
        }
      }
    }
    if (this.pos.y > CEILING) { this.pos.y = CEILING; this.vel.y = Math.min(0, this.vel.y); }
  }

  // ---------------------------------------------------------------- presentation
  _orient(dt, realDt) {
    const o = this.opp;
    const k = dt > 0 ? dt : 0;
    const sp = this.vel.length();
    const st = this.state;
    // flight pose when cruising fast and not fighting
    const wantFly = (st === 'free' && (this.boosting || this.exploring) && sp > (this.exploring ? 14 : 32)) || st === 'rush' || st === 'homing' || st === 'skyward' || st === 'skydive' || st === 'dash' && sp > 50;
    this.flyBlend = damp(this.flyBlend, wantFly ? 1 : 0, 6, k);
    // standing frame: yaw toward opponent, partial pitch, lean from velocity
    _v.subVectors(o.pos, this.pos);
    if (this.exploring) {
      // free roam: face where he's flying, or where the camera looks while he hovers
      if (Math.hypot(this.vel.x, this.vel.z) > 3) _v.set(this.vel.x, 0, this.vel.z);
      else G.fightCam.exploreDir(_v).setY(0);
    }
    if (st === 'launched' || st === 'down' || st === 'ko') _v.copy(this.vel).negate();
    const yaw = Math.atan2(_v.x, _v.z);
    const horiz = Math.hypot(_v.x, _v.z);
    const pitch = clamp(-Math.atan2(_v.y, horiz) * 0.35, -0.5, 0.5);
    _q.setFromAxisAngle(UP, yaw);
    // local velocity for lean
    const inv = _q2.copy(_q).invert();
    _w.copy(this.vel).applyQuaternion(inv);
    const leanF = clamp(_w.z / 60, -0.5, 0.6);
    const leanR = clamp(-_w.x / 60, -0.5, 0.5);
    _q2.setFromEuler(new THREE.Euler(pitch + leanF * 0.7, 0, leanR * 0.8));
    _q.multiply(_q2);
    if (this.flyBlend > 0.01 && sp > 1) {
      // flight frame: body axis along velocity, chest facing down
      const yAxis = _w.copy(this.vel).normalize();
      const down = _u.set(0, -1, 0);
      let zAxis = down.sub(yAxis.clone().multiplyScalar(down.dot(yAxis)));
      if (zAxis.lengthSq() < 1e-3) zAxis.set(0, 0, 1);
      zAxis.normalize();
      const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis);
      _m.makeBasis(xAxis, yAxis, zAxis);
      _q2.setFromRotationMatrix(_m);
      _q.slerp(_q2, this.flyBlend);
    }
    if (st === 'launched' || st === 'ko' && this.stateT < 3) {
      _q.premultiply(this.spin);
    }
    if (st === 'down' || (this.ko && st !== 'launched')) {
      // lie on the back
      _q2.setFromEuler(new THREE.Euler(-Math.PI / 2, yaw, 0, 'YXZ'));
      _q.copy(_q2);
    }
    if (st === 'grabbed' || st === 'superVictim') {
      _v.subVectors(o.pos, this.pos);
      _q.setFromAxisAngle(UP, Math.atan2(_v.x, _v.z));
    }
    this.quat.slerp(_q, st === 'launched' ? 1 : 1 - Math.exp(-14 * (k || 0)));
    this.model.root.quaternion.copy(this.quat);

    // base pose selection
    let base = 'guard';
    const reaching = st === 'homing' && this.pending && this.pending.name === 'grab'; // both hands out for the grab
    if (this.flyBlend > 0.5) base = st === 'rush' || st === 'skyward' || st === 'skydive' || reaching ? 'flyBoth' : 'fly';
    else if (st === 'free' && this.taunting > 0) base = 'taunt';
    else if (st === 'free' && sp < 4 && this.opp.state === 'down') base = this.def.cape ? 'taunt' : 'guard';
    else if (st === 'free' && this.pos.distanceTo(o.pos) > 30 && sp < 10) base = this.def.cape ? 'taunt' : 'idle';
    if (st === 'launched') base = 'tumble';
    if (st === 'down' || this.ko && st !== 'launched') base = 'down';
    if (st === 'grabbed' || st === 'superVictim') base = 'dangle';
    if (st === 'block') base = 'block';
    if (st === 'land') base = 'dive';
    if (st === 'landed') base = 'heroLand';
    this.model.setBase(base);
    if (st === 'block') this.model.setAction(null, 20);
  }

  _trails() {
    const t = G.time.gameTime;
    const cam = G.camera;
    if (this.trailL.emitting) this.trailL.push(this.model.handWorld('L', _v), t);
    if (this.trailR.emitting) this.trailR.push(this.model.handWorld('R', _v), t);
    const sp = this.vel.length();
    this.trailBody.emitting = sp > 38 && this.state !== 'launched';
    if (this.trailBody.emitting) this.trailBody.push(this.model.chestWorld(_v), t);
    this.trailL.update(t, cam); this.trailR.update(t, cam); this.trailBody.update(t, cam);
  }
}

// Destruction aim-assist: bend big launches toward the nearest building in the cone, so a
// good hit almost always ends in a body-shaped hole through a skyscraper.
export function aimAtBuilding(from, dir, maxAngle = 0.5, range = 150) {
  let best = null, bestScore = Infinity;
  for (const s of G.destruction.structs) {
    if (s.aliveCount < 40) continue;
    const t = new THREE.Vector3((s.min.x + s.max.x) / 2, clamp(from.y, s.min.y + 3, s.max.y - 4), (s.min.z + s.max.z) / 2);
    const to = t.sub(from);
    const d = to.length();
    if (d < 6 || d > range) continue;
    to.divideScalar(d);
    const ang = Math.acos(clamp(to.dot(dir), -1, 1));
    if (ang > maxAngle) continue;
    const score = ang * 60 + d * 0.25;
    if (score < bestScore) { bestScore = score; best = to.clone(); }
  }
  if (best) dir.lerp(best, 0.85).normalize();
  return dir;
}

// ---------------------------------------------------------------- hit resolution
export function resolveHit(att, vic, mv, dirIn) {
  const dir = dirIn.clone();
  const m = mv.def;
  const ch = mv.charge || 0;
  const point = vic.hurtCenter(new THREE.Vector3()).addScaledVector(dir, -0.4);
  const val = (k) => (m[k] || 0) + (m[k + 'Charge'] || 0) * ch;
  const facing = _v.subVectors(att.pos, vic.pos).normalize().dot(_w.set(0, 0, 1).applyQuaternion(vic.quat)) > -0.2;
  const strength = val('fx');
  const playerVictim = vic === G.player;

  // ---- block / parry / guard break
  if (vic.state === 'block' && facing) {
    if (vic.blockPressT < 0.14) {
      // parry: attacker staggers, time dilates, defender gets meter
      att.cancelActions();
      att.setState('stagger'); att.staggerT = 0.6;
      att.vel.copy(dir).multiplyScalar(-14);
      vic.meter = Math.min(100, vic.meter + 15);
      juiceHit(point, dir, 0.9, { hitstop: 0.12, blocked: true, sound: 'parry', comic: 'parry', slowmo: [0.3, 0.3], flash: 0.25 });
      att.shout('hurt_light', { odds: 0.6 });
      G.hud && G.hud.flashText(vic, 'PARRY!');
      return 'parry';
    }
    if (m.guardBreak && ch >= m.guardBreak) {
      vic.setState('stagger'); vic.staggerT = 0.8;
      vic.vel.copy(dir).multiplyScalar(30);
      juiceHit(point, dir, 1.2, { hitstop: 0.14, sound: 'huge', comic: 'heavy', victimIsPlayer: playerVictim });
      G.hud && G.hud.flashText(vic, 'GUARD BREAK!');
      vic.shout('hurt_light');
      return 'guardBreak';
    }
    const chip = val('dmg') * 0.12 * att.power;
    vic.takeDamage(chip, att, false);
    vic.vel.copy(dir).multiplyScalar(8 + val('launch') * 0.25);
    juiceHit(point, dir, strength * 0.5, { hitstop: m.hitstop * 0.6, blocked: true, sound: 'block', victimIsPlayer: playerVictim });
    G.fx.comic('block', point, 0.6);
    vic.shout('block', { odds: 0.6 });
    return 'block';
  }

  // ---- clean hit
  vic.cancelActions();
  const scale = Math.max(0.45, 1 - vic.comboTaken * 0.07);
  const dmg = val('dmg') * att.power * scale;
  vic.comboTaken++;
  vic.comboTimer = 1.2;
  att.stats.hits++;
  att.stats.maxCombo = Math.max(att.stats.maxCombo, vic.comboTaken);
  vic.takeDamage(dmg, att, false);
  vic.model.hitFlash(1);
  vic.model.hitSquash(dir, 0.6 + strength * 0.4);
  G.hud && G.hud.onCombo(att, vic.comboTaken);

  const launch = val('launch');
  if (launch > 0 || vic.ko) {
    const ld = dir.clone();
    if (m.dir === 'up') ld.set(dir.x * 0.25, 1, dir.z * 0.25).normalize();
    else if (m.dir === 'down') ld.set(dir.x * 0.35, -1, dir.z * 0.35).normalize();
    else {
      // keep launches mostly horizontal so bodies go *through* the skyline, not over it
      ld.y = clamp(ld.y, -0.45, 0.18) + (m.up || 0.08) * 0.5;
      ld.normalize();
      if (launch >= 60) aimAtBuilding(vic.pos, ld, 0.42 + ch * 0.2);
    }
    vic.launch(ld, Math.max(launch, vic.ko ? 110 : 0), att);
    if (!vic.ko) vic.shout('hurt_heavy');
    const huge = (m.impactFrame && ch >= m.impactFrame) || vic.ko;
    const slow = huge ? [0.2, 0.6] : m.slowmo;
    juiceHit(point, ld, strength + (vic.ko ? 0.6 : 0), {
      hitstop: val('hitstop') + (vic.ko ? 0.12 : 0), impactFrame: huge, sound: m.sound, comic: m.comic,
      slowmo: slow, victimIsPlayer: playerVictim, flash: huge ? 0.35 : 0,
    });
    // pressure wave continues past the victim and slaps the buildings behind
    G.destruction.impact({ pos: point.clone().addScaledVector(ld, 4), radius: 1.2 + strength, power: 0.5, vel: ld.clone().multiplyScalar(40), shatter: 6 + strength * 8 });
    G.debris.explosion(point, 10 + strength * 8, 10 * strength, 0.3);
  } else {
    vic.setState('hitstun');
    vic.stunT = m.hitstun;
    vic.vel.copy(dir).multiplyScalar(m.kb);
    vic.model.setAction(chance(0.5) ? 'hitHigh' : 'hitBody', 60);
    vic.shout('hurt_light', { odds: 0.6 });
    juiceHit(point, dir, strength, { hitstop: m.hitstop, sound: m.sound, comic: strength > 0.5 && chance(0.4) ? 'light' : null, victimIsPlayer: playerVictim });
  }
  att.meter = Math.min(100, att.meter + (m.meter || 3) * 0.5);
  return 'hit';
}
