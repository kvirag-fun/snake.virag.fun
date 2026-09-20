// One announcement overlay, one gate, four triggers: Ouroboros unlocked,
// a life it saves, Basilisk outgazed, Jörmungandr found - all through
// beginSpecialEvent(kind, title, bonus) in index.html. Only the text,
// the rays' color (SUNBURST_RGB[kind]), and the bonus line vary; the
// gate itself - hold movement until a deliberate double-tap or R, never
// a direction, on any device - is exactly one piece of code, so a life
// saved by Ouroboros behaves identically to any other announcement.
//
// The reason for the gate is sharpest on a life saved: whatever swipe or
// keypress was in flight when the snake died must not become the first
// move of its new life - it would set off again before the player has
// even found where it respawned, throwing away the life they just
// earned.
//
// These specs drive real touch and keyboard events rather than poking at
// the handlers' state, because a gate is only worth anything if the
// actual event handlers implement it.
import { test, expect } from './helpers.js';

// Put the game in the "saved by a free life" state: Ouroboros banked,
// then a death that spends it. Reuses the kind 'ouroboros' announcement
// (see respawnWithSameLength()), so this looks and behaves exactly like
// the discovery overlay below, minus the bonus line.
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
// behaviour the gate exists for - asserting only on `specialEventWaiting`
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

// Sample a ring of points around the canvas center, well outside the
// single-tile snake sitting there (it collapses to the center on a
// respawn - see respawnWithSameLength()), and report how many are gold.
// Checks for "clearly more red+green than blue, bright enough to not be
// the navy background" rather than an exact RGB match, since the rays'
// alpha gradient blends them with whatever is underneath.
//
// Sampling many angles rather than one matters because the rays rotate
// with the clock (see drawSpecialRays()) - at any given instant only
// some of the 12 wedges land on a given angle, but with samples every 5
// degrees at least a few always fall inside a ray regardless of the
// current rotation.
function goldRingPixelCount(game, radius) {
    return game.evaluate((r) => {
        let hits = 0;
        for (let deg = 0; deg < 360; deg += 5) {
            const rad = (deg * Math.PI) / 180;
            const x = Math.round(canvas.width / 2 + r * Math.cos(rad));
            const y = Math.round(canvas.height / 2 + r * Math.sin(rad));
            const [red, green, blue] = ctx.getImageData(x, y, 1, 1).data;
            if (red > 80 && green > 60 && blue < 60 && red > blue * 1.5) hits++;
        }
        return hits;
    }, radius);
}

test('a forgiven death shows the "Saved by Ouroboros!" announcement', async ({ game }) => {
    const state = await spendALife(game);
    expect(state.gameRunning).toBe(true);
    expect(state.specialEventWaiting).toBe(true);
    expect(state.specialEventKind).toBe('ouroboros');
    await expect(game.locator('#specialOverlay')).toBeVisible();
    await expect(game.locator('#specialOverlayTitle')).toHaveText('Saved by Ouroboros!');
    // No points for being saved, but the badge still shows - just the
    // emoji, with no number attached.
    await expect(game.locator('#specialOverlayBonus')).toBeVisible();
    await expect(game.locator('#specialOverlayBonus')).toHaveText('♾️');
    expect(await tryToMove(game)).toBe(false);
});

test('golden rays play behind a life-saving announcement, same as a discovery', async ({ game }) => {
    await spendALife(game);
    await game.evaluate(() => drawGame());
    const withOverlay = await goldRingPixelCount(game, 120);
    expect(withOverlay).toBeGreaterThan(0);

    // Same exact frame, overlay dismissed (no move yet, so the snake's
    // still the same single gold tile at center) - the only thing that
    // can account for a difference is the rays turning off.
    await game.evaluate(() => {
        specialEventOverlayDismissed = true;
        hideSpecialOverlay();
        drawGame();
    });
    const withoutOverlay = await goldRingPixelCount(game, 120);
    expect(withoutOverlay).toBe(0);
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
    expect(state.specialEventOverlayDismissed).toBe(false);
    expect(await tryToMove(game)).toBe(false);
});

test('a double-tap opens the gate, and the swipe after it moves', async ({ game }) => {
    await spendALife(game);
    await tapCanvas(game, 2);

    const dismissed = await game.evaluate(() => window.__game.state());
    expect(dismissed.specialEventOverlayDismissed).toBe(true);
    // Dismissing is not itself a move - the snake still waits for a
    // direction - but the text disappears right away.
    expect(dismissed.specialEventWaiting).toBe(true);
    await expect(game.locator('#specialOverlay')).toBeHidden();

    const result = await game.evaluate(() => {
        const h = window.__game;
        const before = { ...snake[0] };
        inputQueue.push({ dx: 0, dy: 1 });
        h.step();
        return { before, after: { ...snake[0] }, ...h.state() };
    });
    expect(result.after).toEqual({ x: result.before.x, y: result.before.y + 1 });
    // The overlay clears itself on that first real move.
    expect(result.specialEventWaiting).toBe(false);
    await expect(game.locator('#specialOverlay')).toBeHidden();
});

test('two taps far apart are two single taps, not a double-tap', async ({ game }) => {
    await spendALife(game);
    await tapCanvas(game, 1);
    await game.waitForTimeout(400);          // longer than doubleTapDelay
    await tapCanvas(game, 1);
    const state = await game.evaluate(() => window.__game.state());
    expect(state.specialEventOverlayDismissed).toBe(false);
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
    expect(result.specialEventOverlayDismissed).toBe(false);
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

    expect(result.specialEventOverlayDismissed).toBe(true);
    expect(result.after).toEqual({ x: before.x, y: before.y + 1 });
});

test('R dismisses without picking a direction', async ({ game }) => {
    await spendALife(game);
    const before = await game.evaluate(() => ({ ...snake[0] }));
    await expect(game.locator('#specialOverlay')).toBeVisible();

    await game.keyboard.press('r');
    // Same as a double-tap: the text disappears the moment R dismisses,
    // not only once a direction actually arrives.
    await expect(game.locator('#specialOverlay')).toBeHidden();

    const result = await game.evaluate(() => {
        const h = window.__game;
        h.step();
        h.step();
        return { after: { ...snake[0] }, ...h.state() };
    });

    expect(result.specialEventOverlayDismissed).toBe(true);
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
    expect(state.specialEventWaiting).toBe(true);
    expect(state.specialEventKind).toBe('ouroboros');   // credited to Ouroboros either way
    expect(state.specialEventOverlayDismissed).toBe(false);
    expect(await tryToMove(game)).toBe(false);
});

test('restarting clears the gate', async ({ game }) => {
    await spendALife(game);
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.reset();
        return h.state();
    });
    expect(state.specialEventWaiting).toBe(false);
    expect(state.specialEventOverlayDismissed).toBe(false);
    await expect(game.locator('#specialOverlay')).toBeHidden();
});


// ---- the same gate, exercised via a fresh egg discovery instead ------

test('an announcement holds movement until it is dismissed', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        return h.state();
    });
    expect(state.specialEventWaiting).toBe(true);
    await expect(game.locator('#specialOverlay')).toBeVisible();
    await expect(game.locator('#specialOverlayBonus')).toBeVisible();
    expect(await tryToMove(game)).toBe(false);
});

test('the bonus line carries the same badge emoji as the leaderboard', async ({ game }) => {
    await game.evaluate(() => window.__game.fireOuroboros());
    // Same character used in renderScores()'s own badge string - not
    // just "some emoji", the identical one the leaderboard shows later.
    await expect(game.locator('#specialOverlayBonus')).toHaveText('+80 ♾️');
});

test('outgazing shows its own badge, Jörmungandr shows its own', async ({ game }) => {
    const bonuses = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        h.eatApples(15);
        const basiliskBonus = specialOverlayBonusElement.textContent;

        h.dismissAndResume(1, 0);
        h.stack(JORMUNGANDR_LENGTH + 10, 3, 12);
        food = { x: 4, y: 12 };
        dx = 1;
        dy = 0;
        h.step();
        const jormungandrBonus = specialOverlayBonusElement.textContent;
        return { basiliskBonus, jormungandrBonus };
    });
    expect(bonuses.basiliskBonus).toBe('+400 \u{1F5FF}');
    expect(bonuses.jormungandrBonus).toBe('+1000 \u{1F409}');
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
