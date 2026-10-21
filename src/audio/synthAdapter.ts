import { seededRng } from '@engine/rng.ts';
import type { AudioPlayback } from '@engine/types.ts';
import type { PlaybackAdapter } from './types.ts';

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16]; // Dur-Pentatonik über zwei Oktaven

/** Erzeugt aus einem Seed eine kurze Testmelodie (WebAudio). Nur für den Demo-Modus. */
export class SynthAdapter implements PlaybackAdapter {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private volume = 0.8;
  private duration = 12;
  private seed = 1;
  private startedAt = 0;
  private offset = 0;
  private playing = false;
  private nodes: OscillatorNode[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private endedCb: () => void = () => {};

  async load(source: AudioPlayback): Promise<void> {
    if (source.kind !== 'synth') throw new Error('Falscher Quellentyp');
    this.seed = source.seed;
    this.duration = source.durationSec;
    this.offset = 0;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error('Dieser Browser unterstützt keine Audiowiedergabe.');
    this.ctx ??= new Ctor();
    this.gain ??= this.ctx.createGain();
    this.gain.gain.value = this.volume;
    this.gain.connect(this.ctx.destination);
  }

  private clearNodes(): void {
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* bereits gestoppt */
      }
      n.disconnect();
    }
    this.nodes = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async play(): Promise<void> {
    if (!this.ctx || !this.gain) throw new Error('Nicht geladen');
    await this.ctx.resume();
    if (this.offset >= this.duration) this.offset = 0;
    this.clearNodes();
    const rng = seededRng(this.seed);
    const tempo = 0.28 + rng() * 0.12; // Sekunden pro Note
    const base = 220 * 2 ** (Math.floor(rng() * 7) / 12);
    const t0 = this.ctx.currentTime;
    let t = 0;
    while (t < this.duration) {
      const len = rng() < 0.3 ? tempo * 2 : tempo;
      const step = SCALE[Math.floor(rng() * SCALE.length)];
      if (t + len > this.offset) {
        const start = Math.max(0, t - this.offset);
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        osc.type = rng() < 0.5 ? 'triangle' : 'sine';
        osc.frequency.value = base * 2 ** (step / 12);
        env.gain.setValueAtTime(0, t0 + start);
        env.gain.linearRampToValueAtTime(0.5, t0 + start + 0.02);
        env.gain.exponentialRampToValueAtTime(0.001, t0 + start + len * 0.95);
        osc.connect(env).connect(this.gain);
        osc.start(t0 + start);
        osc.stop(t0 + start + len);
        this.nodes.push(osc);
      }
      t += len;
    }
    this.startedAt = t0 - 0; // Referenz für position()
    this.playing = true;
    const remaining = Math.max(0, this.duration - this.offset);
    this.timer = setTimeout(() => {
      this.playing = false;
      this.offset = this.duration;
      this.endedCb();
    }, remaining * 1000);
    this.startedAt = this.ctx.currentTime - this.offset;
  }

  pause(): void {
    if (!this.playing || !this.ctx) return;
    this.offset = Math.min(this.duration, this.ctx.currentTime - this.startedAt);
    this.playing = false;
    this.clearNodes();
  }
  stop(): void {
    this.playing = false;
    this.offset = 0;
    this.clearNodes();
  }
  seek(sec: number): void {
    this.offset = sec;
  }
  setVolume(v: number): void {
    this.volume = v;
    if (this.gain) this.gain.gain.value = v;
  }
  position(): number {
    if (!this.ctx) return 0;
    return this.playing ? Math.min(this.duration, this.ctx.currentTime - this.startedAt) : this.offset;
  }
  dispose(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.gain = null;
  }
  onEnded(cb: () => void): void {
    this.endedCb = cb;
  }
  onError(): void {
    /* Der Synthesizer erzeugt keine asynchronen Fehler. */
  }
}
