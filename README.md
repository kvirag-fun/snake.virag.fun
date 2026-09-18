# Snake

A classic Snake game, built as a single self-contained `index.html` — no
build step, no dependencies, just open it in a browser. Live at
[virag.fun](https://www.virag.fun).

## Features

- **Arrow keys or swipe** to steer — both go through the same input
  queue, so turns always resolve in the order they happened, and swipes
  register the instant you've moved your finger far enough (not after
  you lift it).
- **Four difficulty levels** (Viper, Python, Anaconda, King Cobra), each
  with its own **global top-5 leaderboard** shared across everyone who
  plays, backed by Firestore. A per-browser `localStorage` copy is kept
  as an instant-render/offline fallback — the game never breaks just
  because the network or Firestore is unreachable.
- **Bad food**: occasional hazard tiles mixed in with regular food —
  hitting one ends the run just like hitting a wall or yourself.
- **Sound effects** for eating food and game over (toggleable), plus a
  splash screen shown before a run starts.
- **Double-tap to restart** on touch devices, `R` on keyboard.

## Running locally

No build step — just serve the directory and open it:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000/index.html`.

## Deployment

Plain GitHub Pages, deployed from the `main` branch (see the `CNAME`
file for the custom domain) — no GitHub Actions workflow, no build
step. Pushing to `main` is the entire deploy process.

## Global leaderboard (Firestore)

The shared top-5s are the one piece of this game that isn't fully
self-contained — they need a real Firestore project to write to. Unlike
the other virag.fun apps, there's no login here (it's a public game), so
`firestore.rules` is the *entire* anti-cheat model: reads are public,
writes are validated entirely server-side (`difficulty` must be one of
the 4 real values, `score` must be a non-negative integer no higher than
the board can actually produce, `createdAt` must be the server's own
timestamp), and nothing can ever be updated or deleted once written.

The Firebase web config in `index.html` isn't a secret (it only says
which project to talk to - the rule above is what actually protects the
data), so unlike cv.virag.fun it's just hardcoded directly rather than
injected at build time - this repo has no build step to inject it with.

Local testing uses the Firestore emulator (`npx firebase-tools
emulators:start --only firestore`, pointed at `firestore.rules`) rather
than a real project - `index.html` auto-detects `localhost`/`127.0.0.1`
and connects to the emulator instead of production.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The entire game — markup, styles, and logic in one file |
| `firestore.rules` | Security rules for the global leaderboard (see above) |
| `CNAME` | Custom domain for GitHub Pages |
| `tab_icon.ico` | Favicon |
| `snake_splash_screen.png` | Splash screen shown before a run starts |
| `snake_gameover_wall.png`, `snake_gameover_self.png`, `snake_gameover_rotten.png` | Game-over screens, one per death cause |
| `food.mp3`, `ugh_05s.mp3` | Sound effects (eating food, game over) |
