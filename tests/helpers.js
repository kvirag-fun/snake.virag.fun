// Shared test fixture and in-page helpers.
//
// The game is a single classic <script> in index.html, so all of its
// state (`snake`, `score`, `update()`, ...) lives in the page's global
// scope and can be driven directly from `page.evaluate`. That's what
// makes these tests possible without refactoring the game into modules:
// we set up an exact board position, call `update()` once, and assert on
// what came out.
//
// Two things bite every time and are handled here rather than in each
// spec:
//
//   1. The game's own requestAnimationFrame loop keeps calling update()
//      in real time. Every test freezes it by setting gameSpeed absurdly
//      high - and has to re-freeze after any update() that ate food,
//      since the eat branch reassigns gameSpeed from getGameSpeed().
//      helpers.step() does both.
//   2. The special-event pause (Ouroboros/Basilisk/Jörmungandr overlay -
//      also reused for a life-saved announcement, see
//      respawnWithSameLength() in index.html) makes update() a silent
//      no-op until it's dismissed. Tests that continue past one must
//      call dismissAndResume() or dismissAnnouncement().
import { test as base, expect } from '@playwright/test';

// Injected before the game's script runs; the closures resolve the
// game's globals at call time, once they exist.
function installHelpers() {
    window.__game = {
        // --- plumbing ---------------------------------------------------
        freeze() {
            gameSpeed = 999999;
        },
        reset() {
            restart();
            this.freeze();
        },
        // One tick, with the loop re-frozen afterwards.
        step() {
            update();
            this.freeze();
        },
        // Replace the body outright. Also clears regrowPending, since a
        // hand-placed snake is "already at full length" by definition -
        // otherwise the no-apple-while-regrowing rule would block the
        // food-eat the test is trying to set up.
        setSnake(cells) {
            snake = cells.map((c) => ({ x: c.x, y: c.y }));
            regrowPending = 0;
        },
        // A straight body of `length` segments, stacked on one tile. Only
        // the head matters for the tests that use this; the tail is just
        // ballast to hit a length threshold.
        stack(length, x, y) {
            this.setSnake(Array.from({ length }, () => ({ x, y })));
        },

        // --- board positions --------------------------------------------
        // An 8-segment coil whose head steps onto its own tail tip when
        // moving up - i.e. one update() away from triggering Ouroboros.
        coil(ox = 0, oy = 0) {
            return [
                { x: 5 + ox, y: 4 + oy }, { x: 5 + ox, y: 5 + oy },
                { x: 6 + ox, y: 5 + oy }, { x: 7 + ox, y: 5 + oy },
                { x: 7 + ox, y: 4 + oy }, { x: 7 + ox, y: 3 + oy },
                { x: 6 + ox, y: 3 + oy }, { x: 5 + ox, y: 3 + oy },
            ];
        },

        // --- egg choreography -------------------------------------------
        fireOuroboros(ox = 0, oy = 0) {
            this.reset();
            this.setSnake(this.coil(ox, oy));
            dx = 0;
            dy = -1;
            this.step();
        },
        // Clear a special-event overlay and swipe in the given direction.
        dismissAndResume(hdx, hdy) {
            specialEventOverlayDismissed = true;
            hideSpecialOverlay();
            inputQueue.push({ dx: hdx, dy: hdy });
            this.step();
        },
        // Eat `n` apples by parking food directly ahead of the head each
        // tick, wrapping back leftwards before the right wall. Tolerates
        // both the regrow stretch (where no apple can be eaten at all)
        // and any overlay that opens mid-run.
        eatApples(n) {
            let eaten = 0;
            let guard = 0;
            while (eaten < n && guard++ < 400) {
                if (specialEventWaiting) {
                    this.dismissAndResume(1, 0);
                    continue;
                }
                const head = snake[0];
                food = { x: head.x + 1, y: head.y };
                dx = 1;
                dy = 0;
                const before = score;
                this.step();
                if (score > before) eaten++;
                if (snake[0].x > 16) {
                    snake = snake.map((s) => ({ x: s.x - 12, y: s.y }));
                }
            }
            return eaten;
        },
        // Dismiss whatever special-event overlay is currently up
        // (harmless if none is), the way a double-tap or R would - but
        // without also supplying a direction, so callers that set dx/dy
        // themselves right after aren't fighting an inputQueue entry. The
        // gate itself is tested through real input in gates.spec.js;
        // everywhere else it's just in the way.
        dismissAnnouncement() {
            specialEventOverlayDismissed = true;
            hideSpecialOverlay();
        },
        // Run the snake into the right wall - a death from a known cause,
        // used to test what forgives it. Dismisses a pending announcement
        // first, so a second call actually reaches the wall instead of
        // being held by whichever message is up (an egg's own, or the
        // "Saved by Ouroboros!" one respawnWithSameLength() shows after
        // the first call already forgave a death).
        killIntoWall() {
            this.dismissAnnouncement();
            snake[0] = { x: tileCount - 1, y: snake[0].y };
            dx = 1;
            dy = 0;
            this.step();
        },
        // Park an apple on the tile the head is about to enter, step, and
        // report whether it ever got eaten. Used to prove the apple is
        // uneatable while the snake is regrowing.
        tryToEatWhileRegrowing(steps) {
            this.dismissAnnouncement();
            let eaten = false;
            for (let i = 0; i < steps && regrowPending > 0; i++) {
                const head = snake[0];
                food = { x: head.x + 1, y: head.y };
                dx = 1;
                dy = 0;
                const before = score;
                this.step();
                if (score > before) eaten = true;
                // Keep clear of the right wall so the run survives the loop.
                if (snake[0].x > 16) {
                    snake = snake.map((s) => ({ x: s.x - 10, y: s.y }));
                }
            }
            return eaten;
        },
        // Walk a length-1 snake around a tiny box in the upper-left
        // quadrant: moves with no eating, no self-collision, and well
        // clear of the centre row a right-facing gaze wall occupies.
        circle(steps) {
            this.setSnake([{ x: 3, y: 3 }]);
            const path = [[1, 0], [0, 1], [-1, 0], [0, -1]];
            for (let i = 0; i < steps; i++) {
                [dx, dy] = path[i % path.length];
                this.stepWithoutEating();
            }
        },
        // Regrow all the way back to full length without eating anything.
        finishRegrow() {
            this.dismissAnnouncement();
            let guard = 0;
            while (regrowPending > 0 && guard++ < 200) this.stepWithoutEating();
        },
        // Move without eating: park the food off-board first.
        stepWithoutEating() {
            food = { x: -5, y: -5 };
            this.step();
        },

        // --- observation -------------------------------------------------
        // One snapshot of everything the specs assert on. Returning a
        // plain object lets the assertions run in Node, so a failure
        // reports the real value instead of just "expected true".
        state() {
            return {
                length: snake.length,
                head: { ...snake[0] },
                food: { ...food },
                score,
                pacingScore,
                gameRunning,
                deathCause,
                regrowPending,
                snakeColorMode,
                ouroborosTriggered,
                basiliskTriggered,
                jormungandrTriggered,
                basiliskActive,
                basiliskWallLength: basiliskWall.length,
                basiliskWall: basiliskWall.map((s) => ({ x: s.x, y: s.y })),
                basiliskFoodCounter,
                basiliskStage,
                basiliskStageQuotas: [...basiliskStageQuotas],
                ouroborosLifeAvailable,
                basiliskLifeAvailable,
                specialEventWaiting,
                specialEventKind,
                specialEventOverlayDismissed,
                tileCount,
            };
        },
        foodIsOnBoard() {
            return food.x >= 0 && food.x < tileCount
                && food.y >= 0 && food.y < tileCount;
        },
        foodIsUnderSnake() {
            return snake.some((s) => s.x === food.x && s.y === food.y);
        },
    };
}

export const test = base.extend({
    // A loaded, frozen, freshly restarted game. `game` is just the page
    // with those guarantees; specs drive it through page.evaluate.
    game: async ({ page }, use) => {
        await page.addInitScript(installHelpers);
        await page.goto('/');
        await page.waitForFunction(() => typeof update === 'function' && !!window.__game);
        await page.evaluate(() => window.__game.reset());
        await use(page);
    },
});

export { expect };
