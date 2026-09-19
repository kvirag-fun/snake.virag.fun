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
- **Ouroboros easter egg**: biting your own tail tip (not any other
  self-collision) the first time in a run doesn't kill you - the snake
  permanently shrinks to a single square at that point, +500 score, and
  pauses (golden rays, double-tap or `R` to dismiss) until your next
  move; it only grows again by eating food from there, same as a fresh
  run, and stays gold for the rest of the run. A deliberate strategy as
  much as a bonus: worth reaching for once the snake gets unwieldy at a
  harder speed tier. The bonus only affects the score shown/submitted,
  not the level/speed pacing (that's driven by a separate `pacingScore`
  that excludes it) - see `triggerOuroboros()` in `index.html`. Only
  fires once per run; any other self-collision (including hitting a
  non-tail body segment, or a second tail-tip hit) is a normal death.
  Leaderboard entries that triggered it get a ♾️ badge next to the score.
- **Jörmungandr easter egg**: growing the snake to 80 segments (`JORMUNGANDR_LENGTH`
  in `index.html`) triggers independently of Ouroboros - either can happen
  first, neither requires the other, both can happen in the same run. Same
  shrink-to-1/pause/color treatment as Ouroboros, just teal instead of gold
  and +1000 instead of +500. A run with both fires shows both badges
  (♾️🐉). Whichever of the two events fires later wins the snake's color
  for the rest of the run.
- **Installable PWA** (`vite-plugin-pwa`, auto-updating service worker) -
  a from-scratch pixel-art "S" icon built from the game's own in-game
  colors (see `public/icon-*.png`, `public/tab_icon.ico`,
  `public/apple-touch-icon.png`), not derived from the splash artwork.
- **Sound effects** for eating food and game over (toggleable), plus a
  splash screen shown before a run starts.
- **Double-tap to restart** on touch devices, `R` on keyboard.

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
