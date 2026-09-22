// Basilisk: spawns the instant you swipe to resume after Ouroboros, and
// gazes a line of deadly tiles out to the board edge. Outgazed over 4
// sequential stages (a new wall ADDED each time one clears, the earlier
// ones staying up rather than being replaced - see
// spawnBasilisk()/randomBasiliskStageQuotas() in index.html) totalling
// 25 apples, however randomly they end up split across the stages - by
// the fourth stage all 4 walls are live hazards at once.
//
// The origin is one of this run's 4 holes (see randomBasiliskHoles() -
// picked once, uniformly at random from the board, excluding both the
// outer 3 rings and the center 7x7 square) - specifically, whichever of
// the holes not already spent on an earlier wall sits farthest
// (Manhattan distance) from the snake's head at spawn time - not tied to
// the player's heading at all. Every hole has (up to) two equally valid
// growth axes, so which one it takes is a coin flip, unless the hole
// sits exactly on the center row or column, where only one axis actually
// points away from center. Either way the wall only ever grows away from
// center, one step at a time, so it can never fold back through the
// exact center tile (or a tile orthogonally adjacent to it), where a
// forgiven death always respawns. Since each hole is used at most once
// ever, there's no separate "don't repeat" rule to speak of - uniqueness
// falls out of the candidate pool shrinking by one every stage. The
// whole selection defers to snake-body safety first, falling back only
// when nothing collision-free is left to offer.
import { test, expect } from './helpers.js';

const TRIALS = 120;

// Sets up basiliskHoles/basiliskWalls directly, bypassing
// randomBasiliskHoles(), for tests that need to control exactly which
// tiles are candidates rather than working around wherever the RNG
// happens to land them.
function setHoles(game, holes) {
    return game.evaluate((holes) => {
        basiliskHoles = holes;
        basiliskWalls = [];
    }, holes);
}

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
    expect(state.basiliskWallCount).toBe(1);
    expect(state.basiliskWallLength).toBeGreaterThan(0);
    expect(state.basiliskFoodCounter).toBe(0);
});

test('randomBasiliskHoles() picks 4 distinct tiles outside the outer margin and the center square', async ({ game }) => {
    const samples = await game.evaluate((trials) => {
        const out = [];
        for (let i = 0; i < trials; i++) out.push(randomBasiliskHoles());
        return out;
    }, TRIALS);

    const centerX = 10, centerY = 10;  // tileCount 21 -> floor(21/2)
    for (const holes of samples) {
        expect(holes).toHaveLength(4);
        const keys = holes.map((h) => `${h.x},${h.y}`);
        expect(new Set(keys).size).toBe(4);  // no repeats within one draw
        for (const h of holes) {
            expect(h.x).toBeGreaterThanOrEqual(3);
            expect(h.x).toBeLessThanOrEqual(17);
            expect(h.y).toBeGreaterThanOrEqual(3);
            expect(h.y).toBeLessThanOrEqual(17);
            const inCenterSquare = Math.abs(h.x - centerX) <= 3 && Math.abs(h.y - centerY) <= 3;
            expect(inCenterSquare).toBe(false);
        }
    }
});

test('each wall is a straight line from its origin, growing away from center, to the board edge', async ({ game }) => {
    const result = await game.evaluate((trials) => {
        const centerX = Math.floor(tileCount / 2);
        const centerY = Math.floor(tileCount / 2);
        const walls = [];
        for (let i = 0; i < trials; i++) {
            basiliskHoles = randomBasiliskHoles();
            basiliskWalls = [];
            snake = [{
                x: Math.floor(Math.random() * tileCount),
                y: Math.floor(Math.random() * tileCount),
            }];
            spawnBasilisk();
            walls.push(basiliskWalls[0].map((s) => ({ x: s.x, y: s.y })));
        }
        return { walls, centerX, centerY, tileCount };
    }, TRIALS);

    for (const wall of result.walls) {
        const [origin, second] = wall;
        const dir = { x: second.x - origin.x, y: second.y - origin.y };
        // Axis-aligned, single-step, and constant for the whole line.
        expect(Math.abs(dir.x) + Math.abs(dir.y)).toBe(1);
        wall.forEach((tile, i) => {
            expect(tile.x).toBe(origin.x + dir.x * i);
            expect(tile.y).toBe(origin.y + dir.y * i);
        });
        // Reaches an edge - one more step in `dir` would run off the board.
        const last = wall[wall.length - 1];
        const nextX = last.x + dir.x;
        const nextY = last.y + dir.y;
        expect(nextX < 0 || nextX >= result.tileCount || nextY < 0 || nextY >= result.tileCount).toBe(true);
        // Grows away from center: the wall's one nonzero axis points the
        // same way the origin is already offset from center on that axis.
        if (dir.x !== 0) expect(Math.sign(dir.x)).toBe(Math.sign(origin.x - result.centerX));
        if (dir.y !== 0) expect(Math.sign(dir.y)).toBe(Math.sign(origin.y - result.centerY));
    }
});

test('the origin is whichever hole sits farthest from the head, among holes not already used', async ({ game }) => {
    const result = await game.evaluate((trials) => {
        const centerX = Math.floor(tileCount / 2);
        const centerY = Math.floor(tileCount / 2);
        let mismatches = 0;
        const originsSeen = new Set();
        for (let i = 0; i < trials; i++) {
            const holes = randomBasiliskHoles();
            basiliskHoles = holes;
            basiliskWalls = [];
            const head = {
                x: Math.floor(Math.random() * tileCount),
                y: Math.floor(Math.random() * tileCount),
            };
            snake = [head];
            spawnBasilisk();
            const candidates = holes.map((h) => ({
                x: h.x, y: h.y,
                d: Math.abs(h.x - head.x) + Math.abs(h.y - head.y),
            }));
            const maxDist = Math.max(...candidates.map((c) => c.d));
            const best = candidates.filter((c) => c.d === maxDist);
            const origin = basiliskWalls[0][0];
            if (!best.some((c) => c.x === origin.x && c.y === origin.y)) mismatches++;
            originsSeen.add(`${origin.x - centerX},${origin.y - centerY}`);
        }
        return { mismatches, originsSeen: [...originsSeen] };
    }, TRIALS);

    expect(result.mismatches).toBe(0);
    // Genuinely tracks the head and this run's random holes, not stuck
    // reusing the same offset every time.
    expect(result.originsSeen.length).toBeGreaterThan(1);
});

test('it never originates on, or adjacent to, the tile a forgiven death respawns you on', async ({ game }) => {
    const result = await game.evaluate((trials) => {
        const h = window.__game;
        const centre = Math.floor(tileCount / 2);
        let onOrAdjacent = 0;
        for (let i = 0; i < trials; i++) {
            h.fireOuroboros();
            h.dismissAndResume(1, 0);
            const origin = basiliskWalls[0][0];
            const dist = Math.abs(origin.x - centre) + Math.abs(origin.y - centre);
            if (dist <= 1) onOrAdjacent++;
        }
        return onOrAdjacent;
    }, TRIALS);
    expect(result).toBe(0);
});

test('a head exactly on the shared column of two symmetric holes ties them, and the tie is broken randomly', async ({ game }) => {
    // Two holes placed by hand, symmetric left/right around a fixed
    // column, both the same distance from a head parked on that column -
    // without shuffling the candidates before the distance sort, a
    // stable sort always resolves a tie the same way (whichever hole
    // happens to come first in basiliskHoles), not a genuine coin flip.
    const origins = await setHolesAndSample(game, [{ x: 5, y: 10 }, { x: 15, y: 10 }], { x: 10, y: 0 });
    expect(new Set(origins)).toEqual(new Set(['5,10', '15,10']));

    async function setHolesAndSample(game, holes, head) {
        return game.evaluate(({ holes, head, trials }) => {
            const seen = new Set();
            for (let i = 0; i < trials; i++) {
                basiliskHoles = holes;
                basiliskWalls = [];
                snake = [head];
                spawnBasilisk();
                const origin = basiliskWalls[0][0];
                seen.add(`${origin.x},${origin.y}`);
            }
            return [...seen];
        }, { holes, head, trials: TRIALS });
    }
});

test("a hole's growth axis is a coin flip when it's off both center lines", async ({ game }) => {
    const dirs = await game.evaluate((trials) => {
        const seen = new Set();
        for (let i = 0; i < trials; i++) {
            basiliskHoles = [{ x: 15, y: 15 }];  // off-center on both axes
            basiliskWalls = [];
            snake = [{ x: 0, y: 0 }];
            spawnBasilisk();
            const [a, b] = basiliskWalls[0];
            seen.add(`${b.x - a.x},${b.y - a.y}`);
        }
        return [...seen].sort();
    }, TRIALS);
    expect(dirs).toEqual(['0,1', '1,0']);
});

test('a hole exactly on the center row or column is forced to the one axis that actually points away from center', async ({ game }) => {
    const result = await game.evaluate((trials) => {
        const centerY = Math.floor(tileCount / 2);
        const dirs = new Set();
        for (let i = 0; i < trials; i++) {
            basiliskHoles = [{ x: 15, y: centerY }];  // on the center row, off the center column
            basiliskWalls = [];
            snake = [{ x: 0, y: 0 }];
            spawnBasilisk();
            const [a, b] = basiliskWalls[0];
            dirs.add(`${b.x - a.x},${b.y - a.y}`);
        }
        return [...dirs];
    }, TRIALS);
    // Growing vertically (dy != 0) here would immediately re-cross the
    // center row it started on - only horizontal, away from center, is
    // ever valid for this hole.
    expect(result).toEqual(['1,0']);
});

test('a forgiven death always leaves at least three safe directions', async ({ game }) => {
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
                if (basiliskWalls.some((wall) => wall.some((s) => s.x === tx && s.y === ty))) return false;
                if (badFoodList.some((b) => b.x === tx && b.y === ty)) return false;
                return true;
            }).length;
            fewest = Math.min(fewest, safe);
        }
        return fewest;
    }, TRIALS);
    expect(worst).toBeGreaterThanOrEqual(3);
});

test('neither apple ever spawns on any of the gazes', async ({ game }) => {
    const collisions = await game.evaluate((trials) => {
        const h = window.__game;
        let count = 0;
        for (let i = 0; i < trials; i++) {
            h.fireOuroboros();
            h.dismissAndResume(1, 0);
            for (let roll = 0; roll < 5; roll++) {
                randomFood();
                randomBadFood();
                const onWall = (p) => basiliskWalls.some((wall) => wall.some((s) => s.x === p.x && s.y === p.y));
                if (onWall(food) || badFoodList.some(onWall)) count++;
            }
        }
        return count;
    }, TRIALS);
    expect(collisions).toBe(0);
});

// ---- the 4-stage split -------------------------------------------------

test('the encounter splits into 4 stages that always sum to 25, each at least 5', async ({ game }) => {
    const samples = await game.evaluate((trials) => {
        const h = window.__game;
        const out = [];
        for (let i = 0; i < trials; i++) {
            h.fireOuroboros();
            h.dismissAndResume(1, 0);
            out.push([...basiliskStageQuotas]);
        }
        return out;
    }, TRIALS);

    for (const quotas of samples) {
        expect(quotas).toHaveLength(4);
        expect(quotas.reduce((a, b) => a + b, 0)).toBe(25);
        for (const q of quotas) expect(q).toBeGreaterThanOrEqual(5);
    }
    // More than one distinct split shows up - otherwise "randomised"
    // would just mean "always the same".
    const distinct = new Set(samples.map((q) => q.join(','))).size;
    expect(distinct).toBeGreaterThan(1);
});

test('clearing a stage adds a wall on top of the earlier ones, until the fourth clears them all for good', async ({ game }) => {
    const result = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        const quotas = [...basiliskStageQuotas];

        h.eatApples(quotas[0]);
        const afterStage1 = {
            stage: basiliskStage,
            active: basiliskActive,
            counter: basiliskFoodCounter,
            wallCount: basiliskWalls.length,
        };

        h.eatApples(quotas[1]);
        const afterStage2 = {
            stage: basiliskStage,
            active: basiliskActive,
            counter: basiliskFoodCounter,
            wallCount: basiliskWalls.length,
        };

        h.eatApples(quotas[2]);
        const afterStage3 = {
            stage: basiliskStage,
            active: basiliskActive,
            counter: basiliskFoodCounter,
            wallCount: basiliskWalls.length,
        };

        h.eatApples(quotas[3]);
        const afterStage4 = {
            triggered: basiliskTriggered,
            active: basiliskActive,
            wallCount: basiliskWalls.length,
        };

        return { afterStage1, afterStage2, afterStage3, afterStage4 };
    });

    expect(result.afterStage1).toEqual({ stage: 2, active: true, counter: 0, wallCount: 2 });
    expect(result.afterStage2).toEqual({ stage: 3, active: true, counter: 0, wallCount: 3 });
    expect(result.afterStage3).toEqual({ stage: 4, active: true, counter: 0, wallCount: 4 });
    expect(result.afterStage4).toEqual({ triggered: true, active: false, wallCount: 0 });
});

test('every one of the 4 holes gets used exactly once by the time all 4 stages have cleared', async ({ game }) => {
    // Wraps spawnBasilisk() itself to record each wall's origin as it's
    // pushed, rather than trying to catch basiliskWalls mid-transition -
    // basiliskWalls is cleared out the instant the 4th stage triggers
    // triggerBasiliskSurvived(), so reading it after the fact can't see
    // the 4th origin at all.
    const result = await game.evaluate(() => {
        const h = window.__game;
        const origins = [];
        const originalSpawn = spawnBasilisk;
        spawnBasilisk = function (...args) {
            originalSpawn.apply(null, args);
            const last = basiliskWalls[basiliskWalls.length - 1][0];
            origins.push(`${last.x},${last.y}`);
        };
        h.fireOuroboros();
        h.dismissAndResume(1, 0);   // 1st spawn
        const holes = basiliskHoles.map((hh) => `${hh.x},${hh.y}`).sort();
        h.eatApples(25);            // clears all 4 stages -> 3 more spawns
        spawnBasilisk = originalSpawn;
        return { holes, origins: origins.sort() };
    });
    expect(result.origins).toEqual(result.holes);
});

test('outgazing always takes exactly 25 apples, regardless of how the stages split', async ({ game }) => {
    // 5 independent runs, each re-randomising the split via fireOuroboros().
    const outcomes = await game.evaluate((trials) => {
        const h = window.__game;
        const out = [];
        for (let i = 0; i < trials; i++) {
            h.fireOuroboros();
            h.dismissAndResume(1, 0);
            h.eatApples(24);
            const before25th = basiliskTriggered;
            h.eatApples(1);
            out.push({ before25th, after25th: basiliskTriggered });
        }
        return out;
    }, 5);

    for (const { before25th, after25th } of outcomes) {
        expect(before25th).toBe(false);
        expect(after25th).toBe(true);
    }
});

// ---- direct spawnBasilisk() calls: body safety, holes, fallbacks ------

test('a spawn avoids spawning its wall through the current snake body', async ({ game }) => {
    // Two holes; the snake's body sits on the farther one's own tile,
    // blocking every direction that tile's wall could grow in (the
    // origin is always a wall's first tile, whichever axis it then grows
    // along - see wallFor() in index.html) - isolating the body-safety
    // filter from farthest-hole selection: without it, the Basilisk would
    // spawn straight onto the snake.
    await setHoles(game, [{ x: 5, y: 10 }, { x: 15, y: 10 }]);
    const result = await game.evaluate((trials) => {
        let collisions = 0;
        let stillPickedBlocked = 0;
        for (let i = 0; i < trials; i++) {
            basiliskWalls = [];
            snake = [{ x: 0, y: 0 }, { x: 15, y: 10 }];  // blocks the farther hole
            spawnBasilisk();
            const origin = basiliskWalls[0][0];
            if (origin.x === 15 && origin.y === 10) stillPickedBlocked++;
            if (basiliskWalls[0].some((seg) => snake.some((s) => s.x === seg.x && s.y === seg.y))) {
                collisions++;
            }
        }
        return { collisions, stillPickedBlocked };
    }, TRIALS);

    expect(result.collisions).toBe(0);
    expect(result.stillPickedBlocked).toBe(0);
});

test('falls back to an unsafe hole only when every remaining one collides with the body', async ({ game }) => {
    // Deliberately adversarial: a segment sitting on every one of the 4
    // holes blocks every candidate's wall (the origin tile is always a
    // wall's first tile, whichever direction it grows in - see
    // wallFor()), so there's no collision-free tile left to offer. This
    // only checks the function still produces a wall rather than leaving
    // the Basilisk silently un-spawned - avoiding the snake takes
    // priority right up until it's genuinely impossible.
    const holes = [{ x: 5, y: 10 }, { x: 15, y: 10 }, { x: 10, y: 5 }, { x: 10, y: 15 }];
    await setHoles(game, holes);
    const result = await game.evaluate((holes) => {
        snake = [{ x: 0, y: 0 }, ...holes];
        spawnBasilisk();
        const origin = basiliskWalls[0][0];
        const originIsBlocked = holes.some((h) => h.x === origin.x && h.y === origin.y);
        return { active: basiliskActive, wallLength: basiliskWalls[0].length, originIsBlocked };
    }, holes);
    expect(result.active).toBe(true);
    expect(result.wallLength).toBeGreaterThan(0);
    expect(result.originIsBlocked).toBe(true);
});

test('the wall never crosses the exact center tile', async ({ game }) => {
    // Structural under this design - every hole is already excluded from
    // the center square, and every wall grows away from center, one step
    // at a time, so it can never fold back through it (see the big
    // comment on spawnBasilisk() in index.html) - but a random-head,
    // random-hole sample across many spawns is cheap insurance against a
    // regression in that logic.
    const sawCenter = await game.evaluate((trials) => {
        const centerX = Math.floor(tileCount / 2);
        const centerY = Math.floor(tileCount / 2);
        let count = 0;
        for (let i = 0; i < trials; i++) {
            basiliskHoles = randomBasiliskHoles();
            basiliskWalls = [];
            snake = [{
                x: Math.floor(Math.random() * tileCount),
                y: Math.floor(Math.random() * tileCount),
            }];
            spawnBasilisk();
            if (basiliskWalls[0].some((s) => s.x === centerX && s.y === centerY)) count++;
        }
        return count;
    }, TRIALS);
    expect(sawCenter).toBe(0);
});

test('the same hole is never used as an origin twice in one run', async ({ game }) => {
    // Wraps spawnBasilisk() to record each origin as it's pushed - see
    // the identical technique (and the reason for it) in the "every hole
    // gets used exactly once" test above.
    const result = await game.evaluate((trials) => {
        const h = window.__game;
        let repeats = 0;
        const originalSpawn = spawnBasilisk;
        for (let i = 0; i < trials; i++) {
            const origins = [];
            spawnBasilisk = function (...args) {
                originalSpawn.apply(null, args);
                const last = basiliskWalls[basiliskWalls.length - 1][0];
                origins.push(`${last.x},${last.y}`);
            };
            h.fireOuroboros();
            h.dismissAndResume(1, 0);
            h.eatApples(25);
            spawnBasilisk = originalSpawn;
            if (new Set(origins).size !== origins.length) repeats++;
        }
        return repeats;
    }, TRIALS);
    expect(result).toBe(0);
});

test("a fallback spawn's body-safety check still only offers holes not already used", async ({ game }) => {
    // First hole is used by an initial spawn; the second is then blocked
    // by the body, forcing the fallback tier - proving the fallback still
    // respects "only unused holes are candidates" rather than reopening
    // the first (already-spent) one as an option.
    await setHoles(game, [{ x: 5, y: 10 }, { x: 15, y: 10 }]);
    const result = await game.evaluate(() => {
        snake = [{ x: 0, y: 0 }];
        spawnBasilisk();                              // (15,10) is farther from (0,0) - used first
        snake = [{ x: 0, y: 0 }, { x: 5, y: 10 }];     // blocks the only remaining hole
        spawnBasilisk();
        const origin = basiliskWalls[1][0];
        return {
            origin,
            collides: basiliskWalls[1].some((seg) => snake.some((s) => s.x === seg.x && s.y === seg.y)),
        };
    });
    // The only unused hole left, even though it's body-blocked - never
    // the first hole again.
    expect(result.origin).toEqual({ x: 5, y: 10 });
    expect(result.collides).toBe(true);
});

test('touching a gaze is its own death cause', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        ouroborosLifeAvailable = false;         // no life to forgive it
        const wall = basiliskWalls[0];
        const target = wall[wall.length - 1];
        h.setSnake([{ x: target.x - 1, y: target.y }]);
        dx = 1;
        dy = 0;
        h.step();
        return h.state();
    });
    expect(state.gameRunning).toBe(false);
    expect(state.deathCause).toBe('gaze');
});

test('a forgiven death leaves the walls and apple counter intact', async ({ game }) => {
    const result = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        h.eatApples(3);
        const before = {
            counter: basiliskFoodCounter,
            wallLength: basiliskWalls.reduce((sum, w) => sum + w.length, 0),
        };
        const wall = basiliskWalls[0];
        const target = wall[wall.length - 1];
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

test('25 apples outgazes it: +400, second life, purple eyes, gold body', async ({ game }) => {
    const result = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        const before = score;
        const eaten = h.eatApples(25);
        return { before, eaten, ...h.state() };
    });
    expect(result.eaten).toBe(25);
    expect(result.basiliskTriggered).toBe(true);
    expect(result.basiliskActive).toBe(false);
    expect(result.basiliskWallLength).toBe(0);
    expect(result.basiliskWallCount).toBe(0);
    // The 4-stage split is randomised, but it always totals
    // BASILISK_TOTAL_FOOD apples regardless - so 25 at +10, plus the
    // flat +400 for outgazing it, every time.
    expect(result.score).toBe(result.before + 250 + 400);
    expect(result.basiliskLifeAvailable).toBe(true);
    // The encounter is fully over - nothing left mid-stage.
    expect(result.basiliskStage).toBe(0);
    expect(result.basiliskStageQuotas).toEqual([]);
    // The body stays Ouroboros gold - the only permanent trace is the
    // eyes, which `basiliskTriggered` drives.
    expect(result.snakeColorMode).toBe('ouroboros');
});

test('outgazing collapses the snake to a single tile as well', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        h.eatApples(25);
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
        h.eatApples(25);
        return h.state();
    });
    // Only the 25 real apples count towards pace; both bonuses don't.
    expect(state.pacingScore).toBe(250);
});
