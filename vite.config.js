import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative asset URLs so the static build works from any sub-path.
  base: './',
  plugins: [
    VitePWA({
      // Service worker auto-updates and takes over immediately on a new
      // deploy, rather than leaving a visitor stuck on a stale cached
      // version until they close every tab - this game gets iterated on
      // often.
      registerType: 'autoUpdate',
      includeAssets: ['tab_icon.ico'],
      manifest: {
        name: 'Snake',
        short_name: 'Snake',
        description: 'A classic Snake game with a global leaderboard.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        // Same navy as the actual in-game canvas background (--canvas-background
        // in index.html) - the icon artwork is drawn on it too, keeping the
        // install splash screen and OS chrome tint consistent with both.
        background_color: '#0b1a31',
        theme_color: '#0b1a31',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
