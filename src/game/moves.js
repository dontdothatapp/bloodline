// Move data. Times in seconds (60 fps frames in comments). Each move drives every feedback
// channel from a single `fx` strength so the juice scales consistently with the hit.
//   hitstop tiers (KOF/Smash-style): light ~4-5f, heavy ~9-12f, launchers 14-20f
export const MOVES = {
  jab: {
    pose: ['jabW', 'jabS'], side: 'L', startup: 0.075, active: 0.06, recovery: 0.17,
    dmg: 3.5, kb: 7, hitstun: 0.36, hitstop: 0.07, fx: 0.35, lunge: 5.5, range: 2.5,
    next: 'cross', chain: 0.3, meter: 4, sound: 'light',
  },
  cross: {
    pose: ['crossW', 'crossS'], side: 'R', startup: 0.08, active: 0.06, recovery: 0.18,
    dmg: 4, kb: 8, hitstun: 0.38, hitstop: 0.075, fx: 0.42, lunge: 5, range: 2.5,
    next: 'hook', chain: 0.3, meter: 4, sound: 'light',
  },
  hook: {
    pose: ['hookW', 'hookS'], side: 'L', startup: 0.1, active: 0.07, recovery: 0.2,
    dmg: 5, kb: 10, hitstun: 0.42, hitstop: 0.09, fx: 0.55, lunge: 5, range: 2.6,
    next: 'smash', chain: 0.32, meter: 5, sound: 'mid',
  },
  smash: {
    pose: ['smashW', 'smashS'], side: 'R', startup: 0.15, active: 0.08, recovery: 0.36,
    dmg: 9, launch: 78, up: 0.12, hitstop: 0.16, fx: 1.0, lunge: 6, range: 2.8,
    meter: 8, sound: 'heavy', comic: 'heavy', slowmo: [0.35, 0.18],
  },
  heavy: {
    pose: ['chargeW', 'chargeS'], side: 'R', startup: 0.16, active: 0.08, recovery: 0.34,
    dmg: 9, launch: 70, up: 0.1, hitstop: 0.15, fx: 0.95, lunge: 7, range: 2.8,
    meter: 7, sound: 'heavy', comic: 'heavy', armor: false,
  },
  // charged versions scale with `charge` (0..1) at runtime
  heavyCharged: {
    pose: ['chargeW', 'chargeS'], side: 'R', startup: 0.07, active: 0.09, recovery: 0.42,
    dmg: 11, dmgCharge: 15, launch: 85, launchCharge: 110, up: 0.08, hitstop: 0.16, hitstopCharge: 0.16,
    fx: 1.1, fxCharge: 0.7, lunge: 8, lungeCharge: 16, range: 3.0, meter: 9, sound: 'huge', comic: 'huge',
    guardBreak: 0.7, impactFrame: 0.8, slowmo: [0.25, 0.35],
  },
  uppercut: {
    pose: ['upperW', 'upperS'], side: 'R', startup: 0.13, active: 0.08, recovery: 0.34,
    dmg: 8, launch: 75, launchCharge: 60, dir: 'up', hitstop: 0.14, fx: 0.95, lunge: 5, range: 2.8,
    meter: 7, sound: 'heavy', comic: 'heavy',
  },
  meteor: {
    pose: ['meteorW', 'meteorS'], side: 'R', startup: 0.16, active: 0.09, recovery: 0.36,
    dmg: 10, launch: 95, launchCharge: 70, dir: 'down', hitstop: 0.17, fx: 1.05, lunge: 6, range: 3.0,
    meter: 8, sound: 'huge', comic: 'huge', slowmo: [0.35, 0.15],
  },
  // SKYWARD finisher: the dive from above (fighter.js _skydive) ends in this, spiking him down
  skyStrike: {
    pose: ['meteorW', 'meteorS'], side: 'R', startup: 0.05, active: 0.1, recovery: 0.42,
    dmg: 13, launch: 115, dir: 'down', hitstop: 0.2, fx: 1.3, lunge: 5, range: 3.4,
    meter: 9, sound: 'huge', comic: 'huge', guardBreak: 0.8, impactFrame: 0.9, slowmo: [0.25, 0.35],
  },
  grab: {
    pose: ['grab', 'grab'], side: 'R', startup: 0.12, active: 0.1, recovery: 0.42,
    dmg: 0, grab: true, hitstop: 0.06, fx: 0.3, lunge: 7, range: 3.0, meter: 0, sound: 'grab',
  },
  superRush: {
    pose: ['grab', 'hold'], side: 'L', startup: 0.2, active: 0.12, recovery: 0.5,
    dmg: 0, superGrab: true, hitstop: 0.1, fx: 0.6, lunge: 18, range: 3.4, meter: 0, sound: 'grab',
  },
};

export const SPEED = {
  hover: 22,
  boost: 62,
  dash: 95,
  rush: 175,
  smash: 42,     // above this you plow through buildings instead of bumping off them
  drag: 78,      // grab-and-drag flight speed
  throw: 115,
  superLaunch: 190,
  homing: 150,   // a heavy released out of reach flies at him first
  sky: 130,      // SKYWARD climb
  dive: 185,     // ... and the dive back down
};
