import type { AudioPlayback } from '@engine/types.ts';

export type AudioStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';

export interface AudioSnapshot {
  status: AudioStatus;
  /** Position in Sekunden */
  position: number;
  duration: number;
  volume: number;
  /** Browser hat Autoplay blockiert – Nutzer muss selbst auf Play tippen. */
  needsGesture: boolean;
  error: string | null;
  attribution: string | null;
  isDemo: boolean;
}

/** Ein Wiedergabe-Adapter pro Quellenart. Weitere Anbieter (z. B. Embed-Player) implementieren dasselbe. */
export interface PlaybackAdapter {
  load(source: AudioPlayback): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  seek(sec: number): void;
  setVolume(v: number): void;
  position(): number;
  dispose(): void;
  onEnded(cb: () => void): void;
  onError(cb: (message: string) => void): void;
}
