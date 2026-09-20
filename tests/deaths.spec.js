// The four ways a run can end, with no easter eggs in play. Each death
// sets its own `deathCause`, which picks the game-over message and image
// - so a missing entry in either table is a blank game-over screen.
import { test, expect } from './helpers.js';

test('running into a wall ends the run', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.setSnake([{ x: 19, y: 10 }]);
        dx = 1;
        dy = 0;
        h.step();
        return h.state();
    });
    expect(state.gameRunning).toBe(false);
    expect(state.deathCause).toBe('wall');
});

test('running into your own body ends the run', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.setSnake([
            { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 },
            { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 },
        ]);
        dx = 1;
        dy = 0;
        h.step();
        return h.state();
    });
    expect(state.gameRunning).toBe(false);
    expect(state.deathCause).toBe('self');
});

test('eating a rotten apple ends the run', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.setSnake([{ x: 5, y: 5 }]);
        badFoodList = [{ x: 6, y: 5 }];
        dx = 1;
        dy = 0;
        h.step();
        return h.state();
    });
    expect(state.gameRunning).toBe(false);
    expect(state.deathCause).toBe('rotten');
});

test('every death cause has a message and an image', async ({ game }) => {
    const tables = await game.evaluate(() => ({
        messages: Object.fromEntries(
            Object.entries(DEATH_MESSAGES).map(([k, v]) => [k, typeof v === 'string' && v.length > 0])
        ),
        images: Object.fromEntries(
            Object.entries(GAME_OVER_SOURCES).map(([k, v]) => [k, typeof v === 'string' && v.length > 0])
        ),
    }));
    // 'gaze' is the Basilisk's own cause - see basilisk.spec.js.
    for (const cause of ['wall', 'self', 'rotten', 'gaze']) {
        expect(tables.messages[cause], `message for ${cause}`).toBe(true);
        expect(tables.images[cause], `image for ${cause}`).toBe(true);
    }
});
