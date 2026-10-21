import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Crown, LogOut, Play, Share2, UserMinus, WifiOff } from 'lucide-react';
import type { Settings } from '@engine/types.ts';
import { genreLabel } from '@engine/genres.ts';
import { ConnectionBadge } from '../components/ConnectionBadge.tsx';
import { Logo } from '../components/Logo.tsx';
import { SettingsForm } from '../components/SettingsForm.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { Button, Chip, IconButton } from '../components/ui.tsx';
import { copyText, formatCode, inviteLink } from '../lib/format.ts';
import { useGame } from '../lib/GameProvider.tsx';

export function Lobby() {
  const { state, me, isHost, presence, act, leave, notify, busy } = useGame();
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  // Host-Einstellungen: lokal sofort anzeigen, gebündelt an den Server senden.
  const [draft, setDraft] = useState<Settings | null>(null);
  const pending = useRef<Partial<Settings>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return;
    pending.current = {};
    const res = await act({ type: 'updateSettings', patch });
    if (!res.ok && res.error.code === 'rate_limited') {
      // Eine andere Aktion läuft noch – später erneut senden.
      pending.current = { ...patch, ...pending.current };
      timer.current = setTimeout(() => void flush(), 400);
    } else if (!res.ok) {
      setDraft(null);
    }
  }, [act]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  useEffect(() => {
    if (Object.keys(pending.current).length === 0) setDraft(null);
  }, [state?.version]);

  if (!state || !me) return null;
  const settings = draft ?? state.settings;

  const change = (patch: Partial<Settings>) => {
    setDraft({ ...settings, ...patch });
    pending.current = { ...pending.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 350);
  };

  const flash = (what: 'code' | 'link') => {
    setCopied(what);
    setTimeout(() => setCopied(null), 1800);
  };
  const copyCode = async () => {
    if (await copyText(state.code)) flash('code');
    else notify('Kopieren nicht möglich – bitte den Code manuell abtippen.', 'error');
  };
  const share = async () => {
    const url = inviteLink(state.code);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'TIMELINE', text: `Komm in meine TIMELINE-Lobby! Code: ${state.code}`, url });
        return;
      } catch {
        /* abgebrochen – Link kopieren */
      }
    }
    if (await copyText(url)) flash('link');
    else notify(url, 'info');
  };

  const poolBlocked = state.pool.level === 'error';
  const canStart = isHost && state.players.length >= 2 && !poolBlocked;

  return (
    <div className="shell">
      <header className="topbar">
        <Logo />
        <div className="topbar-right">
          <ConnectionBadge />
          <ThemeToggle />
        </div>
      </header>

      <main className="lobby">
        <div className="lobby-head">
          <p className="eyebrow">{state.settings.roomName ? state.settings.roomName : 'Lobby'}</p>
          <h1>Warte auf Mitspieler</h1>
        </div>

        <div className="lobby-grid">
          <div className="stack-lg">
            <section className="panel code-panel" aria-labelledby="code-h">
              <h2 id="code-h" className="panel-title">
                Raumcode
              </h2>
              <div className="code-display" aria-label={`Raumcode ${state.code.split('').join(' ')}`}>
                {formatCode(state.code)}
              </div>
              <div className="row gap-2 wrap">
                <Button icon={copied === 'code' ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copyCode()}>
                  {copied === 'code' ? 'Kopiert' : 'Code kopieren'}
                </Button>
                <Button icon={copied === 'link' ? <Check size={16} /> : <Share2 size={16} />} onClick={() => void share()}>
                  {copied === 'link' ? 'Link kopiert' : 'Einladungslink'}
                </Button>
              </div>
            </section>

            <section className="panel" aria-labelledby="pl-h">
              <div className="panel-head">
                <h2 id="pl-h" className="panel-title">
                  Spieler
                </h2>
                <Chip>
                  {state.players.length} / {state.settings.maxPlayers}
                </Chip>
              </div>
              <ul className="player-list">
                {state.players.map((p) => {
                  const online = presence.size === 0 || presence.has(p.id);
                  return (
                    <li key={p.id} className="player-row">
                      <span className="avatar" aria-hidden>
                        {p.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="player-name">
                        {p.name}
                        {p.id === me.id && <small> (du)</small>}
                      </span>
                      {p.id === state.hostId && (
                        <Chip tone="accent">
                          <Crown size={12} /> Host
                        </Chip>
                      )}
                      <span className={`dot ${online ? 'on' : 'off'}`} role="img" aria-label={online ? 'Verbunden' : 'Getrennt'} title={online ? 'Verbunden' : 'Getrennt'}>
                        {!online && <WifiOff size={12} aria-hidden />}
                      </span>
                      {isHost && p.id !== me.id && (
                        <IconButton label={`${p.name} entfernen`} onClick={() => void act({ type: 'kick', targetId: p.id })}>
                          <UserMinus size={16} />
                        </IconButton>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="panel start-panel">
              {state.pool.message && (
                <p className={`banner banner-${state.pool.level === 'error' ? 'danger' : 'warn'}`} role="status">
                  {state.pool.message}
                </p>
              )}
              <p className="muted small">
                Musikbibliothek: <strong>{state.pool.size}</strong> Songs · Ziel: <strong>{state.settings.targetCards}</strong> Karten
              </p>
              {isHost ? (
                <Button variant="primary" size="lg" block icon={<Play size={18} />} loading={busy} disabled={!canStart} onClick={() => void act({ type: 'start' })}>
                  Spiel starten
                </Button>
              ) : (
                <p className="waiting-note">Warte darauf, dass der Host das Spiel startet …</p>
              )}
              {isHost && state.players.length < 2 && <p className="muted small center">Mindestens 2 Spieler nötig.</p>}
              <Button variant="ghost" block icon={<LogOut size={16} />} onClick={() => void leave()}>
                Lobby verlassen
              </Button>
            </section>
          </div>

          <section className="panel settings-panel" aria-labelledby="set-h">
            <h2 id="set-h" className="panel-title">
              Einstellungen {!isHost && <span className="muted small">· vom Host festgelegt</span>}
            </h2>
            {isHost ? (
              <SettingsForm settings={settings} counts={state.catalog} onChange={change} playerCount={state.players.length} />
            ) : (
              <ReadOnlySettings settings={state.settings} />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function ReadOnlySettings({ settings }: { settings: Settings }) {
  const diff = { easy: 'Einfach', normal: 'Normal', hard: 'Schwer' }[settings.difficulty];
  return (
    <div className="stack-lg">
      <dl className="facts">
        <div>
          <dt>Zielkarten</dt>
          <dd>{settings.targetCards}</dd>
        </div>
        <div>
          <dt>Max. Spieler</dt>
          <dd>{settings.maxPlayers}</dd>
        </div>
        <div>
          <dt>Schwierigkeit</dt>
          <dd>{diff}</dd>
        </div>
        <div>
          <dt>Titel-Bonus</dt>
          <dd>{settings.titleBonus ? 'An' : 'Aus'}</dd>
        </div>
        <div>
          <dt>Wiederholen</dt>
          <dd>{settings.allowReplay ? (settings.maxReplays ? `${settings.maxReplays}×` : 'Unbegrenzt') : 'Aus'}</dd>
        </div>
        <div>
          <dt>Startkarte zählt</dt>
          <dd>{settings.startCardCounts ? 'Ja' : 'Nein'}</dd>
        </div>
        {(settings.yearMin || settings.yearMax) && (
          <div>
            <dt>Zeitraum</dt>
            <dd>
              {settings.yearMin ?? '…'} – {settings.yearMax ?? '…'}
            </dd>
          </div>
        )}
      </dl>
      <div>
        <h3 className="small-title">Genres</h3>
        <div className="genre-chips">
          {settings.genres.length === 0 ? <span className="muted">Noch keine Auswahl</span> : settings.genres.map((g) => <Chip key={g}>{genreLabel(g)}</Chip>)}
        </div>
      </div>
    </div>
  );
}
