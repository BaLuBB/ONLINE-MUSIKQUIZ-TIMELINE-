import { defineConfig } from '@playwright/test';

// E2E für den Direktverbindungs-Modus: lokaler PeerJS-Signalserver + Dev-Server im P2P-Modus.
// Zwei getrennte Browser-Kontexte verhalten sich wie zwei Geräte (WebRTC über localhost).
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  testMatch: /p2p\.spec\.ts/,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    viewport: { width: 1100, height: 800 },
    launchOptions: { executablePath, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] },
    trace: 'retain-on-failure',
  },
  webServer: [
    { command: 'node scripts/peer-server.mjs', url: 'http://127.0.0.1:9000/', reuseExistingServer: true },
    {
      command:
        'VITE_BACKEND=p2p VITE_LOCAL_AUDIO=demo VITE_PEER_HOST=127.0.0.1 VITE_PEER_PORT=9000 VITE_PEER_PATH=/ npx vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
