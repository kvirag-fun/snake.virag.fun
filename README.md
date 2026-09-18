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
  with its own top-5 leaderboard, stored per-browser in `localStorage`.
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

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The entire game — markup, styles, and logic in one file |
| `CNAME` | Custom domain for GitHub Pages |
| `tab_icon.ico` | Favicon |
| `snake_splash_screen.png` | Splash screen shown before a run starts |
| `snake_gameover_wall.png`, `snake_gameover_self.png`, `snake_gameover_rotten.png` | Game-over screens, one per death cause |
| `food.mp3`, `ugh_05s.mp3` | Sound effects (eating food, game over) |
