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

/** Editierabstand mit Buchstabendreher (Damerau/OSA): „Bohemain“ ist ein Fehler, nicht zwei. Bricht ab, sobald `max` überschritten ist. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    rows.push(new Array<number>(b.length + 1).fill(0));
    rows[i][0] = i;
  }
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = rows[i][0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1);
      rows[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return rows[a.length][b.length];
}

/** Erlaubte Tippfehler je Wort: kurze Wörter müssen stimmen, sonst wäre es ein anderes Wort („Love“/„Live“). */
const wordTolerance = (len: number): number => (len <= 4 ? 0 : len <= 7 ? 1 : 2);
/** Insgesamt erlaubte Tippfehler je Titel (wächst mit der Länge). */
const titleTolerance = (len: number): number => Math.max(1, Math.floor(len / 7));

/**
 * Sind Tipp und Titel „fast gleich“? Wörter werden einzeln verglichen: Kleine Tippfehler im Wort sind okay,
 * ein ganz anderes oder fehlendes Wort ist ein Fehler.
 */
function isCloseMatch(guess: string, candidate: string): boolean {
  const gw = guess.split(' ');
  const cw = candidate.split(' ');
  if (gw.length === cw.length) {
    let total = 0;
    for (let i = 0; i < gw.length; i++) {
      const tol = wordTolerance(Math.max(gw[i].length, cw[i].length));
      const d = editDistance(gw[i], cw[i], tol);
      if (d > tol) return false;
      total += d;
    }
    return total <= titleTolerance(candidate.replace(/ /g, '').length);
  }
  // Leerzeichen vergessen oder zu viel („Hey Ya“ / „Heya“): zusammengeschrieben vergleichen, aber nur bei langen Titeln.
  const g = gw.join('');
  const c = cw.join('');
  return c.length >= 8 && editDistance(g, c, 1) <= 1;
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
 * Prüft einen Titeltipp. Erlaubt: normalisierte exakte Treffer sowie leichte Tippfehler
 * (einzelne Buchstaben falsch, fehlend, zu viel oder vertauscht). Ganz andere Wörter,
 * fehlende Wörter und Teiltreffer (Wortbruchstücke) werden abgelehnt.
 */
export function isTitleCorrect(guess: string, song: Pick<Song, 'title' | 'aliases'>): boolean {
  const candidates = acceptedTitles(song);
  for (const translit of [false, true]) {
    const g = normalizeText(guess, translit);
    if (g.length < 2) continue;
    for (const c of candidates) {
      if (g === c || isCloseMatch(g, c)) return true;
    }
  }
  return false;
}
