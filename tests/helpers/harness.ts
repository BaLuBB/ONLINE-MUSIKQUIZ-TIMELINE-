import { DemoResolver } from '@engine/audio.ts';
import { seededRng } from '@engine/rng.ts';
import { createGameServer, type ClientAction, type ServerResponse } from '@engine/server.ts';
import type { PublicState, Song } from '@engine/types.ts';
import { MemoryStore } from './memoryStore.ts';

export function testSongs(n = 60): Song[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    title: `Titel Nummer ${i}`,
    artist: `Interpret ${i}`,
    releaseYear: 1960 + i,
    genres: [i % 2 === 0 ? 'pop' : 'rock', ...(i % 5 === 0 ? ['jazz'] : [])],
    audioProvider: 'demo' as const,
    audioId: null,
    duration: 30,
    available: true,
  }));
}

export interface Harness {
  store: MemoryStore;
  clock: { t: number };
  advance(ms: number): void;
  client(uid: string): Client;
  secretOf(roomId: string): import('@engine/types.ts').SecretState;
  server: ReturnType<typeof createGameServer>;
}

export interface Client {
  uid: string;
  create(name: string, settings?: Record<string, unknown>): Promise<ServerResponse>;
  join(code: string, name: string): Promise<ServerResponse>;
  act(roomId: string, action: ClientAction, actionId?: string): Promise<ServerResponse>;
  heartbeat(roomId: string): Promise<ServerResponse>;
  sync(roomId: string): Promise<ServerResponse>;
}

export function makeHarness(songs: Song[] = testSongs(), seed = 1): Harness {
  const store = new MemoryStore();
  const clock = { t: 1_700_000_000_000 };
  const server = createGameServer({
    store,
    songs: () => songs,
    audio: new DemoResolver(),
    now: () => clock.t,
    rng: seededRng(seed),
  });
  return {
    store,
    clock,
    server,
    advance: (ms) => void (clock.t += ms),
    secretOf: (roomId) => store.rooms.get(roomId)!.secret,
    client: (uid) => {
      // Jede Anfrage dauert 300 ms Spielzeit, damit die Rate-Limits realistisch auffüllen.
      const call = (req: Parameters<typeof server.handle>[1]) => {
        clock.t += 300;
        return server.handle(uid, req);
      };
      return {
        uid,
        create: (name, settings) => call({ type: 'create', name, settings: settings as never }),
        join: (code, name) => call({ type: 'join', code, name }),
        act: (roomId, action, actionId) => call({ type: 'action', roomId, action, actionId }),
        heartbeat: (roomId) => call({ type: 'heartbeat', roomId }),
        sync: (roomId) => call({ type: 'sync', roomId }),
      };
    },
  };
}

export function okState(res: ServerResponse): PublicState {
  if (!res.ok) throw new Error(`Erwartet ok, erhielt ${res.error.code}: ${res.error.message}`);
  if (!res.state) throw new Error('kein State');
  return res.state;
}

export function expectErr(res: ServerResponse, code: string): void {
  if (res.ok) throw new Error(`Erwartet Fehler ${code}, aber ok`);
  if (res.error.code !== code) throw new Error(`Erwartet ${code}, erhielt ${res.error.code}`);
}

export const posFor = (timeline: { year: number }[], year: number): number => {
  let i = 0;
  while (i < timeline.length && timeline[i].year < year) i++;
  return i;
};

/** Eine Position, die garantiert falsch ist (oder null, falls es keine gibt). */
export function wrongPosFor(timeline: { year: number }[], year: number): number | null {
  for (let p = 0; p <= timeline.length; p++) {
    const l = timeline[p - 1];
    const r = timeline[p];
    if ((l && year < l.year) || (r && year > r.year)) return p;
  }
  return null;
}

export interface Room {
  h: Harness;
  host: Client;
  guest: Client;
  roomId: string;
  code: string;
  hostPid: string;
  guestPid: string;
}

/** Erstellt einen Raum mit Host + Gast und startet optional das Spiel. */
export async function setupRoom(
  h: Harness,
  settings: Record<string, unknown> = {},
  start = true,
): Promise<Room> {
  const host = h.client('uid-host');
  const guest = h.client('uid-guest');
  const created = await host.create('Anna', { genres: ['pop', 'rock'], ...settings });
  if (!created.ok) throw new Error(created.error.message);
  const joined = await guest.join(created.code.toLowerCase(), 'Ben');
  if (!joined.ok) throw new Error(joined.error.message);
  if (start) okState(await host.act(created.roomId, { type: 'start' }));
  return { h, host, guest, roomId: created.roomId, code: created.code, hostPid: created.playerId, guestPid: joined.playerId };
}

/** Der aktive Spieler zieht, und liefert Client + Songdaten (Test-Zugriff auf das Geheimnis). */
export async function drawCurrent(room: Room) {
  const st = okState(await room.host.sync(room.roomId));
  const active = st.turn!.playerId === room.hostPid ? room.host : room.guest;
  const res = await active.act(room.roomId, { type: 'draw' });
  const state = okState(res);
  const cur = room.h.secretOf(room.roomId).current!;
  const song = testSongs(60).find((s) => s.id === cur.songId)!;
  const me = state.players.find((p) => p.id === state.turn!.playerId)!;
  return { active, state, song, me, res };
}
