// Basilisk: spawns the instant you swipe to resume after Ouroboros, and
// gazes a line of deadly tiles out to the board edge. Outgazed by eating
// 15 apples with the wall still up.
import { test, expect } from './helpers.js';

const TRIALS = 120;

test('it spawns on the swipe that resumes play after Ouroboros', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        const beforeResume = basiliskActive;
        h.dismissAndResume(1, 0);
        return { ...h.state(), beforeResume };
    });
    // Not during Ouroboros's own pause - only once the player moves again.
    expect(state.beforeResume).toBe(false);
    expect(state.basiliskActive).toBe(true);
    expect(state.basiliskWallLength).toBeGreaterThan(0);
    expect(state.basiliskFoodCounter).toBe(0);
});

test('the gaze is a straight line from its origin to the board edge', async ({ game }) => {
    const wall = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);          // resume heading right
        return h.state().basiliskWall;
    });
    const [origin] = wall;
    // Heading right: same row, consecutive columns, ending at the wall.
    expect(wall.every((tile) => tile.y === origin.y)).toBe(true);
    wall.forEach((tile, i) => expect(tile.x).toBe(origin.x + i));
    expect(wall[wall.length - 1].x).toBe(19);
});

test('the gaze points wherever the player swiped, never elsewhere', async ({ game }) => {
    const headings = await game.evaluate(() => {
        const h = window.__game;
        const seen = [];
        for (const [hdx, hdy] of [[1, 0], [0, 1], [0, -1]]) {
            h.fireOuroboros();
            h.dismissAndResume(hdx, hdy);
            const wall = basiliskWall;
            seen.push({
                hdx,
                hdy,
                stepX: wall[1].x - wall[0].x,
                stepY: wall[1].y - wall[0].y,
            });
        }
        return seen;
    });
    for (const { hdx, hdy, stepX, stepY } of headings) {
        expect({ stepX, stepY }).toEqual({ stepX: hdx, stepY: hdy });
    }
});

test('it never originates on the tile a forgiven death respawns you on', async ({ game }) => {
    // The origin is one of the 8 tiles *around* centre, never centre
    // itself - otherwise spending a life while the wall is up would drop
    // you straight onto it.
    const result = await game.evaluate((trials) => {
        const h = window.__game;
        const centre = Math.floor(tileCount / 2);
        let onCentre = 0;
        let offBy = 0;
        for (let i = 0; i < trials; i++) {
            h.fireOuroboros();
            h.dismissAndResume(1, 0);
            const origin = basiliskWall[0];
            if (origin.x === centre && origin.y === centre) onCentre++;
            if (Math.abs(origin.x - centre) > 1 || Math.abs(origin.y - centre) > 1) offBy++;
        }
        return { onCentre, offBy };
    }, TRIALS);
    expect(result.onCentre).toBe(0);
    expect(result.offBy).toBe(0);
});

test('it never spawns onto the row the snake is already travelling along', async ({ game }) => {
    const ambushes = await game.evaluate((trials) => {
        const h = window.__game;
        let count = 0;
        for (let i = 0; i < trials; i++) {
            h.fireOuroboros();
            const headY = snake[0].y;
            h.dismissAndResume(1, 0);
            if (basiliskWall.some((tile) => tile.y === headY)) count++;
        }
        return count;
    }, TRIALS);
    expect(ambushes).toBe(0);
});

test('a forgiven death always leaves at least three safe directions', async ({ game }) => {
    // The wall can legitimately spawn orthogonally adjacent to centre, so
    // respawning while it's up can cost one direction - but never two.
    const worst = await game.evaluate((trials) => {
        const h = window.__game;
        let fewest = 4;
        for (let i = 0; i < trials; i++) {
            h.fireOuroboros();
            h.dismissAndResume(1, 0);
            h.killIntoWall();
            if (!gameRunning) continue;
            const head = snake[0];
            const safe = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([nx, ny]) => {
                const tx = head.x + nx;
                const ty = head.y + ny;
                if (tx < 0 || tx >= tileCount || ty < 0 || ty >= tileCount) return false;
                if (basiliskWall.some((s) => s.x === tx && s.y === ty)) return false;
                if (badFoodList.some((b) => b.x === tx && b.y === ty)) return false;
                return true;
            }).length;
            fewest = Math.min(fewest, safe);
        }
        return fewest;
    }, TRIALS);
    expect(worst).toBeGreaterThanOrEqual(3);
});

test('neither apple ever spawns on the gaze', async ({ game }) => {
    const collisions = await game.evaluate((trials) => {
        const h = window.__game;
        let count = 0;
        for (let i = 0; i < trials; i++) {
            h.fireOuroboros();
            h.dismissAndResume(1, 0);
            for (let roll = 0; roll < 5; roll++) {
                randomFood();
                randomBadFood();
                const onWall = (p) => basiliskWall.some((s) => s.x === p.x && s.y === p.y);
                if (onWall(food) || badFoodList.some(onWall)) count++;
            }
        }
        return count;
    }, TRIALS);
    expect(collisions).toBe(0);
});

test('touching the gaze is its own death cause', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        ouroborosLifeAvailable = false;         // no life to forgive it
        const target = basiliskWall[3];
        h.setSnake([{ x: target.x - 1, y: target.y }]);
        dx = 1;
        dy = 0;
        h.step();
        return h.state();
    });
    expect(state.gameRunning).toBe(false);
    expect(state.deathCause).toBe('gaze');
});

test('a forgiven death leaves the wall and its apple counter intact', async ({ game }) => {
    const result = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        h.eatApples(3);
        const before = {
            counter: basiliskFoodCounter,
            wallLength: basiliskWall.length,
        };
        const target = basiliskWall[3];
        h.setSnake([{ x: target.x - 1, y: target.y }]);
        dx = 1;
        dy = 0;
        h.step();
        return { before, after: h.state() };
    });
    expect(result.after.gameRunning).toBe(true);
    expect(result.after.ouroborosLifeAvailable).toBe(false);
    expect(result.after.basiliskActive).toBe(true);
    expect(result.after.basiliskWallLength).toBe(result.before.wallLength);
    expect(result.after.basiliskFoodCounter).toBe(result.before.counter);
});

test('the counter tracks apples eaten, not moves made', async ({ game }) => {
    const result = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        h.finishRegrow();
        const afterRegrow = basiliskFoodCounter;
        h.circle(12);                                        // moving, not eating
        const afterCircling = basiliskFoodCounter;
        h.eatApples(2);
        return { afterRegrow, afterCircling, afterEating: basiliskFoodCounter };
    });
    expect(result.afterCircling).toBe(result.afterRegrow);
    expect(result.afterEating).toBe(result.afterRegrow + 2);
});

test('15 apples outgazes it: +400, second life, purple eyes, gold body', async ({ game }) => {
    const result = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        const before = score;
        const eaten = h.eatApples(15);
        return { before, eaten, ...h.state() };
    });
    expect(result.eaten).toBe(15);
    expect(result.basiliskTriggered).toBe(true);
    expect(result.basiliskActive).toBe(false);
    expect(result.basiliskWallLength).toBe(0);
    // 15 apples at +10, plus the flat +400 for outgazing it.
    expect(result.score).toBe(result.before + 150 + 400);
    expect(result.basiliskLifeAvailable).toBe(true);
    // The body stays Ouroboros gold - the only permanent trace is the
    // eyes, which `basiliskTriggered` drives.
    expect(result.snakeColorMode).toBe('ouroboros');
});

test('outgazing collapses the snake to a single tile as well', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        h.eatApples(15);
        return h.state();
    });
    expect(state.length).toBe(1);
    expect(state.regrowPending).toBeGreaterThan(0);
});

test('its bonus does not speed the game up either', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        h.eatApples(15);
        return h.state();
    });
    // Only the 15 real apples count towards pace; both bonuses don't.
    expect(state.pacingScore).toBe(150);
});
