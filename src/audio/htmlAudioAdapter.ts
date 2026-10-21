import type { AudioPlayback } from '@engine/types.ts';
import type { PlaybackAdapter } from './types.ts';

/** Spielt eine URL-Quelle (z. B. 30-s-Vorschau) über ein <audio>-Element und stoppt an der Zielposition. */
export class HtmlAudioAdapter implements PlaybackAdapter {
  private el = new Audio();
  private limit = 30;
  private endedCb: () => void = () => {};
  private errorCb: (m: string) => void = () => {};
  private ended = false;

  constructor() {
    this.el.preload = 'auto';
    this.el.addEventListener('ended', () => this.finish());
    this.el.addEventListener('timeupdate', () => {
      if (this.el.currentTime >= this.limit) this.finish();
    });
    this.el.addEventListener('error', () => this.errorCb('Die Audiodatei konnte nicht geladen werden.'));
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.el.pause();
    this.endedCb();
  }

  load(source: AudioPlayback): Promise<void> {
    if (source.kind !== 'url') return Promise.reject(new Error('Falscher Quellentyp'));
    this.limit = source.durationSec;
    this.ended = false;
    return new Promise((resolve, reject) => {
      const ok = () => {
        cleanup();
        resolve();
      };
      const bad = () => {
        cleanup();
        reject(new Error('Die Audiodatei konnte nicht geladen werden.'));
      };
      const cleanup = () => {
        this.el.removeEventListener('canplay', ok);
        this.el.removeEventListener('error', bad);
        clearTimeout(timer);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Zeitüberschreitung beim Laden der Audiodatei.'));
      }, 12000);
      this.el.addEventListener('canplay', ok, { once: true });
      this.el.addEventListener('error', bad, { once: true });
      this.el.src = source.url;
      this.el.load();
    });
  }

  async play(): Promise<void> {
    if (this.ended) {
      this.ended = false;
      this.el.currentTime = 0;
    }
    await this.el.play();
  }
  pause(): void {
    this.el.pause();
  }
  stop(): void {
    this.el.pause();
    this.el.currentTime = 0;
    this.ended = false;
  }
  seek(sec: number): void {
    this.el.currentTime = sec;
  }
  setVolume(v: number): void {
    this.el.volume = v;
  }
  position(): number {
    return this.el.currentTime;
  }
  dispose(): void {
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
  }
  onEnded(cb: () => void): void {
    this.endedCb = cb;
  }
  onError(cb: (m: string) => void): void {
    this.errorCb = cb;
  }
}
