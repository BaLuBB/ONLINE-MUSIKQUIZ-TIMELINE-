// Server-Kern: Authentifizierte Anfragen → Engine → persistieren (Compare-and-Swap auf `version`).
// Wird von der Supabase Edge Function, vom lokalen Entwicklungsmodus und von den Tests verwendet.
// Der Kern kennt weder HTTP noch Supabase – nur das `RoomStore`-Interface.

import { DemoResolver, type AudioResolver } from './audio.ts';
import { createRoom, reduce, sanitizeName } from './engine.ts';
import { generateRoomCode, normalizeRoomCode, randomId, secureRng, type Rng } from './rng.ts';
import type {
  Action,
  AudioPlayback,
  ClientActionType,
  GameError,
  GameEvent,
  PublicState,
  SecretState,
  Settings,
  Song,
} from './types.ts';

// ───────────────────────── Persistenz-Interface ─────────────────────────

export interface RoomRecord {
  id: string;
  code: string;
  version: number;
  state: PublicState;
  secret: SecretState;
  /** Zuordnung anonyme Sitzung (uid) → Spieler-ID. Nie öffentlich. */
  members: { playerId: string; uid: string }[];
  lastSeen: Record<string, number>;
  createdBy: string;
  createdAt: number;
}

export interface CommitPatch {
  state: PublicState;
  secret: SecretState;
  addMembers: { playerId: string; uid: string; name: string; joinedAt: number }[];
  removePlayerIds: string[];
  events: GameEvent[];
}

export interface RoomStore {
  findByCode(code: string): Promise<RoomRecord | null>;
  getById(id: string): Promise<RoomRecord | null>;
  /** Legt einen Raum an. 'code_taken', wenn der Code schon existiert. */
  insert(rec: RoomRecord, events: GameEvent[]): Promise<'ok' | 'code_taken'>;
  /** Compare-and-Swap: nur erfolgreich, wenn `rec.version` noch aktuell ist. */
  commit(rec: RoomRecord, patch: CommitPatch): Promise<boolean>;
  touch(roomId: string, playerId: string, now: number): Promise<void>;
  countCreatedSince(uid: string, since: number): Promise<number>;
  remove(roomId: string): Promise<void>;
}

// ───────────────────────── Anfragen / Antworten ─────────────────────────

export type ClientAction = Exclude<Action, { type: 'join' } | { type: 'reroll' }>;

export type ServerRequest =
  | { type: 'create'; name: string; settings?: Partial<Settings> }
  | { type: 'join'; code: string; name: string }
  | { type: 'action'; roomId: string; action: ClientAction; actionId?: string }
  | { type: 'heartbeat'; roomId: string }
  | { type: 'sync'; roomId: string };

export type ServerResponse =
  | {
      ok: true;
      roomId: string;
      code: string;
      playerId: string;
      state: PublicState | null;
      /** Nur für den aktiven Spieler bei draw/audio/replay. */
      audio?: AudioPlayback;
      left?: boolean;
    }
  | { ok: false; error: GameError };

const CLIENT_ACTIONS: ReadonlySet<ClientActionType> = new Set([
  'leave',
  'kick',
  'updateSettings',
  'start',
  'restart',
  'toLobby',
  'draw',
  'audio',
  'replay',
  'guess',
  'place',
  'nextTurn',
  'skipTurn',
  'claimHost',
]);

// ───────────────────────── Rate Limiter ─────────────────────────

/** Einfacher Token-Bucket pro Schlüssel (best effort pro Server-Instanz). */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(private now: () => number) {}

  allow(key: string, capacity: number, perSeconds: number): boolean {
    const t = this.now();
    const refillPerMs = capacity / (perSeconds * 1000);
    const b = this.buckets.get(key) ?? { tokens: capacity, at: t };
    b.tokens = Math.min(capacity, b.tokens + (t - b.at) * refillPerMs);
    b.at = t;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > 5000) this.prune(t);
    return ok;
  }

  private prune(t: number): void {
    for (const [k, b] of this.buckets) if (t - b.at > 120_000) this.buckets.delete(k);
  }
}

// ───────────────────────── Server ─────────────────────────

export const SERVER_LIMITS = {
  /** Heartbeat älter als dies → Spieler gilt als getrennt. */
  staleMs: 35_000,
  roomTtlMs: 6 * 3600_000,
  roomsPerHour: 8,
  casRetries: 5,
} as const;

export interface ServerDeps {
  store: RoomStore;
  songs: () => Promise<readonly Song[]> | readonly Song[];
  audio: AudioResolver;
  now?: () => number;
  rng?: Rng;
}

export interface GameServer {
  handle(uid: string, req: ServerRequest): Promise<ServerResponse>;
}

const fail = (code: GameError['code'], message: string): ServerResponse => ({ ok: false, error: { code, message } });

export function createGameServer(deps: ServerDeps): GameServer {
  const now = deps.now ?? (() => Date.now());
  const rng = deps.rng ?? secureRng;
  const limiter = new RateLimiter(now);
  const demo = new DemoResolver();
  const { store } = deps;

  const staleIds = (rec: RoomRecord): string[] =>
    rec.state.players
      .filter((p) => now() - (rec.lastSeen[p.id] ?? rec.state.updatedAt) > SERVER_LIMITS.staleMs)
      .map((p) => p.id);

  async function audioFor(songId: string, songs: readonly Song[]): Promise<AudioPlayback> {
    const song = songs.find((s) => s.id === songId);
    if (!song) return { kind: 'none', provider: 'none', reason: 'Song nicht gefunden.' };
    return deps.audio.resolve(song);
  }

  async function create(uid: string, req: Extract<ServerRequest, { type: 'create' }>): Promise<ServerResponse> {
    if (!limiter.allow(`create:${uid}`, 3, 60)) return fail('rate_limited', 'Zu viele Anfragen. Bitte warte einen Moment.');
    const name = sanitizeName(req.name);
    if (!name) return fail('name_invalid', 'Bitte gib einen Spielernamen ein.');
    if ((await store.countCreatedSince(uid, now() - 3600_000)) >= SERVER_LIMITS.roomsPerHour) {
      return fail('rate_limited', 'Du hast in kurzer Zeit zu viele Räume erstellt. Bitte versuche es später erneut.');
    }
    const songs = await deps.songs();
    for (let attempt = 0; attempt < 8; attempt++) {
      const roomId = randomId('r', rng);
      const playerId = randomId('p', rng);
      const code = generateRoomCode(rng);
      const created = createRoom({
        roomId,
        code,
        hostId: playerId,
        hostName: name,
        settings: req.settings,
        now: now(),
        songs,
      });
      if (!created.ok) return { ok: false, error: created.error };
      const rec: RoomRecord = {
        id: roomId,
        code,
        version: 1,
        state: created.state,
        secret: created.secret,
        members: [{ playerId, uid }],
        lastSeen: { [playerId]: now() },
        createdBy: uid,
        createdAt: now(),
      };
      const res = await store.insert(rec, created.events);
      if (res === 'ok') return { ok: true, roomId, code, playerId, state: rec.state };
    }
    return fail('internal', 'Es konnte kein freier Raumcode erzeugt werden.');
  }

  async function join(uid: string, req: Extract<ServerRequest, { type: 'join' }>): Promise<ServerResponse> {
    if (!limiter.allow(`join:${uid}`, 10, 60)) return fail('rate_limited', 'Zu viele Versuche. Bitte warte einen Moment.');
    const code = normalizeRoomCode(req.code ?? '');
    if (code.length < 4) return fail('invalid_code', 'Dieser Raumcode ist ungültig.');
    const songs = await deps.songs();

    for (let attempt = 0; attempt < SERVER_LIMITS.casRetries; attempt++) {
      const rec = await store.findByCode(code);
      if (!rec) return fail('invalid_code', 'Diesen Raum gibt es nicht. Prüfe den Code.');
      if (isExpired(rec)) {
        await store.remove(rec.id);
        return fail('room_expired', 'Diese Lobby ist abgelaufen.');
      }
      // Wiedereintritt derselben Sitzung (Reconnect) – auch während eines laufenden Spiels.
      const existing = rec.members.find((m) => m.uid === uid);
      if (existing && rec.state.players.some((p) => p.id === existing.playerId)) {
        await store.touch(rec.id, existing.playerId, now());
        return { ok: true, roomId: rec.id, code: rec.code, playerId: existing.playerId, state: rec.state };
      }
      if (rec.state.phase !== 'waiting') {
        return fail('game_running', 'Das Spiel läuft bereits. Beitritt ist nur vor dem Start möglich.');
      }
      const playerId = randomId('p', rng);
      const res = reduce(rec.state, rec.secret, { type: 'join', playerId, name: req.name }, playerId, {
        now: now(),
        rng,
        songs,
      });
      if (!res.ok) return { ok: false, error: res.error };
      const next = { ...res.state, version: rec.version + 1 };
      const ok = await store.commit(rec, {
        state: next,
        secret: res.secret,
        addMembers: [{ playerId, uid, name: sanitizeName(req.name), joinedAt: now() }],
        removePlayerIds: [],
        events: res.events,
      });
      if (ok) {
        await store.touch(rec.id, playerId, now());
        return { ok: true, roomId: rec.id, code: rec.code, playerId, state: next };
      }
    }
    return fail('conflict', 'Die Lobby hat sich gerade geändert. Bitte versuche es erneut.');
  }

  function isExpired(rec: RoomRecord): boolean {
    return now() - rec.state.updatedAt > SERVER_LIMITS.roomTtlMs;
  }

  /** Server-getriebene Hygiene: neuen Host bestimmen, Zug getrennter Spieler überspringen. */
  function housekeepingAction(rec: RoomRecord, playerId: string): Action | null {
    const stale = staleIds(rec);
    const { state } = rec;
    // Nur der am längsten anwesende, verbundene Spieler führt die Hygiene aus – vermeidet Wettläufe.
    const lead = [...state.players].filter((p) => !stale.includes(p.id)).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (!lead || lead.id !== playerId) return null;
    if (stale.includes(state.hostId)) return { type: 'claimHost' };
    if (state.turn && stale.includes(state.turn.playerId) && state.turn.playerId !== playerId) {
      if (state.phase === 'playing') return { type: 'skipTurn' };
      if (state.phase === 'resolving_turn') return { type: 'nextTurn' };
    }
    return null;
  }

  async function mutate(
    uid: string,
    roomId: string,
    makeAction: (rec: RoomRecord, playerId: string) => Action | null,
    actionId?: string,
  ): Promise<ServerResponse> {
    const songs = await deps.songs();
    for (let attempt = 0; attempt < SERVER_LIMITS.casRetries; attempt++) {
      const rec = await store.getById(roomId);
      if (!rec) return fail('room_expired', 'Diese Lobby existiert nicht mehr.');
      const member = rec.members.find((m) => m.uid === uid);
      if (!member || !rec.state.players.some((p) => p.id === member.playerId)) {
        return fail('not_member', 'Du bist nicht Teil dieses Raums.');
      }
      if (isExpired(rec)) {
        await store.remove(rec.id);
        return fail('room_expired', 'Diese Lobby ist abgelaufen.');
      }
      const action = makeAction(rec, member.playerId);
      if (!action) return { ok: true, roomId: rec.id, code: rec.code, playerId: member.playerId, state: rec.state };

      const ctx = { now: now(), rng, songs, staleIds: staleIds(rec), actionId };
      let res = reduce(rec.state, rec.secret, action, member.playerId, ctx);
      if (!res.ok) return { ok: false, error: res.error };

      // Audio auflösen; bei nicht abspielbaren Songs bis zu 3× neu ziehen.
      let audio: AudioPlayback | undefined;
      if (res.reply.songId && (action.type === 'draw' || action.type === 'audio' || action.type === 'replay')) {
        const events = [...res.events];
        let songId = res.reply.songId;
        audio = await audioFor(songId, songs);
        for (let tries = 0; audio.kind === 'none' && action.type === 'draw' && tries < 3; tries++) {
          const again = reduce(res.state, res.secret, { type: 'reroll' }, member.playerId, { ...ctx, actionId: undefined });
          if (!again.ok || !again.reply.songId) break;
          events.push(...again.events);
          res = { ...again, events, changed: true, duplicate: false };
          songId = again.reply.songId;
          audio = await audioFor(songId, songs);
        }
        if (audio.kind === 'none') {
          // Letzte Rückfalloption: klar gekennzeichneter Testton, damit das Spiel weitergehen kann.
          const song = songs.find((s) => s.id === songId);
          audio = song ? await demo.resolve(song) : audio;
          if (audio.kind === 'synth') audio = { ...audio, attribution: 'Testton – Vorschau war nicht verfügbar' };
        }
      }

      if (!res.changed) {
        return { ok: true, roomId: rec.id, code: rec.code, playerId: member.playerId, state: rec.state, audio };
      }

      const next: PublicState = { ...res.state, version: rec.version + 1 };
      const removed = action.type === 'leave' ? [member.playerId] : action.type === 'kick' ? [action.targetId] : [];
      const ok = await store.commit(rec, {
        state: next,
        secret: res.secret,
        addMembers: [],
        removePlayerIds: removed,
        events: res.events,
      });
      if (!ok) continue; // veraltet → neu laden und erneut versuchen

      if (next.players.length === 0) {
        await store.remove(rec.id);
        return { ok: true, roomId: rec.id, code: rec.code, playerId: member.playerId, state: null, left: true };
      }
      return {
        ok: true,
        roomId: rec.id,
        code: rec.code,
        playerId: member.playerId,
        state: action.type === 'leave' ? null : next,
        left: action.type === 'leave' ? true : undefined,
        audio,
      };
    }
    return fail('conflict', 'Der Spielzustand hat sich gerade geändert. Bitte versuche es erneut.');
  }

  async function handle(uid: string, req: ServerRequest): Promise<ServerResponse> {
    if (!uid) return fail('forbidden', 'Nicht angemeldet.');
    if (!limiter.allow(`any:${uid}`, 40, 10)) return fail('rate_limited', 'Zu viele Anfragen. Bitte warte einen Moment.');
    try {
      switch (req.type) {
        case 'create':
          return await create(uid, req);
        case 'join':
          return await join(uid, req);
        case 'sync':
          return await mutate(uid, req.roomId, () => null);
        case 'heartbeat': {
          let rec = await store.getById(req.roomId);
          const member = rec?.members.find((m) => m.uid === uid);
          if (!rec || !member) return fail('not_member', 'Du bist nicht Teil dieses Raums.');
          await store.touch(rec.id, member.playerId, now());
          let last: ServerResponse | null = null;
          // Hygiene kann mehrere Schritte brauchen (z. B. erst Host übernehmen, dann Zug überspringen).
          for (let i = 0; i < 3; i++) {
            rec = await store.getById(req.roomId);
            if (!rec) break;
            if (!housekeepingAction(rec, member.playerId)) break;
            last = await mutate(uid, req.roomId, (r, pid) => housekeepingAction(r, pid));
            if (!last.ok) break;
          }
          if (last) return last;
          return rec
            ? { ok: true, roomId: rec.id, code: rec.code, playerId: member.playerId, state: rec.state }
            : fail('room_expired', 'Diese Lobby existiert nicht mehr.');
        }
        case 'action': {
          const type = req.action?.type as ClientActionType;
          if (!CLIENT_ACTIONS.has(type)) return fail('unknown_action', 'Unbekannte Aktion.');
          if (req.actionId !== undefined && (typeof req.actionId !== 'string' || req.actionId.length > 64)) {
            return fail('unknown_action', 'Ungültige Aktions-ID.');
          }
          return await mutate(uid, req.roomId, () => req.action, req.actionId);
        }
        default:
          return fail('unknown_action', 'Unbekannte Anfrage.');
      }
    } catch (e) {
      console.error('server error', e);
      return fail('internal', 'Interner Fehler. Bitte versuche es erneut.');
    }
  }

  return { handle };
}
