import type { ReactNode } from 'react';
import { Speaker, Users } from 'lucide-react';
import type { PlayerPublic } from '@engine/types.ts';

interface Props {
  players: PlayerPublic[];
  hostId: string;
  meId: string;
  value: string | null;
  onChange(speakerId: string | null): void;
  disabled?: boolean;
}

/** Party-Modus: Auswahl, auf welchem Gerät die Musik läuft (z. B. das Gerät an der Box). */
export function SpeakerPicker({ players, hostId, meId, value, onChange, disabled }: Props) {
  const option = (id: string | null, label: string, hint: string, icon: ReactNode) => (
    <button key={id ?? 'all'} type="button" role="radio" aria-checked={value === id} disabled={disabled} className={`speaker-opt${value === id ? ' on' : ''}`} onClick={() => onChange(id)}>
      {icon}
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
    </button>
  );
  return (
    <div className="speaker-picker" role="radiogroup" aria-label="Musik abspielen auf">
      {option(null, 'Jedes Gerät', 'Jeder hört den Song auf dem eigenen Gerät.', <Users size={18} aria-hidden />)}
      {players.map((p) =>
        option(p.id, p.id === meId ? `${p.name} (du)` : p.name, p.id === hostId ? 'Host – Musik nur über dieses Gerät, z. B. an einer Box.' : 'Musik nur über dieses Gerät, z. B. an einer Box.', <Speaker size={18} aria-hidden />),
      )}
    </div>
  );
}
