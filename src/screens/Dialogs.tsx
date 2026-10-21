import { useEffect, useState, type FormEvent } from 'react';
import type { GameError, Settings } from '@engine/types.ts';
import { defaultSettings } from '@engine/engine.ts';
import { normalizeRoomCode } from '@engine/rng.ts';
import { Field, Button, Dialog } from '../components/ui.tsx';
import { SettingsForm } from '../components/SettingsForm.tsx';
import { useGame } from '../lib/GameProvider.tsx';
import { saveName, savedName } from '../lib/format.ts';
import { useUI } from '../lib/ui-context.tsx';

function errorField(e: GameError | null): { name?: string; code?: string; general?: string } {
  if (!e) return {};
  if (e.code === 'name_invalid' || e.code === 'name_taken') return { name: e.message };
  if (e.code === 'invalid_code' || e.code === 'room_expired') return { code: e.message };
  return { general: e.message };
}

export function CreateDialog() {
  const { dialog, close } = useUI();
  const { createRoom } = useGame();
  const open = dialog === 'create';
  const [name, setName] = useState(savedName());
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<GameError | null>(null);

  useEffect(() => {
    if (open) setErr(null);
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    saveName(name.trim());
    const error = await createRoom(name, settings);
    setLoading(false);
    if (error) setErr(error);
    else close();
  };
  const fe = errorField(err);

  return (
    <Dialog open={open} onClose={close} title="Spiel erstellen" wide>
      <form onSubmit={submit} className="stack-lg" noValidate>
        <div className="grid-2">
          <Field label="Dein Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="nickname" required autoFocus error={fe.name} />
          <Field label="Raumname (optional)" value={settings.roomName} onChange={(e) => setSettings({ ...settings, roomName: e.target.value })} maxLength={32} placeholder="z. B. Freitagabend" />
        </div>
        <SettingsForm
          settings={settings}
          counts={null}
          onChange={(patch) => setSettings((s) => ({ ...s, ...patch, ...(patch.difficulty ? presetFor(patch.difficulty, patch) : {}) }))}
        />
        {fe.general && (
          <p className="form-error" role="alert">
            {fe.general}
          </p>
        )}
        <div className="dialog-actions">
          <Button onClick={close}>Abbrechen</Button>
          <Button type="submit" variant="primary" loading={loading} disabled={!name.trim() || settings.genres.length === 0}>
            Lobby erstellen
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// Schwierigkeits-Presets spiegeln die Engine, damit die Vorschau im Dialog stimmt.
function presetFor(d: Settings['difficulty'], patch: Partial<Settings>): Partial<Settings> {
  const base = { easy: { allowReplay: true, maxReplays: 0 }, normal: { allowReplay: true, maxReplays: 3 }, hard: { allowReplay: true, maxReplays: 1 } }[d];
  return { ...base, ...patch };
}

export function JoinDialog() {
  const { dialog, close, joinCode } = useUI();
  const { joinRoom, backend } = useGame();
  const local = backend?.mode === 'local';
  const open = dialog === 'join';
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState(joinCode);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<GameError | null>(null);

  useEffect(() => {
    if (open) {
      setCode(joinCode);
      setErr(null);
    }
  }, [open, joinCode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    saveName(name.trim());
    const error = await joinRoom(normalizeRoomCode(code), name);
    setLoading(false);
    if (error) setErr(error);
    else close();
  };
  const fe = errorField(err);

  return (
    <Dialog open={open} onClose={close} title="Spiel beitreten">
      <form onSubmit={submit} className="stack-lg" noValidate>
        {local && (
          <p className="banner banner-warn" role="note">
            Lokaler Testmodus: Es gibt nur Räume aus <strong>diesem Browser</strong>. Der Raum muss in einem anderen Tab desselben Browsers erstellt worden sein – nicht auf einem anderen Gerät.
          </p>
        )}
        <Field label="Dein Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="nickname" required autoFocus={!joinCode || Boolean(name)} error={fe.name} />
        <Field
          label="Raumcode"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={10}
          className="code-input"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          placeholder="ABC 123"
          required
          error={fe.code ? (local ? `${fe.code} Im Testmodus sind nur Räume aus diesem Browser erreichbar.` : fe.code) : null}
        />
        {fe.general && (
          <p className="form-error" role="alert">
            {fe.general}
          </p>
        )}
        {err && backend?.diagnostics && (
          <details className="diag">
            <summary>Technische Details (für die Fehlersuche)</summary>
            <pre>{backend.diagnostics().join('\n') || 'Keine Einträge.'}</pre>
          </details>
        )}
        <div className="dialog-actions">
          <Button onClick={close}>Abbrechen</Button>
          <Button type="submit" variant="primary" loading={loading} disabled={!name.trim() || normalizeRoomCode(code).length < 4}>
            Beitreten
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
