import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Die Spiellogik liegt in supabase/functions/_shared und wird sowohl vom Frontend
// (lokaler Modus, Typen) als auch von der Edge Function verwendet.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Der lokale Testmodus (inkl. kompletter Songbibliothek) wird nur in Dev-Builds oder mit
  // VITE_ENABLE_LOCAL_MODE=true eingebaut. Produktions-Builds enthalten die Bibliothek nie.
  const localMode = mode !== 'production' || env.VITE_ENABLE_LOCAL_MODE === 'true';
  // Direktverbindungs-Modus (Geräte-zu-Gerät ohne Backend): im Dev-Server oder mit VITE_ENABLE_P2P=true.
  const p2pMode = mode !== 'production' || env.VITE_ENABLE_P2P === 'true';
  return {
  define: { __LOCAL_MODE__: JSON.stringify(localMode), __P2P_MODE__: JSON.stringify(p2pMode) },
  plugins: [react()],
  resolve: {
    alias: { '@engine': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'vendor', test: /node_modules/ }] } } },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
  };
});
