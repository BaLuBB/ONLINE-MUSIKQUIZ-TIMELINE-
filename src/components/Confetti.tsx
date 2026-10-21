import { useMemo } from 'react';

/** Dezentes Konfetti rein per CSS; wird bei reduzierter Bewegung ausgeblendet. */
export function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.6,
        dur: 3.2 + Math.random() * 2.6,
        size: 5 + Math.random() * 6,
        rot: Math.random() * 360,
        hue: ['var(--accent)', 'var(--ink)', 'var(--success)', 'var(--warn)', 'var(--ink-3)'][i % 5],
        drift: (Math.random() - 0.5) * 120,
      })),
    [],
  );
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.5,
            background: p.hue,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            ['--rot' as string]: `${p.rot}deg`,
            ['--drift' as string]: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
