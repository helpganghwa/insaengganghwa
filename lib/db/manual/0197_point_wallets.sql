-- 0197: 포인트 지갑(2026-09-08, docs/POINT-SHOP.md) — 대난투 포인트(서버별, characters)·마일리지(계정, profiles) 잔액 +
-- 두 재화 공용 원장 point_ledger. 적립은 발표(reveal)·결제 완료(completePurchase)에서, 회수는 환불(refundPurchase)에서.
--  - (kind, ref) 부분 유니크 = 멱등 키: 대난투 'melee:<battle_id>:<user_id>', 결제 'order:<id>', 환불 회수 'order:<id>:refund'.
--  - server_id: 대난투 행은 서버, 마일리지 행은 NULL(계정 단위).
--  - 구 코드와 호환: 컬럼 기본값 0·테이블 신설이라 배포 전 적용해도 무해. 소급은 scripts/points-backfill.ts.
begin;

alter table characters add column if not exists melee_points bigint not null default 0;
alter table profiles add column if not exists mileage bigint not null default 0;

create table if not exists point_ledger (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint,
  kind text not null check (kind in ('melee', 'mileage')),
  delta bigint not null,
  note text not null default '',
  ref text,
  created_at timestamptz not null default now()
);
create unique index if not exists point_ledger_kind_ref_uq on point_ledger (kind, ref) where ref is not null;
create index if not exists point_ledger_user_kind_idx on point_ledger (user_id, kind, created_at desc);

commit;
