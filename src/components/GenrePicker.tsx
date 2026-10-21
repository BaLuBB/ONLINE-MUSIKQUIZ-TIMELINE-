import { Check } from 'lucide-react';
import { GENRES } from '@engine/genres.ts';

const GROUPS = ['Epochen', 'Stile', 'Deutsch', 'Anlässe', 'Medien'] as const;

interface Props {
  selected: string[];
  /** Songanzahl je Genre; null = unbekannt (vor Raumerstellung). */
  counts: Record<string, number> | null;
  onChange(next: string[]): void;
  disabled?: boolean;
}

export function GenrePicker({ selected, counts, onChange, disabled }: Props) {
  const set = new Set(selected);
  const toggle = (id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };
  return (
    <div className="genre-picker">
      {GROUPS.map((group) => (
        <fieldset key={group} className="genre-group" disabled={disabled}>
          <legend>{group}</legend>
          <div className="genre-chips">
            {GENRES.filter((g) => g.group === group).map((g) => {
              const on = set.has(g.id);
              const n = counts ? (counts[g.id] ?? 0) : null;
              return (
                <button key={g.id} type="button" className={`genre-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(g.id)} disabled={disabled || n === 0}>
                  {on && <Check size={13} aria-hidden />}
                  <span>{g.label}</span>
                  {n !== null && <small>{n}</small>}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className="genre-actions">
        <button type="button" className="link" disabled={disabled} onClick={() => onChange(GENRES.filter((g) => !counts || (counts[g.id] ?? 0) > 0).map((g) => g.id))}>
          Alle auswählen
        </button>
        <button type="button" className="link" disabled={disabled} onClick={() => onChange([])}>
          Keine
        </button>
      </div>
    </div>
  );
}
