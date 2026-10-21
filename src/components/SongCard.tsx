import { useState, type CSSProperties } from 'react';
import type { RevealedCard } from '@engine/types.ts';
import { useCover } from '../lib/covers.ts';

/** Eigenständiges Kartenmotiv: konzentrische Rillen einer Schallplatte, ohne Songinformationen. */
export function CardBackArt() {
  return (
    <svg viewBox="0 0 120 160" className="card-art" aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <circle cx="60" cy="80" r="46" strokeWidth="1" opacity=".35" />
        <circle cx="60" cy="80" r="37" strokeWidth="1" opacity=".5" />
        <circle cx="60" cy="80" r="28" strokeWidth="1" opacity=".7" />
        <circle cx="60" cy="80" r="6" strokeWidth="2" />
        <path d="M60 34v-14M60 140v-14" strokeWidth="1.4" opacity=".6" />
      </g>
      <circle cx="60" cy="80" r="2" fill="currentColor" />
      <text x="60" y="152" textAnchor="middle" fontSize="7" letterSpacing="3" fill="currentColor" opacity=".7" fontWeight="600">
        TIMELINE
      </text>
    </svg>
  );
}

export function FaceDownCard({ label = 'Verdeckte Musikkarte', className = '', flip }: { label?: string; className?: string; flip?: boolean }) {
  return (
    <div className={`song-card face-down ${flip ? 'flipping' : ''} ${className}`} role="img" aria-label={label}>
      <CardBackArt />
    </div>
  );
}

/** Platzhalter, solange (oder falls) kein Cover vorliegt. */
function CoverFallback() {
  return (
    <svg viewBox="0 0 100 60" className="cover-fallback" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".55">
        <circle cx="50" cy="30" r="22" />
        <circle cx="50" cy="30" r="14" />
        <circle cx="50" cy="30" r="3.5" />
      </g>
    </svg>
  );
}

export function FaceUpCard({
  card,
  tone,
  className = '',
  flipIn,
  color,
}: {
  card: RevealedCard;
  tone?: 'correct' | 'wrong' | 'start';
  className?: string;
  flipIn?: boolean;
  /** Farbe des Spielers, dem die Karte gehört (CSS-Wert). */
  color?: string;
}) {
  const cover = useCover(card);
  const [broken, setBroken] = useState<string | null>(null); // Cover, die nicht geladen werden konnten
  const showCover = cover && broken !== cover;
  return (
    <div
      className={`song-card face-up${tone ? ` tone-${tone}` : ''}${flipIn ? ' flip-in' : ''} ${className}`}
      style={color ? ({ '--owner': color } as CSSProperties) : undefined}
    >
      <div className="card-cover">
        {showCover ? <img src={cover} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(cover)} /> : <CoverFallback />}
        <span className="card-year">{card.year}</span>
      </div>
      <div className="card-body">
        <span className="card-title" title={card.title}>
          {card.title}
        </span>
        <span className="card-artist" title={card.artist}>
          {card.artist}
        </span>
      </div>
    </div>
  );
}

/** Karte, die sich beim Aufdecken umdreht: Rückseite → Vorderseite. */
export function FlipCard({ card, revealed, tone, color }: { card: RevealedCard | null; revealed: boolean; tone?: 'correct' | 'wrong'; color?: string }) {
  return (
    <div className={`flip${revealed ? ' is-flipped' : ''}`}>
      <div className="flip-inner">
        <div className="flip-face flip-front">
          <FaceDownCard />
        </div>
        <div className="flip-face flip-back">{card ? <FaceUpCard card={card} tone={tone} color={color} /> : <FaceDownCard />}</div>
      </div>
    </div>
  );
}
