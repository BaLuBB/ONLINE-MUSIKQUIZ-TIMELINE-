import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { normalizeRoomCode } from '@engine/rng.ts';
import { HowToDialog } from './components/HowTo.tsx';
import { Logo } from './components/Logo.tsx';
import { ThemeToggle } from './components/ThemeToggle.tsx';
import { Toasts } from './components/Toasts.tsx';
import { ConnectionBadge } from './components/ConnectionBadge.tsx';
import { GameProvider, useGame } from './lib/GameProvider.tsx';
import { UIContext, type DialogName } from './lib/ui-context.tsx';
import { ConfigMissing } from './screens/ConfigMissing.tsx';
import { CreateDialog, JoinDialog } from './screens/Dialogs.tsx';
import { Game } from './screens/Game.tsx';
import { Home } from './screens/Home.tsx';
import { Lobby } from './screens/Lobby.tsx';
import { Results } from './screens/Results.tsx';

function Screens() {
  const { selection, resuming, state, session, backend } = useGame();

  if (selection.kind === 'missing-config') return <ConfigMissing />;
  if (resuming) {
    return (
      <div className="boot" role="status">
        <Loader2 className="spin" size={22} aria-hidden /> Verbinde …
      </div>
    );
  }

  let key = 'home';
  let screen = (
    <div className="shell">
      <header className="topbar">
        <Logo />
        <div className="topbar-right">
          {backend?.mode === 'local' && <ConnectionBadge />}
          <ThemeToggle />
        </div>
      </header>
      <Home />
    </div>
  );
  if (session && !state) {
    key = 'sync';
    screen = (
      <div className="boot" role="status">
        <Loader2 className="spin" size={22} aria-hidden /> Verbindung wird wiederhergestellt …
      </div>
    );
  } else if (state) {
    if (state.phase === 'waiting') {
      key = 'lobby';
      screen = <Lobby />;
    } else if (state.phase === 'finished') {
      key = 'results';
      screen = <Results />;
    } else {
      key = 'game';
      screen = <Game />;
    }
  }
  return (
    <div className="page" key={key}>
      {screen}
    </div>
  );
}

export function App() {
  const initialCode = useMemo(() => normalizeRoomCode(new URLSearchParams(window.location.search).get('code') ?? ''), []);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [joinCode, setJoinCode] = useState(initialCode);

  // Einladungslink → direkt zum Beitrittsformular
  useEffect(() => {
    if (initialCode) setDialog('join');
  }, [initialCode]);

  const ui = useMemo(
    () => ({
      dialog,
      joinCode,
      open: (d: Exclude<DialogName, null>, opts?: { code?: string }) => {
        if (opts?.code !== undefined) setJoinCode(opts.code);
        setDialog(d);
      },
      close: () => {
        setDialog(null);
        if (new URLSearchParams(window.location.search).has('code')) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      },
    }),
    [dialog, joinCode],
  );

  return (
    <GameProvider>
      <UIContext.Provider value={ui}>
        <Screens />
        <CreateDialog />
        <JoinDialog />
        <HowToDialog open={dialog === 'howto'} onClose={ui.close} />
        <Toasts />
      </UIContext.Provider>
    </GameProvider>
  );
}
