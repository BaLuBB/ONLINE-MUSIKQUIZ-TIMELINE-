import { AlertTriangle, Loader2, Pause, Play, RotateCcw, Volume2 } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import type { AudioController } from '../audio/AudioController.ts';
import { Button, Chip } from './ui.tsx';

interface Props {
  audio: AudioController;
  canReplay: boolean;
  /** Tipp ist abgegeben: der Ausschnitt darf nicht noch einmal von vorn gespielt werden. */
  locked?: boolean;
  replaysLeft: number | null; // null = unbegrenzt
  onReplay(): void;
}

const fmt = (s: number) => `0:${String(Math.floor(s)).padStart(2, '0')}`;

export function AudioPanel({ audio, canReplay, locked = false, replaysLeft, onReplay }: Props) {
  const snap = useSyncExternalStore(audio.subscribe, audio.getSnapshot);
  const pct = snap.duration > 0 ? Math.min(100, (snap.position / snap.duration) * 100) : 0;
  const playing = snap.status === 'playing';

  let status = 'Bereit';
  if (snap.status === 'loading') status = 'Lädt …';
  else if (playing) status = 'Spielt';
  else if (snap.status === 'paused') status = 'Pausiert';
  else if (snap.status === 'ended') status = 'Ausschnitt beendet';
  else if (snap.status === 'error') status = 'Wiedergabe nicht möglich';
  else if (snap.needsGesture) status = 'Tippe auf Play, um zu starten';

  return (
    <section className="audio-panel" aria-label="Musikwiedergabe">
      <div className="audio-row">
        <button
          type="button"
          className="play-btn"
          onClick={() => void audio.toggle()}
          disabled={snap.status === 'loading' || snap.status === 'idle' || snap.status === 'error' || (locked && snap.status === 'ended')}
          aria-label={playing ? 'Pause' : 'Abspielen'}
        >
          {snap.status === 'loading' ? <Loader2 className="spin" size={22} /> : playing ? <Pause size={22} /> : <Play size={22} />}
        </button>
        <div className="audio-main">
          <div className="audio-status" aria-live="polite">
            <span>{status}</span>
            {snap.isDemo && <Chip tone="warn">Demo-Ton</Chip>}
          </div>
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(snap.duration)} aria-valuenow={Math.round(snap.position)} aria-label="Wiedergabeposition">
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="audio-time">
            <span>{fmt(snap.position)}</span>
            <span>{fmt(snap.duration)}</span>
          </div>
        </div>
        <label className="volume">
          <Volume2 size={16} aria-hidden />
          <span className="sr-only">Lautstärke</span>
          <input type="range" min={0.05} max={1} step={0.05} value={snap.volume} onChange={(e) => audio.setVolume(Number(e.target.value))} />
        </label>
      </div>

      {snap.status === 'error' && (
        <div className="audio-error" role="alert">
          <AlertTriangle size={16} />
          <span>{snap.error ?? 'Die Wiedergabe ist fehlgeschlagen.'}</span>
          <Button size="sm" onClick={() => void audio.retry()}>
            Erneut versuchen
          </Button>
        </div>
      )}
      {snap.needsGesture && snap.status !== 'error' && (
        <div className="audio-hint">
          Dein Browser blockiert den automatischen Start.
          <Button size="sm" variant="primary" icon={<Play size={14} />} onClick={() => void audio.play()}>
            Jetzt abspielen
          </Button>
        </div>
      )}

      <div className="audio-foot">
        <span className="audio-attr">{snap.attribution}</span>
        {canReplay && locked && <span className="muted small">Tipp abgegeben – kein Wiederholen mehr.</span>}
        {canReplay && !locked && (
          <Button size="sm" icon={<RotateCcw size={14} />} disabled={replaysLeft === 0} onClick={onReplay}>
            Nochmal von vorn{replaysLeft !== null ? ` (${replaysLeft})` : ''}
          </Button>
        )}
      </div>
    </section>
  );
}

export function ListeningIndicator({ name }: { name: string }) {
  return (
    <div className="listening" role="status">
      <span className="eq" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>{name} hört zu …</span>
    </div>
  );
}
