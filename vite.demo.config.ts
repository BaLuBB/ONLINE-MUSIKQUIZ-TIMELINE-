import { mergeConfig } from 'vite';
import base from './vite.config.ts';

// Einzeldatei-Build des lokalen Testmodus (alles inline, kein Code-Splitting) – für die Browser-Demo.
export default (env: { mode: string }) =>
  mergeConfig((base as unknown as (e: { mode: string }) => object)(env), {
    build: {
      outDir: 'dist-demo',
      cssCodeSplit: false,
      rolldownOptions: { output: { codeSplitting: false, inlineDynamicImports: true } },
    },
  });
