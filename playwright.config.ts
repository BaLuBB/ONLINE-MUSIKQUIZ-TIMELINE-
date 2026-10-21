import { defineConfig } from '@playwright/test';

// Die E2E-Tests laufen gegen den lokalen Testmodus (kein Backend nötig):
// Zwei Seiten im selben Browser-Kontext verhalten sich wie zwei Spieler.
// Mit PW_CHROMIUM_PATH lässt sich eine vorhandene Chromium-Installation verwenden.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    launchOptions: { executablePath, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
  webServer: {
    command: 'VITE_LOCAL_AUDIO=demo npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
