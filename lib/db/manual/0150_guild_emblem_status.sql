-- 길드 문양 생성 상태(2026-08-06) — 실패를 유저에게 드러내기 위한 최소 상태.
-- 이전에는 active_emblem_id IS NULL 하나뿐이라 "생성 중"과 "실패"를 구분할 수 없었고,
-- 그래서 화면이 실패를 조용히 빈 칸으로 그렸다(유저는 원래 그런 것으로 인식).
--   pending = 생성 진행 중(결성 직후·재시도 중) · failed = 마지막 시도 실패 · done = 활성 문양 있음
alter table guilds add column if not exists emblem_status text not null default 'done';
alter table guilds add column if not exists emblem_error text;

-- 기존 행 정리 — 문양이 없는데 선택값이 있으면 미완(재시도 대상), 그 외는 done.
update guilds set emblem_status = 'failed'
  where active_emblem_id is null and emblem_selection is not null and emblem_status = 'done';

-- 크론 대상 조회(active_emblem_id null + selection not null + attempts < 12)의 보조 인덱스.
create index if not exists guild_emblem_pending_idx on guilds (emblem_attempts)
  where active_emblem_id is null;
