-- 0185: 랭킹 1위 유지 일수(2026-09-03) — 1위 칭호 옆 위첨자 “N일”의 근거.
-- 개인 5종: ranking_leaders.since(1위 교체 시 rank-leader 크론이 now()로 리셋, 값만 갱신되면 유지).
-- 길드 4종(rank=명가 level/xp · combat · zones · tax): guild_rank_leaders — 같은 크론이 15분마다 현재 1위를 upsert.
-- 도입 시점부터 세기 시작한다(기존 1위도 1일째부터).
begin;

alter table ranking_leaders add column if not exists since timestamptz not null default now();

create table if not exists guild_rank_leaders (
  server_id smallint not null,
  metric text not null,
  guild_id bigint not null references guilds(id) on delete cascade,
  since timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (server_id, metric)
);

commit;
