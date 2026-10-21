import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useGame } from '../lib/GameProvider.tsx';

export function Toasts() {
  const { toasts, dismissToast } = useGame();
  return (
    <div className="toasts" role="region" aria-label="Hinweise" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
          {t.tone === 'error' ? <AlertCircle size={18} /> : t.tone === 'success' ? <CheckCircle2 size={18} /> : <Info size={18} />}
          <span>{t.message}</span>
          <button type="button" aria-label="Hinweis schließen" onClick={() => dismissToast(t.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
