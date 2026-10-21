import { ArrowRight, FlaskConical, Users } from 'lucide-react';
import { useGame } from '../lib/GameProvider.tsx';
import { useUI } from '../lib/ui-context.tsx';
import { FaceDownCard } from '../components/SongCard.tsx';
import { Button } from '../components/ui.tsx';

export function Home() {
  const { open } = useUI();
  const { backend } = useGame();
  const local = backend?.mode === 'local';
  return (
    <main className="home">
      <div className="home-bg" aria-hidden>
        <div className="home-line">
          {[1965, 1975, 1985, 1995, 2005, 2015, 2025].map((y) => (
            <span key={y}>{y}</span>
          ))}
        </div>
        <FaceDownCard className="bg-card c1" />
        <FaceDownCard className="bg-card c2" />
        <FaceDownCard className="bg-card c3" />
      </div>
      <section className="hero">
        <h1>
          Musik. Erinnerungen.
          <br />
          <span className="accent-text">Dein Zeitstrahl.</span>
        </h1>
        <p className="lead">Erkenne Songs, ordne sie chronologisch ein und baue gemeinsam mit Freunden den längsten Zeitstrahl der Musikgeschichte.</p>
        <div className="hero-actions">
          <Button variant="primary" size="lg" icon={<ArrowRight size={18} />} onClick={() => open('create')}>
            Spiel erstellen
          </Button>
          <Button size="lg" onClick={() => open('join')}>
            Spiel beitreten
          </Button>
          <Button variant="ghost" size="lg" onClick={() => open('howto')}>
            So funktioniert’s
          </Button>
        </div>
        <p className="hero-note">
          {backend?.mode === 'p2p' ? (
            <>
              <Users size={15} aria-hidden /> Mit Freunden auf mehreren Geräten spielen – der Host erstellt das Spiel, alle anderen treten mit dem Code bei.
            </>
          ) : local ? (
            <>
              <FlaskConical size={15} aria-hidden /> Lokaler Testmodus – Spielräume gelten nur in diesem Browser (Tabs).
            </>
          ) : (
            <>
              <Users size={15} aria-hidden /> Online mit Freunden spielen – mit einem Code auf jedem Gerät.
            </>
          )}
        </p>
      </section>
    </main>
  );
}
