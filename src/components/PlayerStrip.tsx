import type { PlayerPublic, Settings } from '@engine/types.ts';
import { progressOf, totalPoints } from '@engine/engine.ts';
import { Crown, WifiOff } from 'lucide-react';

interface Props {
  players: PlayerPublic[];
  settings: Settings;
  activeId: string | null;
  meId: string | null;
  hostId: string;
  presence: Set<string>;
  viewId: string | null;
  onView(id: string): void;
}

export function PlayerStrip({ players, settings, activeId, meId, hostId, presence, viewId, onView }: Props) {
  return (
    <ul className="player-strip" aria-label="Spielerübersicht">
      {players.map((p) => {
        const progress = progressOf(p, settings);
        const away = presence.size > 0 && !presence.has(p.id);
        return (
          <li key={p.id}>
            <button
              type="button"
              className={`pcard${p.id === activeId ? ' active' : ''}${p.id === viewId ? ' viewing' : ''}${away ? ' away' : ''}`}
              onClick={() => onView(p.id)}
              aria-current={p.id === activeId ? 'true' : undefined}
              aria-pressed={p.id === viewId}
            >
              <span className="pcard-top">
                <span className="pcard-name">
                  {p.name}
                  {p.id === meId && <small> (du)</small>}
                </span>
                {p.id === hostId && <Crown size={13} aria-label="Host" />}
                {away && <WifiOff size={13} aria-label="Getrennt" />}
              </span>
              <span className="pcard-prog">
                <span className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={settings.targetCards} aria-valuenow={progress} aria-label={`${p.name}: ${progress} von ${settings.targetCards} Karten`}>
                  <span style={{ width: `${Math.min(100, (progress / settings.targetCards) * 100)}%` }} />
                </span>
                <span className="pcard-num">
                  {progress}/{settings.targetCards}
                </span>
              </span>
              <span className="pcard-pts">
                {totalPoints(p)} Pkt.
                {p.bonusPoints > 0 && <small> · {p.bonusPoints} Bonus</small>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
