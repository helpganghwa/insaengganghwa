-- 0049 길드 문양 보관함 — 길드당 최대 3개(앱 로직), 활성 1개 선택. 아바타 다중 프로필 패턴 미러.
--   guild_emblems(id, guild_id, emblem_url, emblem_color, created_at) + guilds.active_emblem_id FK.
--   guilds.emblem_url/emblem_color는 활성 문양의 비정규화 미러로 유지(읽기 코드 전부 호환). 멱등.

create table if not exists guild_emblems (
  id bigserial primary key,
  guild_id bigint not null references guilds(id) on delete cascade,
  emblem_url text,
  emblem_color text,
  created_at timestamptz not null default now()
);
create index if not exists guild_emblem_guild_idx on guild_emblems(guild_id);

alter table guilds add column if not exists active_emblem_id bigint references guild_emblems(id) on delete set null;

-- 백필: 기존 emblem_url 보유 길드의 단일 문양 → guild_emblems 1행으로 이관 + 활성 지정(멱등).
insert into guild_emblems (guild_id, emblem_url, emblem_color, created_at)
  select g.id, g.emblem_url, g.emblem_color, g.created_at
  from guilds g
  where g.emblem_url is not null
    and not exists (select 1 from guild_emblems ge where ge.guild_id = g.id);

update guilds g set active_emblem_id = (
  select ge.id from guild_emblems ge where ge.guild_id = g.id order by ge.id limit 1
)
where g.active_emblem_id is null and g.emblem_url is not null;
