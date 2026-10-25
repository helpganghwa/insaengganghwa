-- 0247 (2026-10-25) 할로윈 이벤트 — 사탕(강화 성공 적립) 지갑·원장·도달 보상 수령 + 강화 대회 정산 결과.
-- lib/game/halloween/config.ts. 추석 0213·0214와 같은 구조(표 이름만 다름).
--
-- 규칙: 기간 중 모든 아이템의 강화 성공마다 도달 단계만큼 사탕(상한 없음). 도달 보상은 누적(total) 기준,
-- 교환은 사용 가능(total − spent). 원장이 정본이고 지갑은 캐시 — 같은 트랜잭션에서 함께 갱신한다.
--  - 적립 멱등 키 ref = 'job:<enhancement_job_id>' (수령 사후처리가 재실행돼도 한 번만).
--  - 교환 ref = 'ex:<uuid>'. 수령은 (user, server, step) PK가 멱등 키.
-- 새 표만 만들고 기존 표는 건드리지 않는다 — 코드보다 먼저 적용해도 무해. 멱등.
begin;

create table if not exists halloween_candy (
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null,
  total bigint not null default 0,
  spent bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, server_id),
  check (spent >= 0 and spent <= total)
);

create table if not exists halloween_candy_ledger (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null,
  kind text not null check (kind in ('earn', 'exchange')),
  delta bigint not null,
  note text not null default '',
  ref text,
  created_at timestamptz not null default now()
);
create unique index if not exists halloween_candy_ledger_ref_uq on halloween_candy_ledger (ref) where ref is not null;
create index if not exists halloween_candy_ledger_user_idx on halloween_candy_ledger (user_id, server_id, created_at desc);

create table if not exists halloween_candy_claims (
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null,
  step smallint not null,
  diamond bigint not null,
  boxes integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, server_id, step)
);

-- RLS deny-all 백스톱(0113 규칙: 새 표는 만들 때 함께 켠다). 공개 역할에 grant가 없어 노출은 없지만 두 번째 그물.
-- 앱의 접속 역할(postgres — 소유자·bypassrls)은 영향 없음. 멱등.
alter table halloween_candy enable row level security;
alter table halloween_candy_ledger enable row level security;
alter table halloween_candy_claims enable row level security;


create table if not exists halloween_contest_results (
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
create index if not exists halloween_contest_results_user_idx on halloween_contest_results (user_id, server_id);

-- RLS deny-all 백스톱(0113 규칙). 멱등.
alter table halloween_contest_results enable row level security;

commit;
