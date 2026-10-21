// Supabase Edge Function `game`: einziger Schreibzugriff auf den Spielzustand.
//
// Ablauf: JWT der anonymen Sitzung prüfen → Anfrage an den Server-Kern → Antwort.
// Der service_role-Schlüssel bleibt in der Function (Supabase stellt ihn als Secret bereit)
// und gelangt nie in den Browser.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createResolver } from '../_shared/audio.ts';
import { createGameServer, type ServerRequest } from '../_shared/server.ts';
import { SONGS } from '../_shared/songs.ts';
import { createSupabaseStore } from '../_shared/supabaseStore.ts';
import type { Song } from '../_shared/types.ts';

declare const Deno: any;

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? '*';

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

// Songquelle: eingebaute Bibliothek (Standard) oder Tabelle `songs` (SONGS_SOURCE=db).
let dbSongs: { at: number; songs: Song[] } | null = null;
async function loadSongs(): Promise<readonly Song[]> {
  if (Deno.env.get('SONGS_SOURCE') !== 'db') return SONGS;
  if (dbSongs && Date.now() - dbSongs.at < 5 * 60_000) return dbSongs.songs;
  const { data, error } = await admin.from('songs').select('*').eq('available', true).limit(10000);
  if (error || !data?.length) return SONGS;
  dbSongs = {
    at: Date.now(),
    songs: data.map((r: any) => ({
      id: r.id,
      title: r.title,
      artist: r.artist,
      releaseYear: r.release_year,
      genres: r.genres,
      audioProvider: r.audio_provider,
      audioId: r.audio_id,
      duration: r.duration,
      available: r.available,
      sourceUrl: r.source_url ?? undefined,
      aliases: r.aliases?.length ? r.aliases : undefined,
      review: r.review ?? undefined,
    })),
  };
  return dbSongs.songs;
}

const server = createGameServer({
  store: createSupabaseStore(admin),
  songs: loadSongs,
  audio: createResolver({ provider: Deno.env.get('AUDIO_PROVIDER') ?? 'itunes', country: Deno.env.get('ITUNES_COUNTRY') ?? 'DE' }),
});

const cors = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: { code: 'unknown_action', message: 'Nur POST erlaubt.' } }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth?.user) return json({ ok: false, error: { code: 'forbidden', message: 'Nicht angemeldet.' } }, 401);

  const raw = await req.text();
  if (raw.length > 20_000) return json({ ok: false, error: { code: 'unknown_action', message: 'Anfrage zu groß.' } }, 413);
  let body: ServerRequest;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: { code: 'unknown_action', message: 'Ungültiges JSON.' } }, 400);
  }
  // Fachliche Fehler kommen als HTTP 200 mit { ok: false, error } zurück.
  return json(await server.handle(auth.user.id, body));
});
