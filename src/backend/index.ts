import { createLocalBackend } from './localBackend.ts';
import { createP2PBackend } from './p2pBackend.ts';
import { createSupabaseBackend } from './supabaseBackend.ts';
import type { Backend } from './types.ts';

export type BackendSelection =
  | { kind: 'ready'; backend: Backend }
  | { kind: 'missing-config'; localAllowed: boolean };

const env = import.meta.env;

export function hasSupabaseConfig(): boolean {
  return Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
}

/**
 * Wählt das Backend:
 *  1. Supabase (echtes Online-Spiel), sobald konfiguriert;
 *  2. sonst Direktverbindung (P2P, Geräte-zu-Gerät ohne Konto), wenn eingebaut und bevorzugt;
 *  3. sonst lokaler Testmodus (nur ein Browser), wenn eingebaut;
 *  4. sonst „Konfiguration fehlt“.
 * VITE_BACKEND=local|p2p legt fest, welcher Modus ohne Supabase Vorrang hat (Standard: local, wenn eingebaut).
 */
export function selectBackend(force?: 'local' | 'p2p'): BackendSelection {
  const pref = force ?? env.VITE_BACKEND ?? (__LOCAL_MODE__ ? 'local' : 'p2p');
  if (!force && hasSupabaseConfig()) {
    return {
      kind: 'ready',
      backend: createSupabaseBackend({ url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY }),
    };
  }
  if (__P2P_MODE__ && (pref === 'p2p' || !__LOCAL_MODE__)) return { kind: 'ready', backend: createP2PBackend() };
  if (__LOCAL_MODE__) return { kind: 'ready', backend: createLocalBackend() };
  return { kind: 'missing-config', localAllowed: false };
}
