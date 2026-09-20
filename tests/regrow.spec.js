// No apple exists at all while the snake is regrowing.
//
// Three different events collapse the snake to a single tile, and all
// three go through the same `regrowPending` counter - so this rule is
// implemented once (one guard in update(), one in drawGame()) rather
// than three times. These tests check each path separately anyway,
// because "they share a counter" is exactly the kind of thing a later
// refactor quietly breaks.
//
// The rule exists for the Basilisk: its apples used to be eaten while
// the snake was conveniently short, making the fight easiest precisely
// when it was meant to cost something.
import { test, expect } from './helpers.js';

test('no apple can be eaten after an Ouroboros collapse', async ({ game }) => {
    const result = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        const ate = h.tryToEatWhileRegrowing(4);
        return { ate, ...h.state() };
    });

    expect(result.ate).toBe(false);
    expect(result.regrowPending).toBeGreaterThan(0);
});

test('no apple can be eaten after a forgiven death', async ({ game }) => {
    const result = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        h.finishRegrow();
        h.killIntoWall();                        // forgiven - collapses again
        const collapsed = h.state();
        const ate = h.tryToEatWhileRegrowing(5);
        return { collapsed, ate };
    });

    expect(result.collapsed.gameRunning).toBe(true);
    expect(result.collapsed.length).toBe(1);
    expect(result.collapsed.regrowPending).toBeGreaterThan(0);
    expect(result.ate).toBe(false);
});

test('no apple can be eaten after outgazing the Basilisk', async ({ game }) => {
    const result = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        h.eatApples(25);
        const collapsed = h.state();
        h.dismissAndResume(1, 0);
        const ate = h.tryToEatWhileRegrowing(5);
        return { collapsed, ate };
    });

    expect(result.collapsed.basiliskTriggered).toBe(true);
    expect(result.collapsed.length).toBe(1);
    expect(result.collapsed.regrowPending).toBeGreaterThan(0);
    expect(result.ate).toBe(false);
});

test('a fresh apple appears the moment the snake is back to full length', async ({ game }) => {
    const result = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        h.finishRegrow();
        return {
            onBoard: h.foodIsOnBoard(),
            underSnake: h.foodIsUnderSnake(),
            ...h.state(),
        };
    });

    expect(result.regrowPending).toBe(0);
    expect(result.length).toBe(8);          // back to its pre-collapse length
    expect(result.onBoard).toBe(true);
    // Placed clear of the body, not buried under it.
    expect(result.underSnake).toBe(false);
});

test('and it is eatable again straight away', async ({ game }) => {
    const gained = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        h.finishRegrow();

        // Line the head up directly left of the apple and step into it.
        const body = snake.slice(1);
        snake = [{ x: food.x - 1, y: food.y }, ...body];
        dx = 1;
        dy = 0;
        const before = score;
        h.step();
        return score - before;
    });
    expect(gained).toBe(10);
});

test("the Basilisk's counter cannot advance while regrowing", async ({ game }) => {
    const result = await game.evaluate(() => {
        const h = window.__game;
        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        const before = basiliskFoodCounter;
        h.tryToEatWhileRegrowing(6);
        return { before, after: basiliskFoodCounter };
    });
    expect(result.after).toBe(result.before);
});

test('normal play is unaffected - the first apple is there from the start', async ({ game }) => {
    const result = await game.evaluate(() => {
        const h = window.__game;
        const atStart = { regrowPending, onBoard: h.foodIsOnBoard() };
        h.setSnake([{ x: 5, y: 5 }]);
        food = { x: 6, y: 5 };
        dx = 1;
        dy = 0;
        const before = score;
        h.step();
        return { atStart, gained: score - before };
    });

    expect(result.atStart.regrowPending).toBe(0);
    expect(result.atStart.onBoard).toBe(true);
    expect(result.gained).toBe(10);
});

test('the apple is not drawn while regrowing', async ({ game }) => {
    // drawGame() skips the food entirely, so the rule is visible as well
    // as enforced. Checked by parking the food on a known empty tile and
    // looking at those pixels - not by scanning the whole canvas for red,
    // which would also catch the snake's own eyes (#ff0000 until the
    // Basilisk is beaten).
    const tiles = await game.evaluate(() => {
        const h = window.__game;
        const SPOT = { x: 2, y: 17 };        // clear of the coil and the gaze
        // How many distinct colours that tile contains: 1 means bare
        // background, more means something was drawn on it.
        const coloursAt = (tile) => {
            const { data } = ctx.getImageData(
                tile.x * gridSize, tile.y * gridSize, gridSize, gridSize
            );
            const seen = new Set();
            for (let i = 0; i < data.length; i += 4) {
                seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
            }
            return seen.size;
        };

        h.fireOuroboros();
        h.dismissAndResume(1, 0);
        badFoodList = [];
        food = { ...SPOT };
        drawGame();
        const whileRegrowing = coloursAt(SPOT);

        h.finishRegrow();
        badFoodList = [];
        food = { ...SPOT };
        drawGame();
        const afterRegrow = coloursAt(SPOT);
        return { whileRegrowing, afterRegrow };
    });

    expect(tiles.whileRegrowing).toBe(1);
    expect(tiles.afterRegrow).toBeGreaterThan(1);
});
