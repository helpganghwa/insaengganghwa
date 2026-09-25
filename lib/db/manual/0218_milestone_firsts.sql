-- 0218: 최초 이정표 기록(2026-09-26, docs/TITLES.md "최초 이정표 칭호") — 서버·이정표별 첫 세 사람(금·은·동).
--  - milestone: enh500 | sum20k | t30 | combat10m (lib/game/balance.ts FIRST_MILESTONES).
--  - rank 1~3 = 도달 순서. (server_id, milestone, rank) PK로 넷째는 못 들어온다. 같은 유저는 이정표당 1행.
--  - 기록은 리더보드 증분 갱신(refreshEnhanceMetrics) 커밋 뒤 best-effort, 이정표별 advisory 락으로 직렬화.
--  - 탈퇴해도 행을 남긴다(withdraw.ts 보존 목록) — 빈 순위를 다시 채우지 않게(다음 도달자는 max(rank)+1 → 3 초과면 기록 없음).
--  - 신설 테이블이라 코드보다 먼저 적용해도 무해. 순서: 0218 적용 → scripts/first-milestones-backfill.ts --apply → 코드 배포.
--  (스테이징에는 9/9 시안의 같은 테이블이 이미 있을 수 있다 — if not exists로 그대로 둔다.)
begin;

create table if not exists milestone_firsts (
  server_id smallint not null,
  milestone text not null,
  rank smallint not null check (rank between 1 and 3),
  user_id uuid not null references profiles(id) on delete cascade,
  reached_at timestamptz not null default now(),
  primary key (server_id, milestone, rank),
  unique (server_id, milestone, user_id)
);
create index if not exists milestone_firsts_user_idx on milestone_firsts (user_id, server_id);
-- 새 표는 RLS를 켠다(0113 규칙) — 앱은 서버 롤로만 접근하고, 공개 롤에는 정책이 없어 전부 막힌다.
alter table milestone_firsts enable row level security;

commit;
