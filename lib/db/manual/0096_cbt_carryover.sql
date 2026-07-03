-- 0096: CBT 참여 보상 이월 테이블
-- 실운영 전환(wipe) 전 스냅샷(scripts/cbt-snapshot.ts)이 채우고, 실운영에서 lazy 지급
-- (lib/game/cbt/grant.ts) 후 granted_at 마킹. ⚠ 실운영 컷오버 wipe에서 이 테이블은
-- 삭제 대상 제외(살아남는 것이 존재 이유). 멱등.

create table if not exists public.cbt_carryover (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  nickname text,
  invite_count integer not null default 0,
  invite_diamond integer not null default 0,
  invite_boxes integer not null default 0,
  keepsake jsonb,
  keepsake_image_url text,
  snapshot_at timestamptz not null default now(),
  granted_at timestamptz
);

create index if not exists cbt_carryover_ungranted_idx
  on public.cbt_carryover (user_id)
  where granted_at is null;
