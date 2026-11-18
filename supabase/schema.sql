-- Korb – Datenbank-Schema für Supabase
-- Einmal komplett im Supabase SQL-Editor ausführen (Dashboard → SQL Editor → New query → Run).
-- Das Skript ist wiederholbar: Es legt nur an, was noch fehlt, und ersetzt Funktionen und Regeln.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table if not exists households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  hue          int  not null default 150 check (hue between 0 and 360),
  push_enabled boolean not null default true,
  updated_at   timestamptz not null default now(),
  synced_at    timestamptz not null default now()
);

-- Ein Gerät (anonyme Anmeldung) gehört zu genau einem Mitglied. Ein Mitglied kann mehrere Geräte haben.
create table if not exists devices (
  auth_uid   uuid primary key references auth.users(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists lists (
  id           uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  color        text not null default 'basil',
  sort         int  not null default 0,
  deleted      boolean not null default false,
  updated_at   timestamptz not null,
  synced_at    timestamptz not null default now()
);

create table if not exists items (
  id           uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  list_id      uuid not null references lists(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  key          text not null,
  emoji        text not null default '🛒',
  cat          text not null default 'sonst',
  qty          numeric,
  unit         text,
  note         text not null default '',
  added_by     uuid references members(id) on delete set null,
  added_at     timestamptz not null default now(),
  done         boolean not null default false,
  done_at      timestamptz,
  done_by      uuid references members(id) on delete set null,
  deleted      boolean not null default false,
  updated_at   timestamptz not null,
  synced_at    timestamptz not null default now()
);

-- Kaufhistorie für die Vorschläge („Milch: alle ~5 Tage“)
create table if not exists purchases (
  id           uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  key          text not null,
  bought_at    timestamptz not null,
  deleted      boolean not null default false,
  updated_at   timestamptz not null,
  synced_at    timestamptz not null default now()
);

create table if not exists stores (
  id           uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  trips        int  not null default 0,
  last_at      timestamptz,
  deleted      boolean not null default false,
  updated_at   timestamptz not null,
  synced_at    timestamptz not null default now()
);

-- Gelernte Laufreihenfolge pro Laden: pos_key = 'i:<artikel>' oder 'c:<kategorie>', p = 0 (Eingang) … 1 (Kasse)
create table if not exists store_positions (
  store_id     uuid not null references stores(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  pos_key      text not null,
  p            real not null,
  n            int  not null default 1,
  updated_at   timestamptz not null,
  synced_at    timestamptz not null default now(),
  primary key (store_id, pos_key)
);

create table if not exists push_subscriptions (
  endpoint     text primary key,
  member_id    uuid not null references members(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now()
);

-- Schutz gegen das Durchprobieren von Einladungscodes
create table if not exists join_attempts (
  auth_uid uuid not null,
  at       timestamptz not null default now()
);

create index if not exists items_sync_idx      on items (household_id, synced_at);
create index if not exists lists_sync_idx      on lists (household_id, synced_at);
create index if not exists purchases_sync_idx  on purchases (household_id, synced_at);
create index if not exists stores_sync_idx     on stores (household_id, synced_at);
create index if not exists positions_sync_idx  on store_positions (household_id, synced_at);
create index if not exists members_hh_idx      on members (household_id);
create index if not exists devices_member_idx  on devices (member_id);
create index if not exists join_attempts_idx   on join_attempts (auth_uid, at);

-- ---------------------------------------------------------------------------
-- Sync-Trigger: Last-Write-Wins nach updated_at, Server-Zeitstempel synced_at für den Delta-Abruf
-- ---------------------------------------------------------------------------
create or replace function korb_touch() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null; -- ältere Änderung eines Offline-Geräts: verwerfen, neuere gewinnt
  end if;
  new.synced_at := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['members','lists','items','purchases','stores','store_positions'] loop
    execute format('drop trigger if exists korb_touch on %I', t);
    execute format('create trigger korb_touch before insert or update on %I for each row execute function korb_touch()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Zugriffsregeln (Row Level Security): nur Mitglieder desselben Haushalts
-- ---------------------------------------------------------------------------
create or replace function korb_my_households() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.household_id from devices d join members m on m.id = d.member_id where d.auth_uid = auth.uid()
$$;

create or replace function korb_my_members() returns setof uuid
language sql stable security definer set search_path = public as $$
  select d.member_id from devices d where d.auth_uid = auth.uid()
$$;

alter table households         enable row level security;
alter table members            enable row level security;
alter table devices            enable row level security;
alter table lists              enable row level security;
alter table items              enable row level security;
alter table purchases          enable row level security;
alter table stores             enable row level security;
alter table store_positions    enable row level security;
alter table push_subscriptions enable row level security;
alter table join_attempts      enable row level security;

drop policy if exists hh_read   on households;
drop policy if exists hh_update on households;
create policy hh_read   on households for select to authenticated using (id in (select korb_my_households()));
create policy hh_update on households for update to authenticated using (id in (select korb_my_households())) with check (id in (select korb_my_households()));

drop policy if exists members_read   on members;
drop policy if exists members_update on members;
create policy members_read   on members for select to authenticated using (household_id in (select korb_my_households()));
create policy members_update on members for update to authenticated using (household_id in (select korb_my_households())) with check (household_id in (select korb_my_households()));

drop policy if exists devices_read on devices;
create policy devices_read on devices for select to authenticated using (auth_uid = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['lists','items','purchases','stores','store_positions'] loop
    execute format('drop policy if exists household_rw on %I', t);
    execute format('create policy household_rw on %I for all to authenticated using (household_id in (select korb_my_households())) with check (household_id in (select korb_my_households()))', t);
  end loop;
end $$;

drop policy if exists push_rw on push_subscriptions;
create policy push_rw on push_subscriptions for all to authenticated
  using (member_id in (select korb_my_members()))
  with check (member_id in (select korb_my_members()) and household_id in (select korb_my_households()));

-- join_attempts: keine Regel = kein direkter Zugriff, nur über die Funktionen unten.

-- ---------------------------------------------------------------------------
-- Funktionen für Haushalt anlegen, beitreten und wiederherstellen
-- ---------------------------------------------------------------------------
create or replace function korb_new_code() returns text
language plpgsql set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- ohne 0/O/1/I
  c text;
begin
  loop
    c := 'KORB-';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1);
    end loop;
    exit when not exists (select 1 from households where invite_code = c);
  end loop;
  return c;
end $$;

create or replace function korb_norm_code(p text) returns text
language sql immutable as $$
  select case when x like 'KORB%' then 'KORB-' || substr(x, 5) else 'KORB-' || x end
  from (select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) as x) s
$$;

create or replace function korb_check_rate() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  delete from join_attempts where at < now() - interval '1 day';
  if (select count(*) from join_attempts where auth_uid = auth.uid() and at > now() - interval '15 minutes') >= 10 then
    raise exception 'Zu viele Versuche. Bitte in 15 Minuten erneut probieren.';
  end if;
  insert into join_attempts (auth_uid) values (auth.uid());
end $$;

create or replace function korb_session(p_member uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('household_id', h.id, 'household_name', h.name, 'invite_code', h.invite_code,
                           'member_id', m.id, 'member_name', m.name)
  from members m join households h on h.id = m.household_id where m.id = p_member
$$;

create or replace function create_household(p_household text, p_name text, p_hue int default 150) returns json
language plpgsql security definer set search_path = public as $$
declare hh uuid; mem uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if exists (select 1 from devices where auth_uid = auth.uid()) then
    raise exception 'Dieses Gerät gehört schon zu einem Haushalt.';
  end if;
  insert into households (name, invite_code) values (trim(p_household), korb_new_code()) returning id into hh;
  insert into members (household_id, name, hue) values (hh, trim(p_name), coalesce(p_hue, 150)) returning id into mem;
  insert into devices (auth_uid, member_id) values (auth.uid(), mem);
  insert into lists (id, household_id, name, color, sort, updated_at) values (gen_random_uuid(), hh, 'Einkauf', 'basil', 0, now());
  return korb_session(mem);
end $$;

create or replace function join_household(p_code text, p_name text, p_hue int default 210) returns json
language plpgsql security definer set search_path = public as $$
declare hh uuid; mem uuid; existing uuid;
begin
  perform korb_check_rate();
  select id into hh from households where invite_code = korb_norm_code(p_code);
  -- Kein raise: sonst würde der Fehlversuch zurückgerollt und nicht gezählt
  if hh is null then return json_build_object('error', 'Diesen Code gibt es nicht. Bitte prüfen.'); end if;
  select d.member_id into existing from devices d where d.auth_uid = auth.uid();
  if existing is not null then
    if (select household_id from members where id = existing) = hh then return korb_session(existing); end if;
    return json_build_object('error', 'Dieses Gerät gehört schon zu einem anderen Haushalt.');
  end if;
  insert into members (household_id, name, hue) values (hh, trim(p_name), coalesce(p_hue, 210)) returning id into mem;
  insert into devices (auth_uid, member_id) values (auth.uid(), mem);
  return korb_session(mem);
end $$;

-- Für „Ich war schon dabei“: Namen der Mitglieder zum Code anzeigen
create or replace function household_members_by_code(p_code text) returns table (id uuid, name text, hue int)
language plpgsql security definer set search_path = public as $$
begin
  perform korb_check_rate();
  return query
    select m.id, m.name, m.hue from members m join households h on h.id = m.household_id
    where h.invite_code = korb_norm_code(p_code) order by m.name;
end $$;

create or replace function recover_member(p_code text, p_member uuid) returns json
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  perform korb_check_rate();
  select exists (select 1 from members m join households h on h.id = m.household_id
                 where m.id = p_member and h.invite_code = korb_norm_code(p_code)) into ok;
  if not ok then return json_build_object('error', 'Code oder Mitglied passt nicht.'); end if;
  insert into devices (auth_uid, member_id) values (auth.uid(), p_member)
    on conflict (auth_uid) do update set member_id = excluded.member_id;
  return korb_session(p_member);
end $$;

create or replace function my_session() returns json
language sql stable security definer set search_path = public as $$
  select korb_session(d.member_id) from devices d where d.auth_uid = auth.uid()
$$;

revoke all on function create_household(text, text, int), join_household(text, text, int),
  household_members_by_code(text), recover_member(text, uuid), my_session(),
  korb_check_rate(), korb_session(uuid), korb_new_code() from public, anon;
grant execute on function create_household(text, text, int), join_household(text, text, int),
  household_members_by_code(text), recover_member(text, uuid), my_session() to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: Änderungen live an alle Geräte des Haushalts
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['members','lists','items','purchases','stores','store_positions'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
