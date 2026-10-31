# Sound effects

The game plays the samples found here (indexed into `index.json` by `node tools/sfx-index.mjs`,
which runs automatically before `npm run dev` / `npm run build`). Files are matched to sound groups
by path prefix in `AudioEngine.GROUPS` (`src/core/audio.js`). If their files are missing, the
punches and stingers fall back to a procedural synthesizer. Each `.ogg` has an AAC twin (`.mp4`,
made by `node tools/ogg-twins.mjs`, not indexed) that Safari before 18.4 plays instead. `sounds.html` on the dev server lists
and plays everything here.

## Included

**`punches/`**: ["37 hits/punches"](https://opengameart.org/content/37-hitspunches) by
Independent.nu, CC0. Leading silence trimmed (most files started 0.1–0.27 s late), levelled, and
split by weight into `light/` (20) and `heavy/` (17). Used for every fist hit.

**`ui/`**: stingers and cues. All but the menu sounds are ElevenLabs sound effects
(`eleven_text_to_sound_v3`) made by `tools/elevenlabs-sfx.mjs`, each brought to the loudness of the
sound it replaced so the levels in `AudioEngine.sting` still hold; prompts and costs are in
`elevenlabs.json`.

| File | Plays on | Source |
|---|---|---|
| `fight.mp3` | "FIGHT!" (ducks the music as the riff comes in) | ElevenLabs |
| `super_ready.mp3` | the player's super meter fills | ElevenLabs |
| `combo_streak.mp3` | 5, 8 and 12-hit combos (first 1.8 s) | ElevenLabs |
| `parry.mp3` | a parry | ElevenLabs |
| `victory.mp3` | the results screen, before the results theme | ElevenLabs |
| `charge.mp3` | holding a charged heavy (looped, rising in pitch); the super wind-up | ElevenLabs |
| `round_drop.mp3` | the "ROUND" banner | ElevenLabs |
| `ko_downer.mp3` | "K.O.!" | ElevenLabs |
| `police_radio.mp3` | once, in the distance, after the first super of a session | ElevenLabs |
| `hover.mp3`, `select.mp3` | menu hover and select | [uisfx](https://www.npmjs.com/package/uisfx), CC0 |

**`voices/heir/`, `voices/patriarch/`**: each fighter's voice lines, spoken by a voice designed for
them with ElevenLabs (`eleven_ttv_v3`, lines with `eleven_v3`) by `tools/elevenlabs-voices.mjs`:
wordless anime-style shouts and efforts for attacks, charging, dashes, skyward and sky dives,
grabs, supers, blocks, getting hurt, getting up, K.O. and victory, plus the Patriarch's taunt.
`<line>-2`, `-3` are extra takes the game picks between. Which action says what, and how often, is
`Fighter.shout` and `SHOUTS` (`src/game/fighter.js`); priorities are `AudioEngine.VOICE`, levels
`AudioEngine.LEVEL.voice` and `VOICE_VOL`. The script brings each take to about -16 LUFS (the
peakiest ones land nearer -20). Texts and costs are in `elevenlabs.json`.

**`impacts/`, `destruction/`, `movement/`**: generated with ElevenLabs sound effects
(`eleven_text_to_sound_v3`) by `tools/elevenlabs-sfx.mjs`. Each file's prompt, length and credit
cost is in `elevenlabs.json`; levels are in `AudioEngine.LEVEL`. `impacts/metal.mp3` came out very
quiet and was raised by 25.7 dB.

| File | Plays on |
|---|---|
| `impacts/blocked.mp3` | any hit that lands on a block |
| `impacts/ground_slam.mp3` | a fighter crashing into the street (landings, missed dives, launches) |
| `impacts/smash_through.mp3` | a launched fighter breaking through a building |
| `impacts/metal.mp3` | lamp posts, cars and the train being hit |
| `impacts/field.mp3` | a launched fighter bouncing off the arena's force field |
| `destruction/creak.mp3` | a damaged building groaning before it falls |
| `destruction/collapse.mp3` | a building collapse |
| `destruction/crumble_small.mp3`, `crumble_big.mp3` | walls breaking up and debris landing, by how much breaks |
| `destruction/glass_small.mp3`, `glass_big.mp3` | windows breaking, by how many |
| `movement/swing.mp3` | every attack swing |
| `movement/whoosh.mp3` | dashes, launches, throws and the intro drop |
| `movement/grab.mp3` | a grab connecting |
| `movement/skid.mp3` | a launched fighter ploughing along the ground |
| `movement/wind.mp3` | looped; louder and faster the faster the player moves |
