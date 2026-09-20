// Touch steering: the touchmove handler in index.html that resolves a
// swipe into a direction. Exercised through real CDP touch events
// (Input.dispatchTouchEvent), not by poking inputQueue directly, since a
// gate on the *input layer itself* is only meaningful if driven the way
// an actual finger would.
import { test, expect } from './helpers.js';

// Playwright's own touchscreen API only taps - it can't drive a
// multi-point continuous drag, which is what a real swipe (and every
// test below) is. CDP's Input.dispatchTouchEvent can.
async function cdpTouch(game) {
    const cdp = await game.context().newCDPSession(game);
    return {
        down: (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }),
        move: (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }),
        up: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
    };
}

// A straight body of 7, moving right, far from every wall - long enough
// that none of these maneuvers is a real self-collision risk, isolating
// "what did the input layer queue" from "did the resulting move kill it".
async function setUpSnake(game) {
    await game.evaluate(() => {
        const h = window.__game;
        h.reset();
        h.setSnake([
            { x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 },
            { x: 6, y: 10 }, { x: 5, y: 10 }, { x: 4, y: 10 },
        ]);
        dx = 1;
        dy = 0;
        window.__queued = [];
        const originalPush = inputQueue.push.bind(inputQueue);
        inputQueue.push = (d) => { window.__queued.push({ ...d }); return originalPush(d); };
    });
}

async function boardOrigin(game) {
    const box = await game.locator('#gameCanvas').boundingBox();
    return { x: box.x + 100, y: box.y + 100 };
}

test('a single clean swipe queues the expected direction', async ({ game }) => {
    await setUpSnake(game);
    const touch = await cdpTouch(game);
    const { x, y } = await boardOrigin(game);

    await touch.down(x, y);
    await touch.move(x, y + 30);   // down - well past the 20px threshold
    await touch.up();

    const queued = await game.evaluate(() => window.__queued);
    expect(queued).toEqual([{ dx: 0, dy: 1 }]);
});

test('swiping directly backward into the current heading is ignored', async ({ game }) => {
    await setUpSnake(game);                        // heading right
    const touch = await cdpTouch(game);
    const { x, y } = await boardOrigin(game);

    await touch.down(x, y);
    await touch.move(x - 30, y);   // left - a straight reversal into the neck
    await touch.up();

    const queued = await game.evaluate(() => window.__queued);
    expect(queued).toEqual([]);
});

test('a continuous drag chains multiple turns without lifting the finger', async ({ game }) => {
    await setUpSnake(game);                        // heading right
    const touch = await cdpTouch(game);
    const { x, y } = await boardOrigin(game);

    await touch.down(x, y);
    await touch.move(x, y + 30);        // down
    await touch.move(x - 30, y + 30);   // then left
    await touch.up();

    const queued = await game.evaluate(() => window.__queued);
    expect(queued).toEqual([{ dx: 0, dy: 1 }, { dx: -1, dy: 0 }]);
});

test('a long same-direction drag does not pile up redundant queue entries', async ({ game }) => {
    await setUpSnake(game);
    await game.evaluate(() => { dx = 0; dy = 1; });  // heading down, so a rightward drag is a genuine turn
    const touch = await cdpTouch(game);
    const { x, y } = await boardOrigin(game);

    await touch.down(x, y);
    // Keeps re-crossing the 20px threshold in the same direction as it
    // goes, the way one continuous real drag does when sampled at high
    // frequency - should resolve to exactly the one turn away from the
    // original heading, not one entry per threshold crossing after that.
    for (let dx = 25; dx <= 150; dx += 25) await touch.move(x + dx, y);
    await touch.up();

    const queued = await game.evaluate(() => window.__queued);
    expect(queued).toEqual([{ dx: 1, dy: 0 }]);
});

test('a diagonal drag - never perfectly axis-aligned, the normal case for a real thumb - does not fire the axis it never meant to turn on', async ({ game }) => {
    // A version of the reference-point reset once shipped that only reset
    // the axis that had just fired (to avoid discarding a perpendicular
    // U-turn already in progress), leaving the *other* axis's reference
    // point untouched on a redundant same-direction reconfirmation. That
    // seemed safe in isolation, but a swipe is essentially never perfectly
    // axis-aligned - there's always some diagonal component from how a
    // thumb actually moves - and with only one axis resetting, the other
    // axis's delta had nothing bounding it: over a normal-length drag it
    // would eventually cross its own 20px threshold too, on this test's
    // numbers well before the drag even ends, firing a direction ("down")
    // the player never swiped for. Confirmed live: a swipe as little as
    // ~10 degrees off horizontal reliably triggered it. Both axes
    // resetting together on every resolved swipe - not just a genuine new
    // direction - is what keeps the never-fired axis's delta bounded.
    await setUpSnake(game);
    await game.evaluate(() => { dx = 0; dy = 1; });  // heading down, so rightward is a genuine turn
    const touch = await cdpTouch(game);
    const { x, y } = await boardOrigin(game);

    await touch.down(x, y);
    // A steady rightward drag at a consistent ~17 degree diagonal (3px
    // down for every 10px right) - well within normal thumb variance, not
    // an extreme case.
    for (let dx = 10; dx <= 160; dx += 10) {
        await touch.move(x + dx, y + dx * 0.3);
    }
    await touch.up();

    const queued = await game.evaluate(() => window.__queued);
    expect(queued).toEqual([{ dx: 1, dy: 0 }]);
});
