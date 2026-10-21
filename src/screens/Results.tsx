import { useMemo } from 'react';
import { Home, ListRestart, RotateCcw, Sparkles } from 'lucide-react';
import { ranking } from '@engine/engine.ts';
import { Confetti } from '../components/Confetti.tsx';
import { ConnectionBadge } from '../components/ConnectionBadge.tsx';
import { Logo } from '../components/Logo.tsx';
import { Podium } from '../components/Podium.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { Button } from '../components/ui.tsx';
import { useGame } from '../lib/GameProvider.tsx';
import { useUI } from '../lib/ui-context.tsx';

export function Results() {
  const { state, isHost, act, busy, leave } = useGame();
  const { open } = useUI();
  const rows = useMemo(() => (state ? ranking(state) : []), [state]);
  if (!state) return null;

  const winner = rows.find((r) => r.isWinner) ?? null;
  const rest = rows.slice(3);
  const abandoned = state.endReason === 'abandoned';
  const heading = winner && !abandoned ? 'Wir haben einen Gewinner!' : 'Das Spiel ist beendet';
  const sub =
    state.endReason === 'deck_empty'
      ? 'Die Musikkarten sind aufgebraucht – es gewinnt, wer am weitesten ist.'
      : abandoned
        ? 'Es sind nicht mehr genug Spieler übrig.'
        : null;

  const newGame = async () => {
    await leave();
    open('create');
  };

  return (
    <div className="shell results-shell">
      {winner && !abandoned && <Confetti />}
      <header className="topbar">
        <Logo />
        <div className="topbar-right">
          <ConnectionBadge />
          <ThemeToggle />
        </div>
      </header>
      <main className="results">
        <p className="eyebrow">
          <Sparkles size={14} aria-hidden /> Spielende
        </p>
        <h1>{heading}</h1>
        {winner && !abandoned && (
          <p className="winner-line">
            <strong>{winner.name}</strong> gewinnt mit {winner.cards} {winner.cards === 1 ? 'Karte' : 'Karten'} und {winner.points} Punkten
            {winner.bonusPoints > 0 && <span className="muted"> ({winner.placedCorrect} Karten + {winner.bonusPoints} Titel-Bonus)</span>}
          </p>
        )}
        {sub && <p className="muted">{sub}</p>}

        <Podium ranking={rows} />

        {rest.length > 0 && (
          <ol className="rank-list" start={4} aria-label="Weitere Plätze">
            {rest.map((r) => (
              <li key={r.playerId}>
                <span className="rank-no">{r.rank}</span>
                <span className="rank-name">{r.name}</span>
                <span className="muted">
                  {r.cards} Karten · {r.points} Pkt.
                </span>
              </li>
            ))}
          </ol>
        )}

        <details className="score-details">
          <summary>Punkte im Detail</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">Platz</th>
                <th scope="col">Spieler</th>
                <th scope="col">Karten</th>
                <th scope="col">Bonus</th>
                <th scope="col">Gesamt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.playerId}>
                  <td>{r.rank}</td>
                  <th scope="row">{r.name}</th>
                  <td>{r.placedCorrect}</td>
                  <td>{r.bonusPoints}</td>
                  <td>{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Bei Gleichstand entscheiden Fortschritt, Gesamtpunkte und zuletzt der frühere Beitritt. Der Spielgewinner ist immer, wer die Siegbedingung zuerst erreicht hat.</p>
        </details>

        <div className="results-actions">
          <Button variant="primary" size="lg" icon={<RotateCcw size={18} />} loading={busy} disabled={!isHost} onClick={() => void act({ type: 'restart' })}>
            Noch einmal spielen
          </Button>
          <Button size="lg" icon={<ListRestart size={18} />} disabled={!isHost || busy} onClick={() => void act({ type: 'toLobby' })}>
            Zur Lobby
          </Button>
          <Button size="lg" icon={<Home size={18} />} onClick={() => void newGame()}>
            Neues Spiel erstellen
          </Button>
        </div>
        {!isHost && <p className="muted small center">Nur der Host kann eine neue Runde starten oder zur Lobby zurückkehren.</p>}
      </main>
    </div>
  );
}
