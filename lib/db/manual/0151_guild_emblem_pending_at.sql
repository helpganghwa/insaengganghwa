-- 문양 생성 시작 시각(2026-08-06) — 'pending'이 굳었는지 판정하는 유일한 근거.
-- 함수가 시간 예산에 잘리면 catch가 못 돌아 상태가 pending으로 남는데, 시각이 없으면
-- 화면이 "생성 중"을 영원히 보여준다(스테이징 gggggg 실측). 3분 넘은 pending은 실패로 본다.
alter table guilds add column if not exists emblem_pending_at timestamptz;

-- 이미 굳어 있는 pending은 시작 시각을 알 수 없다 — 즉시 stale로 보이게 과거 시각을 넣는다.
update guilds set emblem_pending_at = now() - interval '1 hour'
  where emblem_status = 'pending' and emblem_pending_at is null;
