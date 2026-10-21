/** Zufallsquelle: liefert Zahlen in [0, 1). Für Tests austauschbar. */
export type Rng = () => number;

/** Kryptografisch sichere Zufallsquelle (Browser, Deno, Node ≥ 19). */
export const secureRng: Rng = () => {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  // 53 Bit Auflösung
  return (buf[0] * 2 ** 21 + (buf[1] >>> 11)) / 2 ** 53;
};

/** Deterministische Zufallsquelle (mulberry32) für Tests und Demo-Töne. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne I, O, 0, 1

/** Zufälliger Raumcode (Standard: 6 Zeichen, ~1,0 Mrd. Kombinationen). */
export function generateRoomCode(rng: Rng = secureRng, length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return out;
}

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function randomId(prefix: string, rng: Rng = secureRng): string {
  let s = '';
  for (let i = 0; i < 12; i++) s += Math.floor(rng() * 36).toString(36);
  return `${prefix}_${s}`;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
