import { DemoResolver, FallbackResolver, ItunesResolver, type AudioResolver } from '@engine/audio.ts';
import { randomId } from '@engine/rng.ts';
import { createGameServer, type RoomRecord } from '@engine/server.ts';
import type { PublicState, Song } from '@engine/types.ts';
import { LocalStorageStore, localChannel } from './localStore.ts';
import type { Backend, SubscribeHandlers } from './types.ts';

const UID_KEY = 'timeline.local.uid';

/** Jeder Tab ist ein eigener „Spieler“ (sessionStorage) – so lassen sich mehrere Tabs testen. */
function localUid(): string {
  try {
    let uid = sessionStorage.getItem(UID_KEY);
    if (!uid) {
      uid = randomId('local');
      sessionStorage.setItem(UID_KEY, uid);
    }
    return uid;
  } catch {
    return 'local-fallback';
  }
}

let songsPromise: Promise<readonly Song[]> | null = null;
// Die Bibliothek wird nur im lokalen Modus nachgeladen (eigener Chunk) – im Online-Modus
// gelangt sie nie in den Browser.
const loadSongs = () => (songsPromise ??= import('@engine/songs.ts').then((m) => m.SONGS));

/**
 * Testmodus-Audio: echte 30-s-Vorschauen über die iTunes Search API (läuft direkt im Browser),
 * mit automatischem Rückfall auf Demo-Töne. VITE_LOCAL_AUDIO=demo erzwingt Demo-Töne (z. B. für Tests).
 * Hinweis: Im lokalen Modus ist ohnehin alles im Browser einsehbar – die Geheimhaltung gilt nur online.
 */
function localAudio(): AudioResolver {
  const demo = new DemoResolver();
  if (import.meta.env.VITE_LOCAL_AUDIO === 'demo') return demo;
  return new FallbackResolver(new ItunesResolver('DE'), demo);
}

export function createLocalBackend(): Backend {
  const store = new LocalStorageStore();
  const uid = localUid();
  const server = createGameServer({
    store,
    songs: loadSongs,
    audio: localAudio(),
  });

  return {
    mode: 'local',
    request: (req) => server.handle(uid, req),
    async fetchState(roomId) {
      const rec: RoomRecord | null = await store.getById(roomId);
      return rec?.state ?? null;
    },
    subscribe(roomId, playerId, h: SubscribeHandlers) {
      const lastHello = new Map<string, number>();
      const emitPresence = () => {
        const now = Date.now();
        const set = new Set<string>([playerId]);
        for (const [id, t] of lastHello) if (now - t < 7000) set.add(id);
        h.onPresence(set);
      };
      const push = async () => {
        const st: PublicState | null = await store.getById(roomId).then((r) => r?.state ?? null);
        if (st) h.onState(st);
        else h.onClosed();
      };
      const hello = () => localChannel()?.postMessage({ type: 'hello', roomId, playerId });
      const onMsg = (ev: MessageEvent) => {
        const d = ev.data as { type: string; roomId: string; playerId?: string; closed?: boolean };
        if (d.roomId !== roomId) return;
        if (d.type === 'room') void push();
        if (d.type === 'hello' && d.playerId) {
          const isNew = !lastHello.has(d.playerId);
          lastHello.set(d.playerId, Date.now());
          if (isNew) hello(); // neuen Tab sofort begrüßen, damit er uns nicht als „getrennt“ sieht
          emitPresence();
        }
        if (d.type === 'bye' && d.playerId) {
          lastHello.delete(d.playerId);
          emitPresence();
        }
      };
      localChannel()?.addEventListener('message', onMsg);
      hello();
      const iv = setInterval(() => {
        hello();
        emitPresence();
      }, 2500);
      const bye = () => localChannel()?.postMessage({ type: 'bye', roomId, playerId });
      window.addEventListener('pagehide', bye);
      h.onStatus('online');
      emitPresence();
      return () => {
        clearInterval(iv);
        bye();
        window.removeEventListener('pagehide', bye);
        localChannel()?.removeEventListener('message', onMsg);
      };
    },
  };
}
