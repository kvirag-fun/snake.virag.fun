// Ouroboros: biting your own tail tip instead of dying from it.
//
// The bonus scales with the length you took the bite at, specifically to
// remove the old exploit of biting at length 4 while the game is still
// slow and collecting a flat maximum for nearly no risk.
import { test, expect } from './helpers.js';

test('the bonus is +10 per segment from 40 at length 4 to 400 at length 40', async ({ game }) => {
    const curve = await game.evaluate(() => {
        const h = window.__game;
        return [4, 5, 10, 22, 39, 40, 41, 60].map((length) => {
            h.reset();
            h.stack(length, 10, 10);
            score = 0;
            scoreElement.textContent = '0';
            triggerOuroboros();
            return { length, bonus: score };
        });
    });
    expect(curve).toEqual([
        { length: 4, bonus: 40 },
        { length: 5, bonus: 50 },
        { length: 10, bonus: 100 },
        { length: 22, bonus: 220 },
        { length: 39, bonus: 390 },
        { length: 40, bonus: 400 },
        // Capped - no further reward for holding out past 40.
        { length: 41, bonus: 400 },
        { length: 60, bonus: 400 },
    ]);
    // Scores stay round: no decimals leaking into the leaderboard.
    for (const point of curve) {
        expect(point.bonus % 5, `bonus at length ${point.length}`).toBe(0);
    }
});

test('biting your own tail tip fires it instead of killing you', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        return h.state();
    });
    expect(state.gameRunning).toBe(true);
    expect(state.ouroborosTriggered).toBe(true);
    expect(state.specialEventKind).toBe('ouroboros');
    expect(state.snakeColorMode).toBe('ouroboros');
    // Length 8 at the bite: 40 + (8 - 4) * 10.
    expect(state.score).toBe(80);
});

test('it collapses the snake to a single tile and queues the regrow', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        return h.state();
    });
    expect(state.length).toBe(1);
    expect(state.regrowPending).toBe(7);
});

test('the snake regrows one tile per move, not all at once', async ({ game }) => {
    const lengths = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        const seen = [];
        for (let i = 0; i < 4; i++) {
            seen.push(snake.length);
            h.stepWithoutEating();
        }
        return seen;
    });
    expect(lengths).toEqual([2, 3, 4, 5]);
});

test('it fires only once per run', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        const scoreAfterFirst = score;
        // Set up a second tail-tip bite; it must be an ordinary death now.
        // Spend the banked life first, or it would forgive that death and
        // hide the very thing this test is checking.
        ouroborosLifeAvailable = false;
        basiliskActive = false;
        basiliskWall = [];
        h.setSnake(h.coil());
        dx = 0;
        dy = -1;
        h.step();
        return { ...h.state(), scoreAfterFirst };
    });
    expect(state.score).toBe(state.scoreAfterFirst);
    expect(state.gameRunning).toBe(false);
    expect(state.deathCause).toBe('self');
});

test('the bonus does not speed the game up', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        return h.state();
    });
    // score got the bonus, pacingScore (which drives getGameSpeed) did not.
    expect(state.score).toBe(80);
    expect(state.pacingScore).toBe(0);
});

test('it banks a free life', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        return h.state();
    });
    expect(state.ouroborosLifeAvailable).toBe(true);
});

test('a forgiven death respawns at the board centre at length 1', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        while (regrowPending > 0) h.stepWithoutEating();
        h.killIntoWall();
        return h.state();
    });
    expect(state.gameRunning).toBe(true);
    expect(state.ouroborosLifeAvailable).toBe(false);
    expect(state.length).toBe(1);
    expect(state.head).toEqual({
        x: Math.floor(state.tileCount / 2),
        y: Math.floor(state.tileCount / 2),
    });
    expect(state.regrowPending).toBeGreaterThan(0);
});

// A boustrophedon path (row 0 left-to-right, row 1 right-to-left, ...)
// rather than h.stack()'s everything-on-one-tile shape - the glow test
// below samples the tail tile's own pixels, which only means something
// if the tail is actually drawn somewhere the head and body don't also
// overwrite it.
function boustrophedon(length) {
    const path = [];
    for (let row = 0; path.length < length; row++) {
        const xs = row % 2 === 0
            ? Array.from({ length: 21 }, (_, x) => x)
            : Array.from({ length: 21 }, (_, x) => 20 - x);
        for (const x of xs) {
            if (path.length >= length) break;
            path.push({ x, y: row });
        }
    }
    return path;
}

// Samples the tail tile's own center (should read as plain body green
// throughout - the gradient is transparent there by design, see
// index.html) and a pixel right at its edge (gold once eligible).
function tailPixels(game) {
    return game.evaluate(() => {
        const tail = snake[snake.length - 1];
        const size = gridSize - 2;
        const px = tail.x * gridSize, py = tail.y * gridSize;
        const center = ctx.getImageData(px + Math.floor(size / 2), py + Math.floor(size / 2), 1, 1).data;
        const edge = ctx.getImageData(px + 1, py + 1, 1, 1).data;
        return { center: [center[0], center[1], center[2]], edge: [edge[0], edge[1], edge[2]] };
    });
}

const BODY_GREEN = [173, 221, 187];  // SNAKE_COLORS.normal.body, #ADDDBB
function isGoldish([r, g, b]) {
    return r > 200 && g > 150 && b < 100;
}

test('the tail gets a gold frame once it reaches max-bonus length, not before', async ({ game }) => {
    await game.evaluate((cells) => {
        window.__game.reset();
        window.__game.setSnake(cells);
        dx = 1; dy = 0;
        needsRedraw = true;
        drawGame();
    }, boustrophedon(39));
    let pixels = await tailPixels(game);
    expect(pixels.center).toEqual(BODY_GREEN);
    expect(isGoldish(pixels.edge)).toBe(false);

    await game.evaluate((cells) => {
        window.__game.setSnake(cells);
        needsRedraw = true;
        drawGame();
    }, boustrophedon(40));
    pixels = await tailPixels(game);
    // Center stays readable as body color - a solid gold tail would be
    // indistinguishable from the snake's actual post-trigger reward
    // color (SNAKE_COLORS.ouroboros), which would misleadingly suggest
    // Ouroboros had already fired.
    expect(pixels.center).toEqual(BODY_GREEN);
    expect(isGoldish(pixels.edge)).toBe(true);
});

test('the tail glow turns off once Ouroboros has actually fired', async ({ game }) => {
    await game.evaluate((cells) => {
        window.__game.reset();
        window.__game.setSnake(cells);
        ouroborosTriggered = true;
        needsRedraw = true;
        drawGame();
    }, boustrophedon(40));
    const pixels = await tailPixels(game);
    expect(isGoldish(pixels.edge)).toBe(false);
});
