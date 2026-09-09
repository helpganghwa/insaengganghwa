-- 0198: 최초 이정표 기록(2026-09-09, docs/TITLES.md "최초 이정표 칭호") — 서버·이정표별 첫 세 사람(금·은·동).
--  - milestone: enh500 | enh1000 | combat5m | combat10m | t20 | t40 | sum20k | sum30k (lib/game/balance.ts FIRST_MILESTONES).
--  - rank 1~3 = 도달 순서. (server_id, milestone, rank) PK로 넷째는 못 들어온다. 같은 유저는 이정표당 1행.
--  - 기록은 리더보드 증분 갱신(refreshEnhanceMetrics) 커밋 뒤 best-effort, 이정표별 advisory 락으로 직렬화.
--  - 탈퇴 cascade로 빈 순위는 다시 채우지 않는다(다음 도달자는 max(rank)+1 → 3 초과면 기록 없음).
--  - 신설 테이블이라 코드보다 먼저 적용해도 무해. 소급 없음(배포 뒤 도달분만).
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

commit;
