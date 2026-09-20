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

test("a redundant same-axis reconfirmation doesn't discard the other axis's progress toward a real turn", async ({ game }) => {
    // The exact shape of the bug this guards: after turning down, further
    // travel that's still primarily downward (ordinary noise in a real
    // swipe, not a clean two-segment path) can re-cross the 20px
    // threshold in that same direction again - not a new turn, nothing
    // gets queued for it, but it still has to decide whether to reset the
    // touch reference point. If it reset *both* axes' reference points
    // (rather than just the one that redundantly reconfirmed), it would
    // silently erase whatever leftward progress had already built up on
    // the other axis, and a real U-turn gesture would intermittently
    // drop its second turn depending on the precise noise shape.
    await setUpSnake(game);
    const touch = await cdpTouch(game);
    const { x, y } = await boardOrigin(game);

    await touch.down(x, y);
    await touch.move(x, y + 30);        // down - a real turn, resets both axes here
    await touch.move(x - 15, y + 33);   // 15px of leftward progress - below the 20px threshold yet
    await touch.move(x - 13, y + 55);   // still-mostly-down noise re-crosses 20px downward again
    await touch.move(x - 22, y + 58);   // the 15px of leftward progress plus a little more crosses 20px

    const queued = await game.evaluate(() => window.__queued);
    expect(queued).toEqual([{ dx: 0, dy: 1 }, { dx: -1, dy: 0 }]);
    await touch.up();
});
