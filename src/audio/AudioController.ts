import type { AudioPlayback } from '@engine/types.ts';
import { HtmlAudioAdapter } from './htmlAudioAdapter.ts';
import { SynthAdapter } from './synthAdapter.ts';
import type { AudioSnapshot, PlaybackAdapter } from './types.ts';

const VOLUME_KEY = 'timeline.volume';

const initial = (): AudioSnapshot => ({
  status: 'idle',
  position: 0,
  duration: 0,
  volume: readVolume(),
  needsGesture: false,
  error: null,
  attribution: null,
  isDemo: false,
});

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.8;
  } catch {
    return 0.8;
  }
}

/**
 * Steuert die Wiedergabe unabhängig von React: Quelle laden → automatisch starten →
 * an der Zielposition stoppen. Fehler ergeben immer einen klaren Zustand (nie endloses Laden).
 */
export class AudioController {
  private adapter: PlaybackAdapter | null = null;
  private source: AudioPlayback | null = null;
  private snap: AudioSnapshot = initial();
  private listeners = new Set<() => void>();
  private raf: number | null = null;
  private generation = 0;

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getSnapshot = (): AudioSnapshot => this.snap;

  private set(patch: Partial<AudioSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  private tick = (): void => {
    if (this.adapter && this.snap.status === 'playing') {
      this.set({ position: this.adapter.position() });
      this.raf = requestAnimationFrame(this.tick);
    }
  };

  /** Lädt eine neue Quelle und startet – wenn der Browser es zulässt – automatisch. */
  async load(source: AudioPlayback, autoplay = true): Promise<void> {
    const gen = ++this.generation;
    this.reset();
    if (source.kind === 'none') {
      this.set({ status: 'error', error: source.reason, attribution: null });
      return;
    }
    this.source = source;
    this.set({
      status: 'loading',
      duration: source.durationSec,
      attribution: source.attribution,
      isDemo: source.kind === 'synth',
      error: null,
      needsGesture: false,
      position: 0,
    });
    const adapter: PlaybackAdapter = source.kind === 'url' ? new HtmlAudioAdapter() : new SynthAdapter();
    this.adapter = adapter;
    adapter.setVolume(this.snap.volume);
    adapter.onEnded(() => {
      if (gen !== this.generation) return;
      this.set({ status: 'ended', position: this.snap.duration });
    });
    adapter.onError((m) => {
      if (gen === this.generation) this.set({ status: 'error', error: m });
    });
    try {
      await adapter.load(source);
    } catch (e) {
      if (gen === this.generation) this.set({ status: 'error', error: e instanceof Error ? e.message : 'Ladefehler' });
      return;
    }
    if (gen !== this.generation) return;
    this.set({ status: 'ready' });
    if (autoplay) await this.play();
  }

  async play(): Promise<void> {
    if (!this.adapter) return;
    try {
      await this.adapter.play();
      this.set({ status: 'playing', needsGesture: false, error: null });
      this.raf = requestAnimationFrame(this.tick);
    } catch (e) {
      const blocked = e instanceof DOMException && e.name === 'NotAllowedError';
      this.set(
        blocked
          ? { status: 'ready', needsGesture: true }
          : { status: 'error', error: 'Wiedergabe fehlgeschlagen. Tippe auf „Erneut versuchen“.' },
      );
    }
  }

  pause(): void {
    this.adapter?.pause();
    if (this.snap.status === 'playing') this.set({ status: 'paused', position: this.adapter?.position() ?? 0 });
  }

  toggle(): Promise<void> | void {
    return this.snap.status === 'playing' ? this.pause() : this.play();
  }

  /** Von vorne starten (Wiederholen). */
  async restart(): Promise<void> {
    this.adapter?.stop();
    this.set({ position: 0 });
    await this.play();
  }

  /** Erneuter Ladeversuch nach einem Fehler. */
  async retry(): Promise<void> {
    if (this.source) await this.load(this.source, true);
  }

  setVolume(v: number): void {
    this.adapter?.setVolume(v);
    this.set({ volume: v });
    try {
      localStorage.setItem(VOLUME_KEY, String(v));
    } catch {
      /* ignorieren */
    }
  }

  private reset(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.adapter?.dispose();
    this.adapter = null;
  }

  stopAndClear(): void {
    this.generation++;
    this.reset();
    this.source = null;
    this.snap = { ...initial(), volume: this.snap.volume };
    this.listeners.forEach((l) => l());
  }
}
