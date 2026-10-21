import type { RankingEntry } from '@engine/types.ts';
import { Trophy } from 'lucide-react';

const ORDER = [1, 0, 2]; // Anzeige: Platz 2 links, 1 Mitte, 3 rechts

export function Podium({ ranking }: { ranking: RankingEntry[] }) {
  const top = ranking.slice(0, 3);
  const slots = ORDER.map((idx) => top[idx]).filter(Boolean) as RankingEntry[];
  return (
    <ol className={`podium podium-${top.length}`} aria-label="Siegerpodest">
      {slots.map((r) => (
        <li key={r.playerId} className={`podium-slot place-${r.rank}`}>
          <div className="podium-who">
            {r.rank === 1 && <Trophy size={22} aria-hidden />}
            <strong>{r.name}</strong>
            <span>
              {r.cards} Karten · {r.points} Pkt.
            </span>
          </div>
          <div className="podium-block">
            <span>{r.rank}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
