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
