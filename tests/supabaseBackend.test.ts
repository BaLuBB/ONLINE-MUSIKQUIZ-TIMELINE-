import { beforeEach, describe, expect, it, vi } from 'vitest';

// Der Supabase-Client wird ersetzt, um die Fehlerdiagnose der Anbindung zu prüfen.
const state: { signIn: () => Promise<{ error: unknown }>; invoke: () => Promise<{ data?: unknown; error?: unknown }> } = {
  signIn: async () => ({ error: null }),
  invoke: async () => ({ data: { ok: true } }),
};
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }), signInAnonymously: () => state.signIn() },
    functions: { invoke: () => state.invoke() },
  }),
}));

import { createSupabaseBackend } from '../src/backend/supabaseBackend.ts';

const req = { type: 'create' as const, name: 'Anna' };
const message = (r: Awaited<ReturnType<ReturnType<typeof createSupabaseBackend>['request']>>) => (r.ok ? 'ok' : r.error.message);

describe('Supabase-Anbindung: verständliche Fehlerursachen', () => {
  beforeEach(() => {
    state.signIn = async () => ({ error: null });
    state.invoke = async () => ({ data: { ok: true } });
  });

  it('nennt ausgeschaltete anonyme Anmeldungen', async () => {
    state.signIn = async () => ({ error: { name: 'AuthApiError', status: 422, message: 'Anonymous sign-ins are disabled' } });
    const b = createSupabaseBackend({ url: 'https://x.supabase.co', anonKey: 'k' });
    expect(message(await b.request(req))).toContain('Allow anonymous sign-ins');
    expect(b.diagnostics?.().join('\n')).toContain('Anonymous sign-ins are disabled');
  });

  it('erkennt einen abgelehnten Schlüssel', async () => {
    state.signIn = async () => ({ error: { name: 'AuthApiError', status: 401, message: 'Invalid API key' } });
    const b = createSupabaseBackend({ url: 'https://x.supabase.co', anonKey: 'k' });
    expect(message(await b.request(req))).toContain('VITE_SUPABASE_ANON_KEY');
  });

  it('erkennt ein nicht erreichbares Supabase (Netzwerk)', async () => {
    state.signIn = async () => ({ error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' } });
    const b = createSupabaseBackend({ url: 'https://x.supabase.co', anonKey: 'k' });
    expect(message(await b.request(req))).toContain('nicht erreichbar');
  });

  it('meldet eine nicht eingespielte Funktion (404)', async () => {
    state.invoke = async () => ({ error: { name: 'FunctionsHttpError', message: 'not found', context: { status: 404, json: async () => ({}) } } });
    const b = createSupabaseBackend({ url: 'https://x.supabase.co', anonKey: 'k' });
    expect(message(await b.request(req))).toContain('nicht eingespielt');
  });

  it('reicht fachliche Fehler der Funktion unverändert durch', async () => {
    state.invoke = async () => ({
      error: { name: 'FunctionsHttpError', message: 'x', context: { status: 401, json: async () => ({ ok: false, error: { code: 'forbidden', message: 'Nicht angemeldet.' } }) } },
    });
    const b = createSupabaseBackend({ url: 'https://x.supabase.co', anonKey: 'k' });
    expect(message(await b.request(req))).toBe('Nicht angemeldet.');
  });
});
