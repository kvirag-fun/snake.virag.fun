// Basilisk: spawns the instant you swipe to resume after Ouroboros, and
// gazes a line of deadly tiles out to the board edge. Outgazed over 3
// sequential stages (a new wall each time one clears - see
// spawnBasilisk()/randomBasiliskStageQuotas() in index.html) totalling
// 20 apples, however randomly they end up split across the stages.
//
// The origin is whichever of the 8 tiles surrounding board center sits
// farthest (Manhattan distance) from the snake's head at spawn time - not
// tied to the player's heading at all. A side tile (N/S/E/W) has only one
// sensible growth direction, straight out along its own axis; a corner
// tile has two, so which one it takes is a coin flip. Either way the wall
// only ever grows away from center, so it can never fold back through the
// exact center tile, where a forgiven death always respawns. A respawn
// additionally never reappears at the tile it just vacated, and the whole
// selection defers to snake-body safety first, falling back only when
// nothing collision-free is left to offer.
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

test('each candidate wall is a straight line from its origin, growing away from center, to the board edge', async ({ game }) => {
    const result = await game.evaluate((trials) => {
        const centerX = Math.floor(tileCount / 2);
        const centerY = Math.floor(tileCount / 2);
        const walls = [];
        for (let i = 0; i < trials; i++) {
            snake = [{
                x: Math.floor(Math.random() * tileCount),
                y: Math.floor(Math.random() * tileCount),
            }];
            spawnBasilisk();
            walls.push(basiliskWall.map((s) => ({ x: s.x, y: s.y })));
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

test('the origin is whichever of the 4 corner tiles sits farthest from the head', async ({ game }) => {
    // Heads are kept clear of rows/columns 8-11 - a candidate's wall can
    // only ever occupy row/column 9 or 11 (every candidate is a corner,
    // never a side tile) - otherwise the head itself could occasionally
    // sit on the "farthest" candidate's own line, correctly triggering
    // the body-safety filter (tested separately below) and producing a
    // false mismatch here, which only tests pure distance.
    const result = await game.evaluate((trials) => {
        const centerX = Math.floor(tileCount / 2);
        const centerY = Math.floor(tileCount / 2);
        const randCoord = () => {
            let v;
            do { v = Math.floor(Math.random() * tileCount); } while (v >= 8 && v <= 11);
            return v;
        };
        let mismatches = 0;
        const originsSeen = new Set();
        for (let i = 0; i < trials; i++) {
            const head = { x: randCoord(), y: randCoord() };
            snake = [head];
            spawnBasilisk();
            const candidates = BASILISK_SPAWN_OFFSETS.map((o) => ({
                x: centerX + o.x,
                y: centerY + o.y,
                d: Math.abs(centerX + o.x - head.x) + Math.abs(centerY + o.y - head.y),
            }));
            const maxDist = Math.max(...candidates.map((c) => c.d));
            const best = candidates.filter((c) => c.d === maxDist);
            const origin = basiliskWall[0];
            if (!best.some((c) => c.x === origin.x && c.y === origin.y)) mismatches++;
            originsSeen.add(`${origin.x - centerX},${origin.y - centerY}`);
        }
        return { mismatches, originsSeen: [...originsSeen] };
    }, TRIALS);

    expect(result.mismatches).toBe(0);
    // Genuinely tracks the head around the board, not stuck on one tile.
    expect(result.originsSeen.length).toBeGreaterThan(1);
});

test('the origin is always one of the 4 corners, never a side tile', async ({ game }) => {
    // A corner always at least ties its two neighbouring side tiles on
    // pure distance from any head position (see the big comment on
    // spawnBasilisk() in index.html), so a random head alone can never
    // actually exercise a design that still listed side tiles as
    // candidates - it would keep picking corners anyway, coincidentally.
    // The only way a side tile could ever legitimately win is the
    // fallback case this test forces: with the single farthest corner's
    // wall blocked by the snake's body, the next-best tier under the old
    // 8-candidate design was a tie between two side tiles (dist 21) -
    // strictly closer to the head than any remaining corner (dist 20) -
    // so a regression that quietly widened the candidate pool back to
    // all 8 would surface here even though a clean board never reveals
    // it (see the "body avoids the current snake" test above for the
    // exact same blocking setup, now confirming the *other* thing about
    // its outcome).
    const result = await game.evaluate((trials) => {
        const centerX = Math.floor(tileCount / 2);
        const centerY = Math.floor(tileCount / 2);
        const isCorner = (o) => o.x !== centerX && o.y !== centerY;
        let sideTileSeen = 0;

        for (let i = 0; i < trials; i++) {
            snake = [{ x: 0, y: 0 }, { x: centerX + 1, y: centerY + 1 }]; // blocks (11,11)
            spawnBasilisk();
            if (!isCorner(basiliskWall[0])) sideTileSeen++;
        }
        return sideTileSeen;
    }, TRIALS);
    expect(result).toBe(0);
});

test('it never originates on the tile a forgiven death respawns you on', async ({ game }) => {
    // The origin is one of the 4 corners *around* centre, never centre
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

test('a head exactly on the center column ties two opposite corners, and the tie is broken randomly', async ({ game }) => {
    // head.x === centerX makes the left and right corner candidates
    // exactly equidistant (e.g. bottom-left and bottom-right both sit
    // |1| away in x from a head on the column between them). Without
    // shuffling the candidates before the distance sort, a stable sort
    // always resolves a tie the same way - toward whichever offset
    // happens to come first in BASILISK_SPAWN_OFFSETS - which would
    // silently and predictably favor one side forever, not a genuine
    // coin flip.
    const origins = await game.evaluate((trials) => {
        const centerX = Math.floor(tileCount / 2);
        const seen = new Set();
        for (let i = 0; i < trials; i++) {
            snake = [{ x: centerX, y: 0 }];
            spawnBasilisk();
            const origin = basiliskWall[0];
            seen.add(`${origin.x},${origin.y}`);
        }
        return [...seen];
    }, TRIALS);
    // Order-independent: `.sort()` on strings is lexicographic, not
    // numeric, so "11,11" < "9,11" - a fixed literal array would be an
    // easy way to silently assert the wrong thing here.
    expect(new Set(origins)).toEqual(new Set(['9,11', '11,11']));
});

test("a corner origin's growth axis is a coin flip", async ({ game }) => {
    // Head far in the top-left corner of the board: the bottom-right
    // spawn candidate (a corner tile) is then the unique farthest one on
    // every call, isolating the coin flip between its two axes from any
    // variation in which candidate gets chosen.
    const dirs = await game.evaluate((trials) => {
        const seen = new Set();
        for (let i = 0; i < trials; i++) {
            snake = [{ x: 0, y: 0 }];
            spawnBasilisk();
            const [a, b] = basiliskWall;
            seen.add(`${b.x - a.x},${b.y - a.y}`);
        }
        return [...seen].sort();
    }, TRIALS);
    expect(dirs).toEqual(['0,1', '1,0']);
});

test('a forgiven death always leaves at least three safe directions', async ({ game }) => {
    // A corner-tile origin (see the coin-flip test above; the default
    // Ouroboros setup always produces one) never touches an orthogonal
    // neighbour of centre on either of its two possible axes, so this
    // should hold regardless of which way the coin lands.
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

// ---- the 3-stage split -------------------------------------------------

test('the encounter splits into 3 stages that always sum to 20, each at least 5', async ({ game }) => {
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
        expect(quotas).toHaveLength(3);
        expect(quotas.reduce((a, b) => a + b, 0)).toBe(20);
        for (const q of quotas) expect(q).toBeGreaterThanOrEqual(5);
    }
    // More than one distinct split shows up - otherwise "randomised"
    // would just mean "always the same".
    const distinct = new Set(samples.map((q) => q.join(','))).size;
    expect(distinct).toBeGreaterThan(1);
});

test('clearing a stage respawns the wall and resets the counter, until the third clears it for good', async ({ game }) => {
    // "Respawns" means spawnBasilisk() genuinely runs again, not that the
    // new wall is guaranteed to differ from the old one - it picks
    // uniformly among up to 3 fixed candidates each time, so landing on
    // the same one twice in a row is legitimate, not a bug. The reliable
    // signal that a real respawn happened is the counter resetting to 0,
    // which only spawnBasilisk() ever does.
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
        };

        h.eatApples(quotas[1]);
        const afterStage2 = {
            stage: basiliskStage,
            active: basiliskActive,
            counter: basiliskFoodCounter,
        };

        h.eatApples(quotas[2]);
        const afterStage3 = {
            triggered: basiliskTriggered,
            active: basiliskActive,
            wallLength: basiliskWall.length,
        };

        return { afterStage1, afterStage2, afterStage3 };
    });

    expect(result.afterStage1).toEqual({ stage: 2, active: true, counter: 0 });
    expect(result.afterStage2).toEqual({ stage: 3, active: true, counter: 0 });
    expect(result.afterStage3).toEqual({ triggered: true, active: false, wallLength: 0 });
});

test('the wall does sometimes actually move between stages', async ({ game }) => {
    // Separate from the deterministic test above, which can't assert
    // this per-run without risking exactly the false failure this one
    // exists to avoid: sampled across many runs, at least some stage
    // transitions must produce a different wall, or "respawns" would be
    // no different from "stays exactly where it was".
    const moved = await game.evaluate((trials) => {
        const h = window.__game;
        let sawAMove = false;
        for (let i = 0; i < trials && !sawAMove; i++) {
            h.fireOuroboros();
            h.dismissAndResume(1, 0);
            const before = JSON.stringify(basiliskWall);
            h.eatApples(basiliskStageQuotas[0]);
            if (JSON.stringify(basiliskWall) !== before) sawAMove = true;
        }
        return sawAMove;
    }, TRIALS);
    expect(moved).toBe(true);
});

test('outgazing always takes exactly 20 apples, regardless of how the stages split', async ({ game }) => {
    // 5 independent runs, each re-randomising the split via fireOuroboros().
    const outcomes = await game.evaluate((trials) => {
        const h = window.__game;
        const out = [];
        for (let i = 0; i < trials; i++) {
            h.fireOuroboros();
            h.dismissAndResume(1, 0);
            h.eatApples(19);
            const before20th = basiliskTriggered;
            h.eatApples(1);
            out.push({ before20th, after20th: basiliskTriggered });
        }
        return out;
    }, 5);

    for (const { before20th, after20th } of outcomes) {
        expect(before20th).toBe(false);
        expect(after20th).toBe(true);
    }
});

// ---- direct spawnBasilisk() calls: body safety, fallbacks, no-repeat --

test('the first spawn avoids spawning its wall through the current snake body', async ({ game }) => {
    // Head far in the top-left, so the bottom-right corner tile is the
    // unique farthest candidate (see the "farthest tile" test above).
    // Blocking that exact tile forces every direction choice for it to
    // collide - the origin is always a wall's first tile, whichever axis
    // it then grows along (see wallFor() in index.html) - so this
    // isolates the body-safety filter from the farthest-tile selection:
    // without it, the Basilisk would spawn straight onto the snake.
    const result = await game.evaluate((trials) => {
        const centerX = Math.floor(tileCount / 2);
        const centerY = Math.floor(tileCount / 2);
        let collisions = 0;
        let stillPickedBlocked = 0;
        const originsSeen = new Set();
        for (let i = 0; i < trials; i++) {
            snake = [{ x: 0, y: 0 }, { x: centerX + 1, y: centerY + 1 }];
            spawnBasilisk();
            const origin = basiliskWall[0];
            originsSeen.add(`${origin.x},${origin.y}`);
            if (origin.x === centerX + 1 && origin.y === centerY + 1) stillPickedBlocked++;
            if (basiliskWall.some((seg) => snake.some((s) => s.x === seg.x && s.y === seg.y))) {
                collisions++;
            }
        }
        return { collisions, stillPickedBlocked, originsSeen: [...originsSeen] };
    }, TRIALS);

    expect(result.collisions).toBe(0);
    expect(result.stillPickedBlocked).toBe(0);
    // The two next-best corners are genuinely tied at this distance -
    // candidates are shuffled before the distance sort specifically so a
    // tie like this doesn't silently always resolve to the same one, so
    // both should show up here.
    expect(new Set(result.originsSeen)).toEqual(new Set(['11,9', '9,11']));
});

test('falls back to an unsafe candidate only when every one collides with the body', async ({ game }) => {
    // Deliberately adversarial: a segment sitting on every one of the 4
    // origin tiles blocks every candidate's wall (the origin tile is
    // always a wall's first tile, whichever direction it grows in - see
    // wallFor()), so there's no collision-free tile left to offer. This
    // only checks the function still produces a wall rather than leaving
    // the Basilisk silently un-spawned - avoiding the snake takes
    // priority right up until it's genuinely impossible.
    const result = await game.evaluate(() => {
        const centerX = Math.floor(tileCount / 2);
        const centerY = Math.floor(tileCount / 2);
        snake = [
            { x: 0, y: 0 },
            ...BASILISK_SPAWN_OFFSETS.map((o) => ({ x: centerX + o.x, y: centerY + o.y })),
        ];
        spawnBasilisk();
        const origin = basiliskWall[0];
        const originIsBlocked = BASILISK_SPAWN_OFFSETS.some(
            (o) => centerX + o.x === origin.x && centerY + o.y === origin.y
        );
        return { active: basiliskActive, wallLength: basiliskWall.length, originIsBlocked };
    });
    expect(result.active).toBe(true);
    expect(result.wallLength).toBeGreaterThan(0);
    expect(result.originIsBlocked).toBe(true);
});

test('the wall never crosses the exact center tile', async ({ game }) => {
    // Structural under this design - every wall grows away from centre,
    // one step at a time, so it can never fold back through it (see the
    // big comment on spawnBasilisk() in index.html) - but a random-head
    // sample across many spawns, including forced respawns, is cheap
    // insurance against a regression in that logic.
    const sawCenter = await game.evaluate((trials) => {
        const centerX = Math.floor(tileCount / 2);
        const centerY = Math.floor(tileCount / 2);
        let count = 0;
        let previous = null;
        for (let i = 0; i < trials; i++) {
            snake = [{
                x: Math.floor(Math.random() * tileCount),
                y: Math.floor(Math.random() * tileCount),
            }];
            spawnBasilisk(previous);
            if (basiliskWall.some((s) => s.x === centerX && s.y === centerY)) count++;
            previous = { ...basiliskWall[0] };
        }
        return count;
    }, TRIALS);
    expect(sawCenter).toBe(0);
});

test('a respawn never reappears at the tile it just vacated', async ({ game }) => {
    // A fixed head keeps the "farthest" candidate exactly the same
    // between calls, so without the no-repeat guarantee a respawn would
    // legitimately recompute right back onto it - the scenario this
    // guarantee exists for (see the big comment on spawnBasilisk() in
    // index.html).
    const result = await game.evaluate(() => {
        snake = [{ x: 0, y: 0 }];
        spawnBasilisk();                       // first spawn
        const first = { ...basiliskWall[0] };
        spawnBasilisk(first);                  // respawn off of it
        const second = { ...basiliskWall[0] };
        return { first, second };
    });
    expect(result.second).not.toEqual(result.first);
});

test('clearing a stage in real play never respawns the wall at the same tile', async ({ game }) => {
    // The update()-wired version: basiliskWall[0] is read as an argument
    // before spawnBasilisk() overwrites it, so this exercises that
    // ordering directly, not just the function in isolation.
    const repeats = await game.evaluate((trials) => {
        const h = window.__game;
        let count = 0;
        for (let i = 0; i < trials; i++) {
            h.fireOuroboros();
            h.dismissAndResume(1, 0);
            const firstOrigin = { ...basiliskWall[0] };
            h.eatApples(basiliskStageQuotas[0]);         // clears stage 1 -> respawns
            if (basiliskWall[0].x === firstOrigin.x && basiliskWall[0].y === firstOrigin.y) count++;
        }
        return count;
    }, TRIALS);
    expect(repeats).toBe(0);
});

test("a respawn's body-safety check applies on top of the no-repeat guarantee", async ({ game }) => {
    // First spawn is the unique farthest corner. Excluding it via the
    // no-repeat guarantee alone leaves a tie between the other two
    // second-farthest corners (see the body-safety test above) - blocking
    // one of those two with a body segment as well forces the respawn
    // past both filters onto the single remaining corner, proving the two
    // combine rather than one overriding the other.
    const result = await game.evaluate(() => {
        const centerX = Math.floor(tileCount / 2);
        const centerY = Math.floor(tileCount / 2);
        snake = [{ x: 0, y: 0 }];
        spawnBasilisk();
        const first = { ...basiliskWall[0] };
        snake = [{ x: 0, y: 0 }, { x: centerX + 1, y: centerY - 1 }]; // blocks the (11,9) tie candidate
        spawnBasilisk(first);
        return {
            origin: { ...basiliskWall[0] },
            collides: basiliskWall.some((seg) => snake.some((s) => s.x === seg.x && s.y === seg.y)),
        };
    });
    // Neither the excluded first origin nor the body-blocked tied
    // candidate - only the third corner survives both filters.
    expect(result.origin).toEqual({ x: 9, y: 11 });
    expect(result.collides).toBe(false);
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

test('20 apples outgazes it: +400, second life, purple eyes, gold body', async ({ game }) => {
    const result = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        const before = score;
        const eaten = h.eatApples(20);
        return { before, eaten, ...h.state() };
    });
    expect(result.eaten).toBe(20);
    expect(result.basiliskTriggered).toBe(true);
    expect(result.basiliskActive).toBe(false);
    expect(result.basiliskWallLength).toBe(0);
    // The 3-stage split is randomised, but it always totals
    // BASILISK_TOTAL_FOOD apples regardless - so 20 at +10, plus the
    // flat +400 for outgazing it, every time.
    expect(result.score).toBe(result.before + 200 + 400);
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
        h.eatApples(20);
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
        h.eatApples(20);
        return h.state();
    });
    // Only the 20 real apples count towards pace; both bonuses don't.
    expect(state.pacingScore).toBe(200);
});
