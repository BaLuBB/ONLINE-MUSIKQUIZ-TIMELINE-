// RoomStore-Implementierung auf Basis der Postgres-Funktionen aus supabase/migrations/0001_init.sql.
// Bewusst ohne direkte npm-Imports: Der Client wird von außen übergeben (Edge Function: service_role).

import type { CommitPatch, RoomRecord, RoomStore } from './server.ts';
import type { GameEvent } from './types.ts';

export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

async function call<T>(client: RpcClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

interface LoadedRoom {
  id: string;
  code: string;
  version: number;
  state: RoomRecord['state'];
  secret: RoomRecord['secret'];
  createdBy: string;
  createdAt: number;
  members: { playerId: string; uid: string }[];
  lastSeen: Record<string, number>;
}

const toRecord = (r: LoadedRoom | null): RoomRecord | null =>
  r
    ? {
        id: r.id,
        code: r.code,
        version: r.version,
        state: r.state,
        secret: r.secret,
        members: r.members ?? [],
        lastSeen: r.lastSeen ?? {},
        createdBy: r.createdBy,
        createdAt: r.createdAt,
      }
    : null;

export function createSupabaseStore(client: RpcClient): RoomStore {
  return {
    async findByCode(code) {
      return toRecord(await call<LoadedRoom | null>(client, 'load_room', { p_code: code, p_id: null }));
    },
    async getById(id) {
      return toRecord(await call<LoadedRoom | null>(client, 'load_room', { p_code: null, p_id: id }));
    },
    async insert(rec: RoomRecord, events: GameEvent[]) {
      const host = rec.state.players[0];
      const res = await call<string>(client, 'insert_room', {
        p_id: rec.id,
        p_code: rec.code,
        p_state: rec.state,
        p_secret: rec.secret,
        p_created_by: rec.createdBy,
        p_host_player: host.id,
        p_host_name: host.name,
        p_events: events,
      });
      return res === 'ok' ? 'ok' : 'code_taken';
    },
    async commit(rec: RoomRecord, patch: CommitPatch) {
      return call<boolean>(client, 'commit_room', {
        p_room: rec.id,
        p_expected: rec.version,
        p_state: patch.state,
        p_secret: patch.secret,
        p_add: patch.addMembers,
        p_remove: patch.removePlayerIds,
        p_events: patch.events,
      });
    },
    async touch(roomId, playerId) {
      await call<void>(client, 'touch_player', { p_room: roomId, p_player: playerId });
    },
    async countCreatedSince(uid, since) {
      return call<number>(client, 'count_rooms_created', { p_uid: uid, p_since: new Date(since).toISOString() });
    },
    async remove(roomId) {
      // Die Fremdschlüssel-Kaskade löscht Spieler, Geheimnisse, Partien und Ereignisse mit.
      await call<number>(client, 'delete_room', { p_room: roomId });
    },
  };
}
