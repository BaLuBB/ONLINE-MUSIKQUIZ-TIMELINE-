import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2, Minus, Plus, X } from 'lucide-react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg' | 'sm';
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
};

export function Button({ variant = 'secondary', size = 'md', loading, icon, block, children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`btn btn-${variant} btn-${size}${block ? ' btn-block' : ''} ${className}`}
    >
      {loading ? <Loader2 className="spin" size={18} aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={`icon-btn ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Field({
  label,
  error,
  hint,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined} {...rest} />
      {error ? (
        <p id={`${id}-e`} className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-h`} className="field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Toggle({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="toggle-row">
      <div className="toggle-text">
        <label htmlFor={id}>{label}</label>
        {description && <p>{description}</p>}
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} className="switch" onClick={() => onChange(!checked)}>
        <span />
      </button>
    </div>
  );
}

export function Stepper({ label, value, min, max, onChange, disabled, suffix }: { label: string; value: number; min: number; max: number; onChange(v: number): void; disabled?: boolean; suffix?: string }) {
  return (
    <div className="stepper-row">
      <span className="stepper-label" id={`st-${label}`}>
        {label}
      </span>
      <div className="stepper" role="group" aria-labelledby={`st-${label}`}>
        <IconButton label={`${label} verringern`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
          <Minus size={16} />
        </IconButton>
        <output aria-live="polite">
          {value}
          {suffix ? ` ${suffix}` : ''}
        </output>
        <IconButton label={`${label} erhöhen`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
          <Plus size={16} />
        </IconButton>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: { value: T; label: string }[]; onChange(v: T): void; disabled?: boolean }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={disabled} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({ open, onClose, title, children, wide, labelledBy }: { open: boolean; onClose(): void; title: string; children: ReactNode; wide?: boolean; labelledBy?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? ' dialog-wide' : ''}`}
      aria-labelledby={labelledBy ?? titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="dialog-body">
          <header className="dialog-head">
            <h2 id={titleId}>{title}</h2>
            <IconButton label="Schließen" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warn' }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}
