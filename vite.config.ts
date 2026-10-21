import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Die Spiellogik liegt in supabase/functions/_shared und wird sowohl vom Frontend
// (lokaler Modus, Typen) als auch von der Edge Function verwendet.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@engine': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)) },
  },
  build: { target: 'es2022', sourcemap: false },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
