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

Three hidden, mythology-themed easter eggs, each firing once per run,
in a strict chain: Ouroboros → Basilisk → Jörmungandr. Ouroboros is the
gate - until it fires, this is just Snake. Once it fires, the Basilisk
spawns immediately; only once the Basilisk has been outgazed does
Jörmungandr become reachable, and even then only on your next actual
food-eat (not just your next move) - so there's always a real "eat an
apple" step between the two, even if you'd already grown past its
length threshold while the Basilisk's wall was still up. A single run
can earn all three.

- **Ouroboros**: biting your own tail tip (not any other self-collision)
  the first time in a run doesn't kill you, at any length - the snake
  collapses to a single tile at the point of the bite, pauses (golden
  rays, double-tap or `R` to dismiss) until your next move, turns gold,
  and scores a bonus that scales with how long the snake was at the
  bite: +40 at the smallest possible loop (4 segments - the geometric
  floor for the head to even reach its own tail tip) up to +400 once
  you're 40+ segments long - a clean +10 per segment in between
  (`OUROBOROS_MIN_LENGTH`/`OUROBOROS_FULL_BONUS_LENGTH`/
  `OUROBOROS_MIN_BONUS`/`OUROBOROS_MAX_BONUS` in `index.html`) -
  deliberately discourages triggering it the instant it's geometrically
  possible just to breeze through the easiest, slowest part of a run;
  the reward only matches the myth once you've actually risked
  something. It also banks a **free life**: whatever kills the run next (wall,
  self-collision, rotten apple - any cause) is forgiven instead of
  ending it, respawning the snake as a single tile at the board's
  center - the same point a fresh game starts from - with a brief
  "Saved by Ouroboros!" message and no pause. Either way, once you swipe
  again the snake regrows back out to its old length one tile per move
  (`regrowPending`, see `update()`) instead of snapping back instantly.
  The banked life shows as the first of two hearts next to the score -
  a hollow outline when nothing's banked, filled in once it is (the
  second is the Basilisk's own, see below - `handleDeath()` spends this
  one first if both happen to be banked at once). Kept length-preserving
  (rather than a permanent shrink or reset) so reaching Jörmungandr
  afterward stays consecutive instead of forcing a rebuild from scratch
  - the actual risk is choosing to bite your tail at all (or having it
  happen by accident) rather than losing progress from doing so. The
  bonus only affects the score shown/submitted, not the level/speed
  pacing (that's driven by a separate `pacingScore` that excludes it) -
  see `triggerOuroboros()`/`handleDeath()`/`respawnWithSameLength()` in
  `index.html`. Only fires once per run (so there's only ever one of
  *this* free life to spend); any other self-collision, or any death
  after both lives are spent, is a normal death. Leaderboard entries
  that triggered it get a ♾️ badge next to the score.
- **Basilisk**: appears the instant you swipe to resume after
  Ouroboros's own pause, gazing a wall out to the board edge in exactly
  the direction of that swipe - never some unrelated random direction,
  so it's never a surprise: it only ever extends further along the
  path you were already about to take. The origin (its head) is picked
  at random from the 3 of the 8 tiles surrounding the board's center (a
  3x3 area minus the middle - see `BASILISK_SPAWN_OFFSETS`/
  `spawnBasilisk()`) that sit on that same side of center - e.g.
  swiping right picks randomly among the right column's 3 tiles (the
  side tile and both corners) and gazes right from whichever one it
  lands on - excluding whichever of those 3 shares the snake's current
  row (or column, for an up/down swipe), so an Ouroboros bite that
  happened to land within the middle 3 rows/columns can't put the wall
  right on the snake's own row/column the instant it appears. This
  also guarantees the wall never originates at the center itself,
  which is where a forgiven death always respawns. The
  origin tile is stone gray with two purple eyes; the rest of the line
  is the gaze itself, drawn in purple, since that's the part you
  actually can't enter. Touching any tile of the wall, including its head, is its own death
  cause - "You gazed into the Basilisk's eyes," with a game-over screen
  showing the snake turned to stone (same art as the other game-over
  screens, just recolored gray) - still forgiven by a banked free life
  (either one), same as any other death. The wall stays up until 15 apples have been eaten since
  it spawned (`BASILISK_FOOD_COUNT`) - not 15 raw moves, so circling in
  place can't clear it for free, you have to actually keep playing.
  Surviving to see it clear is the achievement: same pause/rays
  treatment as Ouroboros, right down to collapsing to a single tile and
  regrowing back out one tile per move once play resumes (`regrowPending`),
  and banking its own **free life** - the second heart next to the score,
  independent of Ouroboros's own (both can be banked at once; a death
  spends Ouroboros's first - see `handleDeath()`) - +400, 🗿 badge,
  deliberately doesn't change the snake's body color (see below) - the
  one permanent trace it leaves is the snake's own eyes turning the
  same dark purple as the Basilisk's, for the rest of the run. Only
  ever spawns once per run (so there's only ever one of *this* free
  life to spend, same as Ouroboros's own).
- **Jörmungandr**: growing the snake to 80 segments (`JORMUNGANDR_LENGTH`
  in `index.html`) triggers it - but only once the Basilisk has been
  outgazed this run, and even then only re-checked on your next actual
  food-eat, not just your next move (so an unlucky earlier moment - e.g.
  crossing the length threshold, via food or an Ouroboros regrow, while
  the Basilisk's wall is still up - can't chain the two pauses back to
  back with no real play in between). Ouroboros's free life, if still
  banked, carries through unaffected, and so does an in-progress regrow
  if this fires mid-regrow after an Ouroboros collapse - Jörmungandr
  doesn't touch the snake's length or position at all. Pause/rays/color
  otherwise the same treatment as Ouroboros, just teal instead of gold
  and a flat +1000 (unlike Ouroboros's scaled bonus - there's nothing
  to game here, since it already requires a substantial length to
  reach). Leaderboard entries get a 🐉 badge.

Ouroboros and Jörmungandr each set the snake's color (gold, then teal
once both have fired); outgazing the Basilisk never does, so it can't
overwrite the gold you earn just before it - gray only ever shows up on
the Basilisk's own death screen, never on the living snake. A run that
earns all three shows all of their badges together next to the score.

### State reference

The chain is strictly ordered, so a run is only ever in one of five
states. Everything else follows from which one it's in:

| State | How you got here | What's reachable | Hearts |
| --- | --- | --- | --- |
| Plain | run start | nothing - length does nothing, no wall | ` ♡ ♡ ` |
| Ouroboros fired | bit your own tail tip | Basilisk spawns on your next swipe | ` ♥ ♡ ` |
| Basilisk active | swiped to resume | outgaze it (15 apples) or die to it | ` ♥ ♡ ` |
| Basilisk outgazed | ate 15 apples with the wall up | Jörmungandr, on a later food-eat | ` ♥ ♥ ` |
| Jörmungandr found | grew back past the length threshold | nothing left - run it out | ` ♥ ♥ ` |

Rules that hold across every state:

- **Two lives, spent oldest first.** `handleDeath()` spends Ouroboros's
  life before the Basilisk's, so a run forgives at most two deaths, in
  that order, whatever killed you (wall, self, rotten, gaze).
- **A forgiven death never resets progress.** It respawns you at the
  board's center at length 1 and regrows you to your pre-death length;
  the Basilisk's wall and its apple counter both survive it.
- **Spending a life holds movement until you double-tap.** Same gate as
  an egg's announcement overlay (`respawnDismissed`, see `update()` and
  the `touchend` handler): a swipe on its own is discarded rather than
  becoming the new life's first direction. The death that spent the life
  is usually a panicked moment mid-swipe, so without it the snake sets
  off before you've found where it respawned - throwing away the life
  you just earned. On a keyboard an arrow key is already deliberate, so
  it dismisses and steers in one press; `R` dismisses without steering.
- **No apple exists while the snake is regrowing.** Whichever of the
  three collapses put it back to a single tile - the Ouroboros bite, a
  forgiven death, or outgazing the Basilisk - no food is drawn or
  eatable until `regrowPending` hits 0, at which point a fresh apple is
  placed clear of the body. One check in `update()` and one in
  `drawGame()`, both keyed on that counter, so all three paths get it.
  The point is the Basilisk: its 15 apples would otherwise be eaten
  while conveniently short, so this forces the fight at full length -
  you pay in difficulty for the free life it banks.
- **Bonuses never affect difficulty.** Speed is driven by `pacingScore`,
  which counts only real apples - the three bonuses are added to `score`
  alone, so chasing them costs nothing in pace.
- **Each egg fires exactly once**, and each later one needs the previous:
  no Basilisk without Ouroboros, no Jörmungandr without the Basilisk.

Known behavior worth expecting: the gaze wall can spawn on a tile
orthogonally adjacent to the board's center (~1 in 3 runs). If you then
spend a life while it's still up, you respawn at center with the wall
immediately beside you - three of your four directions are still safe,
and the run pauses for you to pick one, but swiping into the wall from
the respawn is an instant second death.

## Running locally

```
bun install
bun run dev
```

Local dev always talks to the Firestore emulator, not the real project
(see "Global leaderboard" below) — it works before any real Firebase
config exists.

## Tests

```
bun run test          # headless
bun run test:ui       # Playwright's watch/inspector UI
```

End-to-end tests (`tests/`) driven by Playwright against a headless
Chromium. There's no test build or harness in the game itself: because
`index.html` is a single classic `<script>`, all of its state lives in
the page's global scope, so a test can set up an exact board position,
call `update()` once, and assert on what came out. `tests/helpers.js`
holds the shared fixture and the in-page helpers, including the two
traps that bite otherwise — the game's own `requestAnimationFrame` loop
must be frozen (and re-frozen after any tick that ate food, which
reassigns `gameSpeed`), and the special-event pause makes `update()` a
silent no-op until it's dismissed.

| Spec | Covers |
| --- | --- |
| `deaths.spec.js` | The four death causes and their message/image tables |
| `ouroboros.spec.js` | The scaled bonus curve, the collapse, the free life, once-per-run |
| `basilisk.spec.js` | Spawn geometry (sampled over repeated runs), the gaze death, the apple counter, outgazing |
| `chain.spec.js` | Egg gating, both free lives, full-run score arithmetic, restart, leaderboard badges |
| `regrow.spec.js` | The no-apple-while-regrowing rule, on all three collapse paths |
| `respawn-gate.spec.js` | The double-tap gate after a forgiven death, driven through real touch and key events |

The suite runs in CI as a gate on the deploy (see below), so a push that
breaks the chain fails before it reaches Pages.

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
(`.github/workflows/deploy.yml`) on every push to `main`: run the
Playwright suite first and stop there if it fails, then build with
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
| `playwright.config.js`, `tests/` | End-to-end test config and specs (see above) |
| `public/CNAME` | Custom domain for GitHub Pages |
| `public/tab_icon.ico` | Favicon (no-gap pixel-art render, no eye detail - aliases into noise at 16-32px otherwise) |
| `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png` | PWA/home-screen icons (segmented pixel-art render, with head/eye detail) |
| `public/snake_splash_screen.png` | Splash screen shown before a run starts |
| `public/snake_gameover_wall.png`, `public/snake_gameover_self.png`, `public/snake_gameover_rotten.png`, `public/snake_gameover_gaze.png` | Game-over screens, one per death cause (`gaze`'s snake is the same art, recolored stone-gray) |
| `public/food.mp3`, `public/ugh_05s.mp3` | Sound effects (eating food, game over) |
