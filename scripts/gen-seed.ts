// Erzeugt supabase/seed.sql aus der Code-Bibliothek (nur nötig, wenn SONGS_SOURCE=db genutzt wird).
import { writeFileSync } from 'node:fs';
import { SONGS } from '../supabase/functions/_shared/songs.ts';

const q = (v: string | null | undefined) => (v == null ? 'null' : `'${v.replace(/'/g, "''")}'`);
const arr = (a: string[] | undefined) => `array[${(a ?? []).map(q).join(',')}]::text[]`;

const rows = SONGS.map(
  (s) =>
    `(${q(s.id)}, ${q(s.title)}, ${q(s.artist)}, ${s.releaseYear}, ${arr(s.genres)}, ${q(s.audioProvider)}, ${q(s.audioId)}, ${s.duration}, ${s.available}, ${q(s.sourceUrl)}, ${arr(s.aliases)}, ${q(s.review)})`,
);

const sql = `-- Automatisch erzeugt mit \`npm run gen:seed\` – nicht von Hand bearbeiten.
insert into public.songs (id, title, artist, release_year, genres, audio_provider, audio_id, duration, available, source_url, aliases, review) values
${rows.join(',\n')}
on conflict (id) do update set
  title = excluded.title, artist = excluded.artist, release_year = excluded.release_year, genres = excluded.genres,
  audio_provider = excluded.audio_provider, audio_id = excluded.audio_id, duration = excluded.duration,
  available = excluded.available, source_url = excluded.source_url, aliases = excluded.aliases, review = excluded.review;
`;
writeFileSync(new URL('../supabase/seed.sql', import.meta.url), sql);
console.log(`supabase/seed.sql geschrieben (${SONGS.length} Songs)`);
