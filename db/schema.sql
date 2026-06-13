-- monopoly スキーマ
-- Studio 起動時に自動適用される。全ゲーム状態は組織単位で分離する。

create table if not exists monopoly_games (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  join_code         text not null,
  join_secret       text not null,
  title             text not null default 'MONOPOLY',
  status            text not null default 'lobby'
                    check (status in ('lobby', 'playing', 'paused', 'finished')),
  phase             text not null default 'lobby'
                    check (phase in ('lobby', 'await_roll', 'await_purchase', 'auction', 'manage_debt', 'finished')),
  current_player_id uuid,
  winner_player_id  uuid,
  turn_number       integer not null default 0,
  dice_1            integer check (dice_1 between 1 and 6),
  dice_2            integer check (dice_2 between 1 and 6),
  doubles_count     integer not null default 0 check (doubles_count between 0 and 3),
  chance_deck       jsonb not null default '[]'::jsonb,
  chest_deck        jsonb not null default '[]'::jsonb,
  pending_action    jsonb not null default '{}'::jsonb,
  settings          jsonb not null default '{"startingMoney":1500,"salary":200,"speed":"normal","tokenSize":"normal"}'::jsonb,
  version           integer not null default 1,
  created_by        uuid references profiles(id) on delete set null,
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, join_code)
);

create table if not exists monopoly_players (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations(id) on delete cascade,
  game_id               uuid not null references monopoly_games(id) on delete cascade,
  seat_order            integer not null check (seat_order between 0 and 7),
  display_name          text not null,
  controller_type       text not null
                        check (controller_type in ('smartphone', 'cpu', 'pc')),
  token_id              text not null
                        check (token_id in ('hat', 'car', 'ship', 'dog', 'boot', 'cat', 'plane', 'camera')),
  color                 text not null,
  money                 integer not null default 1500,
  position              integer not null default 0 check (position between 0 and 39),
  in_jail               boolean not null default false,
  jail_turns            integer not null default 0 check (jail_turns between 0 and 3),
  get_out_chance        integer not null default 0,
  get_out_chest         integer not null default 0,
  bankrupt              boolean not null default false,
  bankrupt_to_player_id uuid,
  connected             boolean not null default false,
  profile_id            uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (game_id, seat_order),
  unique (game_id, token_id)
);

create table if not exists monopoly_controllers (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  game_id            uuid not null references monopoly_games(id) on delete cascade,
  controller_token   text not null,
  label              text not null,
  status             text not null default 'waiting'
                     check (status in ('waiting', 'assigned', 'disconnected')),
  assigned_player_id uuid references monopoly_players(id) on delete set null,
  last_seen_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (game_id, controller_token),
  unique (game_id, assigned_player_id)
);

create table if not exists monopoly_properties (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  game_id         uuid not null references monopoly_games(id) on delete cascade,
  space_index     integer not null check (space_index between 0 and 39),
  owner_player_id uuid references monopoly_players(id) on delete set null,
  buildings       integer not null default 0 check (buildings between 0 and 5),
  mortgaged       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (game_id, space_index)
);

create table if not exists monopoly_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  game_id         uuid not null references monopoly_games(id) on delete cascade,
  event_type      text not null
                  check (event_type in ('system', 'join', 'assign', 'turn', 'dice', 'move', 'purchase', 'auction', 'rent', 'card', 'build', 'mortgage', 'trade', 'correction', 'bankruptcy', 'finish')),
  actor_player_id uuid references monopoly_players(id) on delete set null,
  message         text not null,
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists monopoly_games_org_status_idx
  on monopoly_games (organization_id, status, updated_at desc);
create index if not exists monopoly_players_game_idx
  on monopoly_players (organization_id, game_id, seat_order);
create index if not exists monopoly_controllers_game_idx
  on monopoly_controllers (organization_id, game_id, status);
create index if not exists monopoly_properties_game_idx
  on monopoly_properties (organization_id, game_id, space_index);
create index if not exists monopoly_events_game_idx
  on monopoly_events (organization_id, game_id, created_at desc);

drop trigger if exists monopoly_games_updated_at on monopoly_games;
create trigger monopoly_games_updated_at
  before update on monopoly_games
  for each row execute function update_updated_at();

drop trigger if exists monopoly_players_updated_at on monopoly_players;
create trigger monopoly_players_updated_at
  before update on monopoly_players
  for each row execute function update_updated_at();

drop trigger if exists monopoly_controllers_updated_at on monopoly_controllers;
create trigger monopoly_controllers_updated_at
  before update on monopoly_controllers
  for each row execute function update_updated_at();

drop trigger if exists monopoly_properties_updated_at on monopoly_properties;
create trigger monopoly_properties_updated_at
  before update on monopoly_properties
  for each row execute function update_updated_at();

alter table monopoly_games enable row level security;
alter table monopoly_players enable row level security;
alter table monopoly_controllers enable row level security;
alter table monopoly_properties enable row level security;
alter table monopoly_events enable row level security;

drop policy if exists monopoly_games_select on monopoly_games;
create policy monopoly_games_select on monopoly_games for select using (
  organization_id in (select organization_id from profiles where id = auth.uid())
);
drop policy if exists monopoly_games_insert on monopoly_games;
create policy monopoly_games_insert on monopoly_games for insert with check (
  organization_id in (select organization_id from profiles where id = auth.uid())
);
drop policy if exists monopoly_games_update on monopoly_games;
create policy monopoly_games_update on monopoly_games for update using (
  organization_id in (select organization_id from profiles where id = auth.uid())
) with check (
  organization_id in (select organization_id from profiles where id = auth.uid())
);
drop policy if exists monopoly_games_delete on monopoly_games;
create policy monopoly_games_delete on monopoly_games for delete using (
  organization_id in (select organization_id from profiles where id = auth.uid())
);

drop policy if exists monopoly_players_select on monopoly_players;
create policy monopoly_players_select on monopoly_players for select using (
  organization_id in (select organization_id from profiles where id = auth.uid())
);
drop policy if exists monopoly_players_insert on monopoly_players;
create policy monopoly_players_insert on monopoly_players for insert with check (
  organization_id in (select organization_id from profiles where id = auth.uid())
);
drop policy if exists monopoly_players_update on monopoly_players;
create policy monopoly_players_update on monopoly_players for update using (
  organization_id in (select organization_id from profiles where id = auth.uid())
) with check (
  organization_id in (select organization_id from profiles where id = auth.uid())
);
drop policy if exists monopoly_players_delete on monopoly_players;
create policy monopoly_players_delete on monopoly_players for delete using (
  organization_id in (select organization_id from profiles where id = auth.uid())
);

drop policy if exists monopoly_controllers_select on monopoly_controllers;
create policy monopoly_controllers_select on monopoly_controllers for select using (
  organization_id in (select organization_id from profiles where id = auth.uid())
);
drop policy if exists monopoly_controllers_insert on monopoly_controllers;
create policy monopoly_controllers_insert on monopoly_controllers for insert with check (
  organization_id in (select organization_id from profiles where id = auth.uid())
);
drop policy if exists monopoly_controllers_update on monopoly_controllers;
create policy monopoly_controllers_update on monopoly_controllers for update using (
  organization_id in (select organization_id from profiles where id = auth.uid())
) with check (
  organization_id in (select organization_id from profiles where id = auth.uid())
);
drop policy if exists monopoly_controllers_delete on monopoly_controllers;
create policy monopoly_controllers_delete on monopoly_controllers for delete using (
  organization_id in (select organization_id from profiles where id = auth.uid())
);

drop policy if exists monopoly_properties_select on monopoly_properties;
create policy monopoly_properties_select on monopoly_properties for select using (
  organization_id in (select organization_id from profiles where id = auth.uid())
);
drop policy if exists monopoly_properties_insert on monopoly_properties;
create policy monopoly_properties_insert on monopoly_properties for insert with check (
  organization_id in (select organization_id from profiles where id = auth.uid())
);
drop policy if exists monopoly_properties_update on monopoly_properties;
create policy monopoly_properties_update on monopoly_properties for update using (
  organization_id in (select organization_id from profiles where id = auth.uid())
) with check (
  organization_id in (select organization_id from profiles where id = auth.uid())
);
drop policy if exists monopoly_properties_delete on monopoly_properties;
create policy monopoly_properties_delete on monopoly_properties for delete using (
  organization_id in (select organization_id from profiles where id = auth.uid())
);

drop policy if exists monopoly_events_select on monopoly_events;
create policy monopoly_events_select on monopoly_events for select using (
  organization_id in (select organization_id from profiles where id = auth.uid())
);
drop policy if exists monopoly_events_insert on monopoly_events;
create policy monopoly_events_insert on monopoly_events for insert with check (
  organization_id in (select organization_id from profiles where id = auth.uid())
);
drop policy if exists monopoly_events_update on monopoly_events;
create policy monopoly_events_update on monopoly_events for update using (
  organization_id in (select organization_id from profiles where id = auth.uid())
) with check (
  organization_id in (select organization_id from profiles where id = auth.uid())
);
drop policy if exists monopoly_events_delete on monopoly_events;
create policy monopoly_events_delete on monopoly_events for delete using (
  organization_id in (select organization_id from profiles where id = auth.uid())
);
