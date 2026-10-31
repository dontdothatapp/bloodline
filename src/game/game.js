// Game flow: title -> intro -> fight -> KO -> next round / match end. Destruction persists
// between rounds (the city remembers); a rematch rebuilds the city. The title's TUTORIAL runs
// the 'tutorial' state instead (game/tutorial.js), which can go on to a real fight.
import * as THREE from 'three';
import { G, URLP, reloadWith } from '../core/context.js';
import { Fighter } from './fighter.js';
import { HEROES } from './character.js';
import { Brain } from './ai.js';
import { Intro } from './intro.js';
import { Tutorial } from './tutorial.js';
import { clamp, UP } from '../core/math.js';

const ROUND_TIME = 99;
// prompts name the pad's buttons while one is being played, the on-screen ones on touch
const key = (desk, touch, pad) => (G.input.usingPad ? pad : G.touch ? touch : desk);
const pb = (i) => `<b>${G.input.btn(i)}</b>`;
const ACTIONS = ['light', 'heavy', 'grab', 'block', 'super', 'dash', 'up', 'down', 'rise'];

export class Game {
  constructor() {
    this.state = 'boot';
    this.wins = [0, 0];
    this.round = 1;
    this.timer = ROUND_TIME;
    this.t = 0;
    this.paused = false;
    const park = G.layout.parkCenter;
    const L = G.layout.landing;
    if (URLP.intro) {
      // rounds start on the ground at the landing marks, far apart: room to fly in over the city
      this.spawnA = L.heir.clone().setY(1.05);
      this.spawnB = L.patriarch.clone().setY(1.05);
    } else {
      // dev / test starts (?fight, ?auto): close quarters in the air over the Heir's mark,
      // facing the Patriarch's, which is what the tools/s_*.mjs scenarios expect
      const dir = L.patriarch.clone().sub(L.heir).setY(0).normalize();
      this.spawnA = L.heir.clone().setY(16);
      this.spawnB = L.heir.clone().addScaledVector(dir, 12).setY(17.5);
    }
    this.intro = new Intro(this);
    this.tutorial = new Tutorial(this);

    const p = this.player = G.player = new Fighter(0, HEROES.heir, { hp: 100, power: 1 });
    const b = this.bot = G.bot = new Fighter(1, HEROES.patriarch, { hp: 120, power: 1.15 });
    p.opponent = b; b.opponent = p;
    G.fighters = [p, b];
    this.brain = new Brain(b, G.settings.difficulty);
    this.playerBrain = URLP.auto ? new Brain(p, 'brutal', { lines: false }) : null;
    p.reset(this.spawnA, this.spawnB);
    b.reset(this.spawnB, this.spawnA);
    G.hud.setFighters(p, b);
    G.hud.setRounds(0, 0);
    G.hud.showHUD(false);
    G.fightCam.mode = 'orbit';
    G.fightCam.orbitCenter = park.clone().add(new THREE.Vector3(0, 18, 0));
  }

  start(difficulty) {
    if (this.tutorial.active) this.tutorial.stop();
    G.settings.difficulty = difficulty;
    this.brain.setDifficulty(difficulty);
    G.audio.init();
    G.audio.music(null, { fadeOut: 1.0 }); // the riff kicks in on "FIGHT!"
    this.wins = [0, 0];
    this.round = 1;
    G.hud.setRounds(0, 0);
    G.recorder.beginMatch();
    G.weather.newMatch();
    this.beginRound();
  }

  // The tutorial: the training dummy, close quarters in the air (like ?fight), no clock, the
  // calm title track carrying on underneath.
  startTutorial() {
    G.settings.difficulty = 'training';
    this.brain.setDifficulty('training');
    G.audio.init();
    if (G.audio.wantMusic !== 'menu') G.audio.music('menu', { fadeIn: 1.5 });
    const L = G.layout.landing, dir = L.patriarch.clone().sub(L.heir).setY(0).normalize();
    const a = L.heir.clone().setY(16), b = L.heir.clone().addScaledVector(dir, 12).setY(17.5);
    this.player.reset(a, b);
    this.bot.reset(b, a);
    this.player.meter = 0; this.bot.meter = 0;
    this.state = 'tutorial';
    this.t = 0;
    G.fightCam.mode = 'lock';
    G.fightCam.cine = null;
    G.post.letterboxTarget = 0;
    G.post.desatTarget = 0;
    G.hud.showHUD(true);
    G.hud.setTutorial(true);
    G.hud.banner('TUTORIAL', 'small', 1.3);
    G.audio.sting('round');
    this.tutorial.start();
  }

  onHit(att, vic, mv, outcome) {
    if (this.state === 'tutorial') this.tutorial.onHit(att, vic, mv, outcome);
  }

  beginRound() {
    // the final round: the weather goes all in (render/weather.js)
    if (this.round === 3) G.weather.setFinal(true);
    const p = this.player, b = this.bot;
    G.recorder.cut(); // highlight clips never run across a round reset
    p.reset(this.spawnA, this.spawnB);
    b.reset(this.spawnB, this.spawnA);
    p.meter = Math.min(p.meter, 50); b.meter = Math.min(b.meter, 50);
    this.timer = ROUND_TIME;
    this.t = 0;
    G.fightCam.mode = 'lock';
    G.fightCam.cine = null;
    G.post.desatTarget = 0;
    if (URLP.intro) {
      // the opener (game/intro.js): establishing shot and landings, then _roundReady
      this.state = 'cinematic';
      this.intro.start(this.round === 1);
      return;
    }
    this._roundReady();
  }

  // "ROUND n" ... "FIGHT!"
  _roundReady() {
    const p = this.player, b = this.bot;
    p.setState('intro'); b.setState('intro');
    this.state = 'intro';
    this.t = 0;
    G.post.letterboxTarget = 0;
    G.hud.showHUD(true);
    G.hud.banner(this.round === 3 ? 'FINAL ROUND' : `ROUND ${this.round}`, 'small', 1.3);
    G.audio.sting('round');
    G.hud.hint(this.round === 1 ? key('Charge a heavy (hold RMB/K) and send him through a skyscraper. <b>H</b> = controls',
      'Hold <b>HEAVY</b> to charge, let go to send him through a skyscraper',
      `Charge a heavy (hold ${pb(3)}) and send him through a skyscraper. ${pb(8)} = controls`) : '');
    this.hintClear = 9;
    if (this.round === 1 && !URLP.intro) setTimeout(() => this.brain.say('start'), 600); // the opener has its own
  }

  onKO(victim, attacker) {
    if (this.state !== 'fight') return;
    this.state = 'ko';
    this.t = 0;
    G.hud.hint(''); // an early KO would otherwise leave the opening hint up through the results
    const winner = victim === this.player ? 1 : 0;
    this.wins[winner]++;
    const final = this.wins[winner] >= 2;
    G.recorder.mark('ko', { pos: victim.pos, by: attacker, on: victim, final, bonus: final ? 5 : 0 });
    if (this.wins[winner] >= 2) G.audio.musicFade(3); // silence before the results theme
    G.time.slowmo(0.18, 1.6, 1.2);
    G.post.impactFrame(4, 1);
    G.post.flashScreen(0.6);
    G.post.desatTarget = 0.5;
    G.fightCam.addTrauma(1);
    G.audio.sting('ko');
    victim.shout('ko', { duck: 0.3, hold: 1 });
    G.hud.banner('K.O.!', 'ko', 2.6);
    G.hud.setRounds(this.wins[0], this.wins[1]);
    victim.setState('ko');
    // make sure the KO blow sends them flying
    if (attacker) {
      const dir = victim.pos.clone().sub(attacker.pos).normalize();
      dir.y = Math.max(dir.y, 0.05);
      setTimeout(() => { if (victim.state === 'ko' && victim.vel.length() < 60) victim.launch(dir.normalize(), 120, attacker); victim.ko = true; }, 30);
    }
  }

  // after the first super of the session, a police radio crackles somewhere in the city
  onSuperEnd() {
    if (this.policeDone) return;
    this.policeDone = true;
    setTimeout(() => G.audio.police(), 1200);
  }

  onCollapse(struct, origin) {
    if (this.state === 'fight' || this.state === 'tutorial') G.fightCam.attend(origin);
    if (this.state === 'tutorial') { G.hud.toast('BUILDING DOWN!'); return; }
    if (this.state !== 'fight' && this.state !== 'ko') return;
    const h = struct.max.y - struct.min.y;
    G.recorder.mark('collapse', {
      pos: origin, name: struct.name, bonus: (struct.name ? 6 : 0) + Math.min(4, h / 40),
      struct: { x: (struct.min.x + struct.max.x) / 2, z: (struct.min.z + struct.max.z) / 2, y0: struct.min.y, h, r: Math.max(struct.max.x - struct.min.x, struct.max.z - struct.min.z) / 2 },
    });
    if (struct.name) G.hud.toast(`${struct.name.toUpperCase()} IS DOWN!`);
    else G.hud.toast(['BUILDING DOWN!', 'TIMBERRR!', 'THERE GOES THE NEIGHBORHOOD', 'INSURANCE WON\'T COVER THIS'][Math.floor(Math.random() * 4)]);
  }

  togglePause() {
    if (this.state === 'title' || this.state === 'boot') return;
    this.paused = !this.paused;
    G.time.paused = this.paused;
    const tut = this.state === 'tutorial' ? this.tutorial : null;
    G.hud.showPause(this.paused, {
      resume: () => this.togglePause(),
      restart: () => { this.togglePause(); this.rematch(); },
      newCity: () => this.newCity(),
      menu: () => reloadWith({}),
      // in the tutorial: skip a step instead of a rematch or a new city
      tutorial: !!tut,
      skip: tut && !tut.free && !tut.panel ? () => { this.togglePause(); tut.skip(); } : null,
    });
  }

  // Rematch in the same (already wrecked) city: the city remembers.
  rematch() {
    if (G.audio.wantMusic) G.audio.music(null, { fadeOut: 0.8 }); // the results or tour track makes way for the riff
    G.hud.hideResults();
    this.resultsShown = true;
    this.endMusicAt = 0;
    this.wins = [0, 0];
    this.round = 1;
    this.toured = false;
    G.hud.setRounds(0, 0);
    G.hud.hint('');
    this.recapAt = 0;
    G.recorder.beginMatch();
    G.weather.newMatch();
    this.beginRound();
  }

  // The match recap (game/recap.js): the best moments, re-shot. Plays once after the winner's
  // banner, and again from the results screen.
  playRecap() {
    if (G.recap.active) return false;
    const back = this.state;
    G.hud.hideResults();
    G.recorder.cut();
    if (back === 'end') G.recorder.matchOn = false; // the footage is final: nothing after the match joins it
    const ok = G.recap.play(() => {
      this.state = back;
      if (back === 'end') { this.t = 1.2; this.resultsShown = false; }
      else if (back === 'explore') { G.hud.dockResults(true); G.audio.music('menu', { fadeOut: 1.5, fadeIn: 2.5 }); } // back to the tour
    });
    if (!ok) return false;
    this.state = 'recap';
    if (G.audio.wantMusic !== 'end') G.audio.music('end', { fadeIn: 1.2 });
    this.endMusicAt = 0;
    return true;
  }

  newCity() {
    reloadWith({ fight: true, diff: G.settings.difficulty, seed: Math.floor(Math.random() * 99999) });
  }

  // Free roam once the match is over: fly the Heir around the wreckage (boosting still smashes
  // through buildings). Esc / Enter / Start brings the results back.
  explore() {
    if (this.state !== 'end' || G.recap.active) return;
    const p = this.player, b = this.bot;
    G.hud.dockResults(true); // the panel shrinks into a corner: reachable, out of the way
    G.recorder.matchOn = false; // whatever he wrecks now isn't part of the match's footage
    this.state = 'explore';
    // the tour runs under the calm intro track, not the results riff (which may still be queued)
    this.endMusicAt = 0;
    G.audio.music('menu', { fadeOut: 1.5, fadeIn: 2.5 });
    if (p.ko || p.state !== 'free') {
      // he lost: back on his feet for the tour
      p.hp = p.maxHp; p.ko = false;
      p.setState('free'); p.model.setAction(null, 20);
      p.vel.set(0, 8, 0);
    }
    p.exploring = true;
    p.ctrl._h.clear();
    this.flyAxes = { x: 0, z: 0, y: 0 };
    // the Patriarch stays where the match left him
    b.ctrl._h.clear(); b.ctrl.move.set(0, 0, 0); b.ctrl.vert = 0;
    G.post.desatTarget = 0;
    G.fightCam.explore();
    G.hud.setExplore(true);
    G.hud.hint(key('<b>WASD</b> fly · <b>SPACE</b> / <b>C</b> up, down · hold <b>SHIFT</b> to boost through buildings · drag to look · <b>ESC</b> results',
      'The stick flies · hold <b>DASH</b> to boost through buildings · <b>II</b> results',
      `Left stick flies · right stick looks · hold ${pb(0)} to boost through buildings · ${pb(9)} results`));
  }

  _endExplore() {
    this.player.exploring = false;
    G.fightCam.mode = 'lock';
    G.hud.setExplore(false);
    G.hud.hint('');
    this.state = 'end';
    this.t = 1.8; // straight back to the results panel
    this.resultsShown = false;
  }

  // Free roam: movement relative to the camera, no attacks (with no fight on, a heavy would
  // rocket off after the Patriarch). The keyboard's on / off axes are eased so a tap doesn't
  // jolt him, and while he flies forward left / right steer him round a banked arc, the camera
  // turning with him, instead of sidestepping; hovering, they sidestep as before.
  _exploreInput(realDt) {
    const inp = G.input, c = this.player.ctrl, ax = this.flyAxes;
    for (const a of ['dash', 'up', 'down']) {
      if (inp.pressed(a)) c.press(a);
      if (inp.released(a)) c.release(a);
      if (inp.isHeld(a)) c._h.add(a); else c._h.delete(a);
    }
    for (const k of ['x', 'z', 'y']) {
      const want = inp.axes[k];
      const tau = Math.abs(want) > Math.abs(ax[k]) ? 0.12 : 0.08; // attack / release
      ax[k] += (want - ax[k]) * (1 - Math.exp(-realDt / tau));
    }
    const steer = clamp(ax.z / 0.5, 0, 1); // flying forward: left / right turn, not sidestep
    G.fightCam.steer(-ax.x * steer * 1.4 * realDt);
    const fwd = G.fightCam.exploreDir(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    // the axes come normalised as a pair; steering isn't movement, so a turn mustn't slow him
    const ahead = ax.z + steer * (Math.min(1, Math.hypot(ax.x, ax.z)) - ax.z);
    c.move.set(0, 0, 0).addScaledVector(fwd, ahead).addScaledVector(right, ax.x * (1 - steer));
    if (c.move.lengthSq() > 1) c.move.normalize();
    c.vert = ax.y;
  }

  // Teach the juicy follow-ups at the moment they are available.
  _contextHints(realDt) {
    const p = this.player, b = this.bot;
    this.hintT = (this.hintT || 0) - realDt;
    this.hintCount = this.hintCount || {};
    const show = (key, text, max = 3) => {
      if ((this.hintCount[key] || 0) >= max || this.hintT > 0) return;
      this.hintCount[key] = (this.hintCount[key] || 0) + 1;
      G.hud.hint(text);
      this.hintT = 2.2;
      this.hintClear = 2.2;
    };
    const dash = key('SHIFT', 'DASH', G.input.btn(0));
    if (p.state === 'skyward') this.usedSky = true;
    if (b.state === 'launched' && b.lastHitBy === p && b.vel.length() > 40) show('rush', `Tap <b>${dash}</b> to rush after him and keep the combo going!`);
    else if (p.state === 'launched' && p.stateT > 0.45) show('recover', `Tap <b>${dash}</b> to recover in mid-air!`);
    else if (p.meter >= 100) show('super', `<b>SUPER READY</b> — get close and press <b>${key('R', 'SUPER', G.input.btn(5))}</b>`, 2);
    else if (p.state === 'free' && b.state === 'block' && p.pos.distanceTo(b.pos) < 6) show('grab', `He's blocking — <b>GRAB</b>${key(' (E)', '', ` (${G.input.btn(1)})`)} him and drag him through a building!`, 2);
    else if (p.state === 'skyhang') show('dive', `${key('<b>LMB</b> / <b>RMB</b>', '<b>PUNCH</b> or <b>HEAVY</b>', `${pb(2)} / ${pb(3)}`)} to dive on him!`, 2);
    else if (!this.usedSky && this.timer < ROUND_TIME - 14 && p.state === 'free') show('sky', `${key('Press <b>G</b>', 'Tap <b>SKY</b>', `Press ${pb(12)}`)} to shoot up over the city, then dive on him`, 1);
    if (this.hintClear > 0) { this.hintClear -= realDt; if (this.hintClear <= 0) G.hud.hint(''); }
  }

  // Map keyboard/gamepad to the fighter's controller, relative to the lock-on frame.
  _playerInput() {
    const inp = G.input, p = this.player, c = p.ctrl;
    const allowed = this.state === 'tutorial' ? this.tutorial.allowed : null; // moves not taught yet do nothing
    for (const a of ACTIONS) {
      if (allowed && !allowed.has(a)) { c._h.delete(a); continue; }
      if (inp.pressed(a)) c.press(a);
      if (inp.released(a)) c.release(a);
      if (inp.isHeld(a)) c._h.add(a); else c._h.delete(a);
    }
    const to = new THREE.Vector3().subVectors(p.opp.pos, p.pos);
    const flat = new THREE.Vector3(to.x, 0, to.z);
    if (flat.lengthSq() < 1) flat.set(0, 0, 1).applyQuaternion(G.camera.quaternion).setY(0);
    flat.normalize();
    // W heads straight at the opponent in 3D (so chasing up/down is natural)
    const fwd3 = to.lengthSq() > 1 ? to.clone().normalize() : flat.clone();
    const right = new THREE.Vector3().crossVectors(flat, UP).normalize();
    c.move.set(0, 0, 0)
      .addScaledVector(inp.axes.z >= 0 ? fwd3 : flat, inp.axes.z)
      .addScaledVector(right, inp.axes.x);
    if (c.move.lengthSq() > 1) c.move.normalize();
    c.vert = inp.axes.y;
  }

  update(dt, realDt) {
    const inp = G.input;
    // on-screen controls only while fighting: title, pause and results need normal taps
    if (G.touch) {
      G.touch.setActive(!this.paused && (this.state === 'intro' || this.state === 'fight' || this.state === 'ko' || this.state === 'explore'
        || (this.state === 'tutorial' && !this.tutorial.panel)));
      G.touch.update();
    }
    if (this.state === 'recap') {
      if (inp.anyPressed()) G.recap.skip(); // any key: straight to the results
      return; // the recap owns the fighters' models while it plays
    }
    // an unplugged pad pauses the fight, like on a console
    if (inp.padLost && !this.paused && (this.state === 'intro' || this.state === 'fight' || this.state === 'ko')) this.togglePause();
    if (this.state === 'explore' && (inp.pressed('pause') || inp.pressed('confirm') || inp.padLost)) this._endExplore();
    else if (inp.pressed('pause')) this.togglePause();
    if (this.state === 'explore') { // the docked card's hotkeys work mid-flight too
      if (inp.pressed('newcity')) this.newCity();
      if (inp.pressed('super')) this.playRecap();
    }
    if (inp.pressed('help')) G.hud.toggleControls();
    if (inp.pressed('mute')) G.audio.toggleMute();
    if (this.paused) return;
    this.t += realDt;
    const p = this.player, b = this.bot;

    if (this.state === 'tutorial') {
      this.tutorial.update(dt, realDt);
      if (this.tutorial.panel && inp.pressed('confirm')) return this.tutorial.fight();
    } else if (this.state === 'cinematic') {
      if (inp.anyPressed()) this.intro.skip();
      if (this.intro.update(realDt)) this._roundReady();
    } else if (this.state === 'intro') {
      if (this.t > 1.35 && !this._fightShown) { this._fightShown = true; G.hud.banner('FIGHT!', '', 1.0); G.audio.sting('fight'); G.audio.music('fight', { fadeIn: 0.05 }); G.fightCam.addTrauma(0.4); }
      if (this.t > 1.7) { this.state = 'fight'; this._fightShown = false; p.setState('free'); b.setState('free'); }
    } else if (this.state === 'fight') {
      for (const f of [p, b]) if (f.hp <= 0 && this.state === 'fight') { f.ko = true; this.onKO(f, f.lastHitBy); }
      this.timer -= dt;
      G.hud.setTimer(this.timer);
      if (this.timer <= 0) {
        const pr = p.hp / p.maxHp, br = b.hp / b.maxHp;
        const loser = pr < br ? p : b;
        G.hud.banner('TIME!', 'small', 1.5);
        loser.hp = 0;
        this.onKO(loser, null);
      }
    } else if (this.state === 'ko') {
      if (this.t > 3.8) {
        G.post.desatTarget = 0;
        if (this.wins[0] >= 2 || this.wins[1] >= 2) {
          this.state = 'end';
          this.t = 0;
          const heirWon = this.wins[0] >= 2;
          G.hud.banner(heirWon ? 'THE HEIR WINS' : 'THE PATRIARCH WINS', 'small', 3.5);
          this.resultsShown = false; // the results panel follows once the banner has landed
          if (heirWon) G.hud.speech(p, 'I\'m not you!'); else this.brain.say('win');
          (heirWon ? p : b).shout('win');
          G.audio.sting('win');
          this.endMusicAt = 6.2; // the victory stinger plays out, then the results theme takes over
          this.recapAt = URLP.norecap ? 0 : 2.6; // once the banner has landed: the highlights
        } else {
          this.round++;
          this.beginRound();
        }
      }
    } else if (this.state === 'end') {
      if (this.recapAt && this.t > this.recapAt) {
        this.recapAt = 0;
        if (this.playRecap()) return;
      }
      if (this.endMusicAt && this.t > this.endMusicAt) { this.endMusicAt = 0; G.audio.music('end', { fadeIn: 1.0 }); }
      if (!this.resultsShown && !this.recapAt && this.t > 1.8) {
        this.resultsShown = true;
        G.hud.showResults({
          winner: this.wins[0] >= 2 ? 'THE HEIR WINS' : 'THE PATRIARCH WINS',
          score: `${this.wins[0]} – ${this.wins[1]}`,
        }, {
          rematch: () => this.rematch(), newCity: () => this.newCity(), menu: () => reloadWith({}),
          recap: G.recap.available() ? () => this.playRecap() : null,
          explore: () => this.explore(),
          back: () => this._endExplore(),
        });
        // the first time, straight into the tour of the wreckage (Esc brings the panel back)
        if (!this.toured) { this.toured = true; this.explore(); }
      }
      if (inp.pressed('confirm')) this.rematch();
      if (inp.pressed('newcity')) this.newCity();
      if (inp.pressed('super') && this.resultsShown) this.playRecap();
      if (inp.pressed('explore') && this.resultsShown) this.explore();
    }

    if (this.state === 'fight' && !this.playerBrain) this._contextHints(realDt);
    const fighting = this.state === 'fight' || this.state === 'ko' || this.state === 'end' || this.state === 'tutorial';
    if (fighting) {
      if (this.playerBrain) this.playerBrain.update(dt); else this._playerInput();
      this.brain.update(dt);
    } else if (this.state === 'explore') this._exploreInput(realDt);
    p.update(dt, realDt);
    b.update(dt, realDt);
    for (const f of [p, b]) if (f.vel.length() > 25) { G.props.sweep(f.pos, f.vel, 3.2); G.train.sweep(f.pos, f.vel); }
    if (p.state !== 'rush' && p.state !== 'launched' && !(p.state === 'grabbing')) G.post.speedTarget = clamp((p.vel.length() - 40) / 60, 0, 0.7);
  }
}
