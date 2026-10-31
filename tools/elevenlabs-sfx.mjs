// ElevenLabs sound effects for the game. Generating a sound writes it as an alternative to the
// in-game file (public/alt/<path>.mp3, the B slot on sounds.html); --promote moves the
// alternatives into the game (public/<path>.mp3, replacing the old file). Every prompt and its
// credit cost is kept in public/sfx/elevenlabs.json (spent and tries count all generations).
// Generating skips sounds that already have an alternative unless --force; pass ids to do only those.
// A sound with a loudness target (LUFS) is brought to it as it's written, so a take that replaces a
// file the mix was tuned around lands at that file's level (needs ffmpeg).
// Usage: node --env-file=.env.local tools/elevenlabs-sfx.mjs [--force] [id ...]
//        node tools/elevenlabs-sfx.mjs --promote [id ...]
import fs from 'fs';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';

const MODEL = 'eleven_text_to_sound_v3';
const INFLUENCE = 0.5;   // follow the prompt more closely than the default 0.3

// id -> [path under public/ without extension, seconds, prompt, loop, prompt influence, LUFS target]
const SOUNDS = {
  blocked: ['sfx/impacts/blocked', 0.6, 'A superhuman punch blocked by raised forearms: a hard, dense smack of fist on forearm with a short sharp crack. Tight, punchy, close-up, no reverb tail.'],
  ground_slam: ['sfx/impacts/ground_slam', 2.5, 'A superpowered fighter crashes into a city street from high above: massive deep impact boom, asphalt cracking and caving in, chunks of concrete scattering, heavy sub-bass thump. Cinematic.'],
  // try 1 sounded like a small tiled room: ask for the outside of a big building, dry
  smash_through: ['sfx/impacts/smash_through', 2.5, 'A superpowered fighter is hurled through the outer wall of a big city office building: a huge, explosive crash of reinforced concrete bursting apart, steel rebar tearing, heavy slabs of masonry and debris spilling out onto the street below. Massive scale, outdoors in open city air, dry and close-up. No echo, no room reverb, not indoors.', false, 0.6],
  metal: ['sfx/impacts/metal', 1.2, 'A superhuman hit against a car or a steel lamp post: loud metal crunch and clang, denting steel, short ringing.'],
  field: ['sfx/impacts/field', 1, 'A body bouncing off an energy force field: an electric sci-fi shield impact with a resonant zap and a humming wobble.'],
  creak: ['sfx/destruction/creak', 2, 'A badly damaged skyscraper straining before it falls: deep, low metallic groan of steel beams bending, structural creaking. Ominous.'],
  collapse: ['sfx/destruction/collapse', 6, 'A city building collapsing: huge rumbling roar of concrete and steel coming down, cascading debris, some glass shattering, a deep earthquake-like rumble that fades out.'],
  crumble_small: ['sfx/destruction/crumble_small', 1, 'Small chunks of concrete breaking off a wall and clattering onto the pavement. Short, gritty crumble.'],
  crumble_big: ['sfx/destruction/crumble_big', 2.5, 'A large section of a concrete building breaking apart: heavy crumbling, big chunks of rubble and dust falling, deep rumble underneath.'],
  glass_small: ['sfx/destruction/glass_small', 1, 'A single window pane shattering: a sharp glass break, then a few shards tinkling.'],
  glass_big: ['sfx/destruction/glass_big', 2, 'An entire glass office facade shattering at once: many windows bursting, glass shards raining down onto the street.'],
  whoosh: ['sfx/movement/whoosh', 0.6, 'A superhero dashing past at incredible speed: a fast, powerful whoosh of rushing air. Short and punchy.'],
  // try 1 came out odd: describe the whoosh more concretely and follow the prompt closely
  swing: ['sfx/movement/swing', 0.5, 'A single fast punch cutting through the air right past the ear: a short, clean, airy whoosh of a heavy fist, like a martial arts strike in a fight film. Just the air movement. No impact, no voice, no music.', false, 0.7],
  grab: ['sfx/movement/grab', 0.5, 'A powerful fighter grabbing an opponent by the body: a firm, short, muffled thud of hands and cloth.'],
  skid: ['sfx/movement/skid', 1.5, 'A body skidding across asphalt at high speed: gritty scraping, grinding gravel, the road surface tearing up, sliding to a stop.'],
  wind: ['sfx/movement/wind', 5, 'Rushing wind while flying very fast high above a city: a steady, roaring stream of air.', true],

  // Stingers, cues and the ambience, replacing licensed pack sounds that can't go in a public repo.
  // Each LUFS target is the integrated loudness of the file it replaces, so the levels in
  // AudioEngine.sting / police / chargeStart / AMBIENCE stay right.
  fight: ['sfx/ui/fight', 7, 'A massive cinematic trailer braam: a huge, distorted brass and synth blast over a deep sub-bass hit, ringing out and decaying over several seconds. Epic and aggressive, the moment a superhero fight begins. No voice, no music.', false, 0.6, -13.4],
  super_ready: ['sfx/ui/super_ready', 1.8, 'A short, bright power-up stinger: a quick rising electric shimmer that bursts into a punchy, glowing hit, like a superpower becoming fully charged in a fighting game. No voice.', false, 0.6, -6.7],
  // only its first 1.8 s plays
  combo_streak: ['sfx/ui/combo_streak', 2.5, 'A punchy arcade fighting game combo stinger: a fast rising whoosh into a bright, triumphant impact with a short shimmering tail. Energetic. No voice.', false, 0.6, -8.3],
  parry: ['sfx/ui/parry', 0.8, 'A sharp superhuman parry: a fast, bright metallic clang with a spark, a short ringing deflection as a punch is knocked aside. Tight and punchy, no voice.', false, 0.6, -14.1],
  victory: ['sfx/ui/victory', 7, 'A triumphant cinematic victory stinger: a big brassy orchestral hit swelling into a heroic, glorious chord with a shimmering tail, the end of a superhero fight. No voice.', false, 0.6, -8.0],
  // looped while a heavy charges; the game raises its pitch and level as the charge fills
  charge: ['sfx/ui/charge', 4, 'A superpower charging up in a clenched fist: a dense, humming, crackling electric energy, buzzing and pulsing. A steady sci-fi texture, no start or end.', true, 0.6, -12.2],
  round_drop: ['sfx/ui/round_drop', 3.5, 'A deep cinematic bass drop: a heavy sub-bass boom that falls in pitch and rumbles out, announcing a new round in a fighting game. No voice.', false, 0.6, -25.0],
  ko_downer: ['sfx/ui/ko_downer', 5.5, 'A dramatic cinematic downer for a knockout: a heavy, distorted tone sliding down in pitch with a big boom and a long dark reverb tail. Final. No voice.', false, 0.6, -12.2],
  // played once, far off (band-passed, panned), after the first super of a session
  police_radio: ['sfx/ui/police_radio', 7, 'American city police radio chatter: a dispatcher talking over a crackly walkie-talkie, short bursts of static and squelch between calls about a disturbance downtown. Lo-fi, muffled.', false, 0.5, -22.1],
  // the looped bed under everything (AudioEngine.AMBIENCE)
  ambience: ['music/ambience', 30, 'A dark, ominous city ambience after a superhuman battle: a low eerie drone, distant rumbles, wind between skyscrapers and faint far-off sirens. Tense and brooding, a steady background with no sudden sounds.', true, 0.5, -13.9],
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
for (const id of only) if (!SOUNDS[id]) { console.error(`unknown id: ${id}`); process.exit(1); }
const picked = Object.entries(SOUNDS).filter(([id]) => !only.length || only.includes(id));

const pub = path.resolve('public');
const metaFile = path.join(pub, 'sfx/elevenlabs.json');
const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
const saveMeta = () => fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));

if (args.includes('--promote')) {
  for (const [id, [p]] of picked) {
    const from = path.join(pub, 'alt', `${p}.mp3`);
    if (!fs.existsSync(from)) continue;
    // drop the old take, whatever its format, so the group doesn't play both
    const dir = path.dirname(path.join(pub, p));
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) if (f.replace(/\.\w+$/, '') === path.basename(p)) fs.rmSync(path.join(dir, f));
    fs.renameSync(from, path.join(pub, `${p}.mp3`));
    const prev = meta[`${p}.mp3`], next = meta[`alt/${p}.mp3`];
    if (next) {
      meta[`${p}.mp3`] = { ...next, tries: (prev?.tries ?? 0) + next.tries, spent: (prev?.spent ?? 0) + next.spent };
      delete meta[`alt/${p}.mp3`];
    }
    console.log(`[sfx] ${id}: now in game (${p}.mp3)`);
  }
  saveMeta();
  execFileSync('node', ['tools/sfx-index.mjs'], { stdio: 'inherit' });
  process.exit(0);
}

const { elevenlabs, usedCredits: used } = await import('./elevenlabs.mjs');

let total = 0;
// Bring a file to an integrated loudness, peaks held under -1 dBFS; returns the gain applied in dB.
const lufs = (f) => Number(spawnSync('ffmpeg', ['-nostats', '-hide_banner', '-i', f, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' })
  .stderr.match(/Integrated loudness:\s+I:\s+(-?[\d.]+) LUFS/)?.[1] ?? NaN);
const levelTo = (file, target) => {
  let measured;
  try { measured = lufs(file); } catch (e) { measured = NaN; }
  if (!Number.isFinite(measured)) return null;
  const gain = +(target - measured).toFixed(1), tmp = `${file}.tmp.mp3`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-af', `volume=${gain}dB,alimiter=limit=0.89:level=false`, '-b:a', '128k', tmp]);
  fs.renameSync(tmp, file);
  return gain;
};

for (const [id, [p, seconds, text, loop = false, influence = INFLUENCE, target = null]] of picked) {
  const key = `alt/${p}.mp3`, file = path.join(pub, key);
  if (fs.existsSync(file) && !force && !only.length) { console.log(`[sfx] ${id}: has an alternative, skipped`); continue; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const before = await used();
  try {
    const { data, rawResponse } = await elevenlabs.textToSoundEffects
      .convert({ text, durationSeconds: seconds, promptInfluence: influence, modelId: MODEL, loop, outputFormat: 'mp3_44100_128' })
      .withRawResponse();
    fs.writeFileSync(file, Buffer.from(await new Response(data).arrayBuffer()));
    const gainDb = target != null ? levelTo(file, target) : null;
    const after = await used();
    const header = rawResponse.headers.get('character-cost') ?? rawResponse.headers.get('x-character-count');
    const credits = before != null && after != null && after > before ? after - before : header != null ? Number(header) : null;
    total += credits || 0;
    const prev = meta[key];
    meta[key] = {
      source: 'ElevenLabs', model: MODEL, prompt: text, seconds, loop, promptInfluence: influence, credits,
      ...(target != null ? { lufs: target, gainDb } : {}),
      tries: (prev?.tries ?? 0) + 1, spent: (prev?.spent ?? 0) + (credits || 0), at: new Date().toISOString(),
    };
    saveMeta();
    console.log(`[sfx] ${id}: ${seconds}s, ${credits ?? '?'} credits${gainDb != null ? `, levelled ${gainDb > 0 ? '+' : ''}${gainDb} dB to ${target} LUFS` : ''}`);
  } catch (e) {
    console.error(`[sfx] ${id}: failed - ${e.statusCode ?? ''} ${e.body ? JSON.stringify(e.body) : e.message}`);
  }
}
const sub = await elevenlabs.user.subscription.get().catch(() => null);
if (sub) { meta._plan = { tier: sub.tier, limit: sub.characterLimit }; saveMeta(); }
execFileSync('node', ['tools/sfx-index.mjs'], { stdio: 'inherit' });
console.log(`[sfx] this run: ${total} credits${sub ? ` · ${sub.tier} plan: ${sub.characterCount} / ${sub.characterLimit} used this period` : ''}`);
