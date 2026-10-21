import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { TurnResult } from '@engine/types.ts';
import { useCover } from '../lib/covers.ts';
import { colorVar } from '../lib/colors.ts';

function FeedRow({ r, titleBonus }: { r: TurnResult; titleBonus: boolean }) {
  const cover = useCover(r.card);
  const [broken, setBroken] = useState(false);
  return (
    <li className={`feed-row ${r.correct ? 'ok' : 'bad'}`} style={{ '--pc': colorVar(r.playerColor) } as React.CSSProperties}>
      <span className="feed-thumb">{cover && !broken ? <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : <span aria-hidden>♪</span>}</span>
      <span className="feed-main">
        <span className="feed-who">
          <span className="swatch" aria-hidden />
          <strong>{r.playerName}</strong>
          <span className={`feed-badge ${r.correct ? 'ok' : 'bad'}`}>
            {r.correct ? <Check size={12} aria-hidden /> : <X size={12} aria-hidden />}
            {r.correct ? 'richtig eingeordnet' : 'falsch eingeordnet'}
          </span>
        </span>
        <span className="feed-song">
          {r.card.title} – {r.card.artist} · <b>{r.card.year}</b>
        </span>
        {titleBonus && (
          <span className="feed-guess">
            {r.guess === null ? (
              'Kein Titel getippt'
            ) : (
              <>
                Tipp: „{r.guess}“ {r.titleCorrect ? <span className="ok">✓ +1 Bonus</span> : <span className="bad">✗</span>}
              </>
            )}
          </span>
        )}
      </span>
    </li>
  );
}

/** Zugverlauf: für alle sichtbar, mit Spielerfarbe, Cover, Titel und dem Titel-Tipp jedes Spielers. */
export function TurnFeed({ recent, titleBonus }: { recent: TurnResult[]; titleBonus: boolean }) {
  if (recent.length === 0) return null;
  const rows = [...recent].reverse();
  return (
    <section className="feed" aria-label="Zugverlauf">
      <h2>Zugverlauf</h2>
      <ol>
        {rows.map((r) => (
          <FeedRow key={`${r.playerId}-${r.cardId}-${r.resolvedAt}`} r={r} titleBonus={titleBonus} />
        ))}
      </ol>
    </section>
  );
}
