// The eggs fire in a strict chain - Ouroboros, then Basilisk, then
// Jörmungandr - and each one needs the previous. These tests cover the
// gating, what the two free lives do together, and the arithmetic of a
// full run.
import { test, expect } from './helpers.js';

// Reaching the Jörmungandr threshold requires growing the snake there;
// the specs below place a body of that length directly instead.
async function jormungandrLength(game) {
    return game.evaluate(() => JORMUNGANDR_LENGTH);
}

test('length alone never fires Jörmungandr', async ({ game }) => {
    const threshold = await jormungandrLength(game);
    const state = await game.evaluate((length) => {
        const h = window.__game;
        h.stack(length + 10, 3, 12);
        food = { x: 4, y: 12 };
        dx = 1;
        dy = 0;
        h.step();
        return h.state();
    }, threshold);
    expect(state.jormungandrTriggered).toBe(false);
});

test('Jörmungandr stays locked while the Basilisk is unbeaten', async ({ game }) => {
    const threshold = await jormungandrLength(game);
    const state = await game.evaluate((length) => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);          // Basilisk now active
        basiliskActive = false;            // clear the wall out of the way,
        basiliskWall = [];                 // but leave it *unbeaten*
        h.stack(length + 10, 3, 12);
        food = { x: 4, y: 12 };
        dx = 1;
        dy = 0;
        h.step();
        return h.state();
    }, threshold);
    expect(state.basiliskTriggered).toBe(false);
    expect(state.jormungandrTriggered).toBe(false);
});

test('once the Basilisk is beaten it fires on a food-eat, not on a plain move', async ({ game }) => {
    const threshold = await jormungandrLength(game);
    const result = await game.evaluate((length) => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        h.eatApples(20);                   // outgaze the Basilisk
        h.dismissAndResume(1, 0);

        // At threshold length but not eating: nothing happens.
        h.stack(length + 10, 3, 12);
        h.stepWithoutEating();
        const afterPlainMove = jormungandrTriggered;

        // The very next food-eat at the same length does fire it.
        h.stack(length + 10, 3, 12);
        food = { x: 4, y: 12 };
        dx = 1;
        dy = 0;
        const lengthBefore = snake.length;
        const scoreBefore = score;
        h.step();
        return { afterPlainMove, lengthBefore, scoreBefore, ...h.state() };
    }, threshold);

    expect(result.afterPlainMove).toBe(false);
    expect(result.jormungandrTriggered).toBe(true);
    expect(result.score).toBe(result.scoreBefore + 10 + 1000);
    // Same collapse/regrow treatment as Ouroboros and the Basilisk: back
    // down to a single tile, regrowing out to the length it had just
    // grown to (the food-eat that triggered this already grew it by 1).
    expect(result.length).toBe(1);
    expect(result.regrowPending).toBe(result.lengthBefore + 1 - 1);
    // Teal overrides Ouroboros's gold.
    expect(result.snakeColorMode).toBe('jormungandr');
});

test('both free lives can be banked at once and are spent oldest first', async ({ game }) => {
    const result = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        h.eatApples(20);                   // banks the Basilisk's life too
        h.dismissAndResume(1, 0);
        const banked = {
            ouroboros: ouroborosLifeAvailable,
            basilisk: basiliskLifeAvailable,
        };

        h.killIntoWall();
        const afterFirst = h.state();
        h.killIntoWall();
        const afterSecond = h.state();
        h.killIntoWall();
        const afterThird = h.state();
        return { banked, afterFirst, afterSecond, afterThird };
    });

    expect(result.banked).toEqual({ ouroboros: true, basilisk: true });
    // Death 1 spends Ouroboros's.
    expect(result.afterFirst.gameRunning).toBe(true);
    expect(result.afterFirst.ouroborosLifeAvailable).toBe(false);
    expect(result.afterFirst.basiliskLifeAvailable).toBe(true);
    // Death 2 spends the Basilisk's.
    expect(result.afterSecond.gameRunning).toBe(true);
    expect(result.afterSecond.basiliskLifeAvailable).toBe(false);
    // Death 3 is a real game over.
    expect(result.afterThird.gameRunning).toBe(false);
    expect(result.afterThird.deathCause).toBe('wall');
});

test('a full run adds up exactly, and none of the bonuses touch the pace', async ({ game }) => {
    const result = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();                 // +80 at length 8
        const ouroborosBonus = score;
        h.dismissAndResume(1, 0);
        h.eatApples(20);                   // +200 apples, +400 outgaze
        h.dismissAndResume(1, 0);
        const beforeGrowing = score;

        let guard = 0;
        while (!jormungandrTriggered && guard++ < 300) {
            if (specialEventWaiting) {
                h.dismissAndResume(1, 0);
                continue;
            }
            const head = snake[0];
            food = { x: head.x + 1, y: head.y };
            dx = 1;
            dy = 0;
            h.step();
            if (snake[0].x > 16) snake = snake.map((s) => ({ x: s.x - 12, y: s.y }));
        }
        const applesWhileGrowing = (score - beforeGrowing - 1000) / 10;
        return { ouroborosBonus, applesWhileGrowing, ...h.state() };
    });

    expect(result.ouroborosTriggered).toBe(true);
    expect(result.basiliskTriggered).toBe(true);
    expect(result.jormungandrTriggered).toBe(true);
    expect(result.ouroborosBonus).toBe(80);
    expect(result.score).toBe(
        80 + 200 + 400 + result.applesWhileGrowing * 10 + 1000
    );
    // Difficulty is driven by apples alone: 20 + however many it took to
    // grow back to the Jörmungandr threshold.
    expect(result.pacingScore).toBe((20 + result.applesWhileGrowing) * 10);
});

test('restarting clears every egg, life and colour', async ({ game }) => {
    const state = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        h.eatApples(20);
        h.reset();
        return h.state();
    });
    expect(state).toMatchObject({
        score: 0,
        ouroborosTriggered: false,
        basiliskTriggered: false,
        jormungandrTriggered: false,
        basiliskActive: false,
        basiliskWallLength: 0,
        basiliskFoodCounter: 0,
        ouroborosLifeAvailable: false,
        basiliskLifeAvailable: false,
        regrowPending: 0,
        snakeColorMode: 'normal',
    });
});

test('leaderboard badges render in chain order, and only the ones earned', async ({ game }) => {
    const lines = await game.evaluate(() => {
        renderScores([
            { score: 900, nickname: 'ALL', ouroboros: true, basilisk: true, jormungandr: true },
            { score: 800, nickname: 'OURO', ouroboros: true, basilisk: false, jormungandr: false },
            { score: 700, nickname: 'NONE', ouroboros: false, basilisk: false, jormungandr: false },
        ]);
        return Array.from(document.getElementById('topScoresList').children)
            .map((el) => el.textContent);
    });

    const [all, ouroborosOnly, none] = lines;
    // Ouroboros, Basilisk, Jörmungandr - the order they're earned in.
    expect(all).toBe('1. 900 - ALL \u267E\uFE0F \u{1F5FF} \u{1F409}');
    expect(ouroborosOnly).toBe('2. 800 - OURO \u267E\uFE0F');
    expect(none).toBe('3. 700 - NONE');
    // Padded out to five rows even with three entries.
    expect(lines).toHaveLength(5);
});
