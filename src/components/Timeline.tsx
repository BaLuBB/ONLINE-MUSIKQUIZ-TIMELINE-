import { Fragment, useEffect, useRef } from 'react';
import type { RevealedCard } from '@engine/types.ts';
import { FaceDownCard, FaceUpCard } from './SongCard.tsx';

interface Props {
  cards: RevealedCard[];
  /** Platzieren möglich (aktiver Spieler mit gezogener Karte)? */
  interactive: boolean;
  selected: number | null;
  onSelect(position: number): void;
  /** Zuletzt gelegte Karte hervorheben. */
  lastCardId?: string | null;
  lastTone?: 'correct' | 'wrong';
  startCardId?: string;
  ownerName: string;
  /** Farbe des Zeitstrahl-Besitzers (CSS-Wert) */
  ownerColor?: string;
}

function slotLabel(cards: RevealedCard[], i: number): string {
  const l = cards[i - 1];
  const r = cards[i];
  if (!l && !r) return 'Karte hier einordnen';
  if (!l) return `Vor ${r.year} einordnen`;
  if (!r) return `Nach ${l.year} einordnen`;
  return `Zwischen ${l.year} und ${r.year} einordnen`;
}

export function Timeline({ cards, interactive, selected, onSelect, lastCardId, lastTone, startCardId, ownerName, ownerColor }: Props) {
  const scroller = useRef<HTMLDivElement>(null);

  // Gewählten Platz bzw. neue Karte in den sichtbaren Bereich scrollen
  // Nur den Zeitstrahl horizontal scrollen – nicht die ganze Seite (kein Springen beim Platzieren).
  useEffect(() => {
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>('[data-scroll-target="true"]');
    if (!box || !el) return;
    const left = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
    box.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [selected, lastCardId, cards.length]);

  return (
    <div className="timeline-wrap">
      <div className="timeline-scroll" ref={scroller} role="list" aria-label={`Zeitstrahl von ${ownerName}`}>
        <div className="timeline-track" aria-hidden />
        {Array.from({ length: cards.length + 1 }, (_, i) => (
          <Fragment key={i}>
            {interactive || selected === i ? (
              <div role="listitem" className="slot-wrap">
                <button
                  type="button"
                  className={`slot${selected === i ? ' selected' : ''}`}
                  disabled={!interactive}
                  aria-pressed={selected === i}
                  aria-label={slotLabel(cards, i)}
                  data-scroll-target={selected === i}
                  onClick={() => onSelect(i)}
                  onDragOver={(e) => {
                    if (interactive) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (interactive) onSelect(i);
                  }}
                >
                  {selected === i ? <FaceDownCard className="ghost" label="Gewählte Position" /> : <span className="slot-plus" aria-hidden>+</span>}
                </button>
              </div>
            ) : (
              <div role="presentation" className="slot-gap" />
            )}
            {i < cards.length && (
              <div role="listitem" className="tl-item" data-scroll-target={cards[i].cardId === lastCardId}>
                <FaceUpCard
                  card={cards[i]}
                  tone={cards[i].cardId === lastCardId ? lastTone : cards[i].cardId === startCardId ? 'start' : undefined}
                  flipIn={cards[i].cardId === lastCardId}
                  color={ownerColor}
                />
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
