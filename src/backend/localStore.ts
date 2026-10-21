// Lokaler Entwicklungsmodus: Räume liegen im localStorage dieses Browsers und werden zwischen
// Tabs per BroadcastChannel synchronisiert. KEIN echtes Online-Spiel und NICHT manipulationssicher
// (Geheimnisse liegen im selben Browser). Nur zum Testen ohne Backend gedacht.

import type { CommitPatch, RoomRecord, RoomStore } from '@engine/server.ts';
import type { GameEvent } from '@engine/types.ts';

const PREFIX = 'timeline.local.room.';

const read = (id: string): RoomRecord | null => {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    return raw ? (JSON.parse(raw) as RoomRecord) : null;
  } catch {
    return null;
  }
};
const write = (rec: RoomRecord): void => localStorage.setItem(PREFIX + rec.id, JSON.stringify(rec));

function allRooms(): RoomRecord[] {
  const out: RoomRecord[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX)) {
      const r = read(k.slice(PREFIX.length));
      if (r) out.push(r);
    }
  }
  return out;
}

async function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('timeline-local-store', async () => fn());
  }
  return fn();
}

let channel: BroadcastChannel | null | undefined;
export function localChannel(): BroadcastChannel | null {
  if (channel === undefined) channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('timeline-local') : null;
  return channel;
}
export const notifyRoom = (roomId: string, closed = false): void => localChannel()?.postMessage({ type: 'room', roomId, closed });

export class LocalStorageStore implements RoomStore {
  async findByCode(code: string) {
    return allRooms().find((r) => r.code === code) ?? null;
  }
  async getById(id: string) {
    return read(id);
  }
  async insert(rec: RoomRecord, _events: GameEvent[]) {
    return withLock(() => {
      // Verwaiste Testräume (älter als 6 h) wegräumen
      for (const r of allRooms()) if (rec.createdAt - r.state.updatedAt > 6 * 3600_000) localStorage.removeItem(PREFIX + r.id);
      if (allRooms().some((r) => r.code === rec.code)) return 'code_taken' as const;
      write(rec);
      notifyRoom(rec.id);
      return 'ok' as const;
    });
  }
  async commit(rec: RoomRecord, patch: CommitPatch) {
    return withLock(() => {
      const cur = read(rec.id);
      if (!cur || cur.version !== rec.version) return false;
      cur.version = patch.state.version;
      cur.state = patch.state;
      cur.secret = patch.secret;
      for (const m of patch.addMembers) cur.members.push({ playerId: m.playerId, uid: m.uid });
      cur.members = cur.members.filter((m) => !patch.removePlayerIds.includes(m.playerId));
      write(cur);
      notifyRoom(cur.id);
      return true;
    });
  }
  async touch(roomId: string, playerId: string, now: number) {
    await withLock(() => {
      const cur = read(roomId);
      if (!cur) return;
      cur.lastSeen[playerId] = now;
      write(cur);
    });
  }
  async countCreatedSince(uid: string, since: number) {
    return allRooms().filter((r) => r.createdBy === uid && r.createdAt >= since).length;
  }
  async remove(roomId: string) {
    localStorage.removeItem(PREFIX + roomId);
    notifyRoom(roomId, true);
  }
}
