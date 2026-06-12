-- 0059 P4 스코핑(SERVER.md §5) — 레이드·대난투·친구 + 푸시 활성서버 + P3b 레거시 정리. 멱등.

-- 1) P3b 전환기 레거시 유니크 정리(신코드 배포 완료 — 서버 2 오픈의 전제).
drop index if exists ue_user_catalog_legacy_uq;
drop index if exists ej_user_slot_lane_running_legacy_uq;
drop index if exists checkin_logs_user_day_legacy_uq;
drop index if exists user_supply_boxes_legacy_uq;
drop index if exists user_checkin_state_legacy_uq;
drop index if exists daily_supply_grants_legacy_uq;
drop index if exists shop_free_claims_legacy_uq;
drop index if exists shop_purchases_legacy_uq;
drop index if exists battlepass_state_legacy_uq;
drop index if exists battlepass_segments_legacy_uq;

-- 2) 레이드 — raids에 서버 귀속(참가/공격/보상/신청은 raid FK로 파생). 일일 한도는 서버별.
alter table raids             add column if not exists server_id smallint not null default 1 references servers(id);
alter table raid_daily_counts add column if not exists server_id smallint not null default 1 references servers(id);
do $$
declare pk text;
begin
  select conname into pk from pg_constraint where conrelid = 'raid_daily_counts'::regclass and contype = 'p';
  if pk is not null then execute format('alter table raid_daily_counts drop constraint %I', pk); end if;
  execute 'alter table raid_daily_counts add primary key (user_id, server_id, kst_date)';
end $$;
create unique index if not exists raid_daily_counts_legacy_uq on raid_daily_counts (user_id, kst_date);

-- 3) 대난투 — 서버별 일일 1배틀(참가자는 battle FK 파생).
alter table melee_battles add column if not exists server_id smallint not null default 1 references servers(id);
create unique index if not exists melee_battles_server_date_uq on melee_battles (server_id, battle_date);
-- 구 battle_date 단독 UNIQUE(컬럼 제약)는 전환기 유지 — 신코드 배포 후 0060에서 drop.

-- 4) 친구 — 관계는 서버 내(SERVER.md §1).
alter table friend_links add column if not exists server_id smallint not null default 1 references servers(id);
do $$
declare pk text;
begin
  select conname into pk from pg_constraint where conrelid = 'friend_links'::regclass and contype = 'p';
  if pk is not null then execute format('alter table friend_links drop constraint %I', pk); end if;
  execute 'alter table friend_links add primary key (requester_id, server_id, addressee_id)';
end $$;
create unique index if not exists friend_links_legacy_uq on friend_links (requester_id, addressee_id);

-- 5) 프로필 생성 작업 — escrow 환불 정합(차감 서버로 환불, P2 TODO 해소).
alter table profile_generation_jobs add column if not exists server_id smallint not null default 1;

-- 6) 푸시 활성 서버 필터(경계 규칙 1) — 발송은 last_server_id = 이벤트 서버일 때만.
alter table profiles add column if not exists last_server_id smallint not null default 1;
