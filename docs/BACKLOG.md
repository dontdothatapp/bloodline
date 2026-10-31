# Backlog: ideas and things to fix

Gameplay, feel and presentation items. Performance work lives in
[OPTIMIZATION_BACKLOG.md](OPTIMIZATION_BACKLOG.md). Each item says what is seen today, where it
comes from in the code, and a way in; test with `?mute` so the music doesn't play while iterating.
Items 1–4 are done (2026-10-31; "Done" notes under each). The post-match items (1, 3, 4) are all
reached the same way: win a match (`?fight&diff=training`), or `?fight&diff=training&norecap` to
skip the highlights and get to the results sooner. In the browser console, a win is one line:
`__G.game.wins = [1, 0]; __G.game.onKO(__G.bot, __G.player)`.

## 1. Free flight: play the calm track, not the results theme

**Was.** The results theme `end` (`1-NV5c-brutal2-short`, the loud one) started 6.2 s after the win,
or with the recap, and kept playing through the whole free flight: `explore()` in
`src/game/game.js` never touched the music. The calm intro track `menu` (`1-NV1a-intro`) was only
ever heard on the title screen.

**Want.** The free flight is a tour of the wreckage, so it should sit under the calmer menu track.

**Done.** `explore()` switches to `menu` (1.5 s out, 2.5 s in) and cancels the queued results
theme (`endMusicAt`). The recap still plays `end` and hands back to `menu` when it returns to
the tour. `rematch()` now fades whatever post-match track plays, not only `end`. The track is
reused under its `menu` name rather than decoded a second time under a new one (each track is
~65 MB decoded).

## 2. Z-fighting on the ground under the spawn park

**Seen.** Flying over the park on the Flatiron map (free flight, camera a few hundred metres up and
looking down), the lawn and the paths flickered between two drawings, frame to frame: the crisp one
and a blocky one where the paths dissolve into 2 m squares. [`zfight-park.jpg`](zfight-park.jpg)
is two consecutive frames from the 2026-10-30 recording, side by side.

**Cause (confirmed in the running game).** Two textured planes covered the same ground:
- `Ground.mesh` in `src/world/ground.js`: the deformable 560 m heightfield at y = 0, painted at
  2048 px / 560 m ≈ 0.27 m per pixel (the crisp drawing).
- `realOuterGround()` in the same file: the 4,096 m static plane at y = −0.05, painted with the same
  map at 2 m per pixel (the blocky drawing). It ran on under the whole deformable zone instead of
  stopping at its edge.

So it was worse than z-fighting: every crater deeper than 5 cm dipped under the static plane,
which then lidded it with its own coarse texture. The scorch and cracks painted in a crater's
bowl were simply not visible from above; the park after a fight (full of shallow craters) showed
the blocky paths wherever the lawn had been pushed down, and the band where the two surfaces
were within depth precision of each other flickered. The procedural city had the same layout
(its outer plane at −0.05 under the heightfield, and the lake 7 cm above it).

**Done.** The outer ground is a flat ring (`ringGround()` in `src/world/ground.js`, eight
triangles): the rectangle with the 560 m zone cut out of its middle, so nothing lies under the
heightfield. The procedural ring also stops at the lake shore instead of running on under the
lake. `tools/s_ground.mjs` raycasts down into the zone, onto the ring and onto the lake on both
maps and must find the ring only outside the zone (run its `check()` in the browser console:
`(await import('/tools/s_ground.mjs')).check()`). A crater's scorch now shows from 300 m up with
the ring in place, exactly as it did with the ring hidden.

## 3. After the win, fly by default; keep the results as a small docked card

**Was.** KO → 3.8 s → `THE HEIR WINS` banner → recap (2.6 s later, unless `?norecap`) → the full
results panel (`#results` in `src/game/hud.js`, bottom-centre, five big buttons). Free flight was
one option on it (FLY AROUND / X); it hid the panel and Esc / II brought the panel back.

**Want.** Once the banner and the recap are done, the player is already flying. The results stay
on screen as a compact card in a corner so Rematch, New City, Recap and Main Menu are a click away,
but nothing covers the view or interrupts the flight.

**Done.**
- `Game.update`, state `end`: when the results would appear, they appear docked and `explore()`
  starts in the same step, once per match (`toured`, reset by `rematch()`). `explore()` docks the
  panel (`Hud.dockResults`) instead of hiding it; `showResults` always comes back full size, so
  Esc / Enter / Start still bring the big panel back and FLY AROUND / X dock it again.
- `#results.docked` in `src/style.css`: top-right, small title, the damage bill on one line, the
  buttons in a row without their subtitles. On phones (`body.touch`) there is no room for buttons
  beside the pause button and the damage bill (both top-centre), so the docked card is a small
  "TAP FOR RESULTS" target (103 × 50 px on a 375 px portrait screen) that brings the big panel back.
- The card is not a pad menu: `PadMenu` ignores a docked `#results`, so the stick flies him; II
  opens the big panel, which the pad navigates as before.
- Mid-flight hotkeys: R plays the recap and N starts a new city, as the card says. The recap
  returns to the tour (`playRecap` remembers `explore` as well as `end`), re-docks the card and
  puts the calm track back.

## 4. Free flight: smoother movement, especially left / right

**Seen.** Turning left or right while flying was jerky. Alternating A and D was the worst case.

**Cause.** Three things moved at three different speeds:
- Keyboard axes are −1 / 0 / 1 with no smoothing (`Input.poll`, `src/core/input.js`), and
  `_exploreInput` (`src/game/game.js`) mapped A / D to a camera-relative **sidestep**. A tap of A
  moved the velocity target 90° sideways in one frame.
- `_free` in `src/game/fighter.js` lerps the velocity toward that target at 7 / s hovering (22 m/s)
  and 3.2 / s boosting (62 m/s), and `_orient` slerps the body toward the velocity at 14 / s, so he
  snapped sideways and turned his body almost instantly.
- The chase camera (`FightCam.update`, mode `explore`, `src/game/camera.js`) only swung in behind
  the new heading at 1.6 · min(speed / 20, 1.5) per second, so it lagged, then caught up: the view
  yawed in a lurch after each press.

**Done.**
- The axes are eased in `_exploreInput` (0.12 s attack, 0.08 s release) before they move him, on
  keyboard, pad and touch alike.
- While he flies forward, A / D steer: the heading (and the view with it, `FightCam.steer`) turns
  at up to 1.4 rad/s and he follows it round a banked arc. Hovering, A / D sidestep as before; the
  two blend over the first half of the forward axis. Steering doesn't slow him (the axes arrive
  normalised as a pair, so forward is taken as the pair's length while turning).
- The camera settles in behind his heading at 3 / s (steady, below the 7 / s his velocity turns
  at, so it never overshoots) and holds off for 0.2 s after a steering input, so it doesn't fight
  the turn.
- Measured with `tools/s_flight.mjs` (`(await import('/tools/s_flight.mjs')).measure()` in the
  console; procedural city, same scripted taps): the flight heading's worst per-frame turn fell
  from 482 to 51 °/s and its worst change of turn from 34,977 to 256 °/s². The view now turns at
  up to 87 °/s because the keys steer it (it was 61 °/s and lagging); the heading is the number
  that was rough.

**Still to try if it needs more.** Roll into the pose from the turn rate (`leanR` in `_orient`),
a lower velocity lerp in the tour (7 → 4 / s) if start / stop feels abrupt, and a feel pass on the
pad's stick, which now both flies and steers.
