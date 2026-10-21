import type { RevealedCard } from '@engine/types.ts';

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

export function FaceUpCard({ card, tone, className = '', flipIn }: { card: RevealedCard; tone?: 'correct' | 'wrong' | 'start'; className?: string; flipIn?: boolean }) {
  return (
    <div className={`song-card face-up${tone ? ` tone-${tone}` : ''}${flipIn ? ' flip-in' : ''} ${className}`}>
      <span className="card-year">{card.year}</span>
      <span className="card-title" title={card.title}>
        {card.title}
      </span>
      <span className="card-artist" title={card.artist}>
        {card.artist}
      </span>
    </div>
  );
}

/** Karte, die sich beim Aufdecken umdreht: Rückseite → Vorderseite. */
export function FlipCard({ card, revealed, tone }: { card: RevealedCard | null; revealed: boolean; tone?: 'correct' | 'wrong' }) {
  return (
    <div className={`flip${revealed ? ' is-flipped' : ''}`}>
      <div className="flip-inner">
        <div className="flip-face flip-front">
          <FaceDownCard />
        </div>
        <div className="flip-face flip-back">{card ? <FaceUpCard card={card} tone={tone} /> : <FaceDownCard />}</div>
      </div>
    </div>
  );
}
