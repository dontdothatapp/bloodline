// ElevenLabs voices for the two fighters: designs one voice per character (once; the voice ids
// are kept in public/sfx/elevenlabs.json under _voices), then speaks each action's line with it
// as an alternative for review (public/alt/sfx/voices/<character>/<line>.mp3, shown on
// sounds.html). Takes come back at all sorts of levels, so each is brought to -16 LUFS (a limiter
// holding the peaks at -1 dB) and trimmed to the voice, so a shout lands on the action; one that
// comes back nearly silent, which the model
// sometimes does with a wordless line, is made again (3 tries). Every line's text and credit cost
// is kept in elevenlabs.json like the sound effects.
// Lines the game plays often get several takes (<line>-2.mp3...), which it picks between at random.
// --promote moves the takes into the game (public/sfx/voices/<character>/), replacing the old
// voice a take names in "replaces".
// Skips takes that already exist unless --force; pass line ids (and/or heir, patriarch) to do
// only those.
// Usage: node --env-file=.env.local tools/elevenlabs-voices.mjs [--force] [heir|patriarch] [line ...]
//        node tools/elevenlabs-voices.mjs --promote [heir|patriarch] [line ...]
//        node tools/elevenlabs-voices.mjs --level [heir|patriarch] [line ...]   (re-level the takes in game)
// A line id can name one take: attack_light-2.
import fs from 'fs';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';

const VOICE_MODEL = 'eleven_ttv_v3';
const TTS_MODEL = 'eleven_v3';   // reads the [audio tags] that shape each shout

const CHARACTERS = {
  heir: {
    name: 'Bloodline · The Heir',
    description: 'Young male anime hero, about 18, the fiery protagonist of a shonen battle anime, English dub. Clear, bright tenor with raw grit; earnest and determined, explosive and passionate when fighting, with piercing battle cries and sharp, breathy efforts.',
    sample: "[determined] I won't let you hurt anyone else! [battle cry] HAAAAAAH! [panting] Hah... hah... [shouting] Is that all you've got? I'm just getting started! [strained grunt] Hngh! [roaring] RAAAAAAGH!",
  },
  patriarch: {
    name: 'Bloodline · The Patriarch',
    description: "Imposing middle-aged male villain of a superhero anime, the hero's own father, English dub. Very deep, resonant bass-baritone with a cold, controlled authority; calm and menacing in speech, with thunderous, terrifying roars and a chilling laugh.",
    sample: '[calm, menacing] You think you can stop me, boy? [chuckles darkly] Heh heh heh... [thunderous roar] RAAAAAAAH! [cold] Stay down. [villainous laugh] Hahahaha... HAHAHAHA!',
  },
};

// line id -> { character: text } (wordless shouts and efforts; [tags] steer the delivery).
// takes: how many versions to make of a line the game plays often. tight: a quick grunt, trimmed
// close around its loudest moment so it lands on the action (takes often breathe in first).
const LINES = {
  attack_light: { heir: '[grunts] Hah!', patriarch: '[grunts] Hmph!', takes: 3, tight: true },
  attack_mid: { heir: '[shouts] Hyah!', patriarch: '[grunts] Hah!', takes: 2, tight: true },
  attack_heavy: { heir: '[shouts] Haaaah!', patriarch: '[deep shout] HAAH!', tight: true },
  charge: { heir: '[straining, powering up] Hnnnngh... haaaaaaa...!', patriarch: '[deep, menacing growl, building] Hrrrrrnnngh...!' },
  charge_release: { heir: '[battle cry] HAAAAAAAAH!', patriarch: '[thunderous roar] RAAAAAAH!' },
  dash: { heir: '[sharp exhale] Hmph!', patriarch: '[sharp exhale] Hm.', takes: 2, tight: true },
  skyward: { heir: '[effort] Hup!', patriarch: '[effort] Hmph.', tight: true },
  skydive: { heir: '[furious battle cry] RAAAAAAAAGH!', patriarch: '[thunderous roar] RAAAAAAAAGH!' },
  grab: { heir: '[strained grunt] Hngh! [roaring] RAAAAAAH!', patriarch: '[cold chuckle] Heh. [grunts] Hngh!' },
  super_start: { heir: '[intense, rising scream] Haaaaaaaaa...!', patriarch: '[furious roar] RAAAAAAAAAAAH!' },
  super_finish: { heir: '[explosive battle cry] HAAAAAAAH!', patriarch: '[thunderous shout] HAAAAAAAH!' },
  block: { heir: '[grunts, bracing] Nngh!', patriarch: '[unimpressed grunt] Hmph.', takes: 2, tight: true },
  hurt_light: { heir: '[pained grunt] Ugh!', patriarch: '[pained grunt] Ngh!', takes: 3, tight: true },
  hurt_heavy: { heir: '[screams in pain] Gwaaaaah!', patriarch: '[roars in pain] Graaaagh!' },
  getup: { heir: '[groans, then a determined exhale] Nngh... hah.', patriarch: '[low growl] Grrr... [scoffs] Heh.' },
  ko: { heir: '[agonized scream, fading] Aaaaaaaargh...!', patriarch: '[agonized roar, fading] Aaaaaargh...!' },
  win: { heir: '[panting, then a triumphant shout] Hah... hah... YEAAAAH!', patriarch: '[deep, villainous laugh] Hahahaha... HAHAHAHA!' },
  taunt: { patriarch: '[menacing chuckle] Heh heh heh...' },
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const names = args.filter((a) => !a.startsWith('--'));
const chars = names.filter((a) => CHARACTERS[a]);
const only = names.filter((a) => !CHARACTERS[a]);
for (const id of only) if (!LINES[id.replace(/-\d+$/, '')]) { console.error(`unknown line: ${id}`); process.exit(1); }

const pub = path.resolve('public');
const metaFile = path.join(pub, 'sfx/elevenlabs.json');
const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
const saveMeta = () => fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));
const toBuffer = async (stream) => Buffer.from(await new Response(stream).arrayBuffer());
const describeError = (e) => `${e.statusCode ?? ''} ${e.body ? JSON.stringify(e.body) : e.message}`;
// take: e.g. attack_light-2; a bare line id picks all its takes
const picked = (char, take) => (!chars.length || chars.includes(char)) && (!only.length || only.includes(take) || only.includes(take.replace(/-\d+$/, '')));

// Bring a take to LUFS loudness (limited to a -1 dB peak; measured again and corrected, since the
// limiter eats into peaky takes) and trim it to the voice, from its loudness envelope: from the
// first moment within 35 dB of its loudest (12 dB for a tight grunt) to the last within 40 dB (25),
// so a shout starts the moment it's played. False (file untouched) for a failed take: nearly
// silent, or a click rather than a voice.
const LUFS = -16;
const measure = (file) => {
  const out = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect,ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  if (out.error) return null;
  const peak = Number((out.stderr.match(/max_volume: (-?[\d.]+) dB/) || [])[1] ?? -99);
  const [, h, m, sec] = out.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/) || [0, 0, 0, 0];
  return { peak, loud: Number([...out.stderr.matchAll(/^\s+I:\s+(-?[\d.]+) LUFS/gm)].pop()?.[1] ?? peak - 12), dur: h * 3600 + m * 60 + Number(sec) };
};
// loudness in dB per 25 ms window
const WIN = 0.025;
const envelope = (file) => {
  const pcm = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], { maxBuffer: 1 << 27 }).stdout;
  const x = new Float32Array(new Uint8Array(pcm).buffer), w = WIN * 8000, out = [];
  for (let i = 0; i + w <= x.length; i += w) { let e = 0; for (let j = i; j < i + w; j++) e += x[j] * x[j]; out.push(10 * Math.log10(e / w + 1e-12)); }
  return out;
};
const finish = (file, tight = false) => {
  const m = measure(file);
  if (!m) { console.warn(`[voice] couldn't level ${path.basename(file)} (is ffmpeg installed?)`); return true; }
  if (m.peak < -30) return false;
  const env = envelope(file), top = Math.max(...env);
  const first = env.findIndex((e) => e > top - (tight ? 12 : 35));
  const last = env.length - 1 - [...env].reverse().findIndex((e) => e > top - (tight ? 25 : 40));
  if ((last - first + 1) * WIN < 0.1) return false;
  const from = Math.max(0, first * WIN - 0.03), to = Math.min(m.dur, (last + 1) * WIN + (tight ? 0.08 : 0.15));
  const tmp = file.replace(/\.mp3$/, '.level.mp3');
  let gain = LUFS - m.loud;
  for (let pass = 0; pass < 3; pass++) {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-af',
      `atrim=start=${from.toFixed(3)}:end=${to.toFixed(3)},asetpts=PTS-STARTPTS,volume=${Math.min(40, gain).toFixed(1)}dB,`
      + `alimiter=limit=0.891:attack=2:release=15:level=0:latency=1,afade=t=out:st=${Math.max(0, to - from - 0.04).toFixed(3)}:d=0.04`,
      '-c:a', 'libmp3lame', '-b:a', '128k', tmp]);
    const got = measure(tmp).loud;
    if (Math.abs(LUFS - got) < 1) break;
    gain += LUFS - got;
  }
  fs.renameSync(tmp, file);
  return true;
};

if (args.includes('--level')) {
  for (const char of Object.keys(CHARACTERS)) {
    const dir = path.join(pub, 'sfx/voices', char);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const take = f.replace(/\.mp3$/, ''), line = LINES[take.replace(/-\d+$/, '')];
      if (f.endsWith('.mp3') && picked(char, take)) console.log(`[voice] ${char}/${f}: ${finish(path.join(dir, f), line?.tight) ? 'levelled' : 'FAILED (silent or a click), make it again'}`);
    }
  }
  process.exit(0);
}

if (args.includes('--promote')) {
  for (const char of Object.keys(CHARACTERS)) {
    const dir = path.join(pub, 'alt/sfx/voices', char);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.mp3') || !picked(char, f.replace(/\.mp3$/, ''))) continue;
      const to = `sfx/voices/${char}/${f}`, from = `alt/${to}`;
      fs.mkdirSync(path.dirname(path.join(pub, to)), { recursive: true });
      fs.renameSync(path.join(pub, from), path.join(pub, to));
      const prev = meta[to], next = meta[from];
      if (next) {
        // the old voice this take was made to replace goes
        if (next.replaces) { fs.rmSync(path.join(pub, next.replaces), { force: true }); console.log(`[voice] removed ${next.replaces}`); }
        const { replaces, ...rest } = next;
        meta[to] = { ...rest, tries: (prev?.tries ?? 0) + next.tries, spent: (prev?.spent ?? 0) + next.spent };
        delete meta[from];
      }
      console.log(`[voice] ${char}/${f}: now in game`);
    }
  }
  saveMeta();
  execFileSync('node', ['tools/sfx-index.mjs'], { stdio: 'inherit' });
  process.exit(0);
}

const { elevenlabs, usedCredits } = await import('./elevenlabs.mjs');

meta._voices = meta._voices || {};
const startUsed = await usedCredits();
const designed = [];
let total = 0;
for (const [char, def] of Object.entries(CHARACTERS)) {
  if (chars.length && !chars.includes(char)) continue;
  // the character's voice: designed once, the first of the previews kept
  if (!meta._voices[char]) {
    const before = await usedCredits();
    try {
      const design = await elevenlabs.textToVoice.design({ voiceDescription: def.description, text: def.sample, modelId: VOICE_MODEL });
      const pick = design.previews[0];
      const voice = await elevenlabs.textToVoice.create({ voiceName: def.name, voiceDescription: def.description, generatedVoiceId: pick.generatedVoiceId });
      const after = await usedCredits();
      const credits = before != null && after != null ? after - before : null;
      total += credits || 0;
      meta._voices[char] = { voiceId: voice.voiceId, name: def.name, description: def.description, model: VOICE_MODEL, credits, at: new Date().toISOString() };
      designed.push(char);
      saveMeta();
      console.log(`[voice] ${char}: designed ${def.name} (${credits ?? '?'} credits)`);
    } catch (e) { console.error(`[voice] ${char}: voice design failed - ${describeError(e)}`); continue; }
  }
  const { voiceId, name: voiceName } = meta._voices[char];
  for (const [id, line] of Object.entries(LINES)) for (let take = 1; take <= (line.takes || 1); take++) {
    const text = line[char];
    const name = `${id}${take > 1 ? `-${take}` : ''}`;
    if (!text || !picked(char, name)) continue;
    const key = `alt/sfx/voices/${char}/${name}.mp3`, file = path.join(pub, key);
    // a take already in game counts too
    if ((fs.existsSync(file) || fs.existsSync(path.join(pub, key.slice(4)))) && !force && !only.length) { console.log(`[voice] ${char}/${name}: has a take, skipped`); continue; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const before = await usedCredits();
    try {
      let attempts = 0, ok = false;
      while (!ok && attempts < 3) {
        attempts++;
        const data = await elevenlabs.textToSpeech.convert(voiceId, { text, modelId: TTS_MODEL, outputFormat: 'mp3_44100_128' });
        fs.writeFileSync(file, await toBuffer(data));
        ok = finish(file, line.tight);
      }
      const after = await usedCredits();
      const credits = before != null && after != null && after > before ? after - before : null;
      total += credits || 0;
      const prev = meta[key];
      meta[key] = {
        source: 'ElevenLabs', voice: voiceName, model: TTS_MODEL, prompt: text,
        credits, tries: (prev?.tries ?? 0) + attempts, spent: (prev?.spent ?? 0) + (credits || 0), at: new Date().toISOString(),
      };
      saveMeta();
      console.log(`[voice] ${char}/${name}: ${credits ?? '?'} credits${attempts > 1 ? ` (${attempts} tries)` : ''}${ok ? '' : ' - STILL FAILED (silent or a click)'}`);
    } catch (e) { console.error(`[voice] ${char}/${name}: failed - ${describeError(e)}`); }
  }
}
const sub = await elevenlabs.user.subscription.get().catch(() => null);
if (sub) {
  meta._plan = { tier: sub.tier, limit: sub.characterLimit };
  // a voice design is billed a moment later, so it shows up in the counter after the lines: give
  // the run's unaccounted credits to the voices it designed
  const late = startUsed != null ? sub.characterCount - startUsed - total : 0;
  if (late > 0 && designed.length) {
    for (const c of designed) meta._voices[c].credits = (meta._voices[c].credits || 0) + Math.round(late / designed.length);
    total += late;
  }
  saveMeta();
}
execFileSync('node', ['tools/sfx-index.mjs'], { stdio: 'inherit' });
console.log(`[voice] this run: ${total} credits${sub ? ` · ${sub.tier} plan: ${sub.characterCount} / ${sub.characterLimit} used this period` : ''}`);
