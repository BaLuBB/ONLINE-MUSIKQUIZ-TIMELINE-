-- TIMELINE – Datenbankschema
--
-- Prinzip: Die Spiellogik läuft in der Edge Function `game` (service_role). Clients dürfen
-- NICHTS direkt schreiben und nur den öffentlichen Zustand ihrer eigenen Räume lesen.
--   rooms        öffentlicher Spielzustand (JSON) – per Realtime an Mitglieder verteilt
--   room_secrets verdeckte Karten (Deck, aktuelle Karte) – für Clients unlesbar
--   players      Mitgliedschaft: anonyme Auth-UID ↔ Spieler-ID
--   games        Partien (Start/Ende/Gewinner)
--   game_cards   aufgedeckte Karten (erst nach der Platzierung geschrieben)
--   events       Ereignisprotokoll (nur Server)
--   songs        Bibliothek (nur Server; wird aus der Code-Bibliothek befüllt, siehe seed.sql)

create table if not exists public.rooms (
  id          text primary key,
  code        text not null unique check (code ~ '^[A-Z0-9]{4,10}$'),
  status      text not null check (status in ('waiting','starting','playing','resolving_turn','finished')),
  version     integer not null check (version > 0),
  state       jsonb not null,
  created_by  uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists rooms_created_by_idx on public.rooms (created_by, created_at desc);
create index if not exists rooms_updated_at_idx on public.rooms (updated_at);

create table if not exists public.room_secrets (
  room_id text primary key references public.rooms (id) on delete cascade,
  secret  jsonb not null
);

create table if not exists public.players (
  room_id    text not null references public.rooms (id) on delete cascade,
  player_id  text not null,
  auth_uid   uuid not null,
  name       text not null check (char_length(name) between 1 and 20),
  joined_at  timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (room_id, player_id),
  unique (room_id, auth_uid)
);
create index if not exists players_auth_uid_idx on public.players (auth_uid);

create table if not exists public.games (
  id               text primary key,
  room_id          text not null references public.rooms (id) on delete cascade,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  winner_player_id text,
  target_cards     integer not null,
  status           text not null check (status in ('running','finished')),
  end_reason       text
);
create index if not exists games_room_idx on public.games (room_id);

create table if not exists public.game_cards (
  id            text primary key,           -- <gameId>:<cardId>
  game_id       text not null references public.games (id) on delete cascade,
  card_id       text not null,
  song_id       text not null,
  player_id     text not null,
  revealed      boolean not null default true,
  position      integer not null,
  correct       boolean not null,
  title_bonus   boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists game_cards_game_idx on public.game_cards (game_id);

create table if not exists public.events (
  id         bigint generated always as identity primary key,
  room_id    text not null references public.rooms (id) on delete cascade,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_room_idx on public.events (room_id, id);

create table if not exists public.songs (
  id             text primary key,
  title          text not null,
  artist         text not null,
  release_year   integer not null check (release_year between 1900 and 2100),
  genres         text[] not null default '{}',
  audio_provider text not null default 'itunes',
  audio_id       text,
  duration       integer not null default 30,
  available      boolean not null default true,
  source_url     text,
  aliases        text[] not null default '{}',
  review         text
);

-- ───────────────────────── Zugriffsschutz ─────────────────────────

alter table public.rooms        enable row level security;
alter table public.room_secrets enable row level security;
alter table public.players      enable row level security;
alter table public.games        enable row level security;
alter table public.game_cards   enable row level security;
alter table public.events       enable row level security;
alter table public.songs        enable row level security;

-- Prüfung der Raummitgliedschaft; SECURITY DEFINER vermeidet rekursive RLS-Auswertung.
create or replace function public.is_room_member(p_room text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.players p where p.room_id = p_room and p.auth_uid = auth.uid()
  );
$$;
revoke all on function public.is_room_member(text) from public;
grant execute on function public.is_room_member(text) to authenticated;

-- Lesen nur für Mitglieder des Raums (anonyme Sitzungen zählen als `authenticated`).
drop policy if exists rooms_member_read on public.rooms;
create policy rooms_member_read on public.rooms for select to authenticated
  using (public.is_room_member(id));

drop policy if exists players_member_read on public.players;
create policy players_member_read on public.players for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists games_member_read on public.games;
create policy games_member_read on public.games for select to authenticated
  using (public.is_room_member(room_id));

drop policy if exists game_cards_member_read on public.game_cards;
create policy game_cards_member_read on public.game_cards for select to authenticated
  using (exists (select 1 from public.games g where g.id = game_id and public.is_room_member(g.room_id)));

-- room_secrets, events, songs: RLS aktiv, KEINE Policy → für Clients vollständig gesperrt.

revoke all on all tables in schema public from anon, authenticated;
grant select on public.rooms, public.players, public.games, public.game_cards to authenticated;
-- last_seen/auth_uid sind für Clients nicht nötig, aber unkritisch (nur eigene Raummitglieder).

-- ───────────────────────── Serverfunktionen (nur service_role) ─────────────────────────

-- Lädt Raum + Geheimnis + Mitglieder konsistent in einer Anweisung (ein Snapshot).
create or replace function public.load_room(p_code text default null, p_id text default null)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id,
    'code', r.code,
    'version', r.version,
    'state', r.state,
    'secret', s.secret,
    'createdBy', r.created_by,
    'createdAt', (extract(epoch from r.created_at) * 1000)::bigint,
    'members', coalesce((select jsonb_agg(jsonb_build_object('playerId', p.player_id, 'uid', p.auth_uid))
                         from public.players p where p.room_id = r.id), '[]'::jsonb),
    'lastSeen', coalesce((select jsonb_object_agg(p.player_id, (extract(epoch from p.last_seen) * 1000)::bigint)
                          from public.players p where p.room_id = r.id), '{}'::jsonb)
  )
  from public.rooms r
  join public.room_secrets s on s.room_id = r.id
  where (p_code is not null and r.code = p_code) or (p_id is not null and r.id = p_id)
  limit 1;
$$;

-- Legt einen Raum samt Geheimnis, Host und Ereignissen atomar an.
create or replace function public.insert_room(
  p_id text, p_code text, p_state jsonb, p_secret jsonb, p_created_by uuid,
  p_host_player text, p_host_name text, p_events jsonb
) returns text
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.rooms (id, code, status, version, state, created_by)
  values (p_id, p_code, p_state->>'phase', (p_state->>'version')::int, p_state, p_created_by);
  insert into public.room_secrets (room_id, secret) values (p_id, p_secret);
  insert into public.players (room_id, player_id, auth_uid, name) values (p_id, p_host_player, p_created_by, p_host_name);
  insert into public.events (room_id, type, payload)
    select p_id, e->>'type', coalesce(e->'payload', '{}'::jsonb) from jsonb_array_elements(p_events) e;
  return 'ok';
exception when unique_violation then
  return 'code_taken';
end;
$$;

-- Compare-and-Swap: schreibt nur, wenn die Version noch der erwarteten entspricht.
-- Zustand, Geheimnis, Mitglieder, Partie-/Kartenprotokoll und Ereignisse in EINER Transaktion.
create or replace function public.commit_room(
  p_room text, p_expected integer, p_state jsonb, p_secret jsonb,
  p_add jsonb, p_remove text[], p_events jsonb
) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_game text := p_state->>'gameId';
  v_res  jsonb := p_state->'lastResult';
begin
  update public.rooms
     set state = p_state,
         status = p_state->>'phase',
         version = (p_state->>'version')::int,
         updated_at = now()
   where id = p_room and version = p_expected;
  if not found then
    return false;
  end if;

  update public.room_secrets set secret = p_secret where room_id = p_room;

  insert into public.players (room_id, player_id, auth_uid, name)
    select p_room, a->>'playerId', (a->>'uid')::uuid, a->>'name'
    from jsonb_array_elements(coalesce(p_add, '[]'::jsonb)) a;
  delete from public.players where room_id = p_room and player_id = any(coalesce(p_remove, '{}'));

  if v_game is not null then
    insert into public.games (id, room_id, target_cards, status)
      values (v_game, p_room, (p_state->'settings'->>'targetCards')::int, 'running')
      on conflict (id) do nothing;
    if p_state->>'phase' = 'finished' then
      update public.games
         set status = 'finished', ended_at = now(),
             winner_player_id = p_state->>'winnerId', end_reason = p_state->>'endReason'
       where id = v_game and status <> 'finished';
    end if;
    if v_res is not null and p_state->>'phase' in ('resolving_turn', 'finished') then
      insert into public.game_cards (id, game_id, card_id, song_id, player_id, position, correct, title_bonus)
        values (v_game || ':' || (v_res->>'cardId'), v_game, v_res->>'cardId', v_res->'card'->>'songId',
                v_res->>'playerId', (v_res->>'position')::int, (v_res->>'correct')::boolean,
                coalesce((v_res->>'bonus')::int, 0) > 0)
        on conflict (id) do nothing;
    end if;
  end if;

  insert into public.events (room_id, type, payload)
    select p_room, e->>'type', coalesce(e->'payload', '{}'::jsonb)
    from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) e;
  return true;
end;
$$;

create or replace function public.touch_player(p_room text, p_player text)
returns void
language sql security definer
set search_path = public
as $$
  update public.players set last_seen = now() where room_id = p_room and player_id = p_player;
$$;

create or replace function public.count_rooms_created(p_uid uuid, p_since timestamptz)
returns integer
language sql stable security definer
set search_path = public
as $$
  select count(*)::int from public.rooms where created_by = p_uid and created_at >= p_since;
$$;

create or replace function public.delete_room(p_room text)
returns integer
language sql security definer
set search_path = public
as $$
  with gone as (delete from public.rooms where id = p_room returning 1) select count(*)::int from gone;
$$;

-- Räumt verlassene Räume auf (Kaskade löscht Spieler, Geheimnisse, Partien, Ereignisse).
-- Aufruf z. B. stündlich per pg_cron (siehe README).
create or replace function public.cleanup_expired_rooms(p_max_age interval default interval '6 hours')
returns integer
language sql security definer
set search_path = public
as $$
  with gone as (
    delete from public.rooms where updated_at < now() - p_max_age returning 1
  ) select count(*)::int from gone;
$$;

revoke all on function public.load_room(text, text) from public, anon, authenticated;
revoke all on function public.insert_room(text, text, jsonb, jsonb, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.commit_room(text, integer, jsonb, jsonb, jsonb, text[], jsonb) from public, anon, authenticated;
revoke all on function public.touch_player(text, text) from public, anon, authenticated;
revoke all on function public.count_rooms_created(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.cleanup_expired_rooms(interval) from public, anon, authenticated;
revoke all on function public.delete_room(text) from public, anon, authenticated;
grant execute on function public.load_room(text, text) to service_role;
grant execute on function public.insert_room(text, text, jsonb, jsonb, uuid, text, text, jsonb) to service_role;
grant execute on function public.commit_room(text, integer, jsonb, jsonb, jsonb, text[], jsonb) to service_role;
grant execute on function public.touch_player(text, text) to service_role;
grant execute on function public.count_rooms_created(uuid, timestamptz) to service_role;
grant execute on function public.cleanup_expired_rooms(interval) to service_role;
grant execute on function public.delete_room(text) to service_role;

-- ───────────────────────── Realtime ─────────────────────────
-- Nur `rooms` (öffentlicher Zustand) wird verteilt. RLS stellt sicher, dass nur Mitglieder Änderungen erhalten.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.rooms;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
