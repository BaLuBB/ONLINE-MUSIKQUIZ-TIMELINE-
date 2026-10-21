// Prüft die Musikbibliothek: Struktur, Duplikate, Genres, Jahre.
//   npm run check:songs                 → lokale Konsistenzprüfung
//   npm run check:songs -- --musicbrainz → zusätzlich Abgleich der Jahre mit MusicBrainz (Netzwerk, ~1 s/Song)
import { GENRES } from '../supabase/functions/_shared/genres.ts';
import { normalizeText } from '../supabase/functions/_shared/normalize.ts';
import { SONGS } from '../supabase/functions/_shared/songs.ts';

let problems = 0;
const warn = (msg: string) => {
  problems++;
  console.error('✗', msg);
};

const seen = new Map<string, string>();
for (const s of SONGS) {
  const key = `${normalizeText(s.artist)}|${normalizeText(s.title)}`;
  if (seen.has(key)) warn(`Duplikat: ${s.artist} – ${s.title} (${seen.get(key)} / ${s.id})`);
  seen.set(key, s.id);
  if (s.releaseYear < 1900 || s.releaseYear > new Date().getFullYear()) warn(`Unplausibles Jahr: ${s.id} (${s.releaseYear})`);
}
const ids = new Set(GENRES.map((g) => g.id));
for (const s of SONGS) for (const g of s.genres) if (!ids.has(g)) warn(`Unbekanntes Genre ${g} bei ${s.id}`);
for (const g of GENRES) {
  const n = SONGS.filter((s) => s.genres.includes(g.id)).length;
  if (n < 3) warn(`Genre ${g.label} hat nur ${n} Songs`);
}

const review = SONGS.filter((s) => s.review);
console.log(`${SONGS.length} Songs, ${review.length} zur Überprüfung markiert:`);
for (const s of review) console.log(`  ? ${s.artist} – ${s.title} (${s.releaseYear}): ${s.review}`);

if (process.argv.includes('--musicbrainz')) {
  console.log('\nAbgleich mit MusicBrainz (frühestes Veröffentlichungsjahr der Aufnahme) …');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (const s of SONGS) {
    const query = encodeURIComponent(`recording:"${s.title.replace(/"/g, '')}" AND artist:"${s.artist.split(/ feat\.| & /)[0].replace(/"/g, '')}"`);
    try {
      const res = await fetch(`https://musicbrainz.org/ws/2/recording?query=${query}&fmt=json&limit=5`, {
        headers: { 'User-Agent': 'timeline-musikquiz/0.1 (song-check)' },
      });
      const data = (await res.json()) as { recordings?: { 'first-release-date'?: string; score?: number }[] };
      const years = (data.recordings ?? [])
        .filter((r) => (r.score ?? 0) >= 90 && r['first-release-date'])
        .map((r) => Number(r['first-release-date']!.slice(0, 4)));
      if (years.length) {
        const earliest = Math.min(...years);
        if (earliest !== s.releaseYear) console.log(`  Δ ${s.artist} – ${s.title}: Datensatz ${s.releaseYear}, MusicBrainz ${earliest}`);
      } else console.log(`  ? ${s.artist} – ${s.title}: kein sicherer Treffer`);
    } catch (e) {
      console.error('  MusicBrainz nicht erreichbar:', (e as Error).message);
      break;
    }
    await sleep(1100); // API-Limit: 1 Anfrage/Sekunde
  }
}

if (problems) {
  console.error(`\n${problems} Problem(e) gefunden.`);
  process.exit(1);
}
console.log('\nKonsistenzprüfung bestanden.');
