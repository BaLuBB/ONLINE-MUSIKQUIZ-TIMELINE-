// Direktverbindungs-Modus (P2P): Mehrspieler über mehrere Geräte OHNE eigenes Backend.
//
// Der Browser des Hosts führt den Server-Kern aus (Spiellogik, Geheimnisse) und hält den Raum;
// die Mitspieler verbinden sich per WebRTC (PeerJS) direkt mit ihm. Das PeerJS-Signalisierungs-
// netz (standardmäßig der kostenlose PeerJS-Cloud-Broker) vermittelt nur den Verbindungsaufbau.
//
// Grenzen (siehe README): Der Host muss die Seite geöffnet lassen; es gibt keinen Host-Wechsel;
// der Host-Browser kennt alle Geheimnisse (kein Schutz gegen einen manipulierenden Host);
// manche Netze (strenge NAT/Firmennetze) blockieren WebRTC.

import { Peer, type DataConnection, type PeerOptions } from 'peerjs';
import { DemoResolver, FallbackResolver, ItunesResolver } from '@engine/audio.ts';
import { randomId } from '@engine/rng.ts';
import { createGameServer, type GameServer, type ServerRequest, type ServerResponse } from '@engine/server.ts';
import type { PublicState, Song } from '@engine/types.ts';
import { LocalStorageStore } from './localStore.ts';
import { networkError, type Backend, type ConnectionStatus, type SubscribeHandlers } from './types.ts';

const PEER_PREFIX = 'tl-';
const UID_KEY = 'timeline.p2p.uid';
const ROLE_KEY = 'timeline.p2p.role';

type ToHost = { t: 'req'; rid: number; uid: string; req: ServerRequest } | { t: 'hello'; uid: string };
type ToClient =
  | { t: 'res'; rid: number; res: ServerResponse }
  | { t: 'state'; state: PublicState }
  | { t: 'presence'; ids: string[] }
  | { t: 'closed' };

interface Role {
  role: 'host' | 'client';
  code: string;
  roomId: string;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignorieren */
  }
}

/** Jeder Tab/jedes Gerät hat eine eigene geheime Kennung; sie wird nie an andere Spieler gesendet. */
function myUid(): string {
  let uid: string | null = null;
  try {
    uid = sessionStorage.getItem(UID_KEY);
  } catch {
    /* ignorieren */
  }
  if (!uid) {
    uid = randomId('p2p', undefined);
    uid += randomId('', undefined);
    try {
      sessionStorage.setItem(UID_KEY, uid);
    } catch {
      /* ignorieren */
    }
  }
  return uid;
}

function peerOptions(): PeerOptions {
  const env = import.meta.env;
  const opts: PeerOptions = { debug: 0 };
  if (env.VITE_PEER_HOST) {
    opts.host = env.VITE_PEER_HOST;
    if (env.VITE_PEER_PORT) opts.port = Number(env.VITE_PEER_PORT);
    if (env.VITE_PEER_PATH) opts.path = env.VITE_PEER_PATH;
    opts.secure = env.VITE_PEER_SECURE === 'true';
  }
  if (env.VITE_ICE_SERVERS) {
    try {
      opts.config = { iceServers: JSON.parse(env.VITE_ICE_SERVERS) };
    } catch {
      /* ungültiges JSON → Standard */
    }
  }
  return opts;
}

let songsPromise: Promise<readonly Song[]> | null = null;
const loadSongs = () => (songsPromise ??= import('@engine/songs.ts').then((m) => m.SONGS));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, peerOptions()) : new Peer(peerOptions());
    const timer = setTimeout(() => {
      peer.destroy();
      reject(Object.assign(new Error('Signalserver nicht erreichbar'), { type: 'timeout' }));
    }, 12000);
    const onError = (e: unknown) => {
      clearTimeout(timer);
      peer.destroy();
      reject(e);
    };
    peer.once('error', onError);
    peer.once('open', () => {
      clearTimeout(timer);
      peer.off('error', onError); // spätere Fehler (z. B. peer-unavailable) dürfen den Peer nicht zerstören
      resolve(peer);
    });
  });
}

export function createP2PBackend(): Backend {
  const uid = myUid();
  const handlers = new Set<SubscribeHandlers>();
  const emit = {
    state: (s: PublicState) => handlers.forEach((h) => h.onState(s)),
    presence: (ids: Set<string>) => handlers.forEach((h) => h.onPresence(ids)),
    status: (s: ConnectionStatus) => handlers.forEach((h) => h.onStatus(s)),
    closed: () => handlers.forEach((h) => h.onClosed()),
  };

  // ───────────── Host ─────────────
  let hostPeer: Peer | null = null;
  let server: GameServer | null = null;
  let store: LocalStorageStore | null = null;
  const conns = new Map<DataConnection, { uid: string }>();
  let lastVersion = -1;
  let hostRoomId = '';

  const ensureServer = (): GameServer => {
    store ??= new LocalStorageStore();
    server ??= createGameServer({
      store,
      songs: loadSongs,
      audio:
        import.meta.env.VITE_LOCAL_AUDIO === 'demo'
          ? new DemoResolver()
          : new FallbackResolver(new ItunesResolver('DE'), new DemoResolver()),
    });
    return server;
  };

  const send = (c: DataConnection, msg: ToClient) => {
    try {
      c.send(msg);
    } catch {
      /* Verbindung bereits weg */
    }
  };

  async function broadcast(roomId: string, force = false): Promise<void> {
    if (!store) return;
    const rec = await store.getById(roomId);
    if (!rec) {
      conns.forEach((_, c) => send(c, { t: 'closed' }));
      emit.closed();
      return;
    }
    // Presence: Host + alle verbundenen Mitspieler (Zuordnung Sitzung → Spieler-ID)
    const host = rec.members.find((m) => m.uid === uid);
    const ids = new Set<string>(host ? [host.playerId] : []);
    for (const info of conns.values()) {
      const m = rec.members.find((x) => x.uid === info.uid);
      if (m) ids.add(m.playerId);
    }
    emit.presence(ids);
    conns.forEach((_, c) => send(c, { t: 'presence', ids: [...ids] }));
    if (force || rec.version !== lastVersion) {
      lastVersion = rec.version;
      emit.state(rec.state);
      conns.forEach((_, c) => send(c, { t: 'state', state: rec.state }));
    }
  }

  async function hostHandle(fromUid: string, req: ServerRequest): Promise<ServerResponse> {
    const res = await ensureServer().handle(fromUid, req);
    if (res.ok && res.roomId) void broadcast(res.roomId, res.state === null);
    return res;
  }

  function attachHostPeer(peer: Peer): void {
    hostPeer = peer;
    peer.on('connection', (conn) => {
      conn.on('data', async (raw) => {
        const msg = raw as ToHost;
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'hello' && typeof msg.uid === 'string') {
          conns.set(conn, { uid: msg.uid });
          if (hostRoomId) void broadcast(hostRoomId, true);
          return;
        }
        if (msg.t === 'req' && typeof msg.uid === 'string' && msg.req && typeof msg.req === 'object') {
          conns.set(conn, { uid: msg.uid });
          // Mitspieler dürfen keine Räume erstellen
          const res: ServerResponse =
            msg.req.type === 'create'
              ? { ok: false, error: { code: 'forbidden', message: 'Nicht erlaubt.' } }
              : await hostHandle(msg.uid, msg.req);
          send(conn, { t: 'res', rid: msg.rid, res });
        }
      });
      conn.on('close', () => {
        conns.delete(conn);
        if (hostRoomId) void broadcast(hostRoomId);
      });
      conn.on('error', () => conns.delete(conn));
    });
    peer.on('disconnected', () => {
      // Verbindung zum Signalserver verloren: neu verbinden (bestehende Spieler bleiben verbunden)
      try {
        peer.reconnect();
      } catch {
        /* ignorieren */
      }
    });
  }

  async function startHost(code: string, roomId: string): Promise<boolean> {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const peer = await openPeer(PEER_PREFIX + code);
        hostRoomId = roomId;
        attachHostPeer(peer);
        return true;
      } catch (e) {
        // Nach einem Reload ist die alte Kennung beim Broker kurz noch belegt → warten und erneut versuchen
        if ((e as { type?: string }).type !== 'unavailable-id') return false;
        await wait(1500 * (attempt + 1));
      }
    }
    return false;
  }

  async function hostCreate(req: Extract<ServerRequest, { type: 'create' }>): Promise<ServerResponse> {
    const srv = ensureServer();
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await srv.handle(uid, req);
      if (!res.ok) return res;
      let registered = false;
      try {
        const peer = await openPeer(PEER_PREFIX + res.code);
        hostRoomId = res.roomId;
        attachHostPeer(peer);
        registered = true;
      } catch (e) {
        const type = (e as { type?: string }).type;
        await srv.handle(uid, { type: 'action', roomId: res.roomId, action: { type: 'leave' } });
        if (type !== 'unavailable-id') {
          return networkError('Das Verbindungsnetz (PeerJS) ist nicht erreichbar. Bitte versuche es später erneut.');
        }
      }
      if (registered) {
        writeJson(ROLE_KEY, { role: 'host', code: res.code, roomId: res.roomId } satisfies Role);
        lastVersion = -1;
        emit.status('online');
        return res;
      }
    }
    return networkError('Es konnte kein freier Raumcode reserviert werden.');
  }

  function closeHost(): void {
    conns.forEach((_, c) => {
      send(c, { t: 'closed' });
      setTimeout(() => c.close(), 200);
    });
    conns.clear();
    setTimeout(() => hostPeer?.destroy(), 300);
    hostPeer = null;
    hostRoomId = '';
  }

  // ───────────── Mitspieler ─────────────
  let clientPeer: Peer | null = null;
  let conn: DataConnection | null = null;
  let clientCode = '';
  let rid = 0;
  const pending = new Map<number, (r: ServerResponse) => void>();
  let reconnecting = false;
  let disposedClient = false;

  const failAllPending = () => {
    pending.forEach((resolve) => resolve(networkError('Verbindung zum Host unterbrochen.')));
    pending.clear();
  };

  function attachClientConn(c: DataConnection): void {
    conn = c;
    c.on('data', (raw) => {
      const msg = raw as ToClient;
      if (msg.t === 'res') {
        pending.get(msg.rid)?.(msg.res);
        pending.delete(msg.rid);
      } else if (msg.t === 'state') emit.state(msg.state);
      else if (msg.t === 'presence') emit.presence(new Set(msg.ids));
      else if (msg.t === 'closed') {
        disposedClient = true;
        writeJson(ROLE_KEY, null);
        emit.closed();
      }
    });
    c.on('close', () => {
      if (conn !== c) return;
      conn = null;
      failAllPending();
      if (!disposedClient) {
        emit.status('reconnecting');
        void reconnectLoop();
      }
    });
    c.on('error', () => {
      /* close folgt */
    });
  }

  async function connectToHost(code: string): Promise<{ ok: true } | { ok: false; res: ServerResponse }> {
    clientCode = code;
    try {
      clientPeer?.destroy();
      const peer = await openPeer();
      clientPeer = peer;
      const c = await new Promise<DataConnection>((resolve, reject) => {
        const dc = peer.connect(PEER_PREFIX + code, { reliable: true });
        const timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { type: 'timeout' })), 15000);
        dc.once('open', () => {
          clearTimeout(timer);
          resolve(dc);
        });
        dc.once('error', (e) => {
          clearTimeout(timer);
          reject(e);
        });
        peer.once('error', (e) => {
          clearTimeout(timer);
          reject(e);
        });
      });
      disposedClient = false;
      attachClientConn(c);
      c.send({ t: 'hello', uid } satisfies ToHost);
      return { ok: true };
    } catch (e) {
      const type = (e as { type?: string }).type;
      if (type === 'peer-unavailable') {
        return { ok: false, res: { ok: false, error: { code: 'invalid_code', message: 'Diesen Raum gibt es nicht. Prüfe den Code.' } } };
      }
      return {
        ok: false,
        res: networkError(
          type === 'timeout'
            ? 'Der Host ist nicht erreichbar. Läuft die Seite beim Host noch? (Manche Netze blockieren Direktverbindungen.)'
            : 'Das Verbindungsnetz (PeerJS) ist nicht erreichbar.',
        ),
      };
    }
  }

  async function reconnectLoop(): Promise<void> {
    if (reconnecting) return;
    reconnecting = true;
    for (let i = 0; !disposedClient && !conn; i++) {
      await wait(Math.min(1500 * 2 ** Math.min(i, 3), 15000));
      if (disposedClient || conn) break;
      const r = await connectToHost(clientCode);
      if (r.ok) emit.status('online');
      else if (!r.res.ok && r.res.error.code === 'invalid_code') {
        // Host hat die Seite verlassen oder den Raum beendet
        i = Math.min(i, 6);
        if (i >= 6) {
          emit.closed();
          break;
        }
      }
    }
    reconnecting = false;
  }

  function clientSend(req: ServerRequest): Promise<ServerResponse> {
    return new Promise((resolve) => {
      if (!conn) return resolve(networkError('Keine Verbindung zum Host.'));
      const id = ++rid;
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(networkError('Der Host antwortet nicht.'));
      }, 15000);
      pending.set(id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      try {
        conn.send({ t: 'req', rid: id, uid, req } satisfies ToHost);
      } catch {
        clearTimeout(timer);
        pending.delete(id);
        resolve(networkError());
      }
    });
  }

  function leaveClient(): void {
    disposedClient = true;
    conn?.close();
    conn = null;
    clientPeer?.destroy();
    clientPeer = null;
    writeJson(ROLE_KEY, null);
  }

  /** Nach einem Reload die Rolle (Host/Mitspieler) wiederherstellen. */
  async function restoreRole(): Promise<ServerResponse | null> {
    const role = readJson<Role>(ROLE_KEY);
    if (!role) return null;
    if (role.role === 'host') {
      if (hostPeer) return null;
      ensureServer();
      const rec = await store!.getById(role.roomId);
      if (!rec) {
        writeJson(ROLE_KEY, null);
        return { ok: false, error: { code: 'room_expired', message: 'Diese Lobby existiert nicht mehr.' } };
      }
      emit.status('connecting');
      const ok = await startHost(role.code, role.roomId);
      if (!ok) return networkError('Das Verbindungsnetz (PeerJS) ist nicht erreichbar.');
      emit.status('online');
      return null;
    }
    if (!conn) {
      const r = await connectToHost(role.code);
      if (!r.ok) return r.res;
    }
    return null;
  }

  // ───────────── Backend-Schnittstelle ─────────────
  return {
    mode: 'p2p',

    async request(req) {
      if (req.type === 'create') {
        if (conn || clientPeer) leaveClient();
        return hostCreate(req);
      }
      if (req.type === 'join') {
        if (hostPeer) closeHost();
        leaveClient();
        const code = req.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code.length < 4) return { ok: false, error: { code: 'invalid_code', message: 'Dieser Raumcode ist ungültig.' } };
        const r = await connectToHost(code);
        if (!r.ok) return r.res;
        const res = await clientSend(req);
        if (res.ok) writeJson(ROLE_KEY, { role: 'client', code, roomId: res.roomId } satisfies Role);
        else leaveClient();
        return res;
      }

      const role = readJson<Role>(ROLE_KEY);
      if (!role) return { ok: false, error: { code: 'not_member', message: 'Du bist nicht Teil eines Raums.' } };
      const restoreErr = await restoreRole();
      if (restoreErr) return restoreErr;

      if (role.role === 'host') {
        const res = await hostHandle(uid, req);
        // Verlässt der Host den Raum, endet das Spiel für alle (es gibt keinen Host-Wechsel ohne Server).
        if (req.type === 'action' && req.action.type === 'leave') {
          if (store) await store.remove(role.roomId);
          closeHost();
          writeJson(ROLE_KEY, null);
          return { ok: true, roomId: role.roomId, code: role.code, playerId: '', state: null, left: true };
        }
        return res;
      }
      const res = await clientSend(req);
      if (res.ok && res.left) leaveClient();
      return res;
    },

    async fetchState(roomId) {
      const res = await this.request({ type: 'sync', roomId });
      return res.ok ? res.state : null;
    },

    subscribe(roomId, _playerId, h) {
      handlers.add(h);
      h.onStatus(hostPeer || conn ? 'online' : 'connecting');
      // Aktuellen Stand sofort liefern (Host: aus dem Speicher; Mitspieler: Host antwortet auf „hello“)
      if (hostRoomId === roomId) void broadcast(roomId, true);
      else if (conn) conn.send({ t: 'hello', uid } satisfies ToHost);
      return () => {
        handlers.delete(h);
      };
    },
  };
}
