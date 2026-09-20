// The two "confirm before you steer" gates: an egg's announcement
// overlay, and the message after a free life saves you. Both hold
// movement until a double-tap or R - never a direction, on any device.
//
// The reason is the same for both. Whatever swipe or keypress was in
// flight when the pause began must not become the first move of what
// comes after it: for a respawn that means the snake sets off before the
// player has even found where it landed, throwing away the life they
// just earned.
//
// These specs drive real touch and keyboard events rather than poking at
// the handlers' state, because a gate is only worth anything if the
// actual event handlers implement it.
import { test, expect } from './helpers.js';

// Put the game in the "saved by a free life" state: Ouroboros banked,
// then a death that spends it.
async function spendALife(game) {
    return game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        h.finishRegrow();
        // Straight into the right wall - forgiven, since the life is banked.
        snake[0] = { x: tileCount - 1, y: snake[0].y };
        dx = 1;
        dy = 0;
        h.step();
        return h.state();
    });
}

// Taps land on the canvas, the way a player's would.
async function tapCanvas(game, times) {
    const box = await game.locator('#gameCanvas').boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    for (let i = 0; i < times; i++) {
        await game.touchscreen.tap(x, y);
    }
}

// Queue a direction and tick: does the snake actually move? This is the
// behaviour the gate exists for - asserting only on `respawnDismissed`
// would still pass if the flag were set but never consulted.
function tryToMove(game) {
    return game.evaluate(() => {
        const h = window.__game;
        const before = { ...snake[0] };
        inputQueue.push({ dx: 0, dy: 1 });
        h.step();
        return snake[0].x !== before.x || snake[0].y !== before.y;
    });
}

test('a forgiven death arms the gate and shows the message', async ({ game }) => {
    const state = await spendALife(game);
    expect(state.gameRunning).toBe(true);
    expect(state.respawnMessageShowing).toBe(true);
    expect(state.respawnDismissed).toBe(false);
    await expect(game.locator('#respawnMessage')).toBeVisible();
    await expect(game.locator('#respawnMessage')).toContainText('Double-tap');
    expect(await tryToMove(game)).toBe(false);
});

test('a direction alone does not start the snake moving', async ({ game }) => {
    await spendALife(game);
    const result = await game.evaluate(() => {
        const h = window.__game;
        const before = { ...snake[0] };
        // A swipe that arrived on its own, with no double-tap first.
        inputQueue.push({ dx: 0, dy: 1 });
        h.step();
        h.step();
        return { before, after: { ...snake[0] }, queued: inputQueue.length };
    });
    expect(result.after).toEqual(result.before);
    // The stray input is discarded, not banked for later.
    expect(result.queued).toBe(0);
});

test('one tap is not enough', async ({ game }) => {
    await spendALife(game);
    await tapCanvas(game, 1);
    const state = await game.evaluate(() => window.__game.state());
    expect(state.respawnDismissed).toBe(false);
    expect(await tryToMove(game)).toBe(false);
});

test('a double-tap opens the gate, and the swipe after it moves', async ({ game }) => {
    await spendALife(game);
    await tapCanvas(game, 2);

    const dismissed = await game.evaluate(() => window.__game.state());
    expect(dismissed.respawnDismissed).toBe(true);
    // Dismissing is not itself a move - the snake waits for a direction.
    expect(dismissed.respawnMessageShowing).toBe(true);

    const result = await game.evaluate(() => {
        const h = window.__game;
        const before = { ...snake[0] };
        inputQueue.push({ dx: 0, dy: 1 });
        h.step();
        return { before, after: { ...snake[0] }, ...h.state() };
    });
    expect(result.after).toEqual({ x: result.before.x, y: result.before.y + 1 });
    // The message clears itself on that first real move.
    expect(result.respawnMessageShowing).toBe(false);
    await expect(game.locator('#respawnMessage')).toBeHidden();
});

test('two taps far apart are two single taps, not a double-tap', async ({ game }) => {
    await spendALife(game);
    await tapCanvas(game, 1);
    await game.waitForTimeout(400);          // longer than doubleTapDelay
    await tapCanvas(game, 1);
    const state = await game.evaluate(() => window.__game.state());
    expect(state.respawnDismissed).toBe(false);
    expect(await tryToMove(game)).toBe(false);
});

test('an arrow key alone does not open the gate', async ({ game }) => {
    await spendALife(game);
    const before = await game.evaluate(() => ({ ...snake[0] }));

    await game.keyboard.press('ArrowDown');
    const result = await game.evaluate(() => {
        const h = window.__game;
        h.step();
        h.step();
        return { after: { ...snake[0] }, ...h.state() };
    });

    // Steering never doubles as the dismissal, on any device - it's
    // double-tap or R, always.
    expect(result.respawnDismissed).toBe(false);
    expect(result.after).toEqual(before);
});

test('R then an arrow key is the keyboard sequence that moves', async ({ game }) => {
    await spendALife(game);
    const before = await game.evaluate(() => ({ ...snake[0] }));

    await game.keyboard.press('r');
    await game.keyboard.press('ArrowDown');
    const result = await game.evaluate(() => {
        const h = window.__game;
        h.step();
        return { after: { ...snake[0] }, ...h.state() };
    });

    expect(result.respawnDismissed).toBe(true);
    expect(result.after).toEqual({ x: before.x, y: before.y + 1 });
});

test('R dismisses without picking a direction', async ({ game }) => {
    await spendALife(game);
    const before = await game.evaluate(() => ({ ...snake[0] }));

    await game.keyboard.press('r');
    const result = await game.evaluate(() => {
        const h = window.__game;
        h.step();
        h.step();
        return { after: { ...snake[0] }, ...h.state() };
    });

    expect(result.respawnDismissed).toBe(true);
    expect(result.after).toEqual(before);       // still waiting for a swipe
    expect(result.gameRunning).toBe(true);      // and R did not restart the run
});

test('the gate also covers the Basilisk life, not just Ouroboros', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        h.eatApples(15);                    // banks the second life
        h.dismissAndResume(1, 0);
        h.killIntoWall();                   // spends Ouroboros's
        h.killIntoWall();                   // spends the Basilisk's
        return h.state();
    });

    expect(state.gameRunning).toBe(true);
    expect(state.basiliskLifeAvailable).toBe(false);
    expect(state.respawnMessageShowing).toBe(true);
    expect(state.respawnDismissed).toBe(false);
    expect(await tryToMove(game)).toBe(false);
});

test('restarting clears the gate', async ({ game }) => {
    await spendALife(game);
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.reset();
        return h.state();
    });
    expect(state.respawnMessageShowing).toBe(false);
    expect(state.respawnDismissed).toBe(false);
    await expect(game.locator('#respawnMessage')).toBeHidden();
});


// ---- the announcement overlay's gate ---------------------------------

test('an announcement holds movement until it is dismissed', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        return h.state();
    });
    expect(state.specialEventWaiting).toBe(true);
    await expect(game.locator('#specialOverlay')).toBeVisible();
    expect(await tryToMove(game)).toBe(false);
});

test('an arrow key does not dismiss an announcement either', async ({ game }) => {
    await game.evaluate(() => window.__game.fireOuroboros());
    await game.keyboard.press('ArrowDown');
    const moved = await tryToMove(game);
    expect(moved).toBe(false);
    await expect(game.locator('#specialOverlay')).toBeVisible();
});

test('R dismisses an announcement, then a direction resumes play', async ({ game }) => {
    await game.evaluate(() => window.__game.fireOuroboros());
    await game.keyboard.press('r');
    await expect(game.locator('#specialOverlay')).toBeHidden();

    const stillWaiting = await game.evaluate(() => window.__game.state());
    expect(stillWaiting.specialEventWaiting).toBe(true);   // dismissed, not resumed

    expect(await tryToMove(game)).toBe(true);
    const state = await game.evaluate(() => window.__game.state());
    expect(state.specialEventWaiting).toBe(false);
    // Ouroboros's resume is also what spawns the Basilisk.
    expect(state.basiliskActive).toBe(true);
});

test('a double-tap dismisses an announcement', async ({ game }) => {
    await game.evaluate(() => window.__game.fireOuroboros());
    await tapCanvas(game, 2);
    await expect(game.locator('#specialOverlay')).toBeHidden();
    expect(await tryToMove(game)).toBe(true);
});

test('a single tap does not dismiss an announcement', async ({ game }) => {
    await game.evaluate(() => window.__game.fireOuroboros());
    await tapCanvas(game, 1);
    await expect(game.locator('#specialOverlay')).toBeVisible();
    expect(await tryToMove(game)).toBe(false);
});
