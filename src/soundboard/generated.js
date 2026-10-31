// The hits as the game mixes them (src/core/audio.js: recorded punches with generated sub layers),
// rendered offline through the game's own AudioEngine so the page can show, play and compare them
// like files. Every render is a fresh roll of the recipe's randomness, as in game.
import { AudioEngine } from '../core/audio.js';

const SR = 48000;
// the compressor and limiter need a moment to settle at the start of a render (a sound at 0 s
// comes out up to 12 dB too quiet), so recipes start this far in and the lead-in is cut off
const LEAD = 0.3;

class PageEngine extends AudioEngine {
  constructor(bank = null) { super(); this.shared = bank; }
  get live() { return true; }   // an offline context never "runs"; render regardless
  loadSamples() { if (this.shared) this.bank = this.shared; else this.loaded = super.loadSamples(); }
  _fetch() { return new Promise(() => {}); }       // no soundtrack or ambience here
  _loadTrack() { return new Promise(() => {}); }
}

// the recorded groups the recipes play (the punches), decoded once
let base = null;
const samples = () => {
  if (!base) { base = new PageEngine(); base.prepare(new OfflineAudioContext(2, 128, SR)); }
  return base.loaded.then(() => base.bank);
};

// id -> [category, name, where it plays, call shown on the page, seconds to render, play(engine, at)]
// at(t, fn) runs fn t seconds in, for sounds the game repeats (the super barrage)
export const GENERATED = {
  hit_light: ['hits', 'Light hit', 'Jabs and light attacks: a recorded light punch, pitch varied', "hit('light')", 1, (e) => e.hit('light')],
  hit_mid: ['hits', 'Mid hit', 'Mid-strength attacks: a heavy punch with a generated sub drop', "hit('mid')", 1, (e) => e.hit('mid')],
  hit_heavy: ['hits', 'Heavy hit', 'Heavy attacks: heavy punch, light punch snap and a deeper sub; ducks the music', "hit('heavy')", 1.5, (e) => e.hit('heavy')],
  hit_huge: ['hits', 'Huge hit', 'Launchers, the super finisher, crashes into props and the train: punches, generated boom and rumble', "hit('huge')", 2.5, (e) => e.hit('huge')],
  barrage: ['hits', 'Super barrage', 'The super\'s rapid punches, ten a second, played softer', "hit('barrage') ×10", 2,
    (e, at) => { for (let i = 0; i < 10; i++) at(i * 0.1, () => e.hit('barrage')); }],
};

export async function render(id) {
  const [, , , , secs, play] = GENERATED[id];
  const bank = await samples();
  const ctx = new OfflineAudioContext(2, Math.ceil((LEAD + secs) * SR), SR);
  const e = new PageEngine(bank);
  e.prepare(ctx);
  const at = (t, fn) => (t <= 0 ? fn() : ctx.suspend(LEAD + t).then(() => { fn(); ctx.resume(); }));
  ctx.suspend(LEAD).then(() => { play(e, at); ctx.resume(); });
  return trim(await ctx.startRendering());
}

// cut the lead-in and the silent tail so the length shown is the sound's own
function trim(buf) {
  const start = Math.round(LEAD * SR);
  let end = start;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = d.length - 1; i > end; i--) if (Math.abs(d[i]) > 0.002) { end = i; break; }
  }
  const len = Math.min(buf.length, end + Math.round(0.05 * SR)) - start;
  const out = new AudioBuffer({ length: Math.max(1, len), numberOfChannels: buf.numberOfChannels, sampleRate: SR });
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(start, start + len), c);
  return out;
}
