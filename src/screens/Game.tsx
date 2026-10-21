import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Layers, LogOut, PenLine, X } from 'lucide-react';
import type { RevealedCard } from '@engine/types.ts';
import { AudioPanel, ListeningIndicator } from '../components/AudioPanel.tsx';
import { ConnectionBadge } from '../components/ConnectionBadge.tsx';
import { Logo } from '../components/Logo.tsx';
import { PlayerStrip } from '../components/PlayerStrip.tsx';
import { FaceDownCard, FlipCard } from '../components/SongCard.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { Timeline } from '../components/Timeline.tsx';
import { Button, Chip, Dialog, Field, IconButton } from '../components/ui.tsx';
import { useGame } from '../lib/GameProvider.tsx';
import { formatCode } from '../lib/format.ts';

export function Game() {
  const { state, me, session, presence, isMyTurn, act, busy, audio, leave } = useGame();
  const [selected, setSelected] = useState<number | null>(null);
  const [guessOpen, setGuessOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const turnId = state?.turn?.playerId ?? null;
  const cardId = state?.turn?.cardId ?? null;

  // Auswahl zurücksetzen, sobald sich Karte oder Zug ändert
  useEffect(() => {
    setSelected(null);
  }, [cardId, turnId, state?.phase]);
  // Standardansicht folgt dem aktiven Spieler
  useEffect(() => {
    setViewId(null);
  }, [turnId]);

  const active = useMemo(() => state?.players.find((p) => p.id === turnId) ?? null, [state, turnId]);
  if (!state || !me || !session) return null;

  const viewed = state.players.find((p) => p.id === (viewId ?? turnId)) ?? me;
  const phase = state.phase;
  const result = phase === 'resolving_turn' ? state.lastResult : null;
  const drawn = Boolean(cardId) && phase === 'playing';
  const activeName = active?.name ?? '…';
  const canPlace = isMyTurn && drawn;
  const viewingActive = viewed.id === turnId;
  const replaysLeft = state.settings.maxReplays > 0 ? Math.max(0, state.settings.maxReplays - (state.turn?.replaysUsed ?? 0)) : null;

  const place = async () => {
    if (selected === null) return;
    const res = await act({ type: 'place', position: selected });
    if (res.ok) setSelected(null);
  };

  const actionBar = (
    <div className="action-bar">
      {state.settings.titleBonus && (
        <Button icon={state.turn?.guessMade ? <Check size={16} /> : <PenLine size={16} />} disabled={state.turn?.guessMade || busy} onClick={() => setGuessOpen(true)}>
          {state.turn?.guessMade ? 'Tipp abgegeben' : 'Songtitel erraten'}
        </Button>
      )}
      <Button variant="primary" icon={<ArrowRight size={16} />} disabled={selected === null} loading={busy} onClick={() => void place()}>
        Karte platzieren
      </Button>
    </div>
  );

  const title = phase === 'resolving_turn' ? (result?.playerId === me.id ? 'Dein Ergebnis' : `Ergebnis von ${activeName}`) : isMyTurn ? 'Du bist dran' : `${activeName} ist dran`;

  return (
    <div className="shell game-shell">
      <header className="topbar">
        <Logo compact />
        <div className="topbar-mid">
          <Chip>{formatCode(state.code)}</Chip>
          <span className="hide-sm">
            <Chip>Runde {state.round}</Chip>
          </span>
        </div>
        <div className="topbar-right">
          <ConnectionBadge />
          <ThemeToggle />
          <IconButton label="Spiel verlassen" onClick={() => setConfirmLeave(true)}>
            <LogOut size={18} />
          </IconButton>
        </div>
      </header>

      <PlayerStrip players={state.players} settings={state.settings} activeId={turnId} meId={me.id} hostId={state.hostId} presence={presence} viewId={viewed.id} onView={setViewId} />

      <main className="game-main">
        <section className="stage" aria-labelledby="turn-title">
          <p className="eyebrow">Runde {state.round} · {phase === 'resolving_turn' ? 'Aufgedeckt' : isMyTurn ? 'Dein Zug' : 'Am Zug'}</p>
          <h1 id="turn-title" className={isMyTurn ? 'turn-me' : ''}>
            {title}
          </h1>

          <div className="stage-card">
            {phase === 'resolving_turn' && result ? (
              <FlipCard card={result.card} revealed tone={result.correct ? 'correct' : 'wrong'} />
            ) : drawn ? (
              <div
                className={`card-drag${canPlace ? ' can-drag' : ''}`}
                draggable={canPlace}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', 'card');
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <FaceDownCard className="drawn" flip />
              </div>
            ) : (
              <div className="deck-stack" aria-label={`Kartenstapel, noch ${state.deckRemaining} Karten`}>
                <FaceDownCard className="d3" />
                <FaceDownCard className="d2" />
                <FaceDownCard className="d1" />
              </div>
            )}
          </div>

          <div className="stage-controls" aria-live="polite">
            {phase === 'resolving_turn' && result ? (
              <ResultPanel />
            ) : isMyTurn && !drawn ? (
              <>
                <Button variant="primary" size="lg" icon={<Layers size={18} />} loading={busy} onClick={() => void act({ type: 'draw' })}>
                  Karte ziehen
                </Button>
                <p className="muted small">Der Song startet automatisch – Titel, Interpret und Jahr bleiben verborgen.</p>
              </>
            ) : isMyTurn && drawn ? (
              <>
                <AudioPanel
                  audio={audio}
                  canReplay={state.settings.allowReplay}
                  replaysLeft={replaysLeft}
                  onReplay={() => void act({ type: 'replay' })}
                />
                <div className="action-desktop">{actionBar}</div>
                <p className="muted small center">{selected === null ? 'Tippe im Zeitstrahl auf eine Position oder ziehe die Karte dorthin.' : 'Position gewählt – bestätige mit „Karte platzieren“.'}</p>
              </>
            ) : isMyTurn || !active ? null : (
              <>
                <ListeningIndicator name={activeName} />
                {drawn && state.turn?.guessMade && <p className="muted small">{activeName} hat einen Titel getippt.</p>}
                {!drawn && <p className="muted small">{activeName} zieht gleich eine Karte.</p>}
              </>
            )}
          </div>
        </section>

        <section className="timeline-section" aria-label={`Zeitstrahl von ${viewed.name}`}>
          <div className="timeline-head">
            <h2>
              {viewed.id === me.id ? 'Dein Zeitstrahl' : `Zeitstrahl von ${viewed.name}`}
              <small>
                {' '}
                · {viewed.timeline.length} {viewed.timeline.length === 1 ? 'Karte' : 'Karten'}
              </small>
            </h2>
            {!viewingActive && <Button size="sm" variant="ghost" onClick={() => setViewId(null)}>Zurück zum aktiven Spieler</Button>}
          </div>
          <Timeline
            cards={viewed.timeline}
            interactive={canPlace && viewed.id === me.id}
            selected={viewed.id === me.id ? selected : null}
            onSelect={setSelected}
            lastCardId={result && result.playerId === viewed.id && result.correct ? result.cardId : null}
            lastTone="correct"
            startCardId={viewed.timeline[0]?.cardId}
            ownerName={viewed.name}
          />
          {canPlace && viewed.id !== me.id && (
            <p className="banner banner-warn center">
              Du legst auf deinen eigenen Zeitstrahl.{' '}
              <button type="button" className="link" onClick={() => setViewId(me.id)}>
                Meinen Zeitstrahl anzeigen
              </button>
            </p>
          )}
        </section>
        {canPlace && <div className="action-mobile">{actionBar}</div>}
      </main>

      <GuessDialog open={guessOpen} onClose={() => setGuessOpen(false)} />

      <Dialog open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Spiel verlassen?">
        <p className="muted">Wenn du gehst, wirst du aus der laufenden Partie entfernt. Mit dem Raumcode kannst du nicht wieder einsteigen.</p>
        <div className="dialog-actions">
          <Button onClick={() => setConfirmLeave(false)}>Weiterspielen</Button>
          <Button variant="danger" onClick={() => void leave()}>
            Verlassen
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function GuessDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { act, busy } = useGame();
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText('');
  }, [open]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await act({ type: 'guess', text });
    if (res.ok) onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title="Songtitel erraten">
      <form onSubmit={submit} className="stack-lg" noValidate>
        <Field label="Wie heißt der Song?" value={text} onChange={(e) => setText(e.target.value)} maxLength={100} autoFocus autoComplete="off" hint="Nur der Titel. Du hast einen Versuch pro Karte; ob er stimmt, siehst du beim Aufdecken." />
        <div className="dialog-actions">
          <Button onClick={onClose}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={!text.trim()} loading={busy}>
            Tipp abgeben
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ResultPanel() {
  const { state, me, act, busy, isHost } = useGame();
  const [waited, setWaited] = useState(false);
  const resolvedAt = state?.lastResult?.resolvedAt;
  useEffect(() => {
    setWaited(false);
    const t = setTimeout(() => setWaited(true), 8200);
    return () => clearTimeout(t);
  }, [resolvedAt]);
  const r = state?.lastResult;
  if (!state || !r || !me) return null;
  const mine = r.playerId === me.id;
  const who = state.players.find((p) => p.id === r.playerId)?.name ?? 'Spieler';
  const canContinue = mine || isHost || waited;
  const card: RevealedCard = r.card;

  return (
    <div className={`result ${r.correct ? 'result-ok' : 'result-bad'}`} role="status">
      <div className="result-head">
        {r.correct ? <Check size={20} /> : <X size={20} />}
        <strong>{r.correct ? (mine ? 'Richtig platziert!' : `${who} lag richtig`) : mine ? 'Leider falsch platziert' : `${who} lag daneben`}</strong>
      </div>
      <p className="result-song">
        {card.title} – {card.artist} · <b>{card.year}</b>
      </p>
      <ul className="result-points">
        <li className={r.correct ? 'gain' : ''}>{r.correct ? '+1 Karte' : 'Karte abgelegt'}</li>
        {state.settings.titleBonus && (
          <li className={r.titleCorrect ? 'gain' : ''}>
            {r.guess === null ? 'Kein Titel getippt' : r.titleCorrect ? '+1 Titel-Bonus' : `Titel „${r.guess}“ war nicht richtig`}
          </li>
        )}
        <li>Gesamt: {r.totalPoints} Pkt.</li>
      </ul>
      <Button variant="primary" icon={<ArrowRight size={16} />} disabled={!canContinue} loading={busy} onClick={() => void act({ type: 'nextTurn' })}>
        Weiter
      </Button>
      {!canContinue && <p className="muted small">Der aktive Spieler schaltet gleich weiter …</p>}
    </div>
  );
}
