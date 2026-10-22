// Autoritative, reine Spiellogik. Keine I/O, keine UI – nur Zustand rein, Zustand raus.
//
// Regeln (Details siehe README):
//  - Jeder Spieler startet mit einer aufgedeckten Startkarte.
//  - Wer am Zug ist, zieht eine verdeckte Karte und legt sie an eine Position der eigenen Zeitleiste.
//  - Korrekt = Jahr der Karte liegt zwischen dem Jahr der linken und rechten Nachbarkarte
//    (gleiche Jahre sind austauschbar, d. h. ≤ / ≥ ist erlaubt).
//  - Falsch platzierte Karten werden abgelegt (offizielle Hitster-Regel), die Zeitleiste bleibt unverändert.
//  - Titel-Bonus (digitale Zusatzregel): +1 Punkt für den richtig erratenen Titel, zählt nicht als Karte.
//  - Sieg: erster Spieler mit `targetCards` korrekt platzierten Karten.

import { GENRE_IDS } from './genres.ts';
import { isTitleCorrect } from './normalize.ts';
import { randomId, shuffle, type Rng } from './rng.ts';
import type {
  Action,
  Difficulty,
  EndReason,
  ErrorCode,
  GameError,
  GameEvent,
  PastGame,
  Phase,
  PlayerPublic,
  PoolInfo,
  PublicState,
  RankingEntry,
  Reply,
  RevealedCard,
  SecretState,
  Settings,
  Song,
} from './types.ts';

export const LIMITS = {
  minPlayers: 2,
  maxPlayersCap: 10,
  minTarget: 3,
  maxTarget: 20,
  nameMax: 20,
  roomNameMax: 32,
  guessMax: 100,
  historyMax: 5,
  processedMax: 40,
  recentMax: 12,
  colorCount: 10,
  /** Nach dieser Zeit darf jeder Spieler die Ergebnisanzeige weiterschalten. */
  resolveGraceMs: 8000,
} as const;

// ───────────────────────── Phasen ─────────────────────────

export const ALLOWED_TRANSITIONS: Record<Phase, Phase[]> = {
  waiting: ['starting'],
  starting: ['playing', 'waiting'],
  playing: ['resolving_turn', 'finished'],
  resolving_turn: ['playing', 'finished'],
  finished: ['starting', 'waiting'],
};

export function canTransition(from: Phase, to: Phase): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

function transition(state: PublicState, to: Phase): void {
  if (!canTransition(state.phase, to)) {
    throw new EngineError('invalid_phase', `Ungültiger Phasenwechsel ${state.phase} → ${to}`);
  }
  state.phase = to;
}

class EngineError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const fail = (code: ErrorCode, message: string): { ok: false; error: GameError } => ({
  ok: false,
  error: { code, message },
});

// ───────────────────────── Einstellungen ─────────────────────────

const DIFFICULTY_PRESETS: Record<Difficulty, Pick<Settings, 'allowReplay' | 'maxReplays' | 'titleBonus'>> = {
  easy: { allowReplay: true, maxReplays: 0, titleBonus: true },
  normal: { allowReplay: true, maxReplays: 3, titleBonus: true },
  hard: { allowReplay: false, maxReplays: 0, titleBonus: true }, // einmal anhören
};

export function defaultSettings(): Settings {
  return {
    roomName: '',
    maxPlayers: 6,
    targetCards: 10,
    genres: ['pop', 'rock', 'charts'],
    yearMin: null,
    yearMax: null,
    difficulty: 'normal',
    ...DIFFICULTY_PRESETS.normal,
    startCardCounts: false,
    speakerId: null,
  };
}

const cleanText = (s: unknown, max: number): string =>
  String(s ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

export function sanitizeName(name: unknown): string {
  return cleanText(name, LIMITS.nameMax);
}

const intIn = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** Wendet einen Settings-Patch an und validiert ihn. */
export function applySettingsPatch(
  base: Settings,
  patch: Partial<Settings>,
  playerCount: number,
  playerIds: readonly string[] = [],
): { ok: true; settings: Settings } | { ok: false; error: GameError } {
  const s: Settings = { ...base };
  const bad = (msg: string) => fail('invalid_settings', msg);

  if (patch.difficulty !== undefined) {
    if (!(patch.difficulty in DIFFICULTY_PRESETS)) return bad('Unbekannte Schwierigkeit.');
    if (patch.difficulty !== base.difficulty) Object.assign(s, DIFFICULTY_PRESETS[patch.difficulty]);
    s.difficulty = patch.difficulty;
  }
  if (patch.roomName !== undefined) s.roomName = cleanText(patch.roomName, LIMITS.roomNameMax);
  if (patch.maxPlayers !== undefined) {
    const v = intIn(patch.maxPlayers, LIMITS.minPlayers, LIMITS.maxPlayersCap);
    if (v === null) return bad(`Spieleranzahl muss zwischen ${LIMITS.minPlayers} und ${LIMITS.maxPlayersCap} liegen.`);
    if (v < playerCount) return bad('Es sind bereits mehr Spieler in der Lobby.');
    s.maxPlayers = v;
  }
  if (patch.targetCards !== undefined) {
    const v = intIn(patch.targetCards, LIMITS.minTarget, LIMITS.maxTarget);
    if (v === null) return bad(`Zielkarten müssen zwischen ${LIMITS.minTarget} und ${LIMITS.maxTarget} liegen.`);
    s.targetCards = v;
  }
  if (patch.genres !== undefined) {
    if (!Array.isArray(patch.genres)) return bad('Ungültige Genre-Auswahl.');
    const unique = [...new Set(patch.genres.map(String))];
    if (unique.some((g) => !GENRE_IDS.has(g))) return bad('Unbekanntes Genre.');
    s.genres = unique;
  }
  for (const key of ['yearMin', 'yearMax'] as const) {
    if (patch[key] !== undefined) {
      if (patch[key] === null) s[key] = null;
      else {
        const v = intIn(patch[key], 1900, 2100);
        if (v === null) return bad('Ungültiger Zeitraum.');
        s[key] = v;
      }
    }
  }
  if (s.yearMin !== null && s.yearMax !== null && s.yearMin > s.yearMax) return bad('Zeitraum: „von“ liegt nach „bis“.');
  for (const key of ['titleBonus', 'allowReplay', 'startCardCounts'] as const) {
    if (patch[key] !== undefined) s[key] = Boolean(patch[key]);
  }
  if (patch.speakerId !== undefined) {
    if (patch.speakerId === null) s.speakerId = null;
    else if (typeof patch.speakerId === 'string' && playerIds.includes(patch.speakerId)) s.speakerId = patch.speakerId;
    else return bad('Dieser Spieler ist nicht in der Runde.');
  }
  if (patch.maxReplays !== undefined) {
    const v = intIn(patch.maxReplays, 0, 20);
    if (v === null) return bad('Ungültige Anzahl Wiederholungen.');
    s.maxReplays = v;
  }
  return { ok: true, settings: s };
}

// ───────────────────────── Songpool ─────────────────────────

const dedupeKey = (s: Song): string =>
  `${s.artist.toLowerCase().replace(/[^a-z0-9]+/g, '')}|${s.title.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;

/** Vereinigungsmenge aller gewählten Genres, ohne Duplikate (nach ID und Interpret+Titel). */
export function buildPool(songs: readonly Song[], settings: Pick<Settings, 'genres' | 'yearMin' | 'yearMax'>): Song[] {
  const wanted = new Set(settings.genres);
  const ids = new Set<string>();
  const keys = new Set<string>();
  const out: Song[] = [];
  for (const song of songs) {
    if (!song.available) continue;
    if (!song.genres.some((g) => wanted.has(g))) continue;
    if (settings.yearMin !== null && song.releaseYear < settings.yearMin) continue;
    if (settings.yearMax !== null && song.releaseYear > settings.yearMax) continue;
    const key = dedupeKey(song);
    if (ids.has(song.id) || keys.has(key)) continue;
    ids.add(song.id);
    keys.add(key);
    out.push(song);
  }
  return out;
}

export function catalogCounts(songs: readonly Song[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const song of songs) {
    if (!song.available) continue;
    for (const g of new Set(song.genres)) counts[g] = (counts[g] ?? 0) + 1;
  }
  return counts;
}

export function evaluatePool(size: number, settings: Settings, playerCount: number): PoolInfo {
  const players = Math.max(playerCount, LIMITS.minPlayers);
  const placements = settings.targetCards - (settings.startCardCounts ? 1 : 0);
  const needed = players * (1 + placements);
  if (settings.genres.length === 0) {
    return { size, needed, level: 'error', message: 'Wähle mindestens ein Genre aus.' };
  }
  if (size < players + 1) {
    return {
      size,
      needed,
      level: 'error',
      message: `Mit dieser Auswahl gibt es nur ${size} Songs – zu wenig für ${players} Spieler. Wähle mehr Genres.`,
    };
  }
  if (size < needed) {
    return {
      size,
      needed,
      level: 'warn',
      message: `Nur ${size} Songs für bis zu ${needed} benötigte Karten. Das Spiel kann vorzeitig enden oder Songs wiederholen.`,
    };
  }
  return { size, needed, level: 'ok', message: null };
}

// ───────────────────────── Zustand erzeugen ─────────────────────────

export interface CreateRoomInput {
  roomId: string;
  code: string;
  hostId: string;
  hostName: string;
  settings?: Partial<Settings>;
  now: number;
  songs: readonly Song[];
}

export function createRoom(
  input: CreateRoomInput,
): { ok: true; state: PublicState; secret: SecretState; events: GameEvent[] } | { ok: false; error: GameError } {
  const name = sanitizeName(input.hostName);
  if (!name) return fail('name_invalid', 'Bitte gib einen Spielernamen ein.');
  const applied = applySettingsPatch(defaultSettings(), input.settings ?? {}, 1);
  if (!applied.ok) return applied;
  const state: PublicState = {
    roomId: input.roomId,
    code: input.code,
    version: 1,
    phase: 'waiting',
    hostId: input.hostId,
    settings: applied.settings,
    players: [newPlayer(input.hostId, name, input.now, 0)],
    turnOrder: [],
    turnIndex: 0,
    round: 0,
    gameId: null,
    gameNo: 0,
    turn: null,
    lastResult: null,
    recent: [],
    winnerId: null,
    endReason: null,
    deckRemaining: 0,
    pool: { size: 0, needed: 0, level: 'ok', message: null },
    catalog: catalogCounts(input.songs),
    history: [],
    processed: [],
    createdAt: input.now,
    updatedAt: input.now,
  };
  refreshPool(state, input.songs);
  const secret: SecretState = { deck: [], discard: [], current: null, cardSeq: 0 };
  return {
    ok: true,
    state,
    secret,
    events: [{ type: 'room_created', payload: { code: input.code, hostId: input.hostId } }],
  };
}

function newPlayer(id: string, name: string, now: number, color: number): PlayerPublic {
  return { id, name, joinedAt: now, color, timeline: [], placedCorrect: 0, bonusPoints: 0 };
}

/** Kleinste noch freie Farbe (bleibt über die Partie stabil, auch wenn Spieler gehen). */
function freeColor(players: readonly PlayerPublic[]): number {
  const used = new Set(players.map((p) => p.color));
  for (let c = 0; c < LIMITS.colorCount; c++) if (!used.has(c)) return c;
  return players.length % LIMITS.colorCount;
}

function refreshPool(state: PublicState, songs: readonly Song[]): void {
  state.pool = evaluatePool(buildPool(songs, state.settings).length, state.settings, state.players.length);
}

// ───────────────────────── Auswertung ─────────────────────────

/** Fortschritt Richtung Siegziel: korrekt platzierte Karten (+ Startkarte, falls aktiviert). */
export function progressOf(player: PlayerPublic, settings: Pick<Settings, 'startCardCounts'>): number {
  return player.placedCorrect + (settings.startCardCounts && player.timeline.length > 0 ? 1 : 0);
}

export function totalPoints(player: PlayerPublic): number {
  return player.placedCorrect + player.bonusPoints;
}

/**
 * Rangliste. Reihenfolge: Spielgewinner zuerst; danach Fortschritt, Gesamtpunkte,
 * früherer Beitritt (deterministischer Tie-Break).
 */
export function ranking(state: Pick<PublicState, 'players' | 'settings' | 'winnerId'>): RankingEntry[] {
  const sorted = [...state.players].sort((a, b) => {
    if (state.winnerId) {
      if (a.id === state.winnerId) return -1;
      if (b.id === state.winnerId) return 1;
    }
    return (
      progressOf(b, state.settings) - progressOf(a, state.settings) ||
      totalPoints(b) - totalPoints(a) ||
      a.joinedAt - b.joinedAt
    );
  });
  return sorted.map((p, i) => ({
    rank: i + 1,
    playerId: p.id,
    name: p.name,
    cards: progressOf(p, state.settings),
    placedCorrect: p.placedCorrect,
    bonusPoints: p.bonusPoints,
    points: totalPoints(p),
    isWinner: p.id === state.winnerId,
  }));
}

/** Korrekt, wenn left.year ≤ year ≤ right.year (gleiche Jahre sind austauschbar). */
export function isPlacementCorrect(timeline: readonly { year: number }[], position: number, year: number): boolean {
  const left = timeline[position - 1];
  const right = timeline[position];
  if (left && year < left.year) return false;
  if (right && year > right.year) return false;
  return true;
}

// ───────────────────────── Reducer ─────────────────────────

export interface Ctx {
  now: number;
  rng: Rng;
  songs: readonly Song[];
  /** Spieler, deren Heartbeat zu alt ist (vom Server ermittelt). */
  staleIds?: readonly string[];
  /** Client-Aktions-ID zur Idempotenz. */
  actionId?: string;
}

export type ReduceResult =
  | {
      ok: true;
      state: PublicState;
      secret: SecretState;
      changed: boolean;
      duplicate: boolean;
      events: GameEvent[];
      reply: Reply;
    }
  | { ok: false; error: GameError };

const songIndexCache = new WeakMap<readonly Song[], Map<string, Song>>();
function songById(songs: readonly Song[], id: string): Song | undefined {
  let idx = songIndexCache.get(songs);
  if (!idx) {
    idx = new Map(songs.map((s) => [s.id, s]));
    songIndexCache.set(songs, idx);
  }
  return idx.get(id);
}

interface Work {
  state: PublicState;
  secret: SecretState;
  ctx: Ctx;
  actor: string;
  events: GameEvent[];
  reply: Reply;
  changed: boolean;
}

export function reduce(
  stateIn: PublicState,
  secretIn: SecretState,
  action: Action,
  actor: string,
  ctx: Ctx,
): ReduceResult {
  if (ctx.actionId && stateIn.processed.includes(ctx.actionId)) {
    return { ok: true, state: stateIn, secret: secretIn, changed: false, duplicate: true, events: [], reply: {} };
  }
  const w: Work = {
    state: structuredClone(stateIn),
    secret: structuredClone(secretIn),
    ctx,
    actor,
    events: [],
    reply: {},
    changed: true,
  };
  try {
    const problem = dispatch(w, action);
    if (problem) return { ok: false, error: problem };
  } catch (e) {
    if (e instanceof EngineError) return fail(e.code, e.message);
    throw e;
  }
  if (w.changed) {
    w.state.updatedAt = ctx.now;
    if (ctx.actionId) {
      w.state.processed = [...w.state.processed, ctx.actionId].slice(-LIMITS.processedMax);
    }
  }
  return {
    ok: true,
    state: w.changed ? w.state : stateIn,
    secret: w.changed ? w.secret : secretIn,
    changed: w.changed,
    duplicate: false,
    events: w.events,
    reply: w.reply,
  };
}

type Err = GameError | null;
const err = (code: ErrorCode, message: string): GameError => ({ code, message });

function dispatch(w: Work, action: Action): Err {
  switch (action.type) {
    case 'join':
      return doJoin(w, action.playerId, action.name);
    case 'leave':
      return doLeave(w, w.actor, 'player_left');
    case 'kick':
      return doKick(w, action.targetId);
    case 'updateSettings':
      return doUpdateSettings(w, action.patch);
    case 'start':
      return doStart(w, false);
    case 'restart':
      return doStart(w, true);
    case 'toLobby':
      return doToLobby(w);
    case 'draw':
      return doDraw(w);
    case 'audio':
      return doAudio(w);
    case 'replay':
      return doReplay(w);
    case 'guess':
      return doGuess(w, action.text);
    case 'place':
      return doPlace(w, action.position);
    case 'nextTurn':
      return doNextTurn(w);
    case 'skipTurn':
      return doSkipTurn(w);
    case 'claimHost':
      return doClaimHost(w);
    case 'reroll':
      return doReroll(w);
    default:
      return err('unknown_action', 'Unbekannte Aktion.');
  }
}

const player = (s: PublicState, id: string): PlayerPublic | undefined => s.players.find((p) => p.id === id);

function requireMember(w: Work): Err {
  return player(w.state, w.actor) ? null : err('not_member', 'Du bist nicht Teil dieses Raums.');
}
function requireHost(w: Work): Err {
  return w.state.hostId === w.actor ? null : err('not_host', 'Nur der Host darf das.');
}
function requireActiveTurn(w: Work): Err {
  const m = requireMember(w);
  if (m) return m;
  if (!w.state.turn || w.state.turn.playerId !== w.actor) return err('not_your_turn', 'Du bist gerade nicht an der Reihe.');
  return null;
}

// ── Lobby ──

function doJoin(w: Work, playerId: string, rawName: string): Err {
  const { state } = w;
  if (state.phase !== 'waiting') return err('game_running', 'Das Spiel läuft bereits. Beitritt ist nur vor dem Start möglich.');
  const name = sanitizeName(rawName);
  if (!name) return err('name_invalid', 'Bitte gib einen Spielernamen ein.');
  if (state.players.length >= state.settings.maxPlayers) return err('room_full', 'Diese Lobby ist voll.');
  if (state.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return err('name_taken', 'Dieser Name ist in der Lobby schon vergeben.');
  }
  if (player(state, playerId)) return err('forbidden', 'Du bist bereits beigetreten.');
  state.players.push(newPlayer(playerId, name, w.ctx.now, freeColor(state.players)));
  refreshPool(state, w.ctx.songs);
  w.events.push({ type: 'player_joined', payload: { playerId, name } });
  return null;
}

function doLeave(w: Work, playerId: string, eventType: 'player_left' | 'player_kicked'): Err {
  const { state, secret } = w;
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return err('not_member', 'Du bist nicht Teil dieses Raums.');
  const leaving = state.players[idx];
  state.players.splice(idx, 1);
  if (state.settings.speakerId === playerId) state.settings.speakerId = null;
  w.events.push({ type: eventType, payload: { playerId, name: leaving.name } });

  if (state.hostId === playerId && state.players.length > 0) {
    const next = [...state.players].sort((a, b) => a.joinedAt - b.joinedAt)[0];
    state.hostId = next.id;
    w.events.push({ type: 'host_changed', payload: { hostId: next.id } });
  }

  if (state.phase === 'waiting') {
    refreshPool(state, w.ctx.songs);
    return null;
  }

  // Spiel läuft (oder ist beendet): aus der Zugreihenfolge entfernen.
  const orderIdx = state.turnOrder.indexOf(playerId);
  if (orderIdx >= 0) {
    state.turnOrder.splice(orderIdx, 1);
    const wasActive = state.turn?.playerId === playerId;
    if (orderIdx < state.turnIndex) state.turnIndex -= 1;
    else if (orderIdx === state.turnIndex) state.turnIndex -= 1; // wird unten vorgerückt
    if (wasActive && state.phase !== 'finished') {
      if (secret.current) {
        secret.discard.push(secret.current.songId);
        secret.current = null;
      }
      if (state.phase === 'playing') advanceTurn(w);
      // In resolving_turn zeigt turn weiterhin auf den Gegangenen; nextTurn rückt dann vor.
    }
  }
  if (state.phase === 'playing' || state.phase === 'resolving_turn') {
    if (state.players.length < LIMITS.minPlayers) finishGame(w, 'abandoned');
  }
  return null;
}

function doKick(w: Work, targetId: string): Err {
  const e = requireHost(w);
  if (e) return e;
  if (w.state.phase !== 'waiting') return err('invalid_phase', 'Spieler können nur in der Lobby entfernt werden.');
  if (targetId === w.actor) return err('forbidden', 'Du kannst dich nicht selbst entfernen.');
  return doLeave({ ...w, actor: targetId }, targetId, 'player_kicked');
}

function doUpdateSettings(w: Work, patch: Partial<Settings>): Err {
  const e = requireHost(w);
  if (e) return e;
  // Den Lautsprecher darf der Host auch während des Spiels wechseln, alles andere nur in der Lobby.
  const speakerOnly = Object.keys(patch ?? {}).every((k) => k === 'speakerId');
  if (w.state.phase !== 'waiting' && !speakerOnly) return err('invalid_phase', 'Einstellungen sind nur in der Lobby änderbar.');
  const res = applySettingsPatch(w.state.settings, patch ?? {}, w.state.players.length, w.state.players.map((p) => p.id));
  if (!res.ok) return res.error;
  w.state.settings = res.settings;
  if (w.state.phase === 'waiting') refreshPool(w.state, w.ctx.songs);
  w.events.push({ type: 'settings_changed', payload: { settings: res.settings } });
  return null;
}

function doClaimHost(w: Work): Err {
  const m = requireMember(w);
  if (m) return m;
  const { state } = w;
  if (state.hostId === w.actor) {
    w.changed = false;
    return null;
  }
  if (!(w.ctx.staleIds ?? []).includes(state.hostId)) return err('forbidden', 'Der Host ist noch verbunden.');
  state.hostId = w.actor;
  w.events.push({ type: 'host_changed', payload: { hostId: w.actor } });
  return null;
}

// ── Spielstart ──

function doStart(w: Work, isRestart: boolean): Err {
  const { state, secret, ctx } = w;
  const e = requireHost(w);
  if (e) return e;
  if (isRestart ? state.phase !== 'finished' : state.phase !== 'waiting') {
    return err('invalid_phase', isRestart ? 'Ein neues Spiel kann erst nach dem Ende gestartet werden.' : 'Das Spiel wurde bereits gestartet.');
  }
  if (state.players.length < LIMITS.minPlayers) {
    return err('not_enough_players', `Zum Starten werden mindestens ${LIMITS.minPlayers} Spieler benötigt.`);
  }
  const pool = buildPool(ctx.songs, state.settings);
  const info = evaluatePool(pool.length, state.settings, state.players.length);
  if (info.level === 'error') return err('pool_too_small', info.message ?? 'Die Musikauswahl ist zu klein.');

  if (isRestart) archiveCurrentGame(state);
  transition(state, 'starting');

  state.gameNo += 1;
  state.gameId = randomId('g', ctx.rng);
  state.round = 1;
  state.winnerId = null;
  state.endReason = null;
  state.lastResult = null;
  state.recent = [];
  state.players = state.players.map((p) => ({ ...p, timeline: [], placedCorrect: 0, bonusPoints: 0 }));
  secret.deck = shuffle(pool.map((s) => s.id), ctx.rng);
  secret.discard = [];
  secret.current = null;
  secret.cardSeq = 0;
  for (const p of state.players) {
    const songId = secret.deck.pop()!;
    p.timeline = [revealCard(w, `c_${++secret.cardSeq}`, songId)];
  }
  state.turnOrder = state.players.map((p) => p.id);
  state.turnIndex = 0;
  state.turn = newTurn(state.turnOrder[0], ctx.now);
  state.deckRemaining = secret.deck.length + secret.discard.length;
  state.pool = info;
  transition(state, 'playing');
  w.events.push({
    type: isRestart ? 'game_restarted' : 'game_started',
    payload: { gameId: state.gameId, players: state.turnOrder, poolSize: pool.length },
  });
  return null;
}

function doToLobby(w: Work): Err {
  const e = requireHost(w);
  if (e) return e;
  if (w.state.phase !== 'finished') return err('invalid_phase', 'Zur Lobby geht es erst nach dem Spielende.');
  archiveCurrentGame(w.state);
  transition(w.state, 'waiting');
  const s = w.state;
  s.gameId = null;
  s.turn = null;
  s.turnOrder = [];
  s.turnIndex = 0;
  s.round = 0;
  s.lastResult = null;
  s.recent = [];
  s.winnerId = null;
  s.endReason = null;
  s.deckRemaining = 0;
  s.players = s.players.map((p) => ({ ...p, timeline: [], placedCorrect: 0, bonusPoints: 0 }));
  w.secret.deck = [];
  w.secret.discard = [];
  w.secret.current = null;
  refreshPool(s, w.ctx.songs);
  w.events.push({ type: 'returned_to_lobby', payload: {} });
  return null;
}

function archiveCurrentGame(state: PublicState): void {
  if (!state.gameId) return;
  const past: PastGame = {
    gameId: state.gameId,
    winnerId: state.winnerId,
    winnerName: player(state, state.winnerId ?? '')?.name ?? null,
    endReason: state.endReason ?? 'abandoned',
    ranking: ranking(state),
  };
  state.history = [past, ...state.history].slice(0, LIMITS.historyMax);
}

function newTurn(playerId: string, now: number) {
  return { playerId, cardId: null, guessMade: false, replaysUsed: 0, startedAt: now };
}

function revealCard(w: Work, cardId: string, songId: string): RevealedCard {
  const song = songById(w.ctx.songs, songId);
  if (!song) throw new EngineError('internal', `Song ${songId} nicht gefunden.`);
  return { cardId, songId, title: song.title, artist: song.artist, year: song.releaseYear };
}

// ── Zug ──

function takeFromDeck(secret: SecretState, rng: Rng): string | null {
  if (secret.deck.length === 0 && secret.discard.length > 0) {
    secret.deck = shuffle(secret.discard, rng);
    secret.discard = [];
  }
  return secret.deck.pop() ?? null;
}

function drawInto(w: Work): boolean {
  const songId = takeFromDeck(w.secret, w.ctx.rng);
  if (!songId) return false;
  const cardId = `c_${++w.secret.cardSeq}`;
  w.secret.current = { cardId, songId, guess: null };
  w.state.turn!.cardId = cardId;
  w.state.turn!.guessMade = false;
  w.state.turn!.replaysUsed = 0;
  w.state.deckRemaining = w.secret.deck.length + w.secret.discard.length;
  w.reply.songId = songId;
  return true;
}

function doDraw(w: Work): Err {
  const e = requireActiveTurn(w);
  if (e) return e;
  if (w.state.phase !== 'playing') return err('invalid_phase', 'Es kann gerade keine Karte gezogen werden.');
  if (w.state.turn!.cardId) return err('already_drawn', 'Du hast bereits eine Karte gezogen.');
  if (!drawInto(w)) {
    finishGame(w, 'deck_empty');
    return null;
  }
  w.events.push({ type: 'card_drawn', payload: { playerId: w.actor, cardId: w.state.turn!.cardId } });
  return null;
}

function doReroll(w: Work): Err {
  const { state, secret } = w;
  if (state.phase !== 'playing' || !state.turn || !secret.current) return err('no_card', 'Keine Karte zum Ersetzen.');
  if (secret.current.guess) return err('forbidden', 'Nach einem Tipp kann die Karte nicht mehr ersetzt werden.');
  // Aktuelle Karte unten ins Deck zurücklegen (wird erst spät wieder gezogen).
  secret.deck.unshift(secret.current.songId);
  secret.current = null;
  state.turn.cardId = null;
  w.events.push({ type: 'card_rerolled', payload: { playerId: state.turn.playerId } });
  if (!drawInto(w)) {
    finishGame(w, 'deck_empty');
  }
  return null;
}

function doAudio(w: Work): Err {
  // Im Party-Modus darf der Lautsprecher-Spieler die Quelle abrufen (nicht nur der Spieler am Zug).
  const e = w.state.settings.speakerId && w.state.settings.speakerId === w.actor ? requireMember(w) : requireActiveTurn(w);
  if (e) return e;
  if (w.state.phase !== 'playing' || !w.secret.current) return err('no_card', 'Es gibt gerade keine Karte zum Abspielen.');
  w.reply.songId = w.secret.current.songId;
  w.changed = false;
  return null;
}

function doReplay(w: Work): Err {
  const e = requireActiveTurn(w);
  if (e) return e;
  const { state, secret } = w;
  if (state.phase !== 'playing' || !secret.current) return err('no_card', 'Es gibt gerade keine Karte zum Abspielen.');
  if (!state.settings.allowReplay) return err('replay_disabled', 'Wiederholen ist in diesem Spiel ausgeschaltet.');
  // Der Tipp ist endgültig: Wer den Titel getippt hat, darf den Song nicht noch einmal von vorn hören.
  if (secret.current.guess) return err('replay_disabled', 'Nach dem abgegebenen Tipp kann der Song nicht mehr wiederholt werden.');
  const max = state.settings.maxReplays;
  if (max > 0 && state.turn!.replaysUsed >= max) return err('replay_limit', 'Du hast alle Wiederholungen aufgebraucht.');
  state.turn!.replaysUsed += 1;
  w.reply.songId = secret.current.songId;
  return null;
}

function doGuess(w: Work, text: string): Err {
  const e = requireActiveTurn(w);
  if (e) return e;
  const { state, secret } = w;
  if (state.phase !== 'playing' || !secret.current) return err('no_card', 'Zieh zuerst eine Karte.');
  if (!state.settings.titleBonus) return err('guess_disabled', 'Der Titel-Bonus ist in diesem Spiel ausgeschaltet.');
  if (secret.current.guess) return err('already_guessed', 'Du hast für diese Karte bereits getippt.');
  const guess = cleanText(text, LIMITS.guessMax);
  if (!guess) return err('invalid_settings', 'Bitte gib einen Titel ein.');
  const song = songById(w.ctx.songs, secret.current.songId);
  if (!song) return err('internal', 'Song nicht gefunden.');
  const correct = isTitleCorrect(guess, song);
  secret.current.guess = { text: guess, correct };
  state.turn!.guessMade = true;
  // Ob der Tipp stimmt, wird erst beim Aufdecken veröffentlicht.
  w.events.push({ type: 'title_guessed', payload: { playerId: w.actor, cardId: secret.current.cardId } });
  return null;
}

function doPlace(w: Work, position: number): Err {
  const e = requireActiveTurn(w);
  if (e) return e;
  const { state, secret } = w;
  if (state.phase !== 'playing') return err('invalid_phase', 'Es kann gerade keine Karte gelegt werden.');
  const cur = secret.current;
  if (!cur) return err('no_card', 'Zieh zuerst eine Karte.');
  const me = player(state, w.actor)!;
  if (!Number.isInteger(position) || position < 0 || position > me.timeline.length) {
    return err('invalid_position', 'Ungültige Position auf dem Zeitstrahl.');
  }
  const card = revealCard(w, cur.cardId, cur.songId);
  const correct = isPlacementCorrect(me.timeline, position, card.year);
  const titleCorrect = cur.guess?.correct === true;
  const bonus = titleCorrect && state.settings.titleBonus ? 1 : 0;

  if (correct) {
    me.timeline.splice(position, 0, card);
    me.placedCorrect += 1;
  } else {
    secret.discard.push(cur.songId);
  }
  me.bonusPoints += bonus;
  secret.current = null;
  state.deckRemaining = secret.deck.length + secret.discard.length;
  state.lastResult = {
    playerId: me.id,
    playerName: me.name,
    playerColor: me.color,
    cardId: cur.cardId,
    card,
    position,
    correct,
    guess: cur.guess?.text ?? null,
    titleCorrect,
    bonus,
    placedCorrect: me.placedCorrect,
    totalPoints: totalPoints(me),
    resolvedAt: w.ctx.now,
  };
  state.recent = [...state.recent, state.lastResult].slice(-LIMITS.recentMax);
  w.events.push({ type: 'card_placed', payload: { playerId: me.id, cardId: cur.cardId, position } });
  w.events.push({
    type: 'placement_checked',
    payload: { playerId: me.id, cardId: cur.cardId, songId: card.songId, year: card.year, correct },
  });
  if (bonus) w.events.push({ type: 'bonus_awarded', payload: { playerId: me.id, cardId: cur.cardId, points: bonus } });

  if (progressOf(me, state.settings) >= state.settings.targetCards) {
    finishGame(w, 'target_reached', me.id);
  } else {
    transition(state, 'resolving_turn');
  }
  return null;
}

/** Rückt zum nächsten Spieler vor und beginnt dessen Zug. */
function advanceTurn(w: Work): void {
  const { state } = w;
  const n = state.turnOrder.length;
  const next = (((state.turnIndex + 1) % n) + n) % n;
  if (next <= state.turnIndex || state.turnIndex < 0) state.round += 1;
  state.turnIndex = next;
  state.turn = newTurn(state.turnOrder[next], w.ctx.now);
  w.events.push({ type: 'turn_advanced', payload: { playerId: state.turnOrder[next], round: state.round } });
}

function doNextTurn(w: Work): Err {
  const e = requireMember(w);
  if (e) return e;
  const { state } = w;
  if (state.phase !== 'resolving_turn') return err('invalid_phase', 'Es gibt keinen Zug zum Weiterschalten.');
  const turnPlayer = state.turn?.playerId;
  const waited = state.lastResult ? w.ctx.now - state.lastResult.resolvedAt >= LIMITS.resolveGraceMs : true;
  const allowed =
    w.actor === turnPlayer ||
    w.actor === state.hostId ||
    waited ||
    (turnPlayer !== undefined && (w.ctx.staleIds ?? []).includes(turnPlayer)) ||
    !state.turnOrder.includes(turnPlayer ?? '');
  if (!allowed) return err('forbidden', 'Der aktive Spieler schaltet gleich weiter.');
  transition(state, 'playing');
  advanceTurn(w);
  return null;
}

function doSkipTurn(w: Work): Err {
  const e = requireMember(w);
  if (e) return e;
  const { state, secret } = w;
  if (state.phase !== 'playing' || !state.turn) return err('invalid_phase', 'Es läuft gerade kein Zug.');
  const turnPlayer = state.turn.playerId;
  const stale = (w.ctx.staleIds ?? []).includes(turnPlayer) && w.actor !== turnPlayer;
  if (w.actor !== state.hostId && !stale) return err('not_host', 'Nur der Host oder bei getrennten Spielern darf ein Zug übersprungen werden.');
  if (secret.current) {
    secret.discard.push(secret.current.songId);
    secret.current = null;
  }
  state.deckRemaining = secret.deck.length + secret.discard.length;
  w.events.push({ type: 'turn_skipped', payload: { playerId: turnPlayer } });
  advanceTurn(w);
  return null;
}

// ── Ende ──

function finishGame(w: Work, reason: EndReason, winnerId?: string): void {
  const { state } = w;
  if (state.phase === 'finished') return;
  transition(state, 'finished');
  state.endReason = reason;
  state.winnerId = winnerId ?? null;
  if (reason === 'deck_empty') {
    // Kein Zielstand erreicht: bester Spieler nach Rangliste gewinnt.
    state.winnerId = ranking({ ...state, winnerId: null })[0]?.playerId ?? null;
  }
  if (w.secret.current) {
    w.secret.discard.push(w.secret.current.songId);
    w.secret.current = null;
  }
  w.events.push({
    type: 'game_finished',
    payload: { gameId: state.gameId, winnerId: state.winnerId, reason, ranking: ranking(state) },
  });
}
