import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    // The game is one page's worth of global state, so a spec file drives
    // it serially. Files still run in parallel across workers, each with
    // its own browser context.
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    // No retries: the Basilisk's spawn is random, so a test that only
    // passes on a second attempt is hiding a real intermittent bug rather
    // than suffering infrastructure flake.
    retries: 0,
    reporter: process.env.CI
        ? [['github'], ['list'], ['html', { open: 'never' }]]
        : 'list',
    use: {
        baseURL: 'http://127.0.0.1:5173',
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
    // Tests run against the dev server, not the built bundle: it serves
    // index.html as-is, which is what the specs poke at. Firebase points
    // at the local emulator in dev and simply fails to connect when it
    // isn't running - harmless here, since nothing under test reads the
    // leaderboard from the network.
    // Bind the dev server to 127.0.0.1 explicitly rather than letting it
    // default to `localhost`: on CI runners that name can resolve to ::1
    // first, and Playwright then waits out the whole timeout probing an
    // IPv4 address nothing is listening on.
    webServer: {
        command: 'vite --host 127.0.0.1 --port 5173 --strictPort',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: !process.env.CI,
        // Piped, not ignored - if the server fails to start, its output is
        // the only thing that says why.
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 120_000,
    },
});
