import type { GameError, PublicState } from '@engine/types.ts';
import type { ServerRequest, ServerResponse } from '@engine/server.ts';

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface SubscribeHandlers {
  onState(state: PublicState): void;
  /** Raum wurde gelöscht/geschlossen. */
  onClosed(): void;
  /** Spieler-IDs, die gerade verbunden sind (Presence). */
  onPresence(connected: Set<string>): void;
  onStatus(status: ConnectionStatus): void;
}

/** 'online' = Supabase-Server, 'p2p' = Direktverbindung zwischen Geräten (Host-Browser als Server), 'local' = Entwicklungsmodus (nur ein Browser). */
export interface Backend {
    mode: 'online' | 'p2p' | 'local';
  request(req: ServerRequest): Promise<ServerResponse>;
  /** Liest den aktuellen Zustand (Polling/Reconnect). */
  fetchState(roomId: string): Promise<PublicState | null>;
  subscribe(roomId: string, playerId: string, handlers: SubscribeHandlers): () => void;
  /** Optional: Verbindungsprotokoll für die Fehlersuche (P2P). */
  diagnostics?(): string[];
}

export const networkError = (message = 'Keine Verbindung zum Server.'): { ok: false; error: GameError } => ({
  ok: false,
  error: { code: 'network', message },
});
