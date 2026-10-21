/** CSS-Variable der Spielerfarbe (Index 0–9, siehe tokens.css). */
export const colorVar = (color: number | undefined, fallback = 0): string => `var(--p${((((color ?? fallback) % 10) + 10) % 10)})`;
