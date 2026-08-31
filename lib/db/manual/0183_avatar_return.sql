-- 0183: 아바타 반환(2026-09-01) — 유저가 반환 신청하면 아바타는 즉시 회수(삭제)되고,
-- 운영자가 사후 판단해 다이아를 우편 지급한다(요건 충족=실지불 전액 / 미충족=절반).
-- 아바타 행은 이미 삭제되므로 판단에 필요한 것은 전부 이 행에 스냅샷으로 남긴다.
begin;

create table if not exists avatar_return_requests (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  server_id smallint not null default 1,
  -- 삭제된 아바타의 원 id — FK 아님(대상 행이 이미 없음), 생성 잡 추적용.
  profile_id uuid not null,
  -- equipment_mismatch(장비 미반영) | quality(결과 불만족) | etc
  reason text not null default 'etc',
  sprite_url text not null,
  equipment_snapshot jsonb,
  -- 실지불액(profile_generation_jobs.diamond_escrow 스냅샷, 이월 등 잡 없음 = 1000 간주)
  paid_diamond bigint not null,
  -- pending | paid_full | paid_half
  status text not null default 'pending',
  refund_diamond bigint,
  admin_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists avatar_return_status_idx
  on avatar_return_requests (status, created_at);
create index if not exists avatar_return_user_idx
  on avatar_return_requests (user_id, created_at desc);

commit;
