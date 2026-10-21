// Gemeinsame Typen für Frontend, lokalen Modus und Edge Function.
// Dieses Verzeichnis enthält ausschließlich reine TypeScript-Dateien ohne Laufzeitabhängigkeiten.

export type GenreId = string;

export type Phase = 'waiting' | 'starting' | 'playing' | 'resolving_turn' | 'finished';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Song {
  id: string;
  title: string;
  artist: string;
  /** Ursprüngliches Veröffentlichungsjahr (nicht Remaster/Neuauflage). */
  releaseYear: number;
  genres: GenreId[];
  audioProvider: 'itunes' | 'demo' | 'none';
  /** Stabile Referenz beim Anbieter (z. B. iTunes trackId). null = per Suche auflösen. */
  audioId: string | null;
  /** Länge der verfügbaren Vorschau in Sekunden. */
  duration: number;
  available: boolean;
  sourceUrl?: string;
  /** Zusätzlich erlaubte Titelschreibweisen für die Titel-Prüfung. */
  aliases?: string[];
  /** Gesetzt, wenn das Jahr/der Datensatz manuell überprüft werden sollte. */
  review?: string;
}

export interface Settings {
  roomName: string;
  maxPlayers: number;
  targetCards: number;
  genres: GenreId[];
  yearMin: number | null;
  yearMax: number | null;
  difficulty: Difficulty;
  /** Digitale Zusatzregel (nicht Teil der offiziellen Hitster-Regeln). */
  titleBonus: boolean;
  allowReplay: boolean;
  /** 0 = unbegrenzt (wenn allowReplay) */
  maxReplays: number;
  /** Zählt die Startkarte zum Siegziel (offizielle Hitster-Zählung)? */
  startCardCounts: boolean;
  /** Party-Modus: Nur dieses Gerät (Spieler-ID) spielt die Musik, z. B. an eine Box angeschlossen. null = jedes Gerät. */
  speakerId: string | null;
}

export interface RevealedCard {
  cardId: string;
  songId: string;
  title: string;
  artist: string;
  year: number;
}

export interface PlayerPublic {
  id: string;
  name: string;
  joinedAt: number;
  /** Stabile Spielerfarbe (Index 0–9), beim Beitritt vergeben. */
  color: number;
  timeline: RevealedCard[];
  /** Vom Spieler selbst korrekt platzierte Karten (ohne Startkarte). */
  placedCorrect: number;
  /** Punkte aus dem Titel-Bonus. */
  bonusPoints: number;
}

export interface TurnPublic {
  playerId: string;
  /** Opake Karten-ID; null solange noch nicht gezogen wurde. */
  cardId: string | null;
  guessMade: boolean;
  replaysUsed: number;
  startedAt: number;
}

export interface TurnResult {
  playerId: string;
  playerName: string;
  playerColor: number;
  cardId: string;
  card: RevealedCard;
  position: number;
  correct: boolean;
  guess: string | null;
  titleCorrect: boolean;
  bonus: number;
  placedCorrect: number;
  totalPoints: number;
  resolvedAt: number;
}

export type EndReason = 'target_reached' | 'deck_empty' | 'abandoned';

export interface RankingEntry {
  rank: number;
  playerId: string;
  name: string;
  cards: number;
  placedCorrect: number;
  bonusPoints: number;
  points: number;
  isWinner: boolean;
}

export interface PastGame {
  gameId: string;
  winnerId: string | null;
  winnerName: string | null;
  endReason: EndReason;
  ranking: RankingEntry[];
}

export interface PoolInfo {
  size: number;
  needed: number;
  level: 'ok' | 'warn' | 'error';
  message: string | null;
}

/** Öffentlicher Spielzustand. Enthält niemals unaufgedeckte Titel/Jahre. */
export interface PublicState {
  roomId: string;
  code: string;
  version: number;
  phase: Phase;
  hostId: string;
  settings: Settings;
  players: PlayerPublic[];
  turnOrder: string[];
  turnIndex: number;
  round: number;
  gameId: string | null;
  gameNo: number;
  turn: TurnPublic | null;
  lastResult: TurnResult | null;
  /** Die letzten Züge aller Spieler (öffentlich, für den Zugverlauf). */
  recent: TurnResult[];
  winnerId: string | null;
  endReason: EndReason | null;
  deckRemaining: number;
  pool: PoolInfo;
  /** Anzahl Songs je Genre (für die Genre-Auswahl). */
  catalog: Record<GenreId, number>;
  history: PastGame[];
  processed: string[];
  createdAt: number;
  updatedAt: number;
}

/** Geheimer Zustand – verlässt den Server nie. */
export interface SecretState {
  deck: string[];
  discard: string[];
  current: null | {
    cardId: string;
    songId: string;
    guess: null | { text: string; correct: boolean };
  };
  cardSeq: number;
}

export type Action =
  | { type: 'join'; playerId: string; name: string }
  | { type: 'leave' }
  | { type: 'kick'; targetId: string }
  | { type: 'updateSettings'; patch: Partial<Settings> }
  | { type: 'start' }
  | { type: 'restart' }
  | { type: 'toLobby' }
  | { type: 'draw' }
  | { type: 'audio' }
  | { type: 'replay' }
  | { type: 'guess'; text: string }
  | { type: 'place'; position: number }
  | { type: 'nextTurn' }
  | { type: 'skipTurn' }
  | { type: 'claimHost' }
  /** Nur serverintern: Karte verwerfen und neu ziehen (Audio nicht auflösbar). */
  | { type: 'reroll' };

export type ClientActionType = Exclude<Action['type'], 'reroll' | 'join'>;

export type ErrorCode =
  | 'invalid_code'
  | 'room_full'
  | 'name_taken'
  | 'name_invalid'
  | 'game_running'
  | 'not_host'
  | 'not_your_turn'
  | 'invalid_phase'
  | 'already_drawn'
  | 'no_card'
  | 'already_guessed'
  | 'guess_disabled'
  | 'replay_disabled'
  | 'replay_limit'
  | 'invalid_position'
  | 'invalid_settings'
  | 'pool_too_small'
  | 'not_enough_players'
  | 'not_member'
  | 'room_expired'
  | 'rate_limited'
  | 'conflict'
  | 'forbidden'
  | 'unknown_action'
  | 'audio_unavailable'
  | 'network'
  | 'config'
  | 'internal';

export interface GameError {
  code: ErrorCode;
  message: string;
}

export type GameEventType =
  | 'room_created'
  | 'player_joined'
  | 'player_left'
  | 'player_kicked'
  | 'host_changed'
  | 'settings_changed'
  | 'game_started'
  | 'card_drawn'
  | 'card_rerolled'
  | 'title_guessed'
  | 'card_placed'
  | 'placement_checked'
  | 'bonus_awarded'
  | 'turn_skipped'
  | 'turn_advanced'
  | 'game_finished'
  | 'game_restarted'
  | 'returned_to_lobby';

export interface GameEvent {
  type: GameEventType;
  payload: Record<string, unknown>;
}

/** Wie ein Song abgespielt wird (Ergebnis der serverseitigen Auflösung). */
export type AudioPlayback =
  | {
      kind: 'url';
      provider: string;
      url: string;
      durationSec: number;
      attribution: string;
    }
  | { kind: 'synth'; provider: 'demo'; seed: number; durationSec: number; attribution: string }
  | { kind: 'none'; provider: string; reason: string };

export interface Reply {
  /** Interner Verweis auf den aktuellen Song, nur für die Audioauflösung auf dem Server. */
  songId?: string;
}
