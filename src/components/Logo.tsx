export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--ink)" />
      <path d="M6 16h20" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9.5" cy="16" r="2.2" fill="var(--bg)" />
      <circle cx="16" cy="16" r="2.2" fill="var(--bg)" />
      <circle cx="22.5" cy="16" r="3.4" fill="var(--accent)" />
      <path d="M22.5 8v5M22.5 19v5" stroke="var(--bg)" strokeWidth="1.2" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo" aria-label="TIMELINE">
      <LogoMark />
      {!compact && <span className="logo-word">TIMELINE</span>}
    </span>
  );
}
