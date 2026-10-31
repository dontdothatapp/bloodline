# Soundtrack

| File | Used for |
|---|---|
| `1-NV1a-intro.ogg` | title menu (looped) |
| `1-NV2b-riff-action-doom.ogg` | fights, from "FIGHT!" through all rounds (looped) |
| `1-NV5c-brutal2-short.ogg` | results screen, win or lose, after the victory stinger (looped) |
| `ambience.mp3` | a dark city bed under everything, from the first click (looped) |

Source: **Woffels — Metal OST Asset Pack ("Noitavaino")**, https://woffels.itch.io/metal-ost-asset-pack-noitavaino,
licensed CC BY (credit: Woffels). Converted from the pack's WAV files to Ogg Vorbis (q6) for the web;
otherwise unedited. Each `.ogg` has an AAC twin (`.mp4`, `node tools/ogg-twins.mjs`) for Safari
before 18.4, which can't decode Ogg. The file → use mapping and per-track levels live in `AudioEngine.MUSIC`
(`src/core/audio.js`).

`ambience.mp3`: an ElevenLabs sound effect (`eleven_text_to_sound_v3`, made as a seamless loop by
`tools/elevenlabs-sfx.mjs`; prompt and cost in `public/sfx/elevenlabs.json`), levelled to the loudness
of the recording it replaced. Level: `AudioEngine.AMBIENCE` / `AudioEngine.MIX.ambience`.
