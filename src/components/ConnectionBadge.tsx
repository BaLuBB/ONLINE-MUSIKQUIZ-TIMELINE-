import { Cloud, CloudOff, FlaskConical, Loader2 } from 'lucide-react';
import { useGame } from '../lib/GameProvider.tsx';

export function ConnectionBadge() {
  const { connection, backend } = useGame();
  const local = backend?.mode === 'local';
  let icon = <Cloud size={14} />;
  let text = 'Verbunden';
  let tone = 'ok';
  if (connection === 'connecting') {
    icon = <Loader2 size={14} className="spin" />;
    text = 'Verbinde …';
    tone = 'warn';
  } else if (connection === 'reconnecting') {
    icon = <Loader2 size={14} className="spin" />;
    text = 'Verbindung wird wiederhergestellt …';
    tone = 'warn';
  } else if (connection === 'offline') {
    icon = <CloudOff size={14} />;
    text = 'Offline';
    tone = 'bad';
  }
  if (local && connection === 'online') {
    icon = <FlaskConical size={14} />;
    text = 'Lokaler Testmodus';
    tone = 'local';
  }
  return (
    <span className={`conn conn-${tone}`} role="status">
      {icon}
      <span className="conn-text">{text}</span>
    </span>
  );
}
