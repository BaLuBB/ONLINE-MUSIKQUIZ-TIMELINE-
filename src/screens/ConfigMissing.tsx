import { Settings2 } from 'lucide-react';
import { Logo } from '../components/Logo.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';

export function ConfigMissing() {
  return (
    <div className="shell">
      <header className="topbar">
        <Logo />
        <div className="topbar-right">
          <ThemeToggle />
        </div>
      </header>
      <main className="center-page">
        <div className="panel config-panel">
          <Settings2 size={28} aria-hidden />
          <h1>Backend nicht konfiguriert</h1>
          <p className="muted">
            Dieses Spiel braucht ein Supabase-Projekt für den Online-Mehrspielermodus. Es wurden keine Zugangsdaten gefunden, daher sind Mehrspieler-Funktionen nicht verfügbar.
          </p>
          <ol className="howto">
            <li>
              Lege <code>.env</code> nach dem Muster von <code>.env.example</code> an und trage <code>VITE_SUPABASE_URL</code> und <code>VITE_SUPABASE_ANON_KEY</code> ein.
            </li>
            <li>Richte Datenbank und Edge Function ein (siehe README, Abschnitt „Supabase einrichten“).</li>
            <li>
              Zum reinen Ausprobieren ohne Backend: <code>npm run dev</code> startet den lokalen Testmodus (nur dieser Browser).
            </li>
          </ol>
        </div>
      </main>
    </div>
  );
}
