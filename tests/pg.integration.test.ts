// Integrationstest gegen ein echtes Postgres mit der Migration aus supabase/migrations.
// Läuft nur, wenn TEST_DATABASE_URL gesetzt ist (Superuser-Verbindung auf eine leere Test-DB, auf der die
// Supabase-Rollen anon/authenticated/service_role und auth.uid() existieren – siehe README „Tests“).
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DemoResolver } from '@engine/audio.ts';
import { seededRng } from '@engine/rng.ts';
import { createGameServer } from '@engine/server.ts';
import { SONGS } from '@engine/songs.ts';
import { createSupabaseStore, type RpcClient } from '@engine/supabaseStore.ts';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const byId = new Map(SONGS.map((s) => [s.id, s]));

d('Postgres-Store (echte Datenbank)', () => {
  const pool = new pg.Pool({ connectionString: url, max: 8 });

  // Führt eine RPC-Funktion wie die Edge Function aus: als service_role.
  const rpcClient: RpcClient = {
    async rpc(fn, args) {
      const keys = Object.keys(args);
      const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as data`;
      const params = keys.map((k) => {
        const v = args[k];
        return v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : Array.isArray(v) && k !== 'p_remove' ? JSON.stringify(v) : v;
      });
      const c = await pool.connect();
      try {
        await c.query('begin');
        await c.query('set local role service_role');
        const res = await c.query(sql, params);
        await c.query('commit');
        return { data: res.rows[0]?.data ?? null, error: null };
      } catch (e) {
        await c.query('rollback').catch(() => {});
        return { data: null, error: { message: (e as Error).message } };
      } finally {
        c.release();
      }
    },
  };

  const asUser = async <T>(uid: string, sql: string): Promise<{ rows: T[]; error?: string }> => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query('set local role authenticated');
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      const res = await c.query(sql);
      await c.query('commit');
      return { rows: res.rows as T[] };
    } catch (e) {
      await c.query('rollback').catch(() => {});
      return { rows: [], error: (e as Error).message };
    } finally {
      c.release();
    }
  };

  let now = Date.now();
  const server = createGameServer({
    store: createSupabaseStore(rpcClient),
    songs: () => SONGS,
    audio: new DemoResolver(),
    now: () => (now += 300),
    rng: seededRng(42),
  });
  const host = randomUUID();
  const guest = randomUUID();
  const intruder = randomUUID();
  let roomId = '';
  let code = '';

  beforeAll(async () => {
    await pool.query('truncate public.rooms cascade');
  });
  afterAll(async () => {
    await pool.end();
  });

  it('erstellt Raum, tritt bei und startet; Geheimnisse liegen nur in room_secrets', async () => {
    const c = await server.handle(host, { type: 'create', name: 'Anna', settings: { genres: ['pop', 'rock', '80er'], targetCards: 3 } });
    if (!c.ok) throw new Error(c.error.message);
    roomId = c.roomId;
    code = c.code;
    const j = await server.handle(guest, { type: 'join', code: code.toLowerCase(), name: 'Ben' });
    expect(j.ok).toBe(true);
    const bad = await server.handle(intruder, { type: 'join', code: 'ZZZZZZ', name: 'X' });
    expect(!bad.ok && bad.error.code).toBe('invalid_code');
    const s = await server.handle(host, { type: 'action', roomId, action: { type: 'start' } });
    expect(s.ok).toBe(true);

    const draw = await server.handle(host, { type: 'action', roomId, action: { type: 'draw' } });
    expect(draw.ok && draw.audio?.kind).toBe('synth');
    const room = (await pool.query('select state, status, version from public.rooms where id = $1', [roomId])).rows[0];
    const secret = (await pool.query('select secret from public.room_secrets where room_id = $1', [roomId])).rows[0].secret;
    const song = byId.get(secret.current.songId)!;
    expect(room.status).toBe('playing');
    expect(JSON.stringify(room.state)).not.toContain(song.title);
    expect(JSON.stringify(room.state)).not.toContain(song.id);
  });

  it('wertet eine Platzierung serverseitig und schreibt Partie, Karte und Ereignisse', async () => {
    const secret = (await pool.query('select secret from public.room_secrets where room_id = $1', [roomId])).rows[0].secret;
    const song = byId.get(secret.current.songId)!;
    const state = (await pool.query('select state from public.rooms where id = $1', [roomId])).rows[0].state;
    const me = state.players.find((p: { id: string }) => p.id === state.turn.playerId);
    let pos = 0;
    while (pos < me.timeline.length && me.timeline[pos].year < song.releaseYear) pos++;
    const r = await server.handle(host, { type: 'action', roomId, action: { type: 'place', position: pos } });
    expect(r.ok && r.state?.lastResult?.correct).toBe(true);
    const games = (await pool.query('select * from public.games where room_id = $1', [roomId])).rows;
    const cards = (await pool.query('select * from public.game_cards')).rows;
    const events = (await pool.query('select type from public.events where room_id = $1', [roomId])).rows.map((e) => e.type);
    expect(games).toHaveLength(1);
    expect(games[0].status).toBe('running');
    expect(cards).toHaveLength(1);
    expect(cards[0].correct).toBe(true);
    expect(events).toEqual(expect.arrayContaining(['room_created', 'player_joined', 'game_started', 'card_drawn', 'card_placed', 'placement_checked']));
  });

  it('Row-Level-Security: nur Mitglieder lesen den öffentlichen Zustand, Geheimnisse sind gesperrt', async () => {
    expect((await asUser(host, 'select id from public.rooms')).rows).toHaveLength(1);
    expect((await asUser(guest, 'select id from public.rooms')).rows).toHaveLength(1);
    expect((await asUser(intruder, 'select id from public.rooms')).rows).toHaveLength(0);
    expect((await asUser(intruder, 'select * from public.players')).rows).toHaveLength(0);
    expect((await asUser(host, 'select * from public.room_secrets')).error).toMatch(/permission denied/);
    expect((await asUser(host, 'select * from public.songs')).error).toMatch(/permission denied/);
    expect((await asUser(host, 'select * from public.events')).error).toMatch(/permission denied/);
    expect((await asUser(host, `update public.rooms set status = 'finished'`)).error).toMatch(/permission denied/);
    expect((await asUser(host, `delete from public.players`)).error).toMatch(/permission denied/);
    expect((await asUser(host, `select public.commit_room('x', 1, '{}', '{}', '[]', '{}', '[]')`)).error).toMatch(/permission denied/);
    expect((await asUser(host, `select public.load_room('${code}', null)`)).error).toMatch(/permission denied/);
    expect((await asUser(host, 'select * from public.game_cards')).rows).toHaveLength(1);
    expect((await asUser(intruder, 'select * from public.game_cards')).rows).toHaveLength(0);
  });

  it('Compare-and-Swap: von zwei gleichzeitigen Commits gewinnt genau einer', async () => {
    const store = createSupabaseStore(rpcClient);
    const rec = (await store.getById(roomId))!;
    const patch = { state: { ...rec.state, version: rec.version + 1 }, secret: rec.secret, addMembers: [], removePlayerIds: [], events: [] };
    const results = await Promise.all([store.commit(rec, patch), store.commit(rec, patch), store.commit(rec, patch)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('gleichzeitige Spielaktionen zweier Clients bleiben konsistent', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => server.handle(i % 2 ? host : guest, { type: 'action', roomId, action: { type: 'nextTurn' } })),
    );
    const state = (await pool.query('select state from public.rooms where id = $1', [roomId])).rows[0].state;
    expect(results.filter((r) => r.ok && !('duplicate' in r)).length).toBeGreaterThanOrEqual(1);
    expect(state.phase === 'playing' || state.phase === 'resolving_turn').toBe(true);
    expect(state.turn.playerId).toBeTruthy();
  });

  it('Verlassen des Raums und Aufräumen', async () => {
    await server.handle(guest, { type: 'action', roomId, action: { type: 'leave' } });
    const left = (await pool.query('select count(*)::int as n from public.players where room_id = $1', [roomId])).rows[0].n;
    expect(left).toBe(1);
    await pool.query(`update public.rooms set updated_at = now() - interval '7 hours'`);
    const cleaned = await rpcClient.rpc('cleanup_expired_rooms', {});
    expect(cleaned.data).toBe(1);
    expect((await pool.query('select count(*)::int as n from public.room_secrets')).rows[0].n).toBe(0);
  });
});
