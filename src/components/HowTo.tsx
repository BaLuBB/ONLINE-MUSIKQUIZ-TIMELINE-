import { Dialog } from './ui.tsx';

export function HowToDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Dialog open={open} onClose={onClose} title="So funktioniert’s">
      <ol className="howto">
        <li>
          <strong>Karte ziehen.</strong> Wer an der Reihe ist, zieht eine verdeckte Musikkarte – der Song startet automatisch.
        </li>
        <li>
          <strong>Einordnen.</strong> Lege die Karte an die Stelle deines Zeitstrahls, die zum Erscheinungsjahr passt: nach älteren, vor neueren Songs.
        </li>
        <li>
          <strong>Aufdecken.</strong> Stimmt die Reihenfolge, bleibt die Karte in deinem Zeitstrahl. Sonst wird sie abgelegt.
        </li>
        <li>
          <strong>Titel erraten.</strong> Kennst du den Song? Tippe den Titel vor dem Einordnen – ein richtiger Titel bringt einen Bonuspunkt (zählt nicht als Karte).
        </li>
        <li>
          <strong>Gewinnen.</strong> Wer zuerst die Zielanzahl an Karten korrekt platziert hat, gewinnt.
        </li>
      </ol>
      <p className="muted small">Gleiche Erscheinungsjahre sind austauschbar: Eine Karte darf vor, zwischen oder nach Songs desselben Jahres liegen.</p>
    </Dialog>
  );
}
