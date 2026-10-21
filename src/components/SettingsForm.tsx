import type { Settings } from '@engine/types.ts';
import { GenrePicker } from './GenrePicker.tsx';
import { Segmented, Stepper, Toggle } from './ui.tsx';

type YearPreset = 'all' | 'old' | 'mid' | 'new';
const PRESETS: Record<YearPreset, { yearMin: number | null; yearMax: number | null }> = {
  all: { yearMin: null, yearMax: null },
  old: { yearMin: null, yearMax: 1989 },
  mid: { yearMin: 1990, yearMax: 2009 },
  new: { yearMin: 2010, yearMax: null },
};

function presetOf(s: Settings): YearPreset | 'custom' {
  for (const [k, v] of Object.entries(PRESETS)) if (v.yearMin === s.yearMin && v.yearMax === s.yearMax) return k as YearPreset;
  return 'custom';
}

interface Props {
  settings: Settings;
  counts: Record<string, number> | null;
  onChange(patch: Partial<Settings>): void;
  readOnly?: boolean;
  playerCount?: number;
}

/** Einstellungen von Host (editierbar) – wird im Erstellen-Dialog und in der Lobby verwendet. */
export function SettingsForm({ settings, counts, onChange, readOnly, playerCount = 1 }: Props) {
  const preset = presetOf(settings);
  return (
    <div className="settings-form">
      <section className="set-block">
        <h3>Spiel</h3>
        <Stepper label="Max. Spieler" value={settings.maxPlayers} min={Math.max(2, playerCount)} max={10} onChange={(v) => onChange({ maxPlayers: v })} disabled={readOnly} />
        <Stepper label="Zielkarten" value={settings.targetCards} min={3} max={20} onChange={(v) => onChange({ targetCards: v })} disabled={readOnly} />
      </section>

      <section className="set-block">
        <h3>Schwierigkeit</h3>
        <Segmented
          label="Schwierigkeit"
          value={settings.difficulty}
          disabled={readOnly}
          options={[
            { value: 'easy', label: 'Einfach' },
            { value: 'normal', label: 'Normal' },
            { value: 'hard', label: 'Schwer' },
          ]}
          onChange={(v) => onChange({ difficulty: v })}
        />
        <p className="muted small">
          {settings.difficulty === 'easy' && 'Unbegrenzt wiederholen.'}
          {settings.difficulty === 'normal' && 'Bis zu 3 Wiederholungen pro Karte.'}
          {settings.difficulty === 'hard' && 'Nur eine Wiederholung pro Karte.'}
        </p>
        <h3 className="mt">Zeitraum</h3>
        <Segmented
          label="Zeitraum"
          value={(preset === 'custom' ? 'all' : preset) as YearPreset}
          disabled={readOnly}
          options={[
            { value: 'all', label: 'Alle' },
            { value: 'old', label: 'Bis 1989' },
            { value: 'mid', label: '1990–2009' },
            { value: 'new', label: 'Ab 2010' },
          ]}
          onChange={(v) => onChange(PRESETS[v])}
        />
      </section>

      <section className="set-block">
        <h3>Zusatzregeln</h3>
        <Toggle label="Titel-Bonus" description="+1 Punkt für den richtig erratenen Titel (zählt nicht als Karte)." checked={settings.titleBonus} onChange={(v) => onChange({ titleBonus: v })} disabled={readOnly} />
        <Toggle label="Wiederholen erlauben" description="Der Ausschnitt darf erneut von vorn gespielt werden." checked={settings.allowReplay} onChange={(v) => onChange({ allowReplay: v })} disabled={readOnly} />
        <Toggle label="Startkarte zählt zum Ziel" description="Offizielle Hitster-Zählung: Die Startkarte gehört zu den Zielkarten." checked={settings.startCardCounts} onChange={(v) => onChange({ startCardCounts: v })} disabled={readOnly} />
      </section>

      <section className="set-block set-genres">
        <h3>Musikauswahl</h3>
        <p className="muted small">Mehrere Genres möglich – gespielt wird die Vereinigung aller gewählten.</p>
        <GenrePicker selected={settings.genres} counts={counts} onChange={(g) => onChange({ genres: g })} disabled={readOnly} />
      </section>
    </div>
  );
}
