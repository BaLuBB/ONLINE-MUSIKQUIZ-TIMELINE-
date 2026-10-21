import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { PublicState } from '@engine/types.ts';
import type { ServerResponse } from '@engine/server.ts';
import { networkError, type Backend, type SubscribeHandlers } from './types.ts';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
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
          throw error;
        }
      }
    })());

  return {
    mode: 'online',

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
          return networkError('Der Spielserver ist nicht erreichbar.');
        }
        return data as ServerResponse;
      } catch {
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
