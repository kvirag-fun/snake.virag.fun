// Keyboard steering: the keydown handler in index.html, specifically the
// numpad 8/4/5/6 alternate direction cluster (added for keyboards where
// the arrow cluster splits Up/Down away from Left/Right).
import { test, expect } from './helpers.js';

async function setUpSnake(game) {
    await game.evaluate(() => {
        const h = window.__game;
        h.reset();
        h.setSnake([
            { x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 },
        ]);
        dx = 1;
        dy = 0;
        window.__queued = [];
        const originalPush = inputQueue.push.bind(inputQueue);
        inputQueue.push = (d) => { window.__queued.push({ ...d }); return originalPush(d); };
    });
}

test('numpad 8/4/5/6 queue the same directions as the arrow keys', async ({ game }) => {
    await setUpSnake(game);                        // heading right
    // Each key is a 90-degree turn off the direction the previous one
    // just queued - never straight back the way it came - so all four
    // chain through cleanly, the same as pressing the equivalent arrow
    // keys in this order would.
    await game.keyboard.press('Numpad8');           // up - off right
    await game.keyboard.press('Numpad4');           // left - off up
    await game.keyboard.press('Numpad5');           // down - off left
    await game.keyboard.press('Numpad6');           // right - off down

    const queued = await game.evaluate(() => window.__queued);
    expect(queued).toEqual([
        { dx: 0, dy: -1 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 1, dy: 0 },
    ]);
});

test('numpad 5 (down) is blocked as a reversal exactly like ArrowDown', async ({ game }) => {
    await setUpSnake(game);
    await game.evaluate(() => { dx = 0; dy = -1; });  // heading up
    await game.keyboard.press('Numpad5');             // down - straight reversal into the neck

    const queued = await game.evaluate(() => window.__queued);
    expect(queued).toEqual([]);
});
