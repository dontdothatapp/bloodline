// Lock-on fight camera with trauma shake (Eiserloh: shake = trauma^2 * noise), directional
// kick springs, FOV punches, a chase cam while you're being launched and cinematic shots.
import * as THREE from 'three';
import { G } from '../core/context.js';
import { clamp, damp, noise1, lerp, UP } from '../core/math.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();

export class FightCamera {
  constructor(camera) {
    this.cam = camera;
    this.baseFov = 62;
    this.pos = new THREE.Vector3(0, 30, 60);
    this.look = new THREE.Vector3();
    this.trauma = 0;
    this.kickV = new THREE.Vector3();
    this.kickP = new THREE.Vector3();
    this.fovOff = 0;
    this.fovVel = 0;
    this.mode = 'lock';
    this.modeBlend = 0;
    this.cine = null;
    this.chase = 0;
    this.side = 1;
    this.t = 0;
    this.orbit = 0;
    this.wide = 0;          // 0 over the shoulder (melee) .. 1 pulled back over the city
    this.attention = null;  // { pos, t }: glance at a collapsing building
    this.yaw = 0;           // free roam (mode 'explore'): where the camera looks
    this.pitch = -0.12;
    this.lookT = 0;         // seconds until it swings back behind his heading after a look
    this.steerT = 0;        // same, after the keys steered him round a turn
  }

  // Free roam steering: left / right turn the heading (and the view) rather than sidestep.
  steer(dYaw) {
    if (Math.abs(dYaw) < 1e-5) return;
    this.yaw += dYaw;
    this.steerT = 0.2;
  }

  // Free roam: start looking the way the camera already does.
  explore() {
    const d = this.cam.getWorldDirection(_v);
    this.yaw = Math.atan2(d.x, d.z);
    this.pitch = clamp(Math.asin(d.y), -0.8, 0.5);
    this.lookT = 0;
    this.mode = 'explore';
  }

  // The direction free-roam movement is relative to (W flies where the camera looks).
  exploreDir(out) {
    return out.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  // A building is coming down: widen and turn toward it for a moment, if it's roughly in view.
  attend(pos, seconds = 2.6) {
    _v.subVectors(pos, this.cam.position);
    if (_v.length() > 260 || _v.normalize().dot(this.cam.getWorldDirection(_w)) < -0.1) return;
    this.attention = { pos: pos.clone(), t: seconds };
  }

  addTrauma(a) { this.trauma = clamp(this.trauma + a * G.settings.shake, 0, 1); }
  addTraumaAt(pos, a, falloff = 200) {
    const d = this.cam.position.distanceTo(pos);
    this.addTrauma(a * clamp(1 - d / falloff, 0, 1));
  }
  kick(dir, amount) { this.kickV.addScaledVector(dir, amount * 9); }
  fovKick(deg) { this.fovVel += deg * 14; }
  cinematic(a, b, dur) { this.cine = { a, b, t: 0, dur, angle: Math.random() < 0.5 ? 1 : -1 }; }

  _blocked(pos) {
    let hit = false;
    G.destruction.forChunksInSphere(pos, 2, () => { hit = true; });
    return hit;
  }

  update(realDt, dt) {
    const p = G.player, o = G.bot;
    this.t += realDt;
    const cam = this.cam;
    // 0 on landscape / square screens, 1 on a portrait phone (aspect ~0.46)
    const pk = this.portrait = clamp((0.95 - window.innerWidth / window.innerHeight) / 0.45, 0, 1);
    let desiredPos = _v, desiredLook = _w;

    if (this.override) {
      this.pos.copy(this.override.pos);
      this.look.copy(this.override.look);
    } else if (this.mode === 'orbit' || !p) {
      // title / attract mode
      this.orbit += realDt * 0.06;
      const c = this.orbitCenter || _u.set(0, 30, 0);
      desiredPos.set(c.x + Math.cos(this.orbit) * 70, c.y + 42 + Math.sin(this.orbit * 0.7) * 10, c.z + Math.sin(this.orbit) * 70);
      desiredLook.copy(c);
      this.pos.lerp(desiredPos, 1 - Math.exp(-2 * realDt));
      this.look.lerp(desiredLook, 1 - Math.exp(-2 * realDt));
    } else if (this.mode === 'explore') {
      // free roam after the match: a chase camera behind him. Drag (or the right stick) looks
      // around; let go and it swings back in behind wherever he's flying.
      const inp = G.input;
      if (inp.look.x || inp.look.y || inp.lookRate) {
        this.yaw -= inp.look.x * 0.0045 + inp.lookRate * 2.4 * realDt;
        this.pitch = clamp(this.pitch - inp.look.y * 0.0035, -1.0, 0.75);
        this.lookT = 1.2;
      }
      this.lookT -= realDt; this.steerT -= realDt;
      const sp = p.vel.length(), hv = Math.hypot(p.vel.x, p.vel.z);
      if (this.lookT <= 0 && this.steerT <= 0 && hv > 5) {
        // settle in behind his heading: steady, and slower than his velocity turns (7 / s), so
        // it never overshoots and swings back
        let d = Math.atan2(p.vel.x, p.vel.z) - this.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * (1 - Math.exp(-3 * realDt * clamp(hv / 15, 0.25, 1)));
      }
      const fwd = this.exploreDir(_u);
      const back = 8.5 + clamp(sp / 62, 0, 1) * 7;
      desiredPos.copy(p.pos).addScaledVector(fwd, -back).addScaledVector(UP, 2.4);
      for (let i = 0; i < 4 && this._blocked(desiredPos); i++) desiredPos.lerp(p.pos, 0.35).y += 1.5;
      desiredLook.copy(p.pos).addScaledVector(fwd, 24).addScaledVector(UP, 0.2);
      this.pos.lerp(desiredPos, 1 - Math.exp(-(sp > 45 ? 14 : 8) * realDt));
      this.look.lerp(desiredLook, 1 - Math.exp(-12 * realDt));
    } else if (this.cine) {
      const c = this.cine;
      c.t += realDt;
      const mid = _u.copy(c.a.pos).lerp(c.b.pos, 0.5);
      const ab = _w.subVectors(c.b.pos, c.a.pos).normalize();
      const side = new THREE.Vector3().crossVectors(ab, UP).normalize().multiplyScalar(c.angle);
      const swing = c.t * 0.25;
      desiredPos = new THREE.Vector3().copy(mid).addScaledVector(side, 4.2 - swing).addScaledVector(ab, -1.2 + swing * 2).add(new THREE.Vector3(0, 0.9, 0));
      desiredLook = mid.clone().add(new THREE.Vector3(0, 0.3, 0));
      this.pos.lerp(desiredPos, 1 - Math.exp(-10 * realDt));
      this.look.lerp(desiredLook, 1 - Math.exp(-14 * realDt));
      if (c.t > c.dur || (c.a.state !== 'super')) this.cine = null;
    } else {
      // chase cam when the player is launched hard: look down the flight path
      const launched = p.state === 'launched' && p.vel.length() > 45;
      this.chase = damp(this.chase, launched ? 1 : 0, launched ? 6 : 3, realDt);
      const dist = p.pos.distanceTo(o.pos);
      const to = _u.subVectors(o.pos, p.pos);
      const horiz = Math.hypot(to.x, to.z);
      // limit pitch so you never end up directly above/below; up in the sky keep the horizon
      // (the skyline) in shot instead of staring straight down at him
      const skyView = p.state === 'skyward' || p.state === 'skyhang';
      const pitch = clamp(Math.atan2(to.y, horiz), skyView ? -0.42 : -0.75, 0.75);
      const yaw = Math.atan2(to.x, to.z);
      const fwd = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
      // Scale: when the fight spreads out the camera pulls back and up so the city is in shot
      // (and the skyline behind them); a melee exchange brings it back over the shoulder.
      const at = this.attention;
      const glance = at ? clamp(at.t / 0.6, 0, 1) : 0;
      if (at && (at.t -= realDt) <= 0) this.attention = null;
      // SKYWARD opens all the way up at once: the point of the move is the view
      const spread = Math.max(clamp((dist - 8) / 32, 0, 1), 0.85 * glance, skyView ? 1 : 0);
      this.wide = damp(this.wide, spread, skyView || spread < this.wide ? 2.5 : 1.2, realDt);
      const W = this.wide;
      // portrait: further back and higher, and centred (a narrow screen has no room beside him)
      const back = lerp(5.2 + clamp(dist * 0.16, 0, 9), 15 + clamp(dist * 0.18, 0, 16), W) * (1 + 0.35 * pk * (1 - W));
      const height = lerp(1.5 + clamp(dist * 0.04, 0, 3), 7 + clamp(dist * 0.08, 0, 8), W) + 0.8 * pk;
      const lockPos = p.pos.clone().addScaledVector(fwd, -back).addScaledVector(UP, height).addScaledVector(right, lerp(1.45, 3.2, W) * (1 - 0.75 * pk));
      // spring arm: never sit inside a building, slide in toward him (and up) until clear
      for (let i = 0; i < 4 && this._blocked(lockPos); i++) lockPos.lerp(p.pos, 0.35).y += 1.5;
      const w = skyView ? 0.35 : dist > 45 ? 0.75 : 0.45;
      const lockLook = p.pos.clone().add(new THREE.Vector3(0, 0.6 + 4 * W, 0)).lerp(o.pos, w);
      if (glance > 0) lockLook.lerp(at.pos, 0.35 * glance);
      if (p.state === 'skyhang') {
        // the top of SKYWARD: just behind him, looking out over the city toward the Patriarch
        // ~20 degrees down, so the skyline fills the shot and he's still in it, below
        const flat = new THREE.Vector3(to.x, 0, to.z).normalize();
        lockPos.copy(p.pos).addScaledVector(flat, -16).addScaledVector(UP, 5).addScaledVector(right, 3);
        lockLook.copy(p.pos).addScaledVector(flat, 50).addScaledVector(UP, -18);
      }
      if (this.chase > 0.01) {
        const vd = p.vel.clone().normalize();
        const side = new THREE.Vector3().crossVectors(vd, UP).normalize();
        if (side.lengthSq() < 0.1) side.set(1, 0, 0);
        const cp = p.pos.clone().addScaledVector(vd, -10).addScaledVector(UP, 3).addScaledVector(side, 2.5);
        const cl = p.pos.clone().addScaledVector(vd, 18);
        lockPos.lerp(cp, this.chase);
        lockLook.lerp(cl, this.chase);
      }
      desiredPos = lockPos; desiredLook = lockLook;
      const fast = p.vel.length() > 60 || p.state === 'rush' ? 14 : 7;
      this.pos.lerp(desiredPos, 1 - Math.exp(-fast * realDt));
      this.look.lerp(desiredLook, 1 - Math.exp(-12 * realDt));
    }
    // keep above ground
    const gh = G.ground.heightAt(this.pos.x, this.pos.z) + 1.2;
    if (this.pos.y < gh) this.pos.y = gh;

    // kick spring
    this.kickV.addScaledVector(this.kickP, -120 * realDt);
    this.kickV.multiplyScalar(Math.exp(-12 * realDt));
    this.kickP.addScaledVector(this.kickV, realDt);
    // fov spring
    this.fovVel += -this.fovOff * 160 * realDt;
    this.fovVel *= Math.exp(-14 * realDt);
    this.fovOff += this.fovVel * realDt;
    const speedFov = p ? clamp((p.vel.length() - 30) / 140, 0, 1) * 14 : 0;
    const fov = this.baseFov + 20 * pk + 6 * this.wide + this.fovOff + speedFov;
    // the lift above the thumbs only matters while fighting (no controls in shots and menus)
    const lift = this.override || this.mode !== 'lock' || this.cine ? 0 : pk;
    if (pk > 0) {
      // Portrait: a wider vertical FOV keeps some sideways view, and the picture is the lower
      // part of a taller frustum, so its centre (the fight) sits d px above the screen centre,
      // clear of the thumbs. fov / aspect describe that full, taller frustum.
      const w = window.innerWidth, h = window.innerHeight, d = 0.12 * lift * h, H = h + 2 * d;
      cam.aspect = w / H;
      cam.fov = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * H / h) * 180 / Math.PI;
      cam.setViewOffset(w, H, 0, 2 * d, w, h);
    } else {
      if (cam.view) { cam.clearViewOffset(); cam.aspect = window.innerWidth / window.innerHeight; }
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    cam.position.copy(this.pos).add(this.kickP);
    cam.lookAt(this.look);
    // trauma shake: rotational + a little positional, continues during hitstop (real time)
    this.trauma = Math.max(0, this.trauma - realDt * 1.4);
    const s = this.trauma * this.trauma;
    if (s > 0) {
      const t = this.t * 28;
      const maxA = 0.09;
      cam.rotateX(maxA * s * noise1(t));
      cam.rotateY(maxA * s * noise1(t + 37));
      cam.rotateZ(maxA * 1.4 * s * noise1(t + 71));
      cam.position.x += 0.8 * s * noise1(t + 13);
      cam.position.y += 0.8 * s * noise1(t + 23);
    }
  }
}
