# Snake

A classic Snake game, built as a single self-contained `index.html`
(markup, styles, and all the game logic in one file — no framework),
built and deployed with Vite. Live at
[snake.virag.fun](https://snake.virag.fun).

## Features

- **Arrow keys or swipe** to steer — both go through the same input
  queue, so turns always resolve in the order they happened, and swipes
  register the instant you've moved your finger far enough (not after
  you lift it).
- **Four difficulty levels** (Viper, Python, Anaconda, King Cobra), each
  with its own **global top-5 leaderboard** shared across everyone who
  plays, backed by Firestore. Making the top 5 prompts for an optional
  nickname (client-side profanity/charset filtered).
- **Bad food**: occasional hazard tiles mixed in with regular food —
  hitting one ends the run just like hitting a wall or yourself.
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
of 15 characters or fewer restricted to a safe charset, `createdAt` must
be the server's own timestamp), and nothing can ever be updated or
deleted once written. The rule's charset check is a length/injection
guard, not profanity filtering — a rule can't practically match against
a word list, so that check lives client-side in `index.html` instead and
isn't a security boundary.

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
| `vite.config.js` | Build config |
| `public/CNAME` | Custom domain for GitHub Pages |
| `public/tab_icon.ico` | Favicon |
| `public/snake_splash_screen.png` | Splash screen shown before a run starts |
| `public/snake_gameover_wall.png`, `public/snake_gameover_self.png`, `public/snake_gameover_rotten.png` | Game-over screens, one per death cause |
| `public/food.mp3`, `public/ugh_05s.mp3` | Sound effects (eating food, game over) |
