-- 0214 (2026-09-22) 한가위 강화 대회 — 정산 결과(아이템별·서버별 1~10등). lib/game/chuseok/contest.ts.
--
-- 마감(9/30 23:59:59 KST) 시점의 단계는 enhancement_logs로 되짚어 계산하므로 별도 스냅샷 크론이 없다.
-- 이 표는 **정산이 확정한 순위**를 남긴다 — 어드민이 10/1에 확인·지급을 누르면 한 트랜잭션으로
-- 여기에 넣고(순위 PK 멱등) 우편·칭호를 지급한다. 결과 화면(10/3까지)은 이 표를 읽는다.
begin;

create table if not exists chuseok_contest_results (
  server_id smallint not null,
  catalog_code text not null,
  rank smallint not null,
  user_id uuid not null references profiles(id) on delete cascade,
  level integer not null,
  reached_at timestamptz,
  diamond bigint not null,
  boxes integer not null,
  titles text[] not null default '{}',
  settled_at timestamptz not null default now(),
  settled_by uuid,
  primary key (server_id, catalog_code, rank)
);
create index if not exists chuseok_contest_results_user_idx on chuseok_contest_results (user_id, server_id);

-- RLS deny-all 백스톱(0113 규칙). 멱등.
alter table chuseok_contest_results enable row level security;

commit;
