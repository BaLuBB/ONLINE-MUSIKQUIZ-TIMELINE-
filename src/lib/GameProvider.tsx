import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ClientAction, ServerResponse } from '@engine/server.ts';
import type { AudioPlayback, GameError, PlayerPublic, PublicState, Settings } from '@engine/types.ts';
import { AudioController } from '../audio/AudioController.ts';
import { selectBackend, type BackendSelection } from '../backend/index.ts';
import type { Backend, ConnectionStatus } from '../backend/types.ts';

export interface RoomSession {
  roomId: string;
  code: string;
  playerId: string;
}

export interface Toast {
  id: number;
  tone: 'info' | 'error' | 'success';
  message: string;
}

interface GameContextValue {
  selection: BackendSelection;
  backend: Backend | null;
  resuming: boolean;
  session: RoomSession | null;
  state: PublicState | null;
  presence: Set<string>;
  connection: ConnectionStatus;
  me: PlayerPublic | null;
  isHost: boolean;
  isMyTurn: boolean;
  busy: boolean;
  toasts: Toast[];
  audio: AudioController;
  audioReady: boolean;
  notify(message: string, tone?: Toast['tone']): void;
  dismissToast(id: number): void;
  switchToLocalMode(): void;
  createRoom(name: string, settings: Partial<Settings>): Promise<GameError | null>;
  joinRoom(code: string, name: string): Promise<GameError | null>;
  act(action: ClientAction): Promise<ServerResponse>;
  leave(): Promise<void>;
}

const Ctx = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGame außerhalb des GameProvider');
  return v;
}

const sessionKey = (mode: string) => `timeline.session.${mode}`;
const FORCE_LOCAL_KEY = 'timeline.forceLocal';

function loadSession(mode: string): RoomSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(mode));
    return raw ? (JSON.parse(raw) as RoomSession) : null;
  } catch {
    return null;
  }
}
function saveSession(mode: string, s: RoomSession | null): void {
  try {
    if (s) localStorage.setItem(sessionKey(mode), JSON.stringify(s));
    else localStorage.removeItem(sessionKey(mode));
  } catch {
    /* ignorieren */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function GameProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<BackendSelection>(() => {
    let forceLocal = false;
    try {
      forceLocal = sessionStorage.getItem(FORCE_LOCAL_KEY) === '1';
    } catch {
      /* ignorieren */
    }
    return selectBackend(forceLocal);
  });
  const backend = selection.kind === 'ready' ? selection.backend : null;

  const [session, setSession] = useState<RoomSession | null>(null);
  const [state, setState] = useState<PublicState | null>(null);
  const [presence, setPresence] = useState<Set<string>>(new Set());
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [resuming, setResuming] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [audioReady, setAudioReady] = useState(false);

  const audio = useMemo(() => new AudioController(), []);
  const busyRef = useRef(false);
  const toastSeq = useRef(0);
  const audioCard = useRef<string | null>(null);
  const stateRef = useRef<PublicState | null>(null);
  stateRef.current = state;

  const notify = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-2), { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const applyState = useCallback((next: PublicState) => {
    setState((cur) => {
      if (cur && cur.roomId === next.roomId && next.version < cur.version) return cur; // veraltet
      return next;
    });
  }, []);

  const clearSession = useCallback(
    (message?: string) => {
      if (backend) saveSession(backend.mode, null);
      setSession(null);
      setState(null);
      setPresence(new Set());
      audio.stopAndClear();
      audioCard.current = null;
      setAudioReady(false);
      if (message) notify(message, 'info');
    },
    [backend, audio, notify],
  );

  const enter = useCallback(
    (res: Extract<ServerResponse, { ok: true }>) => {
      if (!backend || !res.state) return;
      const s: RoomSession = { roomId: res.roomId, code: res.code, playerId: res.playerId };
      saveSession(backend.mode, s);
      setSession(s);
      setState(res.state);
    },
    [backend],
  );

  // ── Sitzung nach Reload wiederherstellen ──
  useEffect(() => {
    if (!backend) {
      setResuming(false);
      return;
    }
    const stored = loadSession(backend.mode);
    if (!stored) {
      setResuming(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await backend.request({ type: 'sync', roomId: stored.roomId });
      if (cancelled) return;
      if (res.ok && res.state) enter(res);
      else if (!res.ok && res.error.code !== 'network') saveSession(backend.mode, null);
      else if (!res.ok) {
        // Server gerade nicht erreichbar: Sitzung behalten und später erneut versuchen
        setSession(stored);
        setConnection('reconnecting');
      }
      setResuming(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [backend, enter]);

  // ── Echtzeit, Heartbeat und Nachladen ──
  const roomId = session?.roomId ?? null;
  const playerId = session?.playerId ?? null;
  useEffect(() => {
    if (!backend || !roomId || !playerId) return;
    const unsub = backend.subscribe(roomId, playerId, {
      onState: applyState,
      onClosed: () => clearSession('Die Lobby wurde geschlossen.'),
      onPresence: setPresence,
      onStatus: setConnection,
    });

    const refresh = async () => {
      const res = await backend.request({ type: 'heartbeat', roomId });
      if (res.ok) {
        if (res.state) applyState(res.state);
        setConnection((c) => (c === 'offline' || c === 'reconnecting' ? 'online' : c));
      } else if (res.error.code === 'network') {
        setConnection('reconnecting');
      } else if (res.error.code === 'not_member' || res.error.code === 'room_expired') {
        clearSession(res.error.message);
      }
    };
    void refresh();
    const hb = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 10_000);
    const poll = setInterval(async () => {
      if (document.hidden) return;
      const st = await backend.fetchState(roomId);
      if (st) applyState(st);
    }, 5_000);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    const onOnline = () => void refresh();
    const onOffline = () => setConnection('offline');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      unsub();
      clearInterval(hb);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [backend, roomId, playerId, applyState, clearSession]);

  const me = useMemo(() => state?.players.find((p) => p.id === playerId) ?? null, [state, playerId]);
  const isHost = Boolean(state && playerId && state.hostId === playerId);
  const isMyTurn = Boolean(state && playerId && state.turn?.playerId === playerId && state.phase === 'playing');

  // Wurde ich entfernt (Kick)?
  useEffect(() => {
    if (state && session && !state.players.some((p) => p.id === session.playerId)) {
      clearSession('Du wurdest aus der Lobby entfernt.');
    }
  }, [state, session, clearSession]);

  // ── Audio nur für den aktiven Spieler mit gezogener Karte ──
  const turnCard = state?.turn?.cardId ?? null;
  const phase = state?.phase;
  useEffect(() => {
    if (!backend || !roomId) return;
    const shouldPlay = isMyTurn && Boolean(turnCard);
    if (!shouldPlay) {
      if (audioCard.current) {
        audio.stopAndClear();
        audioCard.current = null;
        setAudioReady(false);
      }
      return;
    }
    if (audioCard.current === turnCard) return;
    audioCard.current = turnCard; // verhindert Doppelabruf; draw lädt selbst
    void (async () => {
      if (audio.getSnapshot().status !== 'idle') return; // wurde bereits durch draw geladen
      const res = await backend.request({ type: 'action', roomId, action: { type: 'audio' } });
      if (res.ok && res.audio) {
        await audio.load(res.audio, true);
        setAudioReady(true);
      }
    })();
  }, [backend, roomId, isMyTurn, turnCard, phase, audio]);

  const act = useCallback(
    async (action: ClientAction): Promise<ServerResponse> => {
      if (!backend || !session) return { ok: false, error: { code: 'config', message: 'Keine aktive Sitzung.' } };
      if (busyRef.current) return { ok: false, error: { code: 'rate_limited', message: 'Einen Moment …' } };
      busyRef.current = true;
      setBusy(true);
      const actionId = crypto.randomUUID();
      try {
        let res: ServerResponse = await backend.request({ type: 'action', roomId: session.roomId, action, actionId });
        // Netzwerkfehler: dieselbe Aktions-ID erneut senden (idempotent)
        for (let i = 0; i < 3 && !res.ok && res.error.code === 'network'; i++) {
          setConnection('reconnecting');
          await sleep(800 * (i + 1));
          res = await backend.request({ type: 'action', roomId: session.roomId, action, actionId });
        }
        if (res.ok) {
          if (res.left) {
            clearSession();
          } else if (res.state) {
            applyState(res.state);
            setConnection((c) => (c === 'reconnecting' ? 'online' : c));
          }
          if (res.audio) {
            if (action.type === 'replay' && audio.getSnapshot().status !== 'idle' && audio.getSnapshot().status !== 'error') {
              void audio.restart();
            } else {
              audioCard.current = res.state?.turn?.cardId ?? audioCard.current;
              void audio.load(res.audio as AudioPlayback, true);
            }
            setAudioReady(true);
          }
        } else if (res.error.code === 'not_member' || res.error.code === 'room_expired') {
          clearSession(res.error.message);
        } else {
          notify(res.error.message, 'error');
          // Bei Zustandskonflikten den aktuellen Stand nachladen
          if (['invalid_phase', 'not_your_turn', 'conflict', 'already_drawn', 'no_card'].includes(res.error.code)) {
            const st = await backend.fetchState(session.roomId);
            if (st) applyState(st);
          }
        }
        return res;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [backend, session, applyState, clearSession, notify, audio],
  );

  const createRoom = useCallback(
    async (name: string, settings: Partial<Settings>): Promise<GameError | null> => {
      if (!backend) return { code: 'config', message: 'Kein Backend konfiguriert.' };
      const res = await backend.request({ type: 'create', name, settings });
      if (!res.ok) return res.error;
      enter(res);
      return null;
    },
    [backend, enter],
  );

  const joinRoom = useCallback(
    async (code: string, name: string): Promise<GameError | null> => {
      if (!backend) return { code: 'config', message: 'Kein Backend konfiguriert.' };
      const res = await backend.request({ type: 'join', code, name });
      if (!res.ok) return res.error;
      enter(res);
      return null;
    },
    [backend, enter],
  );

  const leave = useCallback(async () => {
    if (backend && session) {
      await backend.request({ type: 'action', roomId: session.roomId, action: { type: 'leave' } });
    }
    clearSession();
  }, [backend, session, clearSession]);

  const switchToLocalMode = useCallback(() => {
    try {
      sessionStorage.setItem(FORCE_LOCAL_KEY, '1');
    } catch {
      /* ignorieren */
    }
    setSelection(selectBackend(true));
  }, []);

  const value: GameContextValue = {
    selection,
    backend,
    resuming,
    session,
    state,
    presence,
    connection,
    me,
    isHost,
    isMyTurn,
    busy,
    toasts,
    audio,
    audioReady,
    notify,
    dismissToast,
    switchToLocalMode,
    createRoom,
    joinRoom,
    act,
    leave,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
