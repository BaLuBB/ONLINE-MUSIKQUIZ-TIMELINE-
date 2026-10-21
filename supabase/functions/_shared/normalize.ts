import type { Song } from './types.ts';

/** Normalisiert Text für den Titelvergleich: ohne Groß-/Kleinschreibung, Akzente, Satzzeichen. */
export function normalizeText(input: string, germanTranslit = false): string {
  let s = input.toLowerCase();
  if (germanTranslit) {
    s = s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
  }
  s = s
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’`´]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
      rowMin = Math.min(rowMin, prev[j]);
    }
    if (rowMin > max) return max + 1;
  }
  return prev[b.length];
}

/** Alle akzeptierten Schreibweisen eines Titels. */
export function acceptedTitles(song: Pick<Song, 'title' | 'aliases'>): string[] {
  const variants = new Set<string>([song.title, ...(song.aliases ?? [])]);
  const withoutParens = song.title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  if (withoutParens) variants.add(withoutParens);
  for (const m of song.title.matchAll(/\(([^)]+)\)/g)) variants.add(m[1]);
  const out = new Set<string>();
  for (const v of variants) {
    for (const translit of [false, true]) {
      const n = normalizeText(v, translit);
      if (n.length > 0) out.add(n);
    }
  }
  return [...out];
}

/**
 * Prüft einen Titeltipp. Erlaubt: normalisierte exakte Treffer sowie bei langen Titeln
 * (ab 9 Zeichen) einen einzelnen Tippfehler. Teiltreffer (Wortbruchstücke) werden abgelehnt.
 */
export function isTitleCorrect(guess: string, song: Pick<Song, 'title' | 'aliases'>): boolean {
  const candidates = acceptedTitles(song);
  for (const translit of [false, true]) {
    const g = normalizeText(guess, translit);
    if (g.length < 2) continue;
    for (const c of candidates) {
      if (g === c) return true;
      if (c.length >= 9 && g.length >= 9 && levenshtein(g, c, 1) <= 1) return true;
    }
  }
  return false;
}
