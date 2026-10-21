import type { CommitPatch, RoomRecord, RoomStore } from '@engine/server.ts';
import type { GameEvent } from '@engine/types.ts';

const clone = <T>(v: T): T => structuredClone(v);

/** In-Memory-Implementierung des RoomStore mit Compare-and-Swap – für Tests. */
export class MemoryStore implements RoomStore {
  rooms = new Map<string, RoomRecord>();
  events: { roomId: string; event: GameEvent }[] = [];

  async findByCode(code: string) {
    for (const r of this.rooms.values()) if (r.code === code) return clone(r);
    return null;
  }
  async getById(id: string) {
    const r = this.rooms.get(id);
    return r ? clone(r) : null;
  }
  async insert(rec: RoomRecord, events: GameEvent[]) {
    for (const r of this.rooms.values()) if (r.code === rec.code) return 'code_taken' as const;
    this.rooms.set(rec.id, clone(rec));
    events.forEach((event) => this.events.push({ roomId: rec.id, event }));
    return 'ok' as const;
  }
  async commit(rec: RoomRecord, patch: CommitPatch) {
    const cur = this.rooms.get(rec.id);
    if (!cur || cur.version !== rec.version) return false;
    cur.version = patch.state.version;
    cur.state = clone(patch.state);
    cur.secret = clone(patch.secret);
    for (const m of patch.addMembers) cur.members.push({ playerId: m.playerId, uid: m.uid });
    cur.members = cur.members.filter((m) => !patch.removePlayerIds.includes(m.playerId));
    patch.events.forEach((event) => this.events.push({ roomId: rec.id, event }));
    return true;
  }
  async touch(roomId: string, playerId: string, now: number) {
    const r = this.rooms.get(roomId);
    if (r) r.lastSeen[playerId] = now;
  }
  async countCreatedSince(uid: string, since: number) {
    return [...this.rooms.values()].filter((r) => r.createdBy === uid && r.createdAt >= since).length;
  }
  async remove(roomId: string) {
    this.rooms.delete(roomId);
  }
}
