# Snake

A classic Snake game — markup, styles, and all the game logic live in
one `index.html`, no framework — built and deployed with Vite, and
installable as a PWA. Live at
[snake.virag.fun](https://snake.virag.fun).

## Features

- **Arrow keys or swipe** to steer — both go through the same input
  queue, so turns always resolve in the order they happened, and swipes
  register the instant you've moved your finger far enough (not after
  you lift it).
- **Four difficulty levels** (Viper, Python, Anaconda, King Cobra), each
  with its own **global top-5 leaderboard** shared across everyone who
  plays, backed by Firestore. Making the top 5 prompts for an optional
  nickname (client-side profanity/charset filtered), with the option to
  not save the score at all instead.
- **Bad food**: occasional hazard tiles mixed in with regular food —
  hitting one ends the run just like hitting a wall.
- **Two hidden mythological easter eggs** - see [Fairytales](#fairytales)
  below.
- **Installable PWA** (`vite-plugin-pwa`, auto-updating service worker) -
  a from-scratch pixel-art "S" icon built from the game's own in-game
  colors (see `public/icon-*.png`, `public/tab_icon.ico`,
  `public/apple-touch-icon.png`), not derived from the splash artwork.
- **Sound effects** for eating food and game over (toggleable), plus a
  splash screen shown before a run starts.
- **Double-tap to restart** on touch devices, `R` on keyboard.

## Fairytales

Three hidden, mythology-themed easter eggs, each firing once per run.
Ouroboros is the gate: until it fires, this is just Snake - Jörmungandr
and the Basilisk are both unreachable. Once Ouroboros fires, the other
two become available (the Basilisk immediately, Jörmungandr any time
after via growth) and are independent of each other, in either order -
a single run can earn all three.

- **Ouroboros**: biting your own tail tip (not any other self-collision)
  the first time in a run doesn't kill you - the snake collapses to a
  single tile at the point of the bite, +500 score, pauses (golden
  rays, double-tap or `R` to dismiss) until your next move, turns gold,
  and banks a **free life**: whatever kills the run next (wall,
  self-collision, rotten apple - any cause) is forgiven instead of
  ending it, respawning the snake as a single tile at the board's
  center - the same point a fresh game starts from - with a brief
  "Saved by Ouroboros!" message and no pause. Either way, once you swipe
  again the snake regrows back out to its old length one tile per move
  (`regrowPending`, see `update()`) instead of snapping back instantly.
  The banked life shows as a heart next to the score - a hollow outline
  when nothing's banked, filled in once it is. Kept length-preserving
  (rather than a permanent shrink or reset) so reaching Jörmungandr
  afterward stays consecutive instead of forcing a rebuild from scratch
  - the actual risk is choosing to bite your tail at all (or having it
  happen by accident) rather than losing progress from doing so. The
  bonus only affects the score shown/submitted, not the level/speed
  pacing (that's driven by a separate `pacingScore` that excludes it) -
  see `triggerOuroboros()`/`handleDeath()`/`respawnWithSameLength()` in
  `index.html`. Only fires once per run (so there's only ever one free
  life to spend); any other self-collision, or any death after the life
  is already spent, is a normal death. Leaderboard entries that
  triggered it get a ♾️ badge next to the score.
- **Jörmungandr**: growing the snake to 80 segments (`JORMUNGANDR_LENGTH`
  in `index.html`) triggers it - but only once Ouroboros has already
  fired this run (Ouroboros's free life, if still banked, carries
  through unaffected - only its own regrow-to-old-length target is
  cancelled if Jörmungandr fires mid-regrow, since its own shrink-to-1
  wins). Unlike Ouroboros, this one does shrink to 1 square and stays
  there - no regrow - pause/rays/color otherwise the same treatment,
  just teal instead of gold and +1000 instead of +500. Leaderboard
  entries get a 🐉 badge.
- **Basilisk**: appears the instant you swipe to resume after
  Ouroboros's own pause, on one of the 8 tiles surrounding the board's
  center (a 3x3 area minus the middle, picked at random each time - see
  `BASILISK_SPAWN_OFFSETS`/`spawnBasilisk()`), gazing a wall out to the
  board edge. The origin tile is its head - stone gray, with two purple
  eyes; the rest of the line is the gaze itself, drawn in purple, since
  that's the part you actually can't enter. A side tile gazes straight
  outward in that same direction; a corner tile doesn't gaze diagonally
  - it picks one of its two component directions 50/50 - so the wall is
  always a straight line, and (deliberately) never originates at the
  center itself, which is where a forgiven death always respawns.
  Touching any tile of the wall, including its head, is a death like
  any wall (a banked Ouroboros life still forgives it, same as any
  other death). The wall stays up until 15 apples have been eaten since
  it spawned (`BASILISK_FOOD_COUNT`) - not 15 raw moves, so circling in
  place can't clear it for free, you have to actually keep playing.
  Surviving to see it clear is the achievement: same pause/rays
  treatment, +1500, stone gray, 🗿 badge. Only ever spawns once per run.

Whichever of the three fired most recently wins the snake's color for
the rest of the run, and a run that earns more than one shows all of
their badges together next to the score.

## Running locally

```
bun install
bun run dev
```

Local dev always talks to the Firestore emulator, not the real project
(see "Global leaderboard" below) — it works before any real Firebase
config exists.

## Building

```
bun run build
```

Outputs to `dist/`. The Firebase config is baked in from the
`VITE_FIREBASE_*` environment variables present at build time (see
below) — set them locally to test a production build against the real
project.

## Deployment

GitHub Pages, deployed via GitHub Actions
(`.github/workflows/deploy.yml`) on every push to `main`: build with
Vite, inject the `VITE_FIREBASE_*` vars from repository secrets, deploy
`dist/` to Pages. The repo's Pages source must be set to "GitHub
Actions" (Settings → Pages → Build and deployment), not "Deploy from a
branch".

## Global leaderboard (Firestore)

The shared top-5s are the one piece of this game that isn't fully
self-contained — they need a real Firestore project to write to. Unlike
the other virag.fun apps, there's no login here (it's a public game), so
`firestore.rules` is the *entire* anti-cheat model: reads are public,
writes are validated entirely server-side (`difficulty` must be one of
the 4 real values, `score` must be a non-negative integer no higher than
the board can actually produce, `nickname` (optional) must be a string
of 15 characters or fewer restricted to a safe charset — which also
rules out emoji, so a player can't fake the Ouroboros badge by typing
one into their own name, `ouroboros` must be a bool, `createdAt` must be
the server's own timestamp), and nothing can ever be updated or deleted
once written. The rule's charset check is a length/injection guard, not
profanity filtering — a rule can't practically match against a word
list, so that check lives client-side in `index.html` instead and isn't
a security boundary.

The Firebase web config in `index.html` isn't a secret (it only says
which project to talk to — the rule above is what actually protects the
data). It's injected at build time from individual repository secrets
anyway, for consistency with the other virag.fun apps:
`FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`,
`FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`,
`FIREBASE_APP_ID` — add these under Settings → Secrets and variables →
Actions.

Local dev and testing use the Firestore emulator instead of a real
project:

```
bun run emulators
```

(equivalent to `firebase emulators:start --only firestore`, using
`firebase.json` / `.firebaserc` / `firestore.rules` already in this
repo) — `index.html` auto-detects Vite's dev mode (`import.meta.env.DEV`)
and connects to the emulator instead of production.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The entire game — markup, styles, and logic in one file |
| `firestore.rules` | Security rules for the global leaderboard (see above) |
| `firebase.json`, `.firebaserc` | Local emulator config for `firestore.rules` |
| `vite.config.js` | Build config, including the `vite-plugin-pwa` manifest/icon setup |
| `public/CNAME` | Custom domain for GitHub Pages |
| `public/tab_icon.ico` | Favicon (no-gap pixel-art render, no eye detail - aliases into noise at 16-32px otherwise) |
| `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png` | PWA/home-screen icons (segmented pixel-art render, with head/eye detail) |
| `public/snake_splash_screen.png` | Splash screen shown before a run starts |
| `public/snake_gameover_wall.png`, `public/snake_gameover_self.png`, `public/snake_gameover_rotten.png` | Game-over screens, one per death cause |
| `public/food.mp3`, `public/ugh_05s.mp3` | Sound effects (eating food, game over) |
