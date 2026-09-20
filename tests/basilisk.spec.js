// Basilisk: spawns the instant you swipe to resume after Ouroboros, and
// gazes a line of deadly tiles out to the board edge. Outgazed over 3
// sequential stages (a new wall each time one clears - see
// spawnBasilisk()/randomBasiliskStageQuotas() in index.html) totalling
// 20 apples, however randomly they end up split across the stages.
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

test('a later stage avoids spawning its wall through the current snake body', async ({ game }) => {
    // Isolate the body check from the pre-existing row/column check: the
    // head sits on a row none of the 3 heading-right candidates use, but
    // a lone body segment sits directly on one candidate's line - only a
    // check against the whole body, not just the head's row, would catch
    // that one.
    const result = await game.evaluate((trials) => {
        const centerX = Math.floor(tileCount / 2);
        const centerY = Math.floor(tileCount / 2);
        const blockedY = centerY - 1;      // the {x:1,y:-1} candidate's row
        let collisions = 0;
        let blockedRowChosen = 0;
        const rowsSeen = new Set();
        for (let i = 0; i < trials; i++) {
            snake = [
                { x: 5, y: 5 },                                    // off every candidate's row
                { x: centerX + 3, y: blockedY },                   // blocks the {1,-1} candidate's line
            ];
            dx = 1;
            dy = 0;
            spawnBasilisk(1, 0);
            rowsSeen.add(basiliskWall[0].y);
            if (basiliskWall[0].y === blockedY) blockedRowChosen++;
            if (basiliskWall.some((seg) => snake.some((s) => s.x === seg.x && s.y === seg.y))) {
                collisions++;
            }
        }
        return { collisions, blockedRowChosen, rowsSeen: [...rowsSeen] };
    }, TRIALS);

    expect(result.collisions).toBe(0);
    expect(result.blockedRowChosen).toBe(0);
    // The other two candidates are still both in play - this isn't
    // "always pick the same safe one".
    expect(result.rowsSeen.length).toBeGreaterThan(1);
});

test('falls back to a row/column-safe candidate if every one collides with the body', async ({ game }) => {
    // Deliberately adversarial: block all 3 heading-right candidates'
    // rows with body segments, none on the head's own row either. There
    // is no collision-free tile left to offer, so this only checks the
    // function still produces a wall rather than leaving the Basilisk
    // silently un-spawned.
    const result = await game.evaluate(() => {
        const centerX = Math.floor(tileCount / 2);
        const centerY = Math.floor(tileCount / 2);
        snake = [
            { x: 5, y: 5 },
            { x: centerX + 2, y: centerY - 1 },
            { x: centerX + 2, y: centerY },
            { x: centerX + 2, y: centerY + 1 },
        ];
        dx = 1;
        dy = 0;
        spawnBasilisk(1, 0);
        return { active: basiliskActive, wallLength: basiliskWall.length };
    });
    expect(result.active).toBe(true);
    expect(result.wallLength).toBeGreaterThan(0);
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
