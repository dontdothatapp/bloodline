// Bot brain. Writes virtual inputs into fighter.ctrl, so bots obey exactly the same rules
// (frame data, buffers, recoveries) as the player.
import * as THREE from 'three';
import { G } from '../core/context.js';
import { rand, chance, pick, clamp, UP } from '../core/math.js';

export const DIFFICULTY = {
  // breather: how readily he breaks off after an exchange to hover over the city
  training: { react: 9, block: 0, dodge: 0, aggression: 0, combo: [1, 1], recover: 0.2, charge: 0, grab: 0, rush: 0, superUse: 0, breather: 0, passive: true },
  sparring: { react: 0.42, block: 0.22, dodge: 0.12, aggression: 0.38, combo: [1, 3], recover: 0.35, charge: 0.2, grab: 0.12, rush: 0.35, superUse: 0.5, breather: 0.4 },
  brutal: { react: 0.26, block: 0.42, dodge: 0.25, aggression: 0.62, combo: [2, 4], recover: 0.65, charge: 0.32, grab: 0.2, rush: 0.75, superUse: 0.9, breather: 0.25 },
  viltrumite: { react: 0.16, block: 0.6, dodge: 0.32, aggression: 0.82, combo: [3, 4], recover: 0.92, charge: 0.42, grab: 0.25, rush: 0.95, superUse: 1, breather: 0.12 },
};

const LINES = {
  start: ['You can\'t win this, son.', 'Let\'s see what you\'ve got.', 'Don\'t make me hurt you.', 'Listen to me!'],
  playerDown: ['Stay down.', 'Why do you make me do this?', 'THINK!', 'Look what you made me do.', 'This city is nothing.', 'I\'m barely trying.'],
  hurt: ['Hm. Not bad.', 'Is that all?', 'Again!', 'Ha!'],
  low: ['Impossible...', 'You\'re stronger than I thought.', 'Enough!'],
  win: ['You\'ll outlive all of them.', 'It didn\'t have to be this way.'],
  heirWin: ['I\'m not you!', 'I\'ll protect this planet!'],
  breather: ['Look at this city.', 'They\'ll rebuild. They always do.', 'Come up here, son.', 'All this, for them?', 'Catch your breath.'],
};

const _p = new THREE.Vector3();

export class Brain {
  constructor(fighter, diffName, opts = {}) {
    this.f = fighter;
    this.setDifficulty(diffName);
    this.think = 0;
    this.plan = 'approach';
    this.strafeDir = 1;
    this.vertOff = rand(-3, 2);
    this.comboLeft = 0;
    this.chargeHold = 0;
    this.blockHold = 0;
    this.reactT = 0;
    this.reactingTo = null;
    this.recoverAt = 0;
    this.followUp = 0;
    this.talkCd = 3;
    this.lines = opts.lines !== false;
    this.wasDown = false;
    this.breather = 0;       // seconds left hovering out of reach, above the rooftops
    this.sinceBreather = 0;
    this.perch = new THREE.Vector3();
    this.drill = null;       // tutorial drill for the training dummy: null | 'swing' | 'keepAway'
  }

  setDifficulty(name) { this.d = DIFFICULTY[name] || DIFFICULTY.brutal; this.dname = name; }

  say(kind) {
    if (!this.lines || this.talkCd > 0 || !G.hud) return;
    this.talkCd = rand(5, 9);
    G.hud.speech(this.f, pick(LINES[kind]));
  }

  update(dt) {
    const f = this.f, o = f.opp, c = f.ctrl, d = this.d;
    this.talkCd -= dt;
    c.move.set(0, 0, 0);
    c.vert = 0;
    if (!f.alive || !o) { for (const a of ['block', 'heavy', 'dash']) c.release(a); return; }

    const to = new THREE.Vector3().subVectors(o.pos, f.pos);
    const dist = to.length();
    const dir = to.clone().divideScalar(dist || 1);
    const right = new THREE.Vector3().crossVectors(dir, UP).normalize();

    // ---- being launched: tech out
    if (f.state === 'launched') {
      if (!this.recoverAt) this.recoverAt = f.stateT + rand(0.45, 0.9) + (chance(d.recover) ? 0 : 9);
      if (f.stateT > this.recoverAt) { c.tap('dash'); this.recoverAt = 0; }
      return;
    }
    this.recoverAt = 0;
    if (f.state === 'down') { if (chance(d.recover * dt * 3)) c.tap('up'); return; }
    if (f.state === 'grabbed' || f.state === 'superVictim' || f.state === 'hitstun' || f.state === 'stagger') { c.release('block'); c.release('heavy'); this.breather = 0; return; }
    this.sinceBreather += dt;

    if (o.state === 'down' && !this.wasDown) { this.say('playerDown'); if (f.def.cape && chance(0.6)) { f.taunting = rand(1.2, 2.2); f.shout('taunt'); } }
    this.wasDown = o.state === 'down';

    // ---- grab drag: steer at buildings (dir already chosen), throw late; flights fly themselves
    if (f.state === 'grabbing' || f.state === 'super') return;
    if (f.state === 'homing' || f.state === 'skyward' || f.state === 'skyhang' || f.state === 'skydive') return;

    if (d.passive) {
      // training dummy: hovers and never attacks, except in the tutorial's drills (game/tutorial.js):
      // 'swing' closes in and throws a jab now and then for you to block, 'keepAway' backs off
      // so the grab has to reach him
      if (this.drill === 'swing') {
        if (dist > 3.4) c.move.copy(dir);
        c.vert = clamp(to.y * 0.3, -1, 1);
        this.drillT = (this.drillT || 0) - dt;
        if (f.state === 'free' && dist < 4.5 && this.drillT <= 0) { c.tap('light'); this.drillT = 1.5; }
      } else if (this.drill === 'keepAway') {
        if (dist < 30) c.move.set(-dir.x, 0, -dir.z).normalize();
        c.vert = clamp((o.pos.y + 3 - f.pos.y) * 0.15, -1, 1);
      } else c.move.copy(right).multiplyScalar(Math.sin(G.time.gameTime * 0.5) * 0.3);
      if (f.hp < f.maxHp) f.hp = Math.min(f.maxHp, f.hp + dt * 4);
      return;
    }

    // ---- follow up a launch with a rush (the father never lets you breathe)
    if (o.state === 'launched' && o.lastHitBy === f && f.state === 'free') {
      if (o.vel.length() > 30 && o.stateT > 0.12 && chance(d.rush * dt * 6) && dist > 10) {
        c.move.copy(dir);
        c.tap('dash');
        this.followUp = 1.5;
        return;
      }
    }
    if (this.followUp > 0) {
      this.followUp -= dt;
      if (f.state === 'free' && dist < 7) { c.tap(chance(0.55) ? 'light' : 'heavy'); this.comboLeft = 2; this.followUp = 0; if (c.held('heavy')) c.release('heavy'); }
    }

    // ---- defense: react to the opponent's startup
    if (o.state === 'attack' && o.move && dist < (o.move.def.range + o.move.def.lunge + 2)) {
      if (this.reactingTo !== o.move) {
        this.reactingTo = o.move;
        this.reactT = d.react * rand(0.7, 1.3);
        this.defense = chance(d.block) ? 'block' : chance(d.dodge) ? 'dodge' : 'none';
        if (o.move.def.grab && this.defense === 'block') this.defense = chance(0.5) ? 'dodge' : 'none';
      }
    } else if (o.state === 'charge' && dist < 18 && this.reactingTo !== 'charge') {
      this.reactingTo = 'charge';
      this.reactT = d.react;
      this.defense = chance(d.dodge + 0.15) ? 'dodge' : chance(0.4) ? 'punish' : 'none';
    } else if (o.state === 'skydive' && dist < 40 && this.reactingTo !== 'skydive') {
      // a dive from the sky is telegraphed: sidestep it late (or brace for it)
      this.reactingTo = 'skydive';
      this.reactT = d.react * rand(1, 1.6);
      this.defense = chance(d.dodge + 0.15) ? 'dodge' : chance(d.block) ? 'block' : 'none';
    }
    if (this.reactingTo) {
      this.reactT -= dt;
      if (this.reactT <= 0 && f.canAct) {
        if (this.defense === 'block') { c.press('block'); this.blockHold = 0.45; }
        else if (this.defense === 'dodge') { c.move.copy(right).multiplyScalar(chance(0.5) ? 1 : -1).addScaledVector(dir, -0.3); c.tap('dash'); }
        else if (this.defense === 'punish' && dist < 6) { c.tap('light'); this.comboLeft = 2; }
        this.reactingTo = null;
        this.defense = 'none';
      }
    }
    if (this.blockHold > 0) {
      this.blockHold -= dt;
      if (this.blockHold <= 0 || (o.state !== 'attack' && o.state !== 'charge')) { c.release('block'); this.blockHold = 0; }
      else { c.press('block'); return; }
    }

    // ---- combo continuation
    if (f.state === 'attack' && f.move) {
      const m = f.move.def;
      if (m.next && this.comboLeft > 0 && f.moveT > m.startup + m.active + 0.02) {
        this.comboLeft--;
        if (this.comboLeft === 0 && chance(0.45)) c.tap('heavy');
        else c.tap('light');
      }
      return;
    }

    // ---- charging: hold until in lunge range, then release
    if (f.state === 'charge') {
      this.chargeHold -= dt;
      c.move.copy(dir).multiplyScalar(0.6);
      c.vert = clamp(to.y * 0.2, -1, 1);
      const reach = 4 + f.charge * 15;
      if ((dist < reach && f.charge > 0.35) || this.chargeHold <= 0) c.release('heavy');
      else c.press('heavy');
      return;
    }

    // ---- breather: break off, climb high over the city and watch; dive back in when it's over
    // or when he comes after you. The fight gets quiet moments, the camera gets the skyline.
    if (this.breather > 0) {
      this.breather -= dt;
      const toPerch = _p.subVectors(this.perch, f.pos);
      const far = toPerch.length();
      c.move.set(toPerch.x, 0, toPerch.z);
      if (c.move.lengthSq() > 4) c.move.normalize(); else c.move.set(0, 0, 0);
      c.vert = clamp(toPerch.y * 0.15, -1, 1);
      if (far > 20) c.press('dash'); else c.release('dash');
      if (this.breather <= 0 || dist < 12) {
        // from up there, half the time he comes back down as a dive
        const high = this.breather <= 0 && f.pos.y - o.pos.y > 18;
        this.breather = 0;
        c.release('dash');
        this.plan = 'approach';
        if (high && chance(0.5)) f.skyDive();
      }
      return;
    }

    // ---- planning
    this.think -= dt;
    if (this.think <= 0) {
      this.think = rand(0.18, 0.45);
      if (chance(0.15)) this.strafeDir *= -1;
      if (chance(0.1)) this.vertOff = rand(-3, 2);
      const r = Math.random();
      if (f.meter >= 100 && dist < 16 && chance(d.superUse)) { c.tap('super'); return; }
      if (this.sinceBreather > 7 && dist < 9 && f.state === 'free' && chance(d.breather * 0.3)) {
        const away = _p.set(f.pos.x - o.pos.x, 0, f.pos.z - o.pos.z);
        if (away.lengthSq() < 1) away.set(rand(-1, 1), 0, rand(-1, 1));
        away.normalize().applyAxisAngle(UP, rand(-0.8, 0.8));
        this.perch.copy(o.pos).addScaledVector(away, rand(35, 45));
        this.perch.y = clamp(o.pos.y + rand(35, 60), 40, 110);
        this.breather = rand(2, 3.4);
        this.sinceBreather = 0;
        this.say('breather');
        return;
      }
      if (dist > 26) this.plan = 'approach';
      else if (dist < 4.5) {
        if (r < d.aggression) {
          this.plan = 'strafe';
          if (o.state === 'block' && chance(0.5 + d.grab)) c.tap('grab');
          else if (chance(d.grab * 0.5)) c.tap('grab');
          else { c.tap('light'); this.comboLeft = Math.floor(rand(d.combo[0], d.combo[1] + 0.99)) - 1; }
        } else this.plan = chance(0.5) ? 'strafe' : 'retreat';
      } else {
        if (r < d.charge * 0.6 && dist > 7) { c.press('heavy'); this.chargeHold = rand(0.6, 1.4); this.plan = 'approach'; }
        else this.plan = r < 0.3 + d.aggression * 0.6 ? 'approach' : 'strafe';
      }
      if (f.hp < f.maxHp * 0.3) this.say('low');
    }

    // ---- movement
    // fight inside the skyline band, where there are buildings to smash
    const wantY = clamp(o.pos.y + this.vertOff, 6, 64) - f.pos.y;
    c.vert = clamp(wantY * 0.25, -1, 1);
    if (this.plan === 'approach') {
      c.move.copy(dir).addScaledVector(right, this.strafeDir * 0.25).normalize();
      if (dist > 22) c.press('dash'); else c.release('dash');
    } else if (this.plan === 'strafe') {
      c.release('dash');
      c.move.copy(right).multiplyScalar(this.strafeDir * 0.8).addScaledVector(dir, dist > 6 ? 0.5 : dist < 3 ? -0.4 : 0);
    } else if (this.plan === 'retreat') {
      c.release('dash');
      c.move.copy(dir).multiplyScalar(-0.7).addScaledVector(right, this.strafeDir * 0.5);
    }
    c.move.y = 0;
    if (c.move.lengthSq() > 1) c.move.normalize();
  }
}
