import { createLocalBackend } from './localBackend.ts';
import { createSupabaseBackend } from './supabaseBackend.ts';
import type { Backend } from './types.ts';

export type BackendSelection =
  | { kind: 'ready'; backend: Backend }
  | { kind: 'missing-config'; localAllowed: boolean };

const env = import.meta.env;

export function hasSupabaseConfig(): boolean {
  return Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
}

export function localModeAllowed(): boolean {
  return __LOCAL_MODE__;
}

/**
 * Wählt das Backend: Online (Supabase) sobald konfiguriert. Ohne Konfiguration ist der
 * lokale Entwicklungsmodus nur im Dev-Server oder mit VITE_ENABLE_LOCAL_MODE=true verfügbar –
 * sonst wird ein klarer „Konfiguration fehlt“-Zustand angezeigt.
 */
export function selectBackend(forceLocal = false): BackendSelection {
  if (__LOCAL_MODE__ && forceLocal) return { kind: 'ready', backend: createLocalBackend() };
  if (hasSupabaseConfig()) {
    return {
      kind: 'ready',
      backend: createSupabaseBackend({ url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY }),
    };
  }
  if (__LOCAL_MODE__) return { kind: 'ready', backend: createLocalBackend() };
  return { kind: 'missing-config', localAllowed: false };
}
