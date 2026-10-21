import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { PublicState } from '@engine/types.ts';
import type { ServerResponse } from '@engine/server.ts';
import { networkError, type Backend, type SubscribeHandlers } from './types.ts';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** Fehler mit einer für Spieler verständlichen Erklärung. */
class SetupError extends Error {}

const diagLog: string[] = [];
function note(msg: string): void {
  diagLog.push(`${new Date().toISOString().slice(11, 19)} ${msg}`);
  if (diagLog.length > 60) diagLog.shift();
  console.warn('[supabase]', msg);
}

/** Übersetzt Anmeldefehler der anonymen Sitzung in eine konkrete Ursache. */
function explainAuthError(e: { message?: string; status?: number; name?: string }): string {
  const msg = String(e.message ?? '');
  note(`Anmeldung: ${e.name ?? 'Fehler'} ${e.status ?? ''} – ${msg}`);
  if (/anonymous sign-ins are disabled/i.test(msg)) {
    return 'Anonyme Anmeldungen sind in Supabase ausgeschaltet. Dashboard → Authentication → Sign In / Providers → „Allow anonymous sign-ins“ einschalten und speichern.';
  }
  if (/invalid api key|apikey|invalid jwt/i.test(msg) || e.status === 401 || e.status === 403) {
    return 'Der Supabase-Schlüssel (VITE_SUPABASE_ANON_KEY) wird abgelehnt. Prüfe, dass es der „anon“/„publishable“ Key des richtigen Projekts ist.';
  }
  if (e.name === 'AuthRetryableFetchError' || /failed to fetch|network|load failed/i.test(msg) || !e.status) {
    return 'Supabase ist von diesem Gerät/Netz aus nicht erreichbar (supabase.co blockiert?) oder die Adresse (VITE_SUPABASE_URL) stimmt nicht.';
  }
  return `Die anonyme Anmeldung bei Supabase ist fehlgeschlagen (${e.status}): ${msg}`;
}

export function createSupabaseBackend(cfg: SupabaseConfig): Backend {
  const client: SupabaseClient = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 10 } },
  });

  // Anonyme Sitzung: kein Konto, aber eine stabile, nicht erratbare Identität pro Browser.
  let sessionReady: Promise<void> | null = null;
  const ensureSession = (): Promise<void> =>
    (sessionReady ??= (async () => {
      const { data } = await client.auth.getSession();
      if (!data.session) {
        const { error } = await client.auth.signInAnonymously();
        if (error) {
          sessionReady = null;
          throw new SetupError(explainAuthError(error));
        }
      }
    })());

  return {
    mode: 'online',
    diagnostics: () => [...diagLog],

    async request(req) {
      try {
        await ensureSession();
        const { data, error } = await client.functions.invoke('game', { body: req });
        if (error) {
          // Antworten mit Statuscode ≠ 2xx enthalten den Fehlertext im Response-Body
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.json === 'function') {
            try {
              const body = (await ctx.json()) as ServerResponse;
              if (body && body.ok === false) return body;
            } catch {
              /* ignore */
            }
          }
          const status = (ctx as Response | undefined)?.status;
          note(`Funktion „game“: ${(error as Error).name} ${status ?? ''} – ${(error as Error).message}`);
          if (status === 404) return networkError('Die Server-Funktion „game“ ist in Supabase nicht eingespielt (404). Workflow „Supabase einrichten“ erneut ausführen.');
          if (status) return networkError(`Die Server-Funktion antwortet mit Fehler ${status}. Siehe „Technische Details“.`);
          return networkError('Die Server-Funktion ist nicht erreichbar (Netz blockiert supabase.co oder CORS). Siehe „Technische Details“.');
        }
        return data as ServerResponse;
      } catch (e) {
        if (e instanceof SetupError) return networkError(e.message);
        note(`Unerwarteter Fehler: ${(e as Error)?.message ?? e}`);
        return networkError();
      }
    },

    async fetchState(roomId) {
      try {
        await ensureSession();
        const { data, error } = await client.from('rooms').select('state').eq('id', roomId).maybeSingle();
        if (error) return null;
        return (data?.state as PublicState | undefined) ?? null;
      } catch {
        return null;
      }
    },

    subscribe(roomId, playerId, h: SubscribeHandlers) {
      let disposed = false;
      let dbChannel: RealtimeChannel | null = null;
      let presenceChannel: RealtimeChannel | null = null;
      h.onStatus('connecting');

      void ensureSession().then(() => {
        if (disposed) return;
        dbChannel = client
          .channel(`db:${roomId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
            if (payload.eventType === 'DELETE') h.onClosed();
            else h.onState((payload.new as { state: PublicState }).state);
          })
          .subscribe((status) => {
            if (disposed) return;
            if (status === 'SUBSCRIBED') h.onStatus('online');
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') h.onStatus('reconnecting');
            else if (status === 'CLOSED') h.onStatus('offline');
          });

        presenceChannel = client.channel(`presence:${roomId}`, { config: { presence: { key: playerId } } });
        presenceChannel
          .on('presence', { event: 'sync' }, () => {
            h.onPresence(new Set(Object.keys(presenceChannel!.presenceState())));
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') await presenceChannel!.track({ at: Date.now() });
          });
      });

      return () => {
        disposed = true;
        if (dbChannel) void client.removeChannel(dbChannel);
        if (presenceChannel) void client.removeChannel(presenceChannel);
      };
    },
  };
}
